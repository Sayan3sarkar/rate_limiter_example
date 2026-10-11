export interface Policy {
  /** Maximum number of requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/** Default cap on how many `(policy, key)` windows are held in memory. */
export const DEFAULT_MAX_KEYS = 10_000;

/** Rate limit policies, keyed by the name callers pass as `policy`. */
export const policies: Record<string, Policy> = {
  default: { limit: 100, windowMs: 60_000 },
  login: { limit: 5, windowMs: 60_000 },
  search: { limit: 30, windowMs: 10_000 },
};
