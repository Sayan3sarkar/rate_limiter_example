import cors from "cors";
import express, { Express, Router } from "express";
import { config } from "./config";
import { errorHandler } from "./middlewares";

const app = express();
export const configureExpress = (app: Express, routers: Router[]) => {
  app
    .use(cors())
    .use(express.json())
    .use(config.prefix, routers)
    .use(errorHandler);
};
export default app;
