export interface RateLimitDecision {
  allowed: boolean;
  key: string;
  policy: string;
  limit: number;
  remaining: number;
  /** Unix epoch (ms) at which the current window ends and the counter resets. */
  resetAt: number;
  /** How long the caller should wait before retrying. Only present when denied. */
  retryAfterMs?: number;
}

export interface RateLimitStatus {
  key: string;
  policy: string;
  limit: number;
  used: number;
  remaining: number;
  /** Unix epoch (ms) at which the current window ends and the counter resets. */
  resetAt: number;
}
