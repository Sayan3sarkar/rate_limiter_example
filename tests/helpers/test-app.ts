import express, { Express, Router } from "express";
import { configureExpress } from "../../src/app";
import { config } from "../../src/config";
import { Policy, policies as defaultPolicies } from "../../src/config/policies";
import { HealthController } from "../../src/health";
import {
  FixedWindowRateLimiter,
  RateLimiterController,
} from "../../src/rate-limiter";

/** Base path every route is mounted under. */
export const BASE = config.prefix;

/** A start time aligned to both 10s and 60s windows, so every window starts at T0. */
export const T0 = 1_800_000_000_000;

/** Manually controlled clock to inject into `FixedWindowRateLimiter`. */
export class FakeClock {
  constructor(public time: number = T0) {}

  now = (): number => this.time;

  advance(ms: number): void {
    this.time += ms;
  }
}

interface TestAppOptions {
  clock?: FakeClock;
  policies?: Record<string, Policy>;
  /** Extra routers mounted after the real ones, e.g. to simulate failures. */
  extraRouters?: Router[];
}

/**
 * Builds a fresh, fully configured Express app with its own rate limiter,
 * so no state leaks between tests.
 */
export const createTestApp = ({
  clock = new FakeClock(),
  policies = defaultPolicies,
  extraRouters = [],
}: TestAppOptions = {}): Express => {
  const app = express();
  const rateLimiter = new FixedWindowRateLimiter(policies, clock.now);

  configureExpress(app, [
    new HealthController().router,
    new RateLimiterController(rateLimiter).router,
    ...extraRouters,
  ]);

  return app;
};

/** Runs `fn` and returns what it threw. Fails the test if it doesn't throw. */
export const captureError = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error("Expected function to throw");
};
