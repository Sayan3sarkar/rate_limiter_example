import cors from "cors";
import express, { Express, Router } from "express";
import { config } from "./config";
import { errorHandler, notFoundHandler } from "./middlewares";

const app = express();
export const configureExpress = (app: Express, routers: Router[]) => {
  app
    .use(cors())
    .use(express.json())
    .use(config.prefix, routers)
    .use(notFoundHandler)
    .use(errorHandler);
};
export default app;
