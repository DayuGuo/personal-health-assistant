# 用 skill 安装 / Install with a skill

## 中文

可以让 agent 带着完成配置。推荐在本机 Codex 使用 **Personal Health 安装助手**：它检查环境、识别已有部署，操作现有双语向导，逐步帮助你完成部署、Google 配置、连接和验证。登录、本人同意和平台要求仍需你完成。

### 第一次使用

把这句话发给 Codex：

```text
请使用 skill-installer 安装这个技能：
https://github.com/DayuGuo/personal-health-assistant/tree/main/.agents/skills/personal-health-setup
```

安装完成后，在下一条消息发：

```text
使用 $personal-health-setup 帮我配置个人健康助手。我是新手，每次只引导我做一步；先检查有没有已有部署，保留现有授权和每日同步。需要我登录或同意时再告诉我。
```

如果已经克隆仓库并在 Codex 打开项目，可以直接使用第二句话；仓库中的 `.agents/skills` 是 Codex 支持的本地技能位置。若暂未显示，重新打开项目或重启 Codex。参见 [OpenAI 的 skills 说明](https://learn.chatgpt.com/docs/build-skills)。

### 你需要做什么

- 准备有 Google Health 数据和 API 访问资格的 Google 账户，以及 Cloudflare 账户。
- 让 agent 在需要时打开正确页面，自己完成登录、核对账户和授权。
- 按引导创建 Google OAuth 客户端，下载 JSON，并提供**本机文件路径**。密钥由向导读取，不需要粘贴到对话。
- 最后在自己的 ChatGPT 安装并连接 Personal Health，再实际检查数据状态。

新用户默认只安装按需查询；每日云盘归档可选。已有用户默认保留原归档。域名、邮箱、Worker 名称都使用自己的配置；可考虑 `workers.dev` 简化托管，但仍需核对 Google 的实际发布条件。

### Skill 与插件各做什么

| 部分 | 作用 |
| --- | --- |
| `personal-health-setup` skill | 指导有本地终端能力的 agent 完成安装、续接、连接与排错 |
| `pnpm run setup` | 执行部署、凭据处理、授权回调和接口验证 |
| Personal Health MCP 插件 | 在 dot 日常读取健康记录，回答睡眠和趋势问题 |

装好 skill 不等于已授权健康数据。它也不会替你通过 Google 审核或让授权永久有效。纯浏览器 agent 若不能执行本地命令和接收本机授权回调，仍需在本机 Codex 或其他支持这些能力的环境完成安装。标准 SKILL.md 可供其他支持该格式的应用读取；具体导入能力应以实际应用为准，不能据此宣称 Grok Bot、Muse 已实测支持这个 skill。

技能中的只读检查会区分全新目录、可续接的向导、已有旧部署和配置不匹配；不会因为新装 skill 就重建已有服务。它不会读取 `.env`、Google 客户端下载文件、令牌文件或健康快照，也不会访问云服务。完整配置见 [SETUP.md](../SETUP.md)，其他代理当前的预兼容范围见 [AGENT-COMPATIBILITY.md](AGENT-COMPATIBILITY.md)。

## English

Use **Personal Health Setup** in a local Codex environment to guide installation one step at a time. It checks prerequisites, recognizes existing deployments, operates the bilingual wizard and separates public checks, Health authorization and actual connector verification. Personal login and consent remain your steps.

Ask Codex to install the skill:

```text
Use skill-installer to install:
https://github.com/DayuGuo/personal-health-assistant/tree/main/.agents/skills/personal-health-setup
```

On the next turn:

```text
Use $personal-health-setup to configure my health assistant. I am a beginner: guide me one step at a time. Check for an existing deployment first, preserve its grants and daily sync, and tell me when personal login or consent is needed.
```

If the repository is already open in Codex, its `.agents/skills` folder supports local discovery, so start with the second prompt. Reopen/restart if needed; see the [official skill guide](https://learn.chatgpt.com/docs/build-skills).

Prepare eligible Google Health and Cloudflare accounts. Follow the agent through console configuration, download two OAuth client JSON files and provide local paths rather than pasting secrets. Personally install/connect the MCP plugin and make a real status call. New daily archiving is optional; existing archives are preserved.

The skill guides the workflow, `pnpm run setup` executes its deterministic operations, and the Personal Health MCP plugin supplies daily health tools. A skill install is not a Google grant, platform approval or guarantee of permanent access. Browser-only agents still need an environment capable of local commands and the local OAuth callback. Other hosts may import standard SKILL.md, but their actual support must be checked; Grok Bot/Muse skill installation has not been tested.

The bundled preflight is local/read-only and does not inspect secret files or health snapshots. It prevents an existing deployment from being mistaken for a new install. Follow [SETUP.md](../SETUP.md) and the [agent compatibility guide](AGENT-COMPATIBILITY.md) for maintained technical details.
