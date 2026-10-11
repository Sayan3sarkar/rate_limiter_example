import express from "express";
import request from "supertest";
import app, { configureExpress } from "../../src/app";
import { routers } from "../../src/context";
import { BASE } from "../helpers/test-app";

describe("Production wiring (context + configureExpress)", () => {
  const prodApp = express();
  configureExpress(prodApp, routers);

  it("exports the routers for every controller", () => {
    expect(routers).toHaveLength(2);
  });

  it("exports a default Express app", () => {
    expect(typeof app).toBe("function");
    expect(typeof app.use).toBe("function");
  });

  it.each([
    { method: "get", path: `${BASE}/health` },
    { method: "get", path: `${BASE}/v1/status?key=wiring-check&policy=default` },
  ] as const)("serves $method $path", async ({ method, path }) => {
    const res = await request(prodApp)[method](path);

    expect(res.status).toBe(200);
  });

  it("uses the configured policies and the real clock", async () => {
    const before = Date.now();

    const res = await request(prodApp)
      .post(`${BASE}/v1/allow`)
      .send({ key: "wiring-check", policy: "default" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ allowed: true, limit: 100, remaining: 99 });
    expect(res.body.resetAt).toBeGreaterThan(before);
    expect(res.body.resetAt).toBeLessThanOrEqual(before + 60_000);
  });
});
