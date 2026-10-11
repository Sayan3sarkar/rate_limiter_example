import { config } from "./config";
import { policies } from "./config/policies";
import { HealthController } from "./health/health.controller";
import { FixedWindowRateLimiter, RateLimiterController } from "./rate-limiter";
import { Controller } from "./types/controller.types";

const rateLimiter = new FixedWindowRateLimiter(
  policies,
  Date.now,
  config.rateLimitMaxKeys,
);

const controllers: Controller[] = [
  new HealthController(),
  new RateLimiterController(rateLimiter),
];

export const routers = controllers.map(({ router }) => router);
