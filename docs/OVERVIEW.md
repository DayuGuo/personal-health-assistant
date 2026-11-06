# P1 tools and data status / P1 工具与数据状态

[中文](#中文) | [English](#english)

## 中文

### 三个入口

| 工具 | 用途 |
| --- | --- |
| `get_health_overview` | 一次读取步数、分期睡眠分钟、静息心率、HRV RMSSD 和 SpO2，返回近期摘要、本人历史比较、覆盖和证据 |
| `get_onboarding_guide` | 检查数据后，一次只问一个问题：关注方向、每次回顾时间、回顾偏好；前一轮答案由调用者再次传入 |
| `get_data_status` | 不显示健康数值，报告授权、各指标可用性、记录日期、获取/缓存时间和修复步骤 |

公开 `/start/` 页面也能逐步生成可粘贴到 dot 的提示词。表单不上传、不保存回答；模型推理仍在 dot 中进行。引导不会保存目标或创建提醒。

### 概览如何计算

- `end_date` 默认伦敦日历的昨天，只接受昨天或更早。它表示完整**日历日**，不保证设备数据完整。
- 近期窗口为截至该日的 7 天，历史窗口为之前不重叠的 28 天。
- 均值、最小值、最大值、有效天数和比较由代码计算；步数/睡眠另提供 `observed_total`，仅是已记录有效日的合计。其他指标不计算没有意义的总和。
- 不补零。真实的零步数会保留；无记录、被排除记录和接口失败分别报告。接口不可用时有效天数为 `null`，成功读取但无记录时为 `0`。
- 至少 4/7 个近期有效日和 14/28 个历史有效日才返回均值差与百分比。这是数据覆盖门槛，不是医学阈值。历史均值为零时不计算百分比。
- 每个窗口的 `evidence_ids` 对应 `records` 中的指标/日期记录。这是本工具的逻辑引用，不是 Google 原始资源 ID。
- 同日冲突值会排除；相同重复记录去重。无效日期仅以 `unknown` 标记，不回显原始内容。

历史 end_date 会单独显示为 requested_end_date；latest_complete_calendar_day 仍是当前伦敦日历的昨天。若查询昨晚刚结束的睡眠，应使用 get_sleep 并明确醒来日期（可能是今天），不要把概览窗口误当成昨晚。

### 来源和睡眠边界

步数来自 `google-wearables` 的 dailyRollUp；睡眠来自同系列 reconcile。静息心率、HRV 和 SpO2 来自 `google-sources` 的相应每日 reconcile。只在同一指标、同一来源系列与方法内部比较，不声称来自同一台物理设备。

睡眠按上游的本地醒来日期归属，出差时可能与伦敦日历不同。只汇总分期完整、时间有效且不重叠的睡眠片段，包含符合条件的午睡；完全相同片段去重。片段内分期重叠、未知阶段或分期覆盖差超过 60 秒的记录会排除，不把缺少分期误当作零睡眠。

### 读懂状态

记录日期是数据所属日期；`fetched_at_utc` 是桥完成查询的时间；缓存命中意味着返回既有读取结果。设备最后同步时间和设备身份由当前适配器无法确定，因此返回 `null`，不能从 API 获取时间推断。

每次概览/状态/引导调用先做一次不缓存的 Google identity 授权探测，即使各指标命中缓存也不会直接宣称授权仍有效。访问令牌过期会沿用原刷新令牌自动刷新。刷新暂时失败不会删除令牌或要求立即重装。

| 状态 | 含义与处理 |
| --- | --- |
| `available` / `partial` | 请求完成；仍应核对有效天数、排除日期及各指标状态 |
| `no_records` | 成功读取但没有有效记录；检查日期和设备同步，不补零 |
| `invalid_records` | 记录不完整或有冲突；查看 `excluded_dates` |
| `authorization_required` | 授权缺失/撤销；由维护者续权，原每日归档独立 |
| `configuration_error` | 客户端或存储配置不匹配；检查 Secrets/原 KV，不删除授权 |
| `permission_denied` / `api_disabled` | 检查 API、资格和只读范围，避免盲目重复授权 |
| `rate_limited` | 按 `retry_after_seconds` 等待；新工具不在请求中长时间循环重试 |
| `temporary_error` | 网络或服务暂时失败；稍后重试，不当成无记录 |
| `invalid_response` / `incomplete_response` | 结构或分页无法完整处理；维护适配器，不生成截断统计 |

旧工具名称、参数与成功结果字段保留；旧错误仍使用 `isError: true` 和文本内容，文本中提供脱敏 `data_status` JSON。`get_connection_status.configured` 仍只表示已配置，不证明接口可用；实时状态请使用 `get_data_status`。

## English

### Entry points

- `get_health_overview`: deterministic complete-day summaries of steps, staged sleep minutes, resting heart rate, HRV RMSSD and SpO2, with personal-history comparison, coverage and evidence.
- `get_onboarding_guide`: checks availability, then returns one question at a time: focus, review time budget, review preference. The caller passes previous answers again; nothing is persisted by the bridge.
- `get_data_status`: reports authorization, per-metric availability, record dates, retrieval/cache timestamps and recovery steps without measurements.

The public `/start/` form generates a prompt locally without uploading or saving answers. Inference remains in dot. Neither guide creates goals or reminders.

### Calculation rules

`end_date` defaults to yesterday in Europe/London and must precede today. Seven recent complete calendar days are compared to the preceding, non-overlapping 28 days. A complete calendar day does not guarantee complete device records.

Code computes means, minima/maxima, valid-day counts and comparisons. `observed_total` is available only for steps/sleep and covers recorded valid days, not missing days. No zero filling is performed; measured zero steps remain zero. Unavailable APIs have `null` valid-day counts; successful empty reads have `0`.

Comparisons require at least 4/7 recent and 14/28 baseline days. These are coverage gates, not clinical thresholds. No percentage is returned for a zero baseline. Window `evidence_ids` reference metric/date entries in `records`, not raw Google resource IDs. Conflicting daily values are excluded; identical duplicates are deduplicated.

Historical end dates are reported separately as requested_end_date; latest_complete_calendar_day remains yesterday in London. For the just-completed night, use get_sleep with its wake date (possibly today), rather than treating the overview window as last night.

### Sources and sleep

Steps use `google-wearables` dailyRollUp; sleep uses that family's reconcile data. Resting HR, HRV and SpO2 use the matching `google-sources` daily reconcile types. Comparisons stay within one metric, source family and method; this does not prove identical physical devices.

Sleep uses the provider's local wake date, potentially different from London dates during travel. Valid, staged, non-overlapping episodes (including qualifying naps) are summed. Identical episodes are deduplicated; overlapping/unknown stages and stage-coverage gaps over 60 seconds are excluded. Absent stages are never reported as zero sleep.

### Status and compatibility

Record dates, API retrieval timestamps and cache age are distinct. Device sync time and individual device identity are unavailable and returned as `null`. A fresh API fetch does not prove a fresh device sync.

Each new experience tool performs an uncached Google identity probe before returning metric cache data. Expired access tokens use the existing refresh grant. Temporary refresh failures never delete credentials or demand immediate reinstallation.

Statuses distinguish readable/partial data, empty records, invalid records, missing/revoked consent, configuration mismatch, permission/API access, rate limits, temporary failures and schema/pagination failures. Each includes bilingual messages/actions; rate limits include a retry interval. New tools fail fast on rate limits instead of sleeping through repeated retries.

Old tool names, arguments and success fields remain available. Errors retain `isError: true` with redacted `data_status` JSON in text content, avoiding error payloads that violate success schemas. `get_connection_status.configured` still means configured only; use `get_data_status` for live checks.
