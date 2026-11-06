# Personal Health Assistant

Google Health 只读同步 → 私人 Google Drive → ChatGPT dot 读取结果。

网站仅承载应用说明、隐私政策、条款与本地快照图表。每天的健康同步运行在 Google Apps Script；不依赖 VPS，也不需要保持电脑开机。

## 最简单的部署组合

1. **Google Apps Script**：复制三个文件，配置独立健康 OAuth 客户端，完成本人授权与首次同步。
2. **Cloudflare Pages**：连接本仓库，构建命令 `exit 0`，输出目录 `docs`。
3. **自定义子域名**：在 Pages 添加 `health.anotherdayu.com`，再根据控制台提示配置 DNS CNAME。
4. **长期授权**：确认公开政策页面可访问，补齐 Google Branding，检查是否可切换 Production；切换后重新授权并验证同步。
5. **ChatGPT dot**：通过本人连接的 Drive 插件读取 manifest、状态和最新简报。修改同步配置或主动执行同步需要另行授权的工具或维护任务，本仓库尚无远程管理 API。

安装健康同步见 [SETUP.md](SETUP.md)。网站托管见 [DEPLOY.md](DEPLOY.md)。

## 目录

```text
apps-script/   三个完整 Apps Script 文件，版本 2026-11-06.3
docs/          网站根目录，无框架、无需构建
  privacy/     隐私政策
  terms/       使用条款
  visualize/   仅在浏览器内读取本人选择的快照
deploy/       可选 VPS 的 Nginx/Caddy 示例
```

## 本地预览

```bash
python3 -m http.server 8080 --directory docs
```

打开 http://localhost:8080/。图表页面选择 v2 snapshot JSON，不接收 manifest。按指标与来源分开显示，不补零，不跨缺失日连线，不计算医疗结论。文件不上传服务器、不保存在浏览器持久存储中。

## 配置边界

- 网站 HTML 中的域名、维护者姓名和联系邮箱是当前个人部署的公开说明。其他人复用时必须改成自己的真实配置，不能沿用本维护者身份。
- 健康客户端 secret、访问令牌、刷新令牌、授权码均不进入源码或网站。
- 健康权限仅使用三项 googlehealth.*.readonly；Apps Script 仅使用 external_request、scriptapp 和 drive.file。
- 每次同步写入新一代文件并更新 manifest；状态为 partial 时应核对被拒绝的数据类型，不能当成全部更新。
- 每日目标时间 Europe/London 约 20:00（±15 分钟），不要承诺精确到分钟。
- Testing 健康授权七天限制不能用自动刷新延长；Production 也不保证授权永不被撤销。

## 当前交付状态

此前个人账户已验证独立健康授权、两项诊断 HTTP 200、实际同步 success 与一个每日触发器；这不代表任何其他账户已可用，也不代表本网站已部署或 OAuth 已切换 Production。

本仓库当前为私有整理版，无自动部署 workflow，未选择开源许可证。正式公开前请选定许可证、审阅 Google Health API 的当前访问条件、检查维护者信息，并确认仓库无私人数据或凭据。公开源码不等于公开健康数据。
