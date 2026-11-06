# Owner setup / 配置说明

[中文](#中文) | [English](#english)

## 中文

完整部署流程见 [README.md](README.md)。本地 Health 初始化仅申请三项只读权限，并直接安全保存凭据，回调地址为 `http://127.0.0.1:8787/oauth/callback`。

### 保留原每日同步

`apps-script/` 是独立的每日归档程序。添加健康桥时，保留它原来的 Cloud 项目、回调、OAuth 客户端、令牌属性、云盘文件夹 ID 和触发器。

共享的 Google OAuth 应用从 Testing 切换到 Production 后，为原每日同步单独续权：

1. 在 Apps Script 中运行 `authorizeHealth`，由本人完成 Google 同意页。
2. 运行 `diagnoseSetup`，检查 Health 与 Drive 诊断结果。
3. 运行 `authorizeAndInstall`，完成实际同步和每日触发器安装。
4. 确认只保留一个 `syncDaily` 触发器，并保留其他无关任务。

### 连接 ChatGPT dot

Personal Health 在 ChatGPT 中以**自定义 MCP 插件**存在。添加 `https://YOUR_HOST/mcp`，使用 OAuth / CIMD，在基础授权范围中填写 `health:read` 与 `offline_access`（每行一个），然后由配置的维护者本人登录和同意。

在 dot（工作模式）中选择 Personal Health，实际调用一个只读工具，核对日期、记录是否存在和数据新鲜度。只看到网站或 `/health` 正常，不代表完整连接已成功。

### Production 与重新授权

Production 是发布状态，不代表 Google 已审核通过。新授权仍可能显示未验证应用提示，需要本人核对并决定是否继续；有审核要求时应按实际要求办理。

访问令牌会自动刷新，但撤销授权、长期未使用或其他凭据失效条件仍可能导致重新授权。不能仅凭代码保存成功或网站上线就宣称授权和审核完成。

## English

Read README.md for bridge deployment and authentication. The local Health setup requests only three read scopes, stores secrets directly, and uses `http://127.0.0.1:8787/oauth/callback`.

The preserved `apps-script/` program remains a separate daily archive. Do not replace its Cloud project, callback, client, token properties, folder IDs or trigger while adding the bridge. After the shared OAuth app moves from Testing to Production, run that Apps Script's `authorizeHealth`, complete its own consent, and then run `diagnoseSetup` followed by `authorizeAndInstall` for a real sync to ensure the old seven-day grant was replaced. Keep only one syncDaily trigger and preserve unrelated tasks.

Google Production is a publishing status, not a verification result. New authorizations can still show Google's unverified-app warning. Owner consent and any required review are user steps; never claim them complete based only on saving code or deploying a website.

For the ChatGPT custom MCP plugin, use OAuth/CIMD and set the base scopes to `health:read` and `offline_access` (one per line). Select Personal Health in dot (Work mode) and verify an actual read-only tool call, record dates and freshness.
