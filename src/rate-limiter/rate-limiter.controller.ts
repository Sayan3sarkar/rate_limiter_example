import { Request, Response, Router } from "express";
import { Controller } from "../types/controller.types";
import { parseOrThrow } from "../utils/validation";
import { allowBodySchema, statusQuerySchema } from "./rate-limiter.schema";
import { FixedWindowRateLimiter } from "./rate-limiter.service";

/**
 * Rate limit decision endpoints.
 *
 * Both endpoints respond 200 whenever the check itself succeeds, including
 * when the request is denied: a deny is a valid answer, not a failure of this
 * service. The calling service decides what to tell its own users (e.g. a 429).
 */
export class RateLimiterController implements Controller {
  public router = Router();

  constructor(private readonly rateLimiter: FixedWindowRateLimiter) {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.post("/v1/allow", this.allow);
    this.router.get("/v1/status", this.status);
  }

  private allow = (req: Request, res: Response): void => {
    const { key, policy } = parseOrThrow(allowBodySchema, req.body);
    res.status(200).json(this.rateLimiter.allow(key, policy));
  };

  private status = (req: Request, res: Response): void => {
    const { key, policy } = parseOrThrow(statusQuerySchema, req.query);
    res.status(200).json(this.rateLimiter.status(key, policy));
  };
}
