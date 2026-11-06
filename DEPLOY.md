# Deployment / 部署说明

[中文](#中文) | [English](#english)

## 中文

本项目部署到 **Cloudflare Workers**。公开网站与需要授权的 MCP 接口共用 [health.anotherdayu.com](https://health.anotherdayu.com)。

### 路径与作用

| 路径 | 作用 |
| --- | --- |
| `/`、`/privacy/`、`/terms/`、`/visualize/` | 公开首页、隐私政策、条款和本地快照查看器 |
| `/mcp` | 需要授权的 Streamable HTTP MCP 接口 |
| `/health` | 公开运行状态，仅检查 Worker |
| `/authorize`、`/oauth/token` | MCP 授权与令牌端点 |
| `/login/callback` | Google 本人身份验证回调 |

受保护资源的元数据地址见 `/mcp` 未授权响应（401）的 `WWW-Authenticate` 头。

快照查看器只在浏览器内存中处理你主动选择的本地 JSON，不会自动读取 Drive 或上传文件；MCP 查询是另行授权的请求。

### 密钥与域名

Google 客户端密钥保存到 Worker Secrets。不要把它们放进公开网站资源、GitHub Actions 日志、CNAME 文件或连接器 URL。KV 命名空间 ID 放在被 Git 忽略的本地 `wrangler.toml`，仓库模板保留占位符。

先检查 `health` 子域名没有冲突记录，再在本地 `wrangler.toml` 顶层加入：

```toml
routes = [{ pattern = "health.anotherdayu.com", custom_domain = true }]
```

然后运行 `pnpm exec wrangler deploy`。请勿修改主博客或其他子域名。其他人复用时应替换为自己的域名；已有服务占用主机名时，先核实该服务再处理。

### Google Production 配置地址

- 首页：[https://health.anotherdayu.com/](https://health.anotherdayu.com/)
- 隐私政策：[https://health.anotherdayu.com/privacy/](https://health.anotherdayu.com/privacy/)
- 条款：[https://health.anotherdayu.com/terms/](https://health.anotherdayu.com/terms/)
- 已授权域名：`anotherdayu.com`

原 Apps Script 的 `/usercallback` 回调和客户端独立保留，不要替换为 Worker 的登录回调。自部署时请填写自己控制的域名与相应页面。

### 参考文档

- [ChatGPT 插件身份验证](https://developers.openai.com/plugins/build/auth)
- [连接 ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Cloudflare workers-oauth-provider](https://github.com/cloudflare/workers-oauth-provider)

## English

This project now uses **Cloudflare Workers**, not a Pages-only site. Public policies and the private MCP endpoint share https://health.anotherdayu.com.

- Public site: `/`, `/privacy/`, `/terms/`, `/visualize/`
- Private Streamable HTTP: `/mcp`
- Public status: `/health` (runtime only)
- MCP authorization: `/authorize`, `/oauth/token`
- Google identity callback: `/login/callback`
- Protected resource discovery: read the metadata URL in the `/mcp` 401 WWW-Authenticate header.

The static viewer processes selected local snapshot JSON only in browser memory; it does not automatically access Drive or upload files. MCP tool calls are separate authenticated requests.

Google client secrets belong in Worker Secrets. Never put them in public assets, GitHub Actions logs, a CNAME file or a connector URL. Keep namespace IDs in ignored local wrangler.toml; the committed template contains placeholders.

For custom domain binding, after confirming no conflicting health DNS record exists, add a top-level `routes = [{ pattern = "health.anotherdayu.com", custom_domain = true }]` to local wrangler.toml, then deploy. Do not change the main blog or other subdomains. If the hostname is already used, inspect its actual service before replacing anything.

Production OAuth URLs:
- Home: https://health.anotherdayu.com/
- Privacy: https://health.anotherdayu.com/privacy/
- Terms: https://health.anotherdayu.com/terms/
- Authorized domain: anotherdayu.com

The Apps Script `/usercallback` URI and its client remain separate and must not be replaced by the Worker login callback.

MCP transport/authentication documentation:
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/deploy/connect-chatgpt
- https://github.com/cloudflare/workers-oauth-provider
