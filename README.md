# Personal Health Assistant / 个人健康助手

[中文](#中文) | [English](#english)

## 中文

这是一个运行在 **Cloudflare Workers** 上的私人、只读 Google Health MCP 服务，让你在 **ChatGPT dot（工作模式）** 中通过插件查询自己的活动、睡眠和健康指标。

它改编自 [Ring8688/google-health-worker-mcp-V1](https://github.com/Ring8688/google-health-worker-mcp-V1)，上游基于 [tachibanayu24/fitbit-googlehealth-mcp](https://github.com/tachibanayu24/fitbit-googlehealth-mcp)。保留上游 MIT 版权与 [LICENSE](LICENSE)。

### 在 dot 中如何使用

**Personal Health 是 ChatGPT 中的自定义 MCP 插件**；Cloudflare Worker 是为插件提供工具的后端。完成部署和本人授权后，在 dot 中选用 Personal Health，直接提出问题，例如：

> 查看我最近一周的睡眠和活动趋势，并说明数据日期与新鲜度。

dot 按需读取 Google Health 记录，Google 凭据不会交给模型。当前开放只读能力，不会修改健康记录。连接插件本身不会创建定时监测任务。

### 各部分的作用

| 部分 | 作用 |
| --- | --- |
| Cloudflare Worker | 提供需要授权的 Streamable HTTP `/mcp`、Google 身份验证、公开政策页面和本地快照可视化页面。 |
| 授权 KV | 保存加密的 MCP OAuth 记录及维护者的 Health 令牌包。`OAUTH_KV` 与 `TOKENS` 绑定同一个命名空间，Health 应用键使用 `health:` 前缀。Cloudflare 账户管理员可以访问 Health 令牌，请勿共享该存储。 |
| 缓存 KV | 保存最长五分钟的读取缓存。工具结果说明缓存新鲜度。 |
| 原 Apps Script | 独立执行每日同步并归档到私人 Google Drive；现有部署约在伦敦时间 20:00 运行。Worker 本身没有 cron，不会修改原触发器或云盘文件。 |
| ChatGPT dot | 通过已授权的 MCP 插件按需查询和分析记录。 |

### 相比上游的安全与数据处理调整

- 使用 Cloudflare 官方 OAuth 提供程序库实现 OAuth 2.1、PKCE、受保护资源发现和 ChatGPT CIMD；访问链接不包含暗号，也不依赖仅允许 Anthropic 出口的 IP 白名单。
- 只允许配置的维护者本人通过已验证的 Google 邮箱连接。登录客户端（`openid email`）与 Health 客户端（三项 `googlehealth.*.readonly` 权限）分开配置。
- OAuth 库处理客户端同意和与浏览器绑定的状态，只接受 ChatGPT 客户端元数据与回调主机。此版本面向个人使用。
- 不注册写入、删除、预设以及需要额外个人资料、设置或营养权限的工具；保留的上游映射文件不代表已开放这些权限。
- 默认按伦敦日历处理日期，校验真实日期，单次范围最多 90 天；固定数据来源类型，完整处理分页，达到分页保护上限时报错，避免静默截断；API 错误会脱敏。
- 初始化通过标准输入或权限为 `0600` 的临时文件写入凭据，随后删除临时令牌文件，不打印令牌、授权码或包含密钥的命令。`.bootstrap-secrets.json` 被 Git 忽略，仅供本地初始化使用；限制为本人可读，并在验证完成后删除。

### 最简配置流程

1. 安装 Node.js 24+ 和 pnpm，运行 `pnpm install --frozen-lockfile`。
2. 将 `wrangler.toml.example` 复制为被 Git 忽略的 `wrangler.toml`，配置自己的 `PUBLIC_ORIGIN`、`OWNER_EMAIL`、Worker 名称，以及 `src/index.ts` 中的规范来源地址。
3. 创建两个 KV 命名空间：授权存储同时绑定为 `OAUTH_KV` 与 `TOKENS`，缓存存储绑定为 `CACHE`。在本地填写自己的 ID。
4. 在 Google Cloud 启用 Health API，仅申请三项只读权限：`activity_and_fitness.readonly`、`health_metrics_and_measurements.readonly`、`sleep.readonly`（均使用 `https://www.googleapis.com/auth/googlehealth.` 前缀）。Health 令牌不要混入 Drive 或 Apps Script 权限。
5. 创建两个 **Web application** OAuth 客户端：登录回调为 `https://YOUR_HOST/login/callback`，Health 本地授权回调为 `http://127.0.0.1:8787/oauth/callback`。在本地 `.bootstrap-secrets.json` 中配置 `LOGIN_CLIENT_ID`、`LOGIN_CLIENT_SECRET`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`，不要提交该文件。
6. 运行 `pnpm exec wrangler deploy`，绑定域名，检查公开政策页面，填写 Google Branding 并确认 Production 发布条件。Production 是发布状态，不等于 Google 已审核通过，也不保证令牌永久有效。
7. 运行 `pnpm run setup:health`，在同一台电脑打开 `http://127.0.0.1:8787/auth` 并由本人同意。脚本验证 `health.identity` 返回 200 后，安全写入 Worker Secrets 和 Health 令牌包并结束。
8. 在 ChatGPT「插件 → 添加 → 添加自定义 MCP 服务器」中填写 `https://YOUR_HOST/mcp`，选择 OAuth / CIMD。高级 OAuth 设置中的基础授权范围填写 `health:read` 与 `offline_access`（每行一个），创建插件并由配置的维护者本人完成连接。随后在 dot 中选用该插件；能否使用仍取决于账户和工作区权限。
9. 从 dot 实际调用工具，检查记录日期、数据新鲜度，以及空记录和错误处理。公开 `/health` 返回 200 仅说明 Worker 正在运行。

个人应用可能仍出现 Google「未验证」提示，请本人核对后决定是否继续。切换 Production 后，应重新授权以替换原 Testing 阶段的授权；保留原每日归档时，还需为 Apps Script 的独立客户端重新授权。访问令牌自动刷新不代表授权永不失效。

### 仓库与验证

- `src/`、`scripts/`、`test/`：健康桥代码、初始化脚本与测试。
- `public/`：网站与本地快照查看器。查看器仅在浏览器内存中处理你选择的 JSON，不会自动读取 Drive 或上传文件。
- `apps-script/`：保留的每日同步源代码。
- `wrangler.toml.example`：可移植部署模板。本仓库未启用自动 GitHub 部署。

运行 `pnpm typecheck`、`pnpm test`、`pnpm exec wrangler deploy --dry-run` 验证代码。

维护者可在本地运行 `pnpm exec tsx scripts/diagnose-health.ts`。它仅在内存中读取远端令牌并输出接口状态，不修改令牌；需要新令牌时重新运行初始化。不要执行会直接打印令牌包的 Wrangler 命令。

### 数据与功能边界

只能返回已存在且在授权范围内可访问的记录。缺失记录不等于零，当天数据可能不完整，不同来源和计算方法也可能有差异；统计结果不构成医疗诊断。

健康接口需要授权，可视化页面不会公开健康数据。该桥不会写入健康记录、修改旧 Takeout 历史或自动安装 dot 监测计划。各自部署时仍需确认 Google API 可用性、托管额度、账户权限和上游接口结构。

配置细节见 [SETUP.md](SETUP.md)，部署与域名说明见 [DEPLOY.md](DEPLOY.md)。

## English

Personal Health is a **custom MCP plugin in ChatGPT dot (Work mode)**. The Cloudflare Worker is its backend. Select the plugin in dot and ask, for example: “Review my sleep and activity trends over the past week, and include record dates and freshness.” Connecting the plugin does not create a monitoring schedule.

Private, read-only Google Health MCP bridge on Cloudflare Workers, adapted from [Ring8688/google-health-worker-mcp-V1](https://github.com/Ring8688/google-health-worker-mcp-V1), originally based on [tachibanayu24/fitbit-googlehealth-mcp](https://github.com/tachibanayu24/fitbit-googlehealth-mcp). Upstream MIT copyright is preserved in LICENSE.

### What runs where

- **Cloudflare Worker:** authenticated Streamable HTTP `/mcp`, Google sign-in, public policy pages, local snapshot viewer.
- **Two KV namespaces:** one for encrypted MCP OAuth records and the owner's Health token bundle; one for short-lived read cache (maximum five minutes). OAUTH_KV and TOKENS bind to the same namespace, with health application keys prefixed `health:`. KV health tokens are accessible to Cloudflare account administrators; do not share these namespaces.
- **Existing Apps Script:** daily Europe/London approximately 20:00 sync and private Drive archive remain independent. This Worker has no cron and does not modify that trigger or Drive files.
- **ChatGPT dot:** uses the authenticated MCP plugin to query records on demand. The bridge never gives Google credentials to the model.

### Security changes from upstream

- No secret in a URL and no Anthropic-only IP gate. Standard OAuth 2.1 using Cloudflare's provider library, PKCE, protected resource metadata and ChatGPT CIMD support.
- Only the configured owner's verified Google email may connect; other accounts fail closed. Login client (`openid email`) and Health client (three `googlehealth.*.readonly` scopes) are separate.
- Client consent and browser-bound state are handled by the provider library. Only ChatGPT client metadata and callback hosts are accepted. This personal deployment is not an unrestricted multi-user service.
- Write/delete/preset tools and tools needing extra profile/settings/nutrition scopes are not registered. The provider mapping files are inherited; their presence does not grant permissions.
- London calendar defaults, real date validation, maximum 90-day ranges, fixed source families, pagination with truncation refusal, cache freshness in tool results, and redacted API errors.
- Bootstrap writes credentials directly with stdin/temporary mode-0600 files, then deletes temporary token files; it never prints tokens, authorization codes or secret-bearing commands. The ignored local `.bootstrap-secrets.json` holds the four client configuration values until provisioning finishes. Keep it owner-readable and delete it after verification.

### Minimal setup

1. Install Node.js 24+ and pnpm. Run `pnpm install --frozen-lockfile`.
2. Copy `wrangler.toml.example` to ignored `wrangler.toml`; set PUBLIC_ORIGIN, OWNER_EMAIL, Worker name and the canonical origin in `src/index.ts` for your own deployment.
3. Create two KV namespaces. Bind the authorization namespace as both OAUTH_KV and TOKENS, and the cache namespace as CACHE. Configure the IDs locally, never copy another person's storage IDs.
4. In Google Cloud enable Health API. Keep the three scopes: activity_and_fitness.readonly, health_metrics_and_measurements.readonly, sleep.readonly. Do not combine Drive/script scopes into Health tokens.
5. Create two **Web application** clients: login callback `https://YOUR_HOST/login/callback`; dedicated Health callback `http://127.0.0.1:8787/oauth/callback`. Set `.bootstrap-secrets.json` to a JSON object containing LOGIN_CLIENT_ID, LOGIN_CLIENT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET. Do not commit this file.
6. Deploy with `pnpm exec wrangler deploy`, bind the custom domain, verify public policy pages, fill Google Branding, and check Production eligibility. Production is not verification and tokens are never guaranteed permanent.
7. Run `pnpm run setup:health`. Open `http://127.0.0.1:8787/auth` on that same computer; complete Google consent. The local script verifies health.identity HTTP 200, writes Worker Secrets and the Health bundle safely, then closes. It requests only the three read scopes above.
8. In ChatGPT Plugins → Add custom MCP server: name Personal Health Assistant, endpoint `https://YOUR_HOST/mcp`, choose OAuth/CIMD where offered, set base scopes to `health:read` and `offline_access` (one per line), create as a plugin, approve client consent and sign in using the configured owner. Enable the plugin for your dot. Account/workspace eligibility still applies.
9. Test an actual tool call from dot, including empty/error cases, record dates and freshness. A public `/health` 200 proves only that the Worker is running, not that Google Health or dot linking works.

Google may show an unverified-app warning for personal use; review it yourself. Publishing Google OAuth does not mean Google approved the application. Existing Testing-mode grants should be replaced by a fresh Production authorization, including the separate Apps Script grant if that archive is retained.

### Repository layout

`src/`, `scripts/`, `test/`: bridge code and validation. `public/`: website assets. `apps-script/`: retained daily-sync source. `wrangler.toml.example`: portable deployment template. No automatic GitHub deployment is enabled in this repository.

### Validation

`pnpm typecheck`, `pnpm test`, `pnpm exec wrangler deploy --dry-run`.

`pnpm exec tsx scripts/diagnose-health.ts` is an owner-only local diagnostic. It reads the remote token into memory and prints endpoint status only. It does not modify tokens; rerun setup if a fresh token is needed. Do not run Wrangler commands that print the token bundle directly.

### Boundaries

Only existing records accessible to the approved scopes can be returned. Missing records are not zero; current-day activity can be incomplete. Source/method differences matter. Statistics are not diagnoses. Broad claims of "all body data" or "permanent authorization" are not made.

There is no public Google Health endpoint, no unauthenticated health dashboard, no new health writes, no change to the old Takeout history, and no promise that connecting this server automatically installs a dot monitoring schedule. Google API availability, host quotas, account permissions and upstream schemas must be checked for each deployment.
