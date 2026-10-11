import { HealthController } from "./health/health.controller";
import { Controller } from "./types/controller.types";

const controllers: Controller[] = [new HealthController()];

export const routers = controllers.map(({ router }) => router);
