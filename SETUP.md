# 配置 Google 健康同步

## 1. 准备 Google 项目

为自己的 Google 账户准备 Apps Script 项目，关联本人标准 Google Cloud 项目，检查 Google Health API 和 Google Drive API 可用并启用。Google Health API 的实际可用性与账户、地区及当前服务政策有关，先阅读 https://developers.google.com/health/setup 。

配置 OAuth 应用名称、支持邮箱、开发者邮箱和 External 测试用户。Data access 保留脚本权限及三个健康只读范围。不要扩大为健康写入权限或全云盘权限。

## 2. 复制三个文件

将 apps-script/ 下 Code.gs、Setup.gs、appsscript.json 的内容完整复制到自己的 Apps Script 项目，避免重复的旧函数。保存并刷新核对 APP_VERSION = 2026-11-06.3。

清单仅包含 script.external_request、script.scriptapp、drive.file；健康范围由独立 OAuth 客户端申请。

## 3. 独立健康 OAuth 客户端

在 Google Cloud 的 Google Auth Platform → Clients 新建 Web application 客户端，名称可用 Personal Health Read Only，JavaScript origins 留空。

在自己的 Apps Script 运行 showHealthRedirectUri，将实际输出原样添加到客户端 Authorized redirect URIs。它应是 `https://script.google.com/macros/d/<YOUR_SCRIPT_ID>/usercallback`，不能用编辑器或 /exec 地址。

在 Script properties 保存 GH_CLIENT_ID、GH_CLIENT_SECRET，不清除其他属性。不把秘密粘贴进聊天、日志、仓库或网站。

三个健康范围：

- https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly
- https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly
- https://www.googleapis.com/auth/googlehealth.sleep.readonly

## 4. 两层授权与验证

1. 运行 authorizeAndInstall，完成脚本权限同意。
2. 在执行日志打开生成的私人健康授权链接，一小时内完成三个健康范围同意。
3. 回调显示成功后，再运行 authorizeAndInstall。不要手动运行 healthOAuthCallback。
4. 运行 diagnoseSetup，确认 health.identity 与 drive.files.list 都为 HTTP 200。
5. 核对实际同步 success/partial、文件夹 URL、manifest、状态和同一代文件 run_id；核对仅有一个 syncDaily 触发器。安装函数不会自动删除重复触发器，发现重复时只处理本项目同名项，保留其他任务。

每日同步在 Google 云端运行，结果保存在本人 Drive。旧历史文件不要改写或删除。授权链接过期可运行 authorizeHealth 重试，不能分享其 state、授权码或令牌。

## 5. 长期运行

网站上线后填写本人真实主页、隐私与条款链接，按当前要求验证域名所有权；检查控制台能否发布到 Production。个人自用的免 OAuth 验证例外不自动等于所有 Branding 要求均豁免，以当前官方文档和实际控制台为准。

Production 后重新运行 authorizeHealth 并完成本人授权，再运行诊断和实际同步。无论何种发布状态，令牌仍可能因撤销或安全策略等失效。监测 sync_status.json 的最近成功时间，失败时请排查安全诊断；不要反复新建客户端或扩大权限。

## 6. 使用 ChatGPT dot

本人给 dot 连接 Google Drive 插件，并提供自己生成的文件夹链接。要求它先读 live_manifest.json 与 sync_status.json，再按指针读取最新简报，核对 run_id 和日期后报告。持续检查与通知需明确安排并由 dot 确认；首次设置本流程不会自动给 dot 创建定时任务。

本仓库不提供 Google Health 令牌给 dot，也不提供公开触发同步 API。后续管理功能应使用受认证的工具接口或授权的 Codex/浏览器维护任务。
