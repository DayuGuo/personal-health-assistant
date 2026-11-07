# Product direction / 产品改进方向

[中文](#中文) | [English](#english)

Research checked 2026-11-06 / 资料核对日期：2026-11-06。

## 中文

### 从公开实现中借鉴什么

WHOOP 公开说明将连续生理数据、个人基线、目标和用户可控制的情境记忆结合，用于解释变化和提供适时的下一步；不需要行动时保持安静。[WHOOP 官方说明](https://www.whoop.com/us/en/thelocker/new-ai-guidance-from-whoop/)

Google Health Coach 由 Gemini 支持，首次通过对话了解目标、生活安排等情境，随后允许用户用自然语言调整，并在合适时机提供反馈。[Google 官方介绍](https://blog.google/products-and-platforms/products/google-health/google-health-coach/) [Google Health 使用说明](https://support.google.com/googlehealth/answer/14237011?hl=en)

这些资料说明了公开产品行为和部分架构，并没有公开完整的模型、提示词、检索链或评分算法。本项目借鉴交互原则，不声称复现其私有模型，也不把读取 Google Health API 当作获得 Google Health Coach 的推理能力。

### 这次已经实现

- 双语安装向导：配置 → 部署 → 本人授权 → 接口验证 → dot 连接卡，支持恢复进度。
- 可选每日归档，默认只安装即时查询所需的健康桥。
- 首页提供“昨晚睡眠”和“每周回顾”问题示例；[dot 模板](DOT-PROMPTS.md) 提供首次使用、睡眠、周回顾、生活情境和排错五类入口。
- MCP 指引要求先核对日期、来源、覆盖与新鲜度，再给出结论、证据、不确定性和一个可选下一步。禁止编造恢复评分、诊断，或声称只读工具已保存计划和记忆。
- 模型继续使用 dot 自身能力；Worker 负责授权、读取和短时缓存，不增加第二套模型服务或模型 API 密钥。

### P1 已在 0.4.0 实现

`get_health_overview`、`get_onboarding_guide`、`get_data_status` 与公开 `/start/` 三步页面已实现，详见 [计算和状态规则](OVERVIEW.md)。旧工具、授权存储和独立每日归档保持兼容。当前范围固定为现有 P1 和安装部署流程，只进行准确性、稳定性、兼容性与易用性维护。P2/P3 不继续实施。

### 当前维护范围

- 保证概览统计、日期与来源解释准确，缺失数据清晰可见。
- 维护只读授权、缓存时效、错误提示、安装与升级兼容性。
- 完善三步引导和双语说明，保留现有授权与独立每日同步。
- 本阶段不增加持久化目标/情境、主动回顾提醒或习惯实验。

## English

### What the public implementations suggest

WHOOP describes combining continuous physiology, personal baselines, goals and user-controlled contextual memory to explain changes and offer timely next steps, staying quiet when no action is warranted. [Official WHOOP description](https://www.whoop.com/us/en/thelocker/new-ai-guidance-from-whoop/)

Google Health Coach uses Gemini, conversational onboarding around goals and routines, natural-language adjustments and timely feedback. [Google announcement](https://blog.google/products-and-platforms/products/google-health/google-health-coach/) [Google Health guide](https://support.google.com/googlehealth/answer/14237011?hl=en)

These sources describe product behavior and parts of the architecture, not complete models, prompts, retrieval pipelines or proprietary scores. We borrow interaction principles, not private algorithms. Google Health API access does not provide Google Health Coach's inference system.

### Included in this release

- A bilingual, resumable configuration/deployment/consent/verification wizard and a dot connection card.
- Optional daily archiving; on-demand bridge installation is the default.
- Two homepage starter questions and five [dot prompt recipes](DOT-PROMPTS.md).
- Server instructions to check record dates, sources, coverage and freshness; explain a finding with evidence, uncertainty and one optional next step. No invented recovery scores, diagnoses or false claims that read-only tools saved plans or memory.
- Inference stays in dot. The Worker handles authorization, reads and short-lived caching without another model service or API key.

### P1 shipped in 0.4.0

`get_health_overview`, `get_onboarding_guide`, `get_data_status` and the `/start/` page are implemented. See [calculation and status rules](OVERVIEW.md). Existing tools/grant storage and separate archives remain compatible. The scope is fixed to the existing P1 tools and installation/deployment flow, with accuracy, reliability, compatibility and usability maintenance. P2/P3 implementation is discontinued.

### Current maintenance scope

- Accurate statistics, dates, source explanations and visible missing data.
- Read-only authorization, cache freshness, actionable errors and installation/upgrade compatibility.
- Clear three-step onboarding and bilingual documentation, preserving existing grants and the independent daily archive.
- Persistent goals/context, proactive review reminders and habit experiments are outside this phase.
