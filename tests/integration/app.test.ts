import { Router } from "express";
import request from "supertest";
import { BASE, createTestApp } from "../helpers/test-app";

describe("App", () => {
  describe("GET /health", () => {
    it("returns 200 with status, uptime and timestamp", async () => {
      const res = await request(createTestApp()).get(`${BASE}/health`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: "ok",
        uptime: expect.any(Number),
        timestamp: expect.any(String),
      });
      expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
    });

    it("is not served outside the route prefix", async () => {
      const res = await request(createTestApp()).get("/health");

      expect(res.status).toBe(404);
    });
  });

  describe("unknown routes (404 NOT_FOUND)", () => {
    it.each([
      { method: "get", path: `${BASE}/v1/nothing` },
      { method: "get", path: `${BASE}/v1/allow` },
      { method: "post", path: `${BASE}/v1/status` },
      { method: "delete", path: `${BASE}/v1/allow` },
      { method: "get", path: `${BASE}/v2/allow` },
      { method: "get", path: "/" },
      { method: "post", path: "/v1/allow" },
    ] as const)("returns JSON for $method $path", async ({ method, path }) => {
      const res = await request(createTestApp())[method](path);

      expect(res.status).toBe(404);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(res.body).toEqual({
        error: {
          code: "NOT_FOUND",
          message: `Route ${method.toUpperCase()} ${path} not found`,
        },
      });
    });
  });

  describe("body parsing errors", () => {
    const allow = () => request(createTestApp()).post(`${BASE}/v1/allow`);

    it("returns 413 ENTITY_TOO_LARGE for a body over the 100 KB limit", async () => {
      const res = await allow().send({ key: "k".repeat(200_000), policy: "login" });

      expect(res.status).toBe(413);
      expect(res.body.error).toEqual({
        code: "ENTITY_TOO_LARGE",
        message: "request entity too large",
      });
    });

    it("accepts a body just under the limit (then validates it)", async () => {
      const res = await allow().send({ key: "k".repeat(90_000), policy: "login" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("BAD_REQUEST");
    });

    it("returns 415 CHARSET_UNSUPPORTED for an unknown charset", async () => {
      const res = await allow()
        .set("Content-Type", "application/json; charset=klingon")
        .send('{"key":"user-1","policy":"login"}');

      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe("CHARSET_UNSUPPORTED");
    });

    it("returns 415 ENCODING_UNSUPPORTED for an unknown content encoding", async () => {
      const res = await allow()
        .set("Content-Type", "application/json")
        .set("Content-Encoding", "compress")
        .send('{"key":"user-1","policy":"login"}');

      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe("ENCODING_UNSUPPORTED");
    });
  });

  describe("unexpected errors", () => {
    it("returns 500 INTERNAL_ERROR without leaking the error", async () => {
      const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
      const failing = Router().get("/boom", () => {
        throw new Error("secret internals");
      });

      const res = await request(createTestApp({ extraRouters: [failing] })).get(
        `${BASE}/boom`,
      );

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        error: { code: "INTERNAL_ERROR", message: "Internal Server Error" },
      });
      expect(res.text).not.toContain("secret internals");
      expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ message: "secret internals" }));
    });

    it("handles rejected promises from async handlers", async () => {
      jest.spyOn(console, "error").mockImplementation(() => {});
      const failing = Router().get("/async-boom", async () => {
        throw new Error("async failure");
      });

      const res = await request(createTestApp({ extraRouters: [failing] })).get(
        `${BASE}/async-boom`,
      );

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("INTERNAL_ERROR");
    });
  });

  describe("CORS", () => {
    it("allows any origin on regular requests", async () => {
      const res = await request(createTestApp())
        .get(`${BASE}/health`)
        .set("Origin", "https://example.com");

      expect(res.headers["access-control-allow-origin"]).toBe("*");
    });

    it("answers preflight requests", async () => {
      const res = await request(createTestApp())
        .options(`${BASE}/v1/allow`)
        .set("Origin", "https://example.com")
        .set("Access-Control-Request-Method", "POST");

      expect(res.status).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe("*");
      expect(res.headers["access-control-allow-methods"]).toContain("POST");
    });
  });
});
