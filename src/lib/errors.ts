export {
  FitbitApiError,
  FitbitAuthError,
  FitbitRateLimitError,
  IncompleteDataError,
} from './error-types';
import { statusForError } from './data-status';
export type ToolTextResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
};
export function toolErrorResult(error: unknown): ToolTextResult {
  const data_status = statusForError(error);
  return { isError: true, content: [{ type: 'text', text: JSON.stringify({ data_status }) }] };
}
