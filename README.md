# Rate Limiter Example

An Express + TypeScript service that will implement a **rate limiter using the fixed window algorithm**.

> **Status:** work in progress. The project scaffolding (server, config, routing, health check) is in place; the rate limiter itself will be added in upcoming PRs, along with details on how it works and how to configure it.

## Tech stack

- [Express 5](https://expressjs.com/)
- [TypeScript](https://www.typescriptlang.org/)
- npm

## Getting started

Requires Node.js 20.12+ (tested on 22).

```bash
npm install
cp .env.example .env
npm run dev
```

The server starts on `http://localhost:3000` by default.

## Scripts

| Script              | Description                                  |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Run the server in watch mode with `tsx`      |
| `npm run build`     | Compile TypeScript to `dist/`                |
| `npm start`         | Run the compiled server from `dist/`         |
| `npm run typecheck` | Type-check without emitting files            |

## Environment variables

Variables are loaded from `.env` and exposed through the `Config` class in [`src/config`](src/config/index.ts). Values set in the process environment take precedence over `.env`.

| Variable   | Default         | Description                       |
| ---------- | --------------- | --------------------------------- |
| `NODE_ENV` | `development`   | Environment the app runs in       |
| `PORT`     | `3000`          | Port the HTTP server listens on   |
| `PREFIX`   | `/rate_limiter` | Base path all routes are mounted on |

## API

| Method | Path                   | Description  |
| ------ | ---------------------- | ------------ |
| `GET`  | `/rate_limiter/health` | Health check |

## Project structure

```
src/
├── config/        # Config class with a getter per environment variable
├── health/        # Health check controller
├── types/         # Shared types (Controller interface)
├── context.ts     # Registers controllers and exposes their routers
├── app.ts         # Configures the Express app (middleware, routes)
└── server.ts      # Entry point: starts the HTTP server, handles graceful shutdown
```
