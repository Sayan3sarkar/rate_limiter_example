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

| Method | Path                                          | Description                                          |
| ------ | --------------------------------------------- | ---------------------------------------------------- |
| `GET`  | `/rate_limiter/health`                        | Health check                                         |
| `POST` | `/rate_limiter/v1/allow`                      | Consume one request for `key` and return a decision  |
| `GET`  | `/rate_limiter/v1/status?key=<key>&policy=<p>` | Peek at current usage without consuming a request    |

### `POST /v1/allow`

```bash
curl -X POST localhost:3000/rate_limiter/v1/allow \
  -H 'Content-Type: application/json' \
  -d '{"key":"user-123","policy":"login"}'
```

```json
{ "key": "user-123", "policy": "login", "limit": 5, "resetAt": 1791719760000, "allowed": true, "remaining": 4 }
```

A denied request is still a `200`, with `"allowed": false` and a `retryAfterMs` field. The decision service call succeeded; the calling service decides what to tell its own users (e.g. respond `429`).

### `GET /v1/status`

Returns `limit`, `used`, `remaining` and `resetAt` for the current window. It does not count as a request.

### Errors

All errors share one shape:

```json
{ "error": { "code": "POLICY_NOT_FOUND", "message": "Unknown policy \"nope\"" } }
```

| Status | Code               | When                                              |
| ------ | ------------------ | ------------------------------------------------- |
| `400`  | `BAD_REQUEST`      | Body or query fails validation (`details` lists the fields) |
| `400`  | `INVALID_JSON`     | Body is not valid JSON                            |
| `404`  | `POLICY_NOT_FOUND` | `policy` is not configured                        |
| `404`  | `NOT_FOUND`        | Unknown route                                     |

## Policies

Policies are defined in [`src/config/policies.ts`](src/config/policies.ts):

| Policy    | Limit | Window |
| --------- | ----- | ------ |
| `default` | 100   | 60s    |
| `login`   | 5     | 60s    |
| `search`  | 30    | 10s    |

Counters are kept in memory, so they are per-process and reset on restart.

## Project structure

```
src/
├── config/        # Config class with a getter per environment variable, rate limit policies
├── errors/        # HttpError and its subclasses
├── health/        # Health check controller
├── middlewares/   # 404 and error-handling middleware
├── rate-limiter/  # Fixed window rate limiter service, controller, schemas
├── types/         # Shared types (Controller interface)
├── utils/         # Zod validation helper
├── context.ts     # Registers controllers and exposes their routers
├── app.ts         # Configures the Express app (middleware, routes)
└── server.ts      # Entry point: starts the HTTP server, handles graceful shutdown
```
