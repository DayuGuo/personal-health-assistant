export class FitbitAuthError extends Error {
  readonly code = 'fitbit_auth_error' as const;
  constructor(
    message: string,
    public readonly reason:
      | 'authorization_required'
      | 'configuration_error'
      | 'temporary_error'
      | 'permission_denied'
      | 'invalid_response' = 'authorization_required',
  ) {
    super(message);
    this.name = 'FitbitAuthError';
  }
}

export class IncompleteDataError extends Error {}

export class FitbitApiError extends Error {
  readonly code = 'fitbit_api_error' as const;
  constructor(
    public readonly status: number,
    public readonly bodyText: string,
    public readonly endpoint?: string,
  ) {
    super(`Fitbit API ${status} at ${endpoint ?? '<unknown>'}: ${bodyText.slice(0, 240)}`);
    this.name = 'FitbitApiError';
  }
}

export class FitbitRateLimitError extends Error {
  readonly code = 'fitbit_rate_limit_error' as const;
  constructor(
    public readonly retryAfterSec: number,
    public readonly endpoint?: string,
  ) {
    super(
      `Fitbit rate limit exceeded at ${endpoint ?? '<unknown>'} (Retry-After: ${retryAfterSec}s)`,
    );
    this.name = 'FitbitRateLimitError';
  }
}
