# Setup guide / 配置指南

[中文](#中文) | [English](#english)

## 中文

入口是 `pnpm run setup`，可加 `--lang zh` 或 `--lang en`。Node.js 24+，macOS/Linux 或 WSL；在仓库根目录运行。`pnpm setup` 是 pnpm 自身命令。

### 自动完成与本人步骤

向导自动生成本地配置、创建或恢复两块 KV、渲染公开页面、部署并验证 OAuth 元数据、写入 Worker Secrets、完成本地 PKCE 回调与令牌刷新验证、测试 Health identity/steps/sleep/HRV/SpO2，最后输出 dot 连接卡。

本人仍需：Cloudflare 登录；Google Cloud 启用 Health API 和配置同意页；核对 Production 及必要审核要求；创建两个 Web OAuth 客户端并下载 JSON；Google 授权；在 ChatGPT 创建、安装和连接插件。向导会在正确阶段显示链接和精确参数，并等待本人完成。

两个客户端分别使用：

| 客户端 | 回调 | 权限 |
| --- | --- | --- |
| 登录 | `https://你的主机名/login/callback` | `openid email`，仅验证维护者 |
| Health | `http://127.0.0.1:8787/oauth/callback` | 三项 `googlehealth.*.readonly` |

Health 范围完整列表：

```text
https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly
https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly
https://www.googleapis.com/auth/googlehealth.sleep.readonly
```

Production 是发布状态，不等于已审核。不得绕过适用的 Google 要求。由本人核对未验证应用提示；Testing 阶段的旧授权应在 Production 后重新授权。自动刷新访问令牌不保证长期凭据永不失效。

### dot 安装参数

[ChatGPT 插件](https://chatgpt.com/plugins) → 添加自定义 MCP 服务器：

- 地址：`https://你的主机名/mcp`
- 身份验证：OAuth；客户端注册：CIMD；Token 认证：`none`
- 基础范围：`health:read`、`offline_access`，每行一个
- 创建后安装插件，以配置的本人 Google 账户完成连接，在 dot 选用 `@Personal Health` 实际查询一个完整日。

查看 [OpenAI 官方说明](https://developers.openai.com/api/docs/guides/custom-mcp-server#how-to-use)。账户和工作区限制仍然适用。仅 CLI 成功不等于 ChatGPT 端到端调用已验证。

### 恢复与故障

- 中断后重跑同一命令，保留同一个目录。状态存于 `.setup/state.json`，不含客户端密钥或健康记录；不要提交生成目录。
- 未识别或被修改的 `wrangler.toml` 会被保护。已有线上部署无需运行新装向导；请用全新目录试装。
- 自定义主机名须无现用 DNS 解析；向导不会替换已有记录。若使用 `workers.dev`，填写其完整地址，首段须与 Worker 名称一致。
- DNS/TLS 未就绪时，检查账户、域名和错误后重新运行；已创建 KV 不会重复创建。Cloudflare 权限或网络错误不会被当成“Worker 不存在”。
- 端口 8787 被占用时先关闭其他本地授权程序，再重试。服务器只监听 `127.0.0.1`，有状态校验和 PKCE。
- Health 授权已保存但某接口验证失败时，不会宣称全部成功；解决 API 可用性或权限后用 `--reauthorize` 重新验证。
- `--check` 仅检查公开 HTTPS 与 OAuth 元数据，显示上次 Health 验证时间，不读取私人记录。
- 维护者可运行 `pnpm run diagnose:health -- --client /path/to/health-client.json`；此只读诊断只输出接口状态，不持久化刷新后的凭据。需要重新授权时使用向导。

### 凭据与存储

凭据由本地下载的 Google JSON 读入内存，经标准输入上传到 Worker Secrets，不打印密钥。令牌包仅通过临时 `0600` 文件写入远端 KV，失败也清理临时文件。下载的原 JSON 由本人保管和按需删除；向导不自动删除用户文件。

`OAUTH_KV` 与 `TOKENS` 共用一个私有 KV 命名空间，Health 键以 `health:` 开头；`CACHE` 为另一命名空间，缓存最多五分钟。Cloudflare 管理员仍可能访问凭据与缓存。不要共享这些存储，也不要把 URL 当作授权凭据。

原每日同步始终独立。新归档选项仅导出代码和指南，需要额外 Apps Script/Drive 同意。保留现有选项不读取、更换或重新安装原触发器。

## English

Run `pnpm run setup`, optionally with `--lang zh` or `--lang en`, from the repository root. Requires Node.js 24+ on macOS/Linux or WSL. `pnpm setup` belongs to pnpm itself.

### Automated and personal steps

The wizard generates local configuration, creates/recovers two KV namespaces, renders policy pages, deploys and verifies OAuth metadata, uploads Worker Secrets, handles local PKCE consent, proves refresh, probes Health identity/steps/sleep/HRV/SpO2 and writes a dot connection card.

You personally complete Cloudflare login; Google Health API/consent/Production and any required review; two Web OAuth clients and JSON downloads; Google consent; ChatGPT plugin creation, installation and connection. The wizard provides exact parameters at the appropriate stage and waits.

- Login client callback: `https://YOUR_HOST/login/callback`; scopes: `openid email` only.
- Health client callback: `http://127.0.0.1:8787/oauth/callback`; scopes: the three full Google Health read-only URLs listed above.

Production is publishing status, not verification. Follow applicable Google requirements and review warnings yourself. Replace Testing grants after moving to Production. Automatic access-token refresh is not a guarantee of permanent authorization.

### Install in dot

Open [ChatGPT Plugins](https://chatgpt.com/plugins) → Add custom MCP server. Enter `https://YOUR_HOST/mcp`, OAuth, CIMD, token endpoint authentication `none`, and base scopes `health:read` and `offline_access` on separate lines. Create and install the plugin, connect as the configured owner, then select `@Personal Health` in dot and read a complete day. See [official OpenAI guidance](https://developers.openai.com/api/docs/guides/custom-mcp-server#how-to-use). Account/workspace restrictions apply. CLI success does not establish a successful ChatGPT end-to-end call.

### Resume and troubleshoot

- Rerun in the same directory. `.setup/state.json` holds progress without client secrets or health records; keep generated files untracked.
- Unrecognized/edited `wrangler.toml` is protected. Existing live installations do not need this wizard; use a fresh clone to try it.
- A custom hostname must have no existing DNS resolution. Existing records are never replaced. A full `workers.dev` URL must start with the selected Worker name.
- Resolve DNS/TLS or account errors, then resume. Created KV namespaces are reused; permission/network failures are never treated as proof that a Worker name is free.
- Free local port 8787 before retrying. Consent listens only on `127.0.0.1`, validates state and uses PKCE.
- Saved consent with failed read probes is not reported as fully verified. Resolve API availability/scopes and use `--reauthorize`.
- `--check` only verifies public HTTPS/OAuth and reports the last Health check time; it does not read private records.
- Owner diagnostic: `pnpm run diagnose:health -- --client /path/to/health-client.json`. It prints statuses only and cannot persist refreshed credentials; use the wizard for reauthorization.

### Credentials and optional archiving

Downloaded Google JSON is read into memory and uploaded through stdin to Worker Secrets without printing credentials. The token bundle is uploaded via a temporary mode-0600 file, cleaned even on failure. Keep/delete original downloaded JSON yourself; user files are never automatically deleted.

`OAUTH_KV` and `TOKENS` share a private namespace with application keys prefixed `health:`. `CACHE` is separate with up to five minutes of read caching. Cloudflare administrators may access stored credentials/cache. Do not share those namespaces or treat the endpoint URL as a credential.

Existing daily sync remains independent. The new-archive option exports sources/instructions and requires separate Apps Script/Drive consent. “Keep existing” neither reads nor reinstalls its trigger.
