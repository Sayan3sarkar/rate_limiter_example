import { Policy } from "../config/policies";
import { NotFoundError } from "../errors";
import {
  RateLimitDecision,
  RateLimitStatus,
} from "../types/rate-limiter.types";

type WindowState = {
  /** Unix epoch (ms) at which this window started. */
  windowStart: number;
  count: number;
};

/**
 * Fixed window rate limiter.
 *
 * Time is divided into consecutive windows of `policy.windowMs`, aligned to the
 * Unix epoch. Each `(policy, key)` pair gets a counter per window that resets
 * when the next window begins. State is held in memory, so it is per-process
 * and lost on restart.
 */
export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, WindowState>();

  constructor(
    private readonly policies: Record<string, Policy>,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a request for `key` under `policyName` and decides whether it is allowed. */
  allow(key: string, policyName: string): RateLimitDecision {
    const policy = this.getPolicy(policyName);
    const now = this.now();
    const windowStart = this.getWindowStart(now, policy.windowMs);
    const storageKey = this.getStorageKey(policyName, key);

    let state = this.windows.get(storageKey);
    if (!state || state.windowStart !== windowStart) {
      state = { windowStart, count: 0 };
      this.windows.set(storageKey, state);
    }

    const resetAt = windowStart + policy.windowMs;
    const decision = { key, policy: policyName, limit: policy.limit, resetAt };

    if (state.count >= policy.limit) {
      return {
        ...decision,
        allowed: false,
        remaining: 0,
        retryAfterMs: resetAt - now,
      };
    }

    state.count += 1;
    return {
      ...decision,
      allowed: true,
      remaining: Math.max(0, policy.limit - state.count),
    };
  }

  /** Reports the current window's usage for `key` without consuming a request. */
  status(key: string, policyName: string): RateLimitStatus {
    const policy = this.getPolicy(policyName);
    const state = this.windows.get(this.getStorageKey(policyName, key));

    const windowStart = this.getWindowStart(this.now(), policy.windowMs);
    const used = state?.windowStart === windowStart ? state.count : 0;

    return {
      key,
      policy: policyName,
      limit: policy.limit,
      used,
      remaining: Math.max(0, policy.limit - used),
      resetAt: windowStart + policy.windowMs,
    };
  }

  private getPolicy(name: string): Policy {
    if (!Object.hasOwn(this.policies, name))
      throw new NotFoundError(`Unknown policy "${name}"`, "POLICY_NOT_FOUND");

    return this.policies[name];
  }

  private getWindowStart(now: number, windowMs: number): number {
    return Math.floor(now / windowMs) * windowMs;
  }

  private getStorageKey(policyName: string, key: string): string {
    return `${policyName}:${key}`;
  }
}
