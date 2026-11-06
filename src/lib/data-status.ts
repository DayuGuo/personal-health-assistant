import { z } from 'zod';
import {
  FitbitApiError,
  FitbitAuthError,
  FitbitRateLimitError,
  IncompleteDataError,
} from './error-types';

export const StatusCode = z.enum([
  'available',
  'partial',
  'no_records',
  'invalid_records',
  'authorization_required',
  'configuration_error',
  'permission_denied',
  'api_disabled',
  'rate_limited',
  'temporary_error',
  'invalid_response',
  'incomplete_response',
  'invalid_request',
]);
export type StatusCode = z.infer<typeof StatusCode>;
export const DataStatusSchema = z.object({
  code: StatusCode,
  retryable: z.boolean(),
  retry_after_seconds: z.number().nullable(),
  message: z.object({ zh: z.string(), en: z.string() }),
  next_action: z.object({ zh: z.string(), en: z.string() }),
});
export type DataStatus = z.infer<typeof DataStatusSchema>;
const messages: Record<StatusCode, [string, string, string, string]> = {
  available: [
    '读取请求已成功完成。',
    'The read request completed successfully.',
    '先核对日期、覆盖和获取时间。',
    'Check record dates, coverage and retrieval time.',
  ],
  partial: [
    '部分记录缺失、无效或读取失败。',
    'Some records are missing, invalid or unavailable.',
    '查看各指标状态；不要把缺失补成零。',
    'Inspect each metric status; never replace missing data with zero.',
  ],
  no_records: [
    '请求范围内没有有效记录。',
    'No valid records were returned for this range.',
    '检查设备是否已同步及日期范围；这不等于数值为零。',
    'Check device synchronization and dates; this does not mean a zero measurement.',
  ],
  invalid_records: [
    '记录不完整、重复冲突或无法可靠汇总。',
    'Records are incomplete, conflicting or cannot be safely summarized.',
    '查看排除日期和原因；不要推测缺失值。',
    'Inspect excluded dates/reasons and do not infer missing values.',
  ],
  authorization_required: [
    'Google Health 授权缺失或已失效。',
    'Google Health authorization is missing or no longer valid.',
    '由维护者重新授权 Google Health；现有每日归档的授权独立保留。',
    'Have the owner renew Google Health consent; daily archive consent remains separate.',
  ],
  configuration_error: [
    '健康桥的客户端或存储配置需要检查。',
    'The bridge client or storage configuration needs attention.',
    '由维护者检查 Worker Secrets 和原 KV 绑定；不要删除现有授权存储。',
    'Check Worker Secrets and original KV bindings without deleting stored grants.',
  ],
  permission_denied: [
    'Google 拒绝访问此数据。',
    'Google denied access to this data.',
    '检查 API、账户资格和三项只读范围；确认原因后再决定是否重新授权。',
    'Check API access, account eligibility and the three read scopes before deciding whether consent needs renewal.',
  ],
  api_disabled: [
    'Google Health API 未启用或不可用。',
    'Google Health API is disabled or unavailable to the project.',
    '在对应 Google Cloud 项目检查 Health API 和访问资格。',
    'Check Health API enablement and eligibility in the matching Cloud project.',
  ],
  rate_limited: [
    'Google 暂时限制了请求频率。',
    'Google temporarily rate-limited requests.',
    '按 retry_after_seconds 等待后重试；无需立即重新授权。',
    'Wait for retry_after_seconds before retrying; do not immediately reauthorize.',
  ],
  temporary_error: [
    '接口或网络暂时不可用。',
    'The API or network is temporarily unavailable.',
    '稍后重试；不要据此判断没有记录或授权已失效。',
    'Retry later; this does not establish missing records or revoked consent.',
  ],
  invalid_response: [
    '上游返回结构与当前适配器不匹配。',
    'The upstream response does not match the adapter schema.',
    '由维护者检查适配器；不展示或推断部分统计。',
    'Have the maintainer inspect the adapter; do not infer partial statistics.',
  ],
  incomplete_response: [
    '上游分页未能完整读取。',
    'Upstream pagination did not complete.',
    '由维护者检查分页和数据范围，不使用截断结果计算汇总。',
    'Inspect pagination and range handling; do not summarize truncated results.',
  ],
  invalid_request: [
    '日期或请求参数无效。',
    'The date or request parameters are invalid.',
    '使用真实的 YYYY-MM-DD 日期；概览只能截至昨天或更早。',
    'Use valid YYYY-MM-DD dates; overview windows must end yesterday or earlier.',
  ],
};
export function dataStatus(code: StatusCode, retryAfter?: number): DataStatus {
  const [zh, en, actionZh, actionEn] = messages[code];
  return {
    code,
    retryable: code === 'temporary_error' || code === 'rate_limited',
    retry_after_seconds:
      code === 'rate_limited' ? Math.min(3600, Math.max(1, Math.ceil(retryAfter ?? 60))) : null,
    message: { zh, en },
    next_action: { zh: actionZh, en: actionEn },
  };
}
export function statusForError(error: unknown): DataStatus {
  if (error instanceof FitbitRateLimitError) return dataStatus('rate_limited', error.retryAfterSec);
  if (error instanceof FitbitAuthError) return dataStatus(error.reason);
  if (error instanceof IncompleteDataError) return dataStatus('incomplete_response');
  if (error instanceof RangeError) return dataStatus('invalid_request');
  if (error instanceof FitbitApiError) {
    if (error.status === 401) return dataStatus('authorization_required');
    if (error.status === 403) {
      try {
        if (
          (JSON.parse(error.bodyText) as { reasons?: string[] }).reasons?.includes(
            'SERVICE_DISABLED',
          )
        )
          return dataStatus('api_disabled');
      } catch {}
      return dataStatus('permission_denied');
    }
    if (error.status === 429) return dataStatus('rate_limited');
    return dataStatus(error.status >= 500 ? 'temporary_error' : 'invalid_response');
  }
  return dataStatus('temporary_error');
}
