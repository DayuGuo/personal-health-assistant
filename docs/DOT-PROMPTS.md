# Use Personal Health in dot / 在 dot 中使用健康助手

[中文](#中文) | [English](#english)

## 中文

在 ChatGPT 工作模式选用 **@Personal Health**。模型负责解释，MCP 工具负责读取；桥本身不运行另一个大模型，也不需要额外的 OpenAI/Gemini API 密钥。

### 第一次使用

> 我想用健康助手关注自己的记录。先确认连接和最近有数据的日期，然后一次只问我一个问题：我最关心什么、希望多久回顾一次、日常有哪些时间限制。只在本次对话使用我的回答；不要声称已经保存长期记忆或创建监测任务。

### 昨晚睡得怎么样

> 用 Personal Health 查看昨晚的睡眠。先检查日期、来源和新鲜度；有足够历史时，与之前 28 个完整日的本人记录比较。用“一个结论、支持证据、不确定性、一个可选的小行动”回答。历史不足就直说，不要补零、跨来源混算或生成恢复评分。

### 最近一周有什么变化

> 回顾最近 7 个完整日的活动和睡眠，与此前本人的历史比较。先说明有效天数和数据缺口，只挑最值得关注的一个变化，并给出一个可选的小行动。把记录事实和可能解释分开，不把相关性当因果关系。

### 结合我的生活情境

> 我这周在出差，睡眠时间不固定。结合我明确提供的情境和可读到的记录解释变化；先确认数据是否足够，再给一个符合我时间限制的温和建议。如果需要了解我的目标，请先问我。不要自动记录情境、改变训练计划或创建提醒。

### 连接故障

> 用 Personal Health 检查连接配置，再试读一个最近的完整日。只报告成功与否、日期和新鲜度，不展示健康数值。区分“没记录”“授权失败”“权限不足”和“接口暂时失败”，不要用猜测值代替。

主动日报、长期目标记忆、计划保存和提醒都需要各自明确的设置和授权。现有只读桥不会自动执行这些操作。当前工具使用 Europe/London 作为日历默认值；涉及旅行或其他时区时，先确认日期边界，不要把设备同步时间和 API 获取时间混为一谈。

## English

Select **@Personal Health** in ChatGPT Work. The model explains the records and MCP tools read them. The bridge does not run another model or require an additional OpenAI/Gemini API key.

### First use

> Help me understand my health records. First check the connection and most recent record dates. Then ask one question at a time about my main focus, preferred review frequency and practical time constraints. Use my answers in this conversation; do not claim to have saved long-term memory or created monitoring tasks.

### Last night's sleep

> Use Personal Health to review last night's sleep. Check dates, source and freshness first. If sufficient history exists, compare with my previous 28 complete days. Give one finding, supporting evidence, uncertainty and one optional small action. State insufficient history plainly; never fill gaps with zero, combine different sources or invent a recovery score.

### Weekly review

> Review activity and sleep for the last seven complete days against my earlier history. State valid-day coverage and gaps first. Choose the single most useful change to discuss and one optional small action. Separate recorded facts from possible explanations and avoid causal claims from correlations.

### Personal context

> I am traveling this week with irregular sleep. Use the context I explicitly shared and available records to explain changes. Check coverage before suggesting one gentle adjustment that fits my time constraints. Ask about my goals when needed. Do not automatically store this context, alter a training plan or create a reminder.

### Connection check

> Check Personal Health configuration, then try reading a recent complete day. Report success, record date and freshness without measurements. Distinguish missing records, authorization failure, insufficient scopes and temporary API failure. Do not guess values.

Proactive reports, persistent goals, saved plans and reminders require separate explicit setup and authorization. This read-only bridge does not create them. Current tools default to the Europe/London calendar; confirm date boundaries for other timezones. API retrieval time is not device synchronization time.
