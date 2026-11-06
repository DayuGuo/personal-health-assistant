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

`get_health_overview`、`get_onboarding_guide`、`get_data_status` 与公开 `/start/` 三步页面已实现，详见 [计算和状态规则](OVERVIEW.md)。旧工具、授权存储和独立每日归档保持兼容。下表中的 P1 已完成；P2/P3 仍为设计建议。

### 优先级与状态

| 优先级 | 功能 | 易用性收益与验收标准 |
| --- | --- | --- |
| P1 已完成 | 一个健康概览工具 | 合并常用读取，返回最新完整日、7 日摘要、个人历史比较和有效天数。每个结论能追溯到原记录；接口错误和缺失单独展示。统计由可测试代码计算，模型负责解释。 |
| P1 已完成 | 极简首次对话 | 只问关注目标、可用时间和回顾偏好，不索取无关健康细节。没有历史时先说明可做什么。 |
| P1 已完成 | 可见的数据状态 | 明确区分设备记录日期、API 获取时间、缓存命中，以及空记录、过期授权和限流；给出能执行的修复入口。 |
| P2 | 用户可编辑的目标与情境 | 提供查看、修改、删除和停用入口；确认后才持久化，与 Google 原始记录分开。不能默默依赖聊天记忆已保存。 |
| P2 | 用户选择的晨间或周度回顾 | 默认关闭，明确时区、时段、频率和停止方法；通过 dot 支持的任务能力独立配置。每日归档不等于主动 AI 提醒。 |
| P3 | 有约束的小实验回顾 | 用户自愿选择一个小习惯，按完整日期比较前后记录，说明覆盖、不确定性和混杂因素，不作医学或因果结论。 |

建议先做好“今天怎么看、这周有什么变化、数据是否可靠”三个入口，再考虑更多指标。不要合成看似精确但未经验证的统一恢复分数；不要用模板建议冒充个性化分析。

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

`get_health_overview`, `get_onboarding_guide`, `get_data_status` and the `/start/` page are implemented. See [calculation and status rules](OVERVIEW.md). Existing tools/grant storage and separate archives remain compatible. Items 1–3 below have shipped; items 4–6 are still proposals.

### Priorities and status

1. **One overview tool:** return a latest-complete-day view, seven-day summary, historical comparison and valid-day coverage. Compute statistics in tested code, retain record provenance and separate missing data from API errors.
2. **Three-question onboarding:** focus, time constraints and review preference. Explain limited history instead of asking for unnecessary personal detail.
3. **Clear data status:** distinguish record date, API fetch time and cache age; separate empty records, expired grants and rate limits with actionable recovery paths.
4. **Editable personal context:** view, edit, delete and disable explicit saved goals separately from raw Google records. Persist only after confirmation.
5. **Opt-in morning or weekly reviews:** configure through supported dot task capabilities with timezone, timing, frequency and a stop control. A daily archive is not an AI notification schedule.
6. **Small voluntary habit experiments:** compare complete dates with coverage and uncertainty, noting confounders without causal or medical conclusions.

Prioritize three entry points: understanding today, reviewing the week and knowing whether data is reliable. Avoid unvalidated composite readiness scores and generic advice presented as individualized analysis.
