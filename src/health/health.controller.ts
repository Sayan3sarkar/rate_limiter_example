import { Request, Response, Router } from "express";
import { Controller } from "../types/controller.types";

export class HealthController implements Controller {
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.get("/health", this.getHealth);
  }

  private getHealth = (_req: Request, res: Response): void => {
    res.status(200).json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  };
}
