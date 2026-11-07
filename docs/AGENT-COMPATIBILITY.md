# Agent compatibility / 代理兼容性

## 中文

同一 Worker、Google Health 授权和只读工具可以供多个代理使用。每个代理另行完成 MCP 连接授权。默认仅允许现有 ChatGPT；不会自动把健康记录发送给新平台，也不会更改每日归档。

### 当前支持与验证边界

| 客户端 | 配置方式 | 已验证与尚需验证 |
| --- | --- | --- |
| ChatGPT dot | 原有 OAuth + CIMD | 原连接保留；新增客户端默认关闭 |
| Grok 网页／控制台 | `deploy/grok-clients.json` | 客户端 ID 和回调来自官方公开元数据；仍需账号内完成连接和实际工具调用 |
| Grok Bot | 精确 CIMD 或受限动态注册 | 官方说明可添加远程 MCP；不能假设 Bot 与 Grok 网页使用相同 OAuth 客户端，需要核对实际客户端／回调 |
| Meta Muse | 精确 CIMD 或受限动态注册 | 官方平台支持连接器；个人账号入口、认证参数和端到端工具调用需实测，不宣称已上架或获 Meta 批准 |
| 其他远程 MCP 客户端 | 精确 CIMD 或受限动态注册 | 支持 Streamable HTTP 和 OAuth 的客户端可配置；不能据此保证所有代理可用 |

Google Health、MCP 连接和某个平台的上架审批是三件不同的事。新代理不会得到 Google 刷新令牌；它通过自己的 MCP 令牌读取同一维护者的数据。

当前按**预兼容**交付：无需持有 Grok Bot 或 Muse 账户。通用协议、拒绝规则和合成授权流程已有测试；不能据此认定厂商应用已经实测可用。线上保持默认 ChatGPT-only，Grok 预设不会自行启用。

Muse 的待填模板是 `deploy/muse-clients.template.json`，其中回调为故意无效的占位符，原样应用会在本地校验失败，不会写入 Cloudflare。确认真实参数后填写；若 Muse 使用 CIMD，则按下文 CIMD 格式填写客户端 ID，而非凭名称猜测官方 URL。Grok Bot 若采用不同客户端，同样等待真实参数。

### 启用 Grok 网页客户端

先部署 0.4.2，再预览并应用：

```sh
pnpm run setup:agents -- --file deploy/grok-clients.json
pnpm run setup:agents -- --file deploy/grok-clients.json --apply --origin https://YOUR_HOST
```

使用本地 `wrangler.toml` 中的目标，或通过 `--config` 指定配置文件；`--origin` 必须与其中的 `PUBLIC_ORIGIN` 一致。默认命令只预览；`--apply` 才通过标准输入写入 Cloudflare 的 `MCP_CLIENT_POLICY`，不重写 Google 凭据。

到 Grok 的 Connectors → New Connector → Custom，填写 `https://YOUR_HOST/mcp`，使用 OAuth；若可选，注册方式为 CIMD，Token 认证为 `none`，范围为 `health:read offline_access`。在健康桥同意页核对客户端及精确回调，再用维护者本人 Google 账户确认。

Grok Bot 官方说明可在 Connect apps 中连接，或请求 Bot 添加远程 MCP 地址。若使用了不同的客户端 ID 或回调，需要另行加入精确规则，不能沿用网页连接成功的结论。

连接后先调用 `get_data_status`，核对授权和读取状态，不展示健康数值；再由本人决定是否查询睡眠或概览。发现工具列表不等于实际读取成功。

### Muse 和其他客户端的精确规则

从真实应用或其官方文档取得参数，不猜测回调地址。规则存为本地 JSON 数组。CIMD 示例中的域名仅为占位符：

```json
[
  {
    "mode": "cimd",
    "name": "My agent",
    "clientId": "https://agent.example.org/oauth/client.json",
    "redirectUris": ["https://agent.example.org/oauth/callback"]
  }
]
```

如果客户端使用动态注册（DCR），规则改为：

```json
[
  {
    "mode": "registration",
    "name": "My agent",
    "redirectUris": ["https://agent.example.org/oauth/callback"]
  }
]
```

只有配置了 `registration` 规则才启用 `/oauth/register`。客户端提交的所有回调都必须属于同一条规则，注册成功仍须本人登录同意。动态注册请求中的客户端名称不构成身份凭证；同意页使用维护者配置的名称，并显示实际客户端 ID 和回调。

规则采用精确匹配，拒绝 HTTP、通配符、IP、localhost、嵌入密码、片段和自定义端口。HTTPS 元数据获取继续由 Cloudflare 的 `global_fetch_strictly_public` 限制。公开应用自定义连接器与官方目录上架不同；如需 Muse 目录发布，应另外遵循其平台提交流程。

该版本不提供聊天中粘贴 API Key、URL 暗号或无认证的健康数据端点。只支持静态 API Key 的客户端尚未适配。

### 移除客户端与保留现有连接

配置命令会替换整个额外客户端白名单；启用多个代理时应把规则放在同一个文件。ChatGPT 内置规则始终保留。应用空数组 `[]` 可恢复为仅 ChatGPT。

每次 MCP 请求都会检查当前白名单；移除额外客户端后，它的已签发 MCP 令牌也不能再读取。此操作不会删除其他客户端授权、Google Health 凭据、缓存或 Apps Script 触发器；清除已接收数据需在相应平台单独处理。

### 来源

- [Grok 自定义 MCP](https://docs.x.ai/grok/connectors)
- [Grok 官方客户端元数据](https://grok.com/oauth/mcp-client.json)
- [Grok Bot 应用与 MCP](https://docs.x.ai/grok-bot/computer-and-apps)（以官方文档当前导航及实际账号界面为准）
- [Muse Connector Platform](https://platform.muse.ai/docs)

## English

One Worker can serve multiple explicitly enabled agents using the same read-only Health tools and Google grant. Each agent completes its own MCP consent. ChatGPT remains enabled by default; other clients are disabled until configured. Daily archiving is independent.

Grok's web/console preset uses its published CIMD document. This does not establish Grok Bot compatibility: obtain the Bot's actual client ID and redirects. Meta Muse's consumer entry and exact OAuth parameters also need account-level verification. No listing, vendor approval or end-to-end success is implied by protocol tests. This is a pre-compatibility release: no Grok Bot or Muse account is required to prepare it. Live extra clients remain disabled. The Muse template at `deploy/muse-clients.template.json` deliberately contains an invalid placeholder; applying it unchanged is rejected locally before network access or Cloudflare writes. Fill actual vendor callbacks only when available; do not guess them.

Deploy 0.4.2, preview `pnpm run setup:agents -- --file deploy/grok-clients.json`, then add `--apply --origin https://YOUR_HOST` to update the matching Worker's policy through stdin. `--config` selects a local Wrangler file. The command does not modify Google credentials or archive triggers.

`MCP_CLIENT_POLICY` is an array of exact rules shown above. `cimd` pairs a metadata URL with callbacks; `registration` enables restricted `/oauth/register` for that rule's exact callbacks. All submitted callbacks must belong to one rule. Owner login and consent remain mandatory. A registration's self-claimed name is not identity; consent displays the operator's label, actual client ID and exact redirect.

No HTTP, wildcard, loopback/IP, embedded credentials, fragments or custom ports. No public health endpoint or secret-in-URL fallback. Static-API-key-only clients are not supported by this version. Obtain callbacks from real applications or official documentation, never from guessed defaults.

The command replaces the entire extra-client policy; combine rules in one file. An empty array restores ChatGPT-only access. Every MCP call checks the current policy, so removed extra clients are denied even with previously issued access tokens. Other grants, Google credentials and daily sync are preserved. Data already delivered to another platform must be managed there.

After connecting, call `get_data_status` first and report statuses without measurements. A tool listing or public `/health` response alone is not an end-to-end read check. See the primary sources above for platform-specific requirements.
