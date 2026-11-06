# 网站部署：推荐 Cloudflare Pages

此项目为纯静态 HTML/CSS/JS。默认域名是 health.anotherdayu.com；复用者需统一替换 docs 中的 canonical URL、身份和联系信息。私人健康文件不得放进 docs。

## 方式 A：Cloudflare Pages（推荐，可保留私有仓库）

1. Cloudflare 控制台 → Workers & Pages → 新建 Pages 项目，连接 GitHub 的 DayuGuo/personal-health-assistant。只授予这个仓库的所需访问权限。
2. Production branch：main；Framework preset：None；Build command：`exit 0`；Build output directory：`docs`；Root directory：仓库根目录。
3. 部署成功后先检查控制台实际给出的 pages.dev 地址。
4. Pages 项目 → Custom domains → 添加 health.anotherdayu.com，然后按控制台提示新增 DNS：`CNAME health → <控制台实际项目名>.pages.dev`。不要凭空填写项目名，清理同名冲突 A/AAAA 后再切换。
5. 子域名使用外部 DNS 时不必把整个主域名的 nameservers 移到 Cloudflare。先在 Pages 添加域名，再配 CNAME，等待证书生效。不要修改主域名与 www 的现有记录。

Git 连接启用后，main 的后续提交可能自动更新线上网站；启用前请审阅页面内容和政策。当前并未替你启用部署。

官方：
- https://developers.cloudflare.com/pages/framework-guides/deploy-anything/
- https://developers.cloudflare.com/pages/configuration/custom-domains/
- https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/

## 方式 B：GitHub Pages

GitHub Free 支持公开仓库 Pages；私有仓库 Pages 取决于 GitHub 计划（例如 Pro/Team/Enterprise）。私有源码不代表发布后的 Pages 网站私有。若你不准备公开源码且没有相应计划，选择 Cloudflare Pages。

1. 仓库 Settings → Pages → Deploy from a branch，选择 main、/docs，保存。
2. 在 Custom domain 填 health.anotherdayu.com。
3. DNS 新增 CNAME：`health → dayuguo.github.io`，不要添加仓库路径，清理 health 的冲突 A/AAAA。
4. 等待 DNS/证书配置生效后开启 Enforce HTTPS。按 GitHub 提示验证域名所有权。

不要同时把同一个 health 子域名指向 GitHub Pages 与 Cloudflare Pages；选一个托管方。

官方：
- https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages
- https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site

## 方式 C：VPS（仍可使用）

把 docs/ 内容复制到 /var/www/health-assistant，参考 deploy/nginx-subdomain.conf.example，配置 HTTPS 与证书续期。已有 Caddy 时，把 docs/ 内容放在 /srv/health-assistant，合并 deploy/Caddyfile.example，校验后 reload。不要覆盖其他网站配置。

## 部署后验证

主页 /、隐私 /privacy/、条款 /terms/、图表 /visualize/ 应均可通过 HTTPS 访问。图表选择本地 v2 snapshot，不上传数据，不自动连接 Drive。

后续 OAuth 配置：

- Home: https://health.anotherdayu.com/
- Privacy: https://health.anotherdayu.com/privacy/
- Terms: https://health.anotherdayu.com/terms/
- Authorized domain: anotherdayu.com

网站部署完成不代表 Google Production、品牌验证或健康授权已完成。回原聊天确认部署完成，再检查线上页面、保存真实 Branding、处理域名验证、尝试 Production 和重新授权。
