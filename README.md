# Personal Health Assistant / 个人健康助手

[中文](#中文) | [English](#english)

## 中文

把自己的 Google Health 记录接入 **ChatGPT dot（工作模式）**。每个人部署自己的 Cloudflare Worker，在自己的 dot 中安装 Personal Health 自定义 MCP 插件。活动、睡眠和健康指标按需只读查询；原始凭据不会交给模型。

### 从这里开始

准备 Node.js 24+、pnpm、Cloudflare 账户，以及有权访问 Google Health API 和相应记录的 Google 账户。使用 macOS 或 Linux；Windows 请使用 WSL。准备一个未使用、由你控制的子域名，或完整的 Worker `workers.dev` 地址。

```sh
git clone https://github.com/DayuGuo/personal-health-assistant.git
cd personal-health-assistant
pnpm install --frozen-lockfile
pnpm run setup
```

**请使用 `pnpm run setup`。`pnpm setup` 是 pnpm 自身的保留命令，不会运行本项目向导。**

选择中文或英文后，向导会：

1. 收集本人邮箱、公开维护者名称、Worker 名称和 HTTPS 地址，不用修改源码。
2. 引导 Cloudflare 登录、选择账户，自动创建两块 KV，生成本地配置及个性化双语政策页。
3. 核对部署目标后部署，检查 HTTPS、MCP 的授权保护与 OAuth/CIMD 元数据。
4. 在公开页面就绪后，引导你配置 Google Cloud、Production 与两个 Web OAuth 客户端。你只需选择下载的客户端 JSON 文件，无需手写密钥文件或复制包含凭据的命令。
5. 打开本机 Google 同意页，验证实际令牌刷新和五个 Health 读取接口，并将凭据安全写入自己的 Cloudflare。
6. 生成 `.setup/CONNECT.md`，列出 dot 插件地址和授权参数。最后由本人在 ChatGPT 创建、安装、连接插件并实际调用一次。

Google 控制台配置、发布状态核对和本人同意不能由终端替代。Production 不等于 Google 审核通过，也不保证授权永久有效。ChatGPT 功能能否使用取决于账户和工作区权限。

### 每日归档是可选项

- **不安装（默认）**：只使用 dot 按需查询，无需 Apps Script 或 Drive 权限。
- **保留现有**：向导不会访问或更改已有脚本、令牌、云盘文件或触发器。
- **新装独立归档**：导出源文件和双语指南到 `.setup/daily-sync/`，由本人在 Apps Script 完成独立授权和安装。此选项不会自动创建触发器，也不复用健康桥的令牌。

### 继续、排错和使用

```sh
pnpm run setup --lang en       # 英文 / English
pnpm run setup --dry-run       # 仅查看计划，不写文件或调用云服务
pnpm run setup                # 从保存的进度继续
pnpm run setup --check         # 仅检查公开站点及 OAuth 发现，不检查私人健康数据
pnpm run setup --reauthorize   # 为本向导管理的部署重新授权
```

现有但非本向导生成的 `wrangler.toml`、已被占用的 Worker 名称或已解析的自定义主机名会被保护。请用干净的克隆目录新装，不要把已有配置和新装流程混用。下载的 Google JSON 含密钥，请本人妥善保管；向导只读取，不复制到仓库。

在 dot 选用 **@Personal Health**，问：“我昨晚睡得怎么样？先检查日期与新鲜度，再与我的历史记录比较。”更多入口见 [dot 使用模板](docs/DOT-PROMPTS.md)。

### 文档与开发

- [完整配置、恢复与安全边界](SETUP.md)
- [部署结构与验证](DEPLOY.md)
- [WHOOP / Google Health Coach 调研及产品方向](docs/PRODUCT.md)
- `src/`：MCP 与 Google Health 适配；`scripts/`：向导与诊断；`public/`：可配置网站模板；`apps-script/`：独立可选归档。

```sh
pnpm typecheck
pnpm test
pnpm exec wrangler deploy --dry-run
```

最后一条需要已生成的本地配置和站点。CLI 不会自动将插件发布到 ChatGPT 插件目录，也不自动创建 AI 监测计划。数据可能缺失或延迟；缺失不等于零，统计不是医疗诊断。当前日历默认 Europe/London，单次日期范围最多 90 天。

### 来源与许可证

改编自 [Ring8688/google-health-worker-mcp-V1](https://github.com/Ring8688/google-health-worker-mcp-V1)，上游基于 [tachibanayu24/fitbit-googlehealth-mcp](https://github.com/tachibanayu24/fitbit-googlehealth-mcp)。保留上游 MIT 版权与 [LICENSE](LICENSE)。

## English

Connect your Google Health records to **ChatGPT dot (Work mode)**. Each owner deploys their own Cloudflare Worker and installs a Personal Health custom MCP plugin in their own dot. Activity, sleep and health measurements are read on demand; Google credentials are never provided to the model.

### Start here

Requirements: Node.js 24+, pnpm, a Cloudflare account, and a Google account with access to the Health API and applicable records. Use macOS or Linux, or WSL on Windows. Prepare an unused subdomain you control or the full `workers.dev` URL for your Worker.

```sh
git clone https://github.com/DayuGuo/personal-health-assistant.git
cd personal-health-assistant
pnpm install --frozen-lockfile
pnpm run setup
```

**Use `pnpm run setup`. `pnpm setup` is pnpm's own reserved command and does not start this wizard.**

Choose Chinese or English. The wizard:

1. Collects owner email, public maintainer name, Worker name and HTTPS origin without source edits.
2. Guides Cloudflare login/account selection, creates two KV namespaces and generates local configuration and personalized bilingual policy pages.
3. Deploys after target review; verifies HTTPS, protected MCP and OAuth/CIMD discovery.
4. Once public pages are live, guides Google Cloud/Production and two Web OAuth clients. Select downloaded client JSON files instead of writing secret files or copying credential-bearing commands.
5. Opens local Google consent, proves an actual token refresh and five Health reads, and stores credentials securely in your Cloudflare account.
6. Writes `.setup/CONNECT.md` with dot connection settings. Personally create, install and connect the ChatGPT plugin, then make one actual tool call.

The terminal cannot replace Google console configuration, publishing-status checks or personal consent. Production is not Google verification or a promise of permanent authorization. ChatGPT account/workspace permissions still apply.

### Daily archiving is optional

- **Disabled (default):** on-demand dot queries only; no Apps Script or Drive permissions.
- **Keep existing:** no existing script, token, Drive file or trigger is accessed or changed.
- **New independent archive:** export sources and a bilingual guide to `.setup/daily-sync/`, then complete separate Apps Script consent and installation yourself. This option does not automatically create triggers or reuse the bridge token.

### Resume, inspect and use

```sh
pnpm run setup --lang en
pnpm run setup --dry-run       # Plan only; no file writes or cloud calls
pnpm run setup                # Resume saved progress
pnpm run setup --check         # Public HTTPS/OAuth only, not private Health reads
pnpm run setup --reauthorize   # Renew this installer's managed deployment
```

An unrecognized existing `wrangler.toml`, occupied Worker name or resolving custom hostname is protected. Use a clean clone for a new install. Do not mix legacy configuration with a new installation. Downloaded Google JSON files contain secrets: keep them private; the wizard reads them without copying them into the repository.

In dot choose **@Personal Health** and ask: “Review last night's sleep. Check dates and freshness, then compare with my history.” More [dot prompt recipes](docs/DOT-PROMPTS.md) are included.

### Documentation and development

- [Configuration, recovery and security boundaries](SETUP.md)
- [Deployment structure and verification](DEPLOY.md)
- [WHOOP / Google Health Coach research and product direction](docs/PRODUCT.md)
- `src/`: MCP and Health adapter; `scripts/`: wizard/diagnostics; `public/`: configurable site templates; `apps-script/`: separate optional archive.

```sh
pnpm typecheck
pnpm test
pnpm exec wrangler deploy --dry-run
```

The final command requires generated local configuration/site assets. The CLI does not publish a plugin to the ChatGPT directory or create AI monitoring schedules. Records may be missing or delayed; missing is not zero and statistics are not diagnoses. The current calendar default is Europe/London and a query can span at most 90 days.

### Attribution and license

Adapted from [Ring8688/google-health-worker-mcp-V1](https://github.com/Ring8688/google-health-worker-mcp-V1), originally based on [tachibanayu24/fitbit-googlehealth-mcp](https://github.com/tachibanayu24/fitbit-googlehealth-mcp). Upstream MIT copyright is preserved in [LICENSE](LICENSE).
