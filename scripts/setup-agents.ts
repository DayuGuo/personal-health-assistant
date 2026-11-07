import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseClientPolicy } from '../src/auth/clients';
import { publicOrigin } from '../src/lib/deployment';
import { requireCommand, wranglerRunner, type Runner } from './setup/process';

export async function configureAgents(args: string[], run?: Runner, fetcher: typeof fetch = fetch) {
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    if (index < 0 || !args[index + 1] || args[index + 1]!.startsWith('--'))
      throw Error(`Missing ${flag}`);
    return args[index + 1]!;
  };
  const policy = parseClientPolicy(await readFile(resolve(value('--file')), 'utf8'));
  console.log(
    'Agent clients / 代理客户端: ' +
      (policy.map((p) => p.name).join(', ') || 'ChatGPT only / 仅 ChatGPT'),
  );
  for (const p of policy) console.log(JSON.stringify(p));
  if (!args.includes('--apply')) {
    console.log(
      'Preview only / 仅预览；添加 --apply --origin https://你的主机名 才写入 Cloudflare。',
    );
    return;
  }
  const origin = publicOrigin(value('--origin'));
  const config = resolve(args.includes('--config') ? value('--config') : 'wrangler.toml');
  const configText = await readFile(config, 'utf8');
  const configuredOrigin = configText.match(/^PUBLIC_ORIGIN\s*=\s*"([^"\r\n]+)"\s*$/m)?.[1];
  if (configuredOrigin !== origin)
    throw Error('PUBLIC_ORIGIN does not match the requested deployment');
  const response = await fetcher(origin + '/health', {
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  const status = (await response.json()) as { version?: string; mode?: string };
  if (!response.ok || status.version !== '0.4.2' || status.mode !== 'read-only')
    throw Error('Deploy the matching 0.4.2 read-only Worker before configuring agents');
  await requireCommand(
    run ?? wranglerRunner(config),
    ['secret', 'put', 'MCP_CLIENT_POLICY'],
    JSON.stringify(policy),
  );
  console.log('已更新代理白名单 / Agent policy updated: ' + origin);
  console.log('请在每个代理内单独添加 /mcp 并完成本人授权；Google Health 凭据和每日同步未作修改。');
  console.log(
    'Connect and authorize each agent separately. Google Health credentials and daily sync were not changed.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.includes('--help'))
    console.log(
      'pnpm run setup:agents -- --file deploy/grok-clients.json\npnpm run setup:agents -- --file your-policy.json --apply --origin https://YOUR_HOST\nDefault: preview only. Empty JSON array restores ChatGPT-only access. See docs/AGENT-COMPATIBILITY.md.',
    );
  else
    try {
      await configureAgents(args);
    } catch {
      console.error(
        'Agent configuration incomplete / 代理配置未完成。检查白名单、目标地址、Worker 版本及 Cloudflare 权限；未输出凭据。',
      );
      process.exitCode = 1;
    }
}
