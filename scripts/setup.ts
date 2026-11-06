import { createInterface } from 'node:readline/promises';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  parseGoogleClient,
  validateState,
  type Clients,
  type Language,
  type SetupState,
} from './setup/config';
import {
  assertManaged,
  exists,
  install,
  loadState,
  verifyPublic,
  connectionGuide,
} from './setup/install';
import { commandRunner, wranglerRunner, openBrowser } from './setup/process';

const args = process.argv.slice(2),
  root = process.cwd();
if (args.includes('--help')) {
  console.log(
    'Personal Health installer / 个人健康助手安装向导\n\npnpm run setup [--lang zh|en] [--reauthorize]\npnpm run setup --check       Public HTTPS/OAuth checks only; no cloud writes\npnpm run setup --dry-run     Show the plan; no files or cloud resources changed\n\npnpm setup is a pnpm built-in. Use pnpm run setup for this project.\nRequires Node.js 24+, pnpm, macOS or Linux (Windows: WSL).\nExisting unrecognized wrangler.toml is never overwritten.\nDaily sync is optional and existing Apps Script projects are never modified.',
  );
} else if (args.includes('--dry-run')) {
  console.log(
    'PLAN ONLY / 仅预览计划\n1. Choose language, owner, public name, Worker name and HTTPS origin.\n2. Refuse unrecognized local config or an existing same-name Worker.\n3. Log in to Cloudflare, select account, create/recover two private KV namespaces.\n4. Generate local config and personalized bilingual policies; deploy after review.\n5. Guide Google setup/Production; import two Web client JSON files locally.\n6. Upload secrets; run local PKCE consent; prove refresh and five Health reads.\n7. Print ChatGPT OAuth/CIMD connection card. Dot install/consent is a browser step.\n8. Daily archive: disabled, keep existing, or export separate setup guide.\nNo cloud calls or file writes were performed.',
  );
} else {
  const languageArg = args[args.indexOf('--lang') + 1];
  let lang: Language = languageArg === 'en' ? 'en' : 'zh';
  const say = (zh: string, en: string) => (lang === 'zh' ? zh : en);
  const rl = process.stdin.isTTY
    ? createInterface({ input: process.stdin, output: process.stdout })
    : null;
  const ask = async (zh: string, en: string, fallback?: string): Promise<string> => {
    if (!rl)
      throw Error(
        'Run the installer in an interactive terminal. Use --help or --dry-run for unattended inspection.',
      );
    const answer = (
      await rl.question(say(zh, en) + (fallback ? ` [${fallback}]` : '') + ': ')
    ).trim();
    return answer || fallback || '';
  };
  const confirm = async (zh: string, en: string) => {
    if (
      (await ask(zh + '（输入 yes 继续）', en + ' (type yes to continue)')).toLowerCase() !== 'yes'
    )
      throw Error('Stopped before the next operation. Resume with pnpm run setup.');
  };
  try {
    if (Number(process.versions.node.split('.')[0]) < 24) throw Error('Node.js 24+ is required.');
    if (process.platform === 'win32') throw Error('Use WSL on Windows.');
    const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as {
      name?: string;
    };
    if (manifest.name !== 'personal-health-assistant')
      throw Error('Run this command from the repository root.');
    let state = await loadState(root);
    if (args.includes('--check')) {
      if (!state)
        throw Error(
          'No installer state. This command does not import or alter an existing deployment.',
        );
      await assertManaged(root, state);
      await verifyPublic(state.origin);
      console.log(
        say(
          '公开站点与 OAuth 发现通过；此检查不读取私人健康数据。',
          'Public HTTPS and OAuth discovery passed. This check does not read private health data.',
        ),
      );
      console.log(
        'Last Health verification / 上次 Health 验证: ' +
          (state.healthVerifiedAt ?? 'not verified / 尚未验证'),
      );
    } else {
      if (!state) {
        // Guard legacy deployments before login, generated files, or cloud calls.
        if (await exists(resolve(root, 'wrangler.toml')))
          throw Error(
            'An existing wrangler.toml was preserved. Use a clean clone for the installer; your existing deployment and daily sync are unchanged.',
          );
        if (!args.includes('--lang'))
          lang = (await ask('选择语言 zh / en', 'Language zh / en', 'zh')) === 'en' ? 'en' : 'zh';
        const installId = randomBytes(6).toString('hex');
        const ownerEmail = await ask(
          '本人 Google 邮箱（仅此账户可连接）',
          'Owner Google email (only this account can connect)',
        );
        const ownerName = await ask('公开维护者名称', 'Public maintainer name');
        const workerName = await ask(
          'Worker 名称',
          'Worker name',
          'health-' + installId.slice(0, 8),
        );
        const origin = await ask(
          '公开 HTTPS 地址（自有子域名或完整 workers.dev 地址）',
          'Public HTTPS origin (your subdomain or full workers.dev URL)',
        );
        const choice = await ask(
          '每日归档：0 不安装，1 保留现有，2 导出独立安装指南',
          'Daily archive: 0 disabled, 1 keep existing, 2 export separate setup guide',
          '0',
        );
        if (!['0', '1', '2'].includes(choice)) throw Error('Invalid daily archive selection');
        state = validateState({
          version: 1,
          language: lang,
          installId,
          ownerEmail,
          ownerName,
          workerName,
          origin,
          daily: choice === '1' ? 'existing' : choice === '2' ? 'guide' : 'off',
          domainBinding: !new URL(origin).hostname.endsWith('.workers.dev'),
        });
        if (
          !state.domainBinding &&
          new URL(state.origin).hostname.split('.')[0] !== state.workerName
        )
          throw Error('The workers.dev hostname must start with the selected Worker name.');
      } else {
        lang = state.language;
        await assertManaged(root, state);
        console.log(
          say(
            '恢复本地安装进度；保留已创建的存储。',
            'Resuming the local installation; existing provisioned storage is retained.',
          ),
        );
      }
      console.log(
        JSON.stringify(
          {
            worker: state.workerName,
            origin: state.origin,
            owner: state.ownerEmail,
            daily: state.daily,
          },
          null,
          2,
        ),
      );
      await confirm(
        '确认这是你控制的全新部署；不会安装或修改已有每日同步',
        'Confirm this is your own new deployment; no existing daily sync will be installed or changed',
      );
      const base = commandRunner(root),
        run = wranglerRunner(resolve(root, 'wrangler.toml'), base);
      // whoami must not load a config that has not yet been created.
      let who = await base(['exec', 'wrangler', 'whoami', '--json']);
      if (who.code !== 0) {
        console.log(
          say(
            '请在自动打开的浏览器中完成 Cloudflare 登录授权。若未打开，另开终端运行 pnpm exec wrangler login。',
            'Complete Cloudflare login in the browser. If no browser opens, run pnpm exec wrangler login in another terminal.',
          ),
        );
        const login = await base([
          'exec',
          'wrangler',
          'login',
          '--scopes',
          'user:read',
          'account:read',
          'workers:write',
          'workers_kv:write',
          'workers_scripts:write',
          'workers_routes:write',
          'zone:read',
          'offline_access',
        ]);
        if (login.code !== 0) throw Error('Cloudflare login was not completed');
        who = await base(['exec', 'wrangler', 'whoami', '--json']);
      }
      if (who.code !== 0) throw Error('Cloudflare account could not be verified');
      const info = JSON.parse(who.stdout) as { accounts?: { id: string; name: string }[] };
      const accounts = info.accounts;
      if (!accounts?.length) throw Error('No Cloudflare accounts are available');
      if (!state.accountId) {
        accounts.forEach((a, i) => console.log(`${i + 1}. ${a.name} (${a.id})`));
        const index =
          Number(
            await ask(
              '选择 Cloudflare 账户编号',
              'Select the Cloudflare account number',
              accounts.length === 1 ? '1' : undefined,
            ),
          ) - 1;
        if (!Number.isInteger(index) || !accounts[index])
          throw Error('Invalid Cloudflare account selection');
        state.accountId = accounts[index]!.id;
      } else if (!accounts.some((a) => a.id === state!.accountId))
        throw Error('The saved Cloudflare account is not available in this login');
      const current = state;
      const loadClients = async (): Promise<Clients> => {
        console.log(
          say(
            '请在 Google Cloud 完成以下步骤。向导会在此等待，稍后可重新运行继续。',
            'Complete these Google Cloud steps. The wizard waits here and can be resumed later.',
          ),
        );
        console.log(
          'https://console.cloud.google.com/apis/library/health.googleapis.com\nhttps://console.cloud.google.com/auth/overview',
        );
        console.log(
          say(
            '启用 Health API；配置 External 同意页及三项 Health 只读范围；核实发布条件并切换 Production。填写以下公开页面，核对模板确实符合你的部署：',
            'Enable Health API; configure External consent and the three Health read scopes; check publishing eligibility and select Production. Use the following public pages after reviewing that they describe your deployment:',
          ),
        );
        console.log(
          current.origin + '/\n' + current.origin + '/privacy/\n' + current.origin + '/terms/',
        );
        console.log(
          'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly\nhttps://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly\nhttps://www.googleapis.com/auth/googlehealth.sleep.readonly',
        );
        console.log(
          say(
            '创建两个 Web application OAuth 客户端并下载各自 JSON。登录客户端只用于 openid email；Health 客户端只用于以上三项只读范围。',
            'Create two Web application OAuth clients and download their JSON files. The login client uses only openid email; the Health client uses only the three read scopes above.',
          ),
        );
        console.log(
          'Login callback / 登录回调: ' +
            current.origin +
            '/login/callback\nHealth callback / Health 回调: http://127.0.0.1:8787/oauth/callback',
        );
        await confirm(
          '已由本人检查 Production 状态、公开政策与只读权限（向导无法替 Google 审核）',
          'I checked Production status, public policies and read-only scopes (the wizard cannot perform Google verification)',
        );
        const readClient = async (zh: string, en: string, redirect: string) => {
          for (;;) {
            const path = (await ask(zh, en)).replace(/^['"]|['"]$/g, '');
            try {
              return parseGoogleClient(await readFile(resolve(root, path), 'utf8'), redirect);
            } catch {
              console.log(
                say(
                  '文件读取或校验失败。请选择下载的 Web 客户端 JSON，并核对回调地址。不会输出文件内容。',
                  'File read or validation failed. Choose the downloaded Web client JSON and verify its callback. Contents were not printed.',
                ),
              );
            }
          }
        };
        const login = await readClient(
          '登录客户端 JSON 路径',
          'Login client JSON path',
          current.origin + '/login/callback',
        );
        const health = await readClient(
          'Health 客户端 JSON 路径',
          'Health client JSON path',
          'http://127.0.0.1:8787/oauth/callback',
        );
        if (login.id === health.id) throw Error('Use two separate OAuth clients');
        console.log(
          say(
            '稍后请在 Google 同意页选择 ' + current.ownerEmail + '，并同意全部三项只读权限。',
            'On the Google consent page, choose ' +
              current.ownerEmail +
              ' and approve all three read-only scopes.',
          ),
        );
        return {
          LOGIN_CLIENT_ID: login.id,
          LOGIN_CLIENT_SECRET: login.secret,
          GOOGLE_CLIENT_ID: health.id,
          GOOGLE_CLIENT_SECRET: health.secret,
        };
      };
      await install({
        root,
        state: current,
        run,
        loadClients,
        reauthorize: args.includes('--reauthorize'),
        progress: console.log,
        confirmDeploy: () =>
          confirm(
            '将部署到 ' +
              current.workerName +
              ' / ' +
              current.origin +
              '。若绑定自有域名，确认该主机名没有其他现用服务',
            'Deploy to ' +
              current.workerName +
              ' / ' +
              current.origin +
              '. If binding a custom hostname, confirm it is not serving another application',
          ),
      });
      console.log(connectionGuide(current));
      console.log(
        say(
          '最后一步：在 ChatGPT 创建并安装插件，完成本人连接后实际调用一次。详细配置已保存到 .setup/CONNECT.md。',
          'Final step: create and install the plugin in ChatGPT, complete personal consent and make one actual tool call. Connection settings are saved in .setup/CONNECT.md.',
        ),
      );
      if (current.healthVerifiedAt)
        console.log(
          'Health reads last verified / Health 读取上次验证: ' + current.healthVerifiedAt,
        );
      // Open only the public plugin entry, never a token or authorization URL.
      if (
        (
          await ask('打开 ChatGPT 插件页面？yes/no', 'Open ChatGPT Plugins? yes/no', 'yes')
        ).toLowerCase() === 'yes'
      )
        await openBrowser('https://chatgpt.com/plugins');
    }
  } catch (e) {
    // Only messages generated by this installer are shown; do not print arbitrary errors.
    const text = e instanceof Error ? e.message : '';
    const safe =
      /^(Run |Node\.js |Use WSL|An existing|Existing wrangler|The generated|Invalid |Worker name:|A public|PUBLIC_ORIGIN|Stopped |No installer|No Cloudflare|Cloudflare |The saved|The workers|The custom|A Worker|Could not safely|Operation failed|Public verification|The hostname|Protected MCP|OAuth |Authorization |Health authorization|Use two |Unable to start|Command timed|The saved|Authorization was saved|Ambiguous namespace)/.test(
        text,
      )
        ? text
        : 'Setup did not complete. Check configuration, account permissions, DNS and consent, then rerun pnpm run setup. No credentials were printed.';
    console.error(say('安装未完成：', 'Setup incomplete: ') + safe);
    process.exitCode = 1;
  } finally {
    rl?.close();
  }
}
