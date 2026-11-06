# Deployment / 部署说明

[中文](#中文) | [English](#english)

## 中文

推荐通过 `pnpm run setup` 生成配置。向导把可配置模板 `public/` 渲染到被 Git 忽略的 `.setup/site/`，本地 `wrangler.toml` 指向该目录。邮箱、维护者名称、域名和 Worker 名称不需要修改源码。

| 路径 | 作用 |
| --- | --- |
| `/`、`/privacy/`、`/terms/` | 公开说明和个性化双语政策 |
| `/visualize/` | 主动选择本地 JSON 的图表，不自动读取 Drive 或上传文件 |
| `/start/` | 双语三步引导，只在本页生成提示词 |
| `/health` | 公开运行状态，不表示 Health 授权有效 |
| `/mcp` | 受 OAuth 保护的 Streamable HTTP，只接受已授权 POST 工具调用 |
| `/authorize`、`/oauth/token` | MCP 授权与令牌端点 |
| `/login/callback` | Google 本人身份验证回调 |

受保护资源元数据地址见 `/mcp` 401 响应的 `WWW-Authenticate` 头。OAuth 规范来源从配置的 `PUBLIC_ORIGIN` 派生，不从请求 Host 头推断。

### 部署与验证

首次向导会确认 Worker 名称未被占用、域名没有已有解析，然后创建资源并部署。自有域名通过 Cloudflare Worker Custom Domain 绑定；`workers.dev` 不创建自定义域名路由。使用者仍应确认对域名的控制和 Google 的实际发布条件。

完成向导后更新自己的部署：

```sh
pnpm typecheck
pnpm test
pnpm exec wrangler deploy --dry-run
pnpm run deploy
```

配置和 Secrets 已在本地/Cloudflare 的前提下，最后一条才会更新实际服务。本仓库没有自动 GitHub 部署。`pnpm run deploy` 的预检查会阻止发布未渲染的模板，避免旧配置误覆盖公开政策页。对现有但非向导管理的部署，不要直接运行新装；先保留现有本地配置与站点，使用独立目录试装。

安装验证分三层：

1. 公开页面、HTTPS、`/mcp` 401 和匹配本人的 OAuth/CIMD 元数据。
2. 本人 Google 同意、实际刷新令牌、五个 Health 读取接口，仅输出状态。
3. 本人在 ChatGPT 安装并连接插件，再由 dot 实际调用，核对日期和新鲜度。

Google Branding 使用自己的站点首页、`/privacy/`、`/terms/` 和适用的授权域名；先阅读生成的政策，确保与自己的实际部署一致。Google 客户端密钥只放 Worker Secrets；不要放进静态文件、GitHub、日志或 URL。

原 Apps Script 的 `/usercallback`、客户端、令牌、文件夹和定时任务独立保留。向导不会操作现有归档；新归档只是可选扩展，需要本人完成独立安装。

## English

Use `pnpm run setup` to generate configuration. It renders configurable `public/` templates to ignored `.setup/site/`, referenced by local `wrangler.toml`. No source edits are needed for owner email/name, origin or Worker name.

- Public explanation/policies: `/`, `/privacy/`, `/terms/`.
- Local JSON viewer: `/visualize/`; no automatic Drive access or uploads.
- Local-only three-question starter: `/start/`.
- Runtime status only: `/health`.
- OAuth-protected Streamable HTTP: `/mcp` (authorized POST calls).
- MCP authorization/token: `/authorize`, `/oauth/token`.
- Google identity callback: `/login/callback`.

Read the protected-resource metadata URL from `/mcp`'s 401 `WWW-Authenticate` header. The canonical OAuth audience comes from configured `PUBLIC_ORIGIN`, never a request Host header.

The wizard refuses occupied Worker names and resolving custom hostnames before creating resources. Custom origins use Cloudflare Worker Custom Domains; `workers.dev` requires no custom route. Verify domain control and applicable Google publishing requirements yourself.

After setup, update your deployment with typecheck, tests, a Wrangler dry run, then `pnpm run deploy` (commands above). Only the final command updates the real service and requires existing configuration/Secrets. No automatic GitHub deployment is enabled. The `pnpm run deploy` precheck blocks unrendered templates to prevent accidental replacement of legacy policy pages. Legacy installations should preserve local configuration/site assets and try the wizard in a separate clean directory.

Verification has three layers: public HTTPS/pages/protected MCP and matching OAuth/CIMD; owner consent plus real token refresh and five status-only Health probes; then personal ChatGPT plugin installation/connection and an actual dot tool call with record dates/freshness.

Google Branding uses your homepage, `/privacy/`, `/terms/` and applicable authorized domain. Review generated policies for accuracy. Client secrets belong only in Worker Secrets, never static assets, GitHub, logs or URLs.

Existing Apps Script callback/client/tokens/folder/trigger remain independent and untouched. New daily archives are optional and require separate personal setup/consent.


## Upgrade an existing Worker / 升级已有 Worker

Keep the exact Worker name, custom domain, PUBLIC_ORIGIN, OWNER_EMAIL, OAUTH_KV/TOKENS and CACHE namespace IDs and all four Worker Secrets. Do not run the new-install wizard against a legacy deployment, recreate KV, run secret bulk, replace token bundles or reinstall Apps Script. Render the updated policy assets with the same owner and daily-archive setting, then deploy code/assets using the existing configuration. Record the current version first; retain it as a rollback point.

升级时保留同一 Worker、域名、PUBLIC_ORIGIN、OWNER_EMAIL、原 KV 绑定及四项 Worker Secrets。不要运行新装向导、重建 KV、重写密钥或令牌包、重新安装 Apps Script。按原维护者及每日归档设置渲染新版页面后，使用原配置更新代码和资源，先记录旧版本供回滚。

After deployment, verify `/health` version, protected MCP and unchanged secret names; call an old tool through the existing ChatGPT connection before refreshing tool metadata. Refresh the plugin's tool list to discover the three new tools, then test status, overview and guide. No new Google scopes or consent is required by this release. A revoked/invalid existing grant can still require owner action.

部署后核对版本、MCP 保护及密钥名称，先用原 ChatGPT 连接调用旧工具，再刷新插件工具列表并测试三项新能力。本版本不增加 Google 权限，不要求重新授权；若原授权本身已失效则仍需本人处理。
