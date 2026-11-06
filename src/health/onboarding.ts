import { z } from 'zod';
import { DataStatusViewSchema, type Overview, dataStatusView } from './overview';
export const Focus = z.enum(['sleep', 'activity', 'understand_data']);
export const ReviewPreference = z.enum(['on_demand', 'weekly', 'daily']);
export const OnboardingInput = {
  language: z.enum(['zh', 'en']).optional(),
  focus: Focus.optional(),
  available_minutes: z.number().int().min(1).max(120).optional(),
  review_preference: ReviewPreference.optional(),
};
export type OnboardingAnswers = {
  language?: 'zh' | 'en';
  focus?: z.infer<typeof Focus>;
  available_minutes?: number;
  review_preference?: z.infer<typeof ReviewPreference>;
};
export const OnboardingSchema = z.object({
  stage: z.enum([
    'connection_required',
    'focus',
    'available_minutes',
    'review_preference',
    'ready',
  ]),
  language: z.enum(['zh', 'en']),
  completed_steps: z.array(z.string()),
  context: z.object({
    focus: Focus.nullable(),
    available_minutes: z.number().nullable(),
    review_preference: ReviewPreference.nullable(),
  }),
  next_question: z
    .object({
      id: z.string(),
      text: z.string(),
      options: z.array(z.object({ value: z.union([z.string(), z.number()]), label: z.string() })),
    })
    .nullable(),
  data: DataStatusViewSchema,
  data_note: z.string(),
  suggested_prompt: z.string().nullable(),
  bridge_persists_answers: z.literal(false),
  schedules_created: z.literal(false),
  notice: z.string(),
});
export function onboardingGuide(overview: Overview, answers: OnboardingAnswers) {
  const language = answers.language ?? 'zh',
    zh = language === 'zh';
  const text = (cn: string, en: string) => (zh ? cn : en);
  const context = {
    focus: answers.focus ?? null,
    available_minutes: answers.available_minutes ?? null,
    review_preference: answers.review_preference ?? null,
  };
  const completed_steps = Object.entries(context)
    .filter(([, v]) => v !== null)
    .map(([key]) => key);
  const blocked = overview.authorization.code !== 'available';
  let stage: z.infer<typeof OnboardingSchema>['stage'] = 'ready',
    next_question: z.infer<typeof OnboardingSchema>['next_question'] = null;
  if (blocked) stage = 'connection_required';
  else if (!answers.focus) {
    stage = 'focus';
    next_question = {
      id: 'focus',
      text: text('你最想先了解哪方面的记录？', 'What would you like to understand first?'),
      options: [
        { value: 'sleep', label: text('睡眠', 'Sleep') },
        { value: 'activity', label: text('日常活动', 'Activity') },
        {
          value: 'understand_data',
          label: text('先了解数据是否可靠', 'Data availability and reliability'),
        },
      ],
    };
  } else if (answers.available_minutes === undefined) {
    stage = 'available_minutes';
    next_question = {
      id: 'available_minutes',
      text: text(
        '每次回顾，你愿意花几分钟？',
        'How many minutes would you like to spend on each review?',
      ),
      options: [5, 15, 30].map((value) => ({
        value,
        label: text(`${value} 分钟`, `${value} minutes`),
      })),
    };
  } else if (!answers.review_preference) {
    stage = 'review_preference';
    next_question = {
      id: 'review_preference',
      text: text(
        '你希望按需查询，还是按周或按日回顾？这只是偏好，不会自动创建任务。',
        'Would you prefer on-demand, weekly or daily reviews? This is a preference, not a scheduled task.',
      ),
      options: [
        { value: 'on_demand', label: text('按需查询', 'On demand') },
        { value: 'weekly', label: text('每周回顾', 'Weekly') },
        { value: 'daily', label: text('每天回顾', 'Daily') },
      ],
    };
  }
  const data_note = blocked
    ? overview.authorization.message[language] + ' ' + overview.authorization.next_action[language]
    : overview.latest_record_date
      ? text(
          `完整日窗口内的最近记录日期：${overview.latest_record_date}。先查看各指标覆盖情况；获取时间不等于设备同步时间。`,
          `Latest record date in the complete-day window: ${overview.latest_record_date}. Check each metric's coverage; retrieval time is not device sync time.`,
        )
      : text(
          '目前没有可汇总的有效记录。可以先选择关注方向，再检查设备同步或数据排除原因；缺失不是零。',
          'No valid records can currently be summarized. You can choose a focus, then check device sync or excluded records. Missing is not zero.',
        );
  const focusLabel =
    answers.focus === 'sleep'
      ? text('睡眠', 'sleep')
      : answers.focus === 'activity'
        ? text('活动', 'activity')
        : text('数据可用性与质量', 'data availability and quality');
  return OnboardingSchema.parse({
    stage,
    language,
    completed_steps,
    context,
    next_question,
    data: dataStatusView(overview),
    data_note,
    suggested_prompt:
      stage === 'ready'
        ? text(
            `请用 get_health_overview 回顾我的${focusLabel}记录，控制在约 ${answers.available_minutes} 分钟可读的篇幅。先说明日期、来源、有效天数和新鲜度，再给一个结论、证据和不确定性。不要保存目标或创建任务。`,
            `Use get_health_overview to review my ${focusLabel} records in a format readable in about ${answers.available_minutes} minutes. Start with dates, sources, valid-day coverage and freshness, then give one finding with evidence and uncertainty. Do not save goals or create tasks.`,
          )
        : null,
    bridge_persists_answers: false,
    schedules_created: false,
    notice: text(
      '桥不会保存这些回答，也不会创建提醒。ChatGPT 对话和记忆遵循本人账户设置。更换对话时如需这些偏好，请本人再次提供。',
      'The bridge does not persist these answers or create reminders. ChatGPT conversation/memory follows your account settings. Provide these preferences again in a new conversation if needed.',
    ),
  });
}
