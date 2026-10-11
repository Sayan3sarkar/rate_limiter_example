import { Express } from "express";
import request from "supertest";
import { BASE, createTestApp, FakeClock, T0 } from "../helpers/test-app";

const ALLOW = `${BASE}/v1/allow`;
const STATUS = `${BASE}/v1/status`;
const LOGIN_WINDOW_MS = 60_000;

describe("Rate limiter API", () => {
  let clock: FakeClock;
  let app: Express;

  beforeEach(() => {
    clock = new FakeClock(T0);
    app = createTestApp({ clock });
  });

  const allow = (body: object = { key: "user-1", policy: "login" }) =>
    request(app).post(ALLOW).send(body);

  const status = (query: Record<string, string> = { key: "user-1", policy: "login" }) =>
    request(app).get(STATUS).query(query);

  describe("POST /v1/allow", () => {
    it("returns 200 with an allow decision", async () => {
      const res = await allow();

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(res.body).toEqual({
        key: "user-1",
        policy: "login",
        limit: 5,
        allowed: true,
        remaining: 4,
        resetAt: T0 + LOGIN_WINDOW_MS,
      });
    });

    it("allows exactly the policy limit, then denies with 200 (not 429)", async () => {
      const results = [];
      for (let i = 0; i < 7; i++) results.push(await allow());

      expect(results.map((r) => r.status)).toEqual(Array(7).fill(200));
      expect(results.map((r) => r.body.allowed)).toEqual([
        true, true, true, true, true, false, false,
      ]);
      expect(results.map((r) => r.body.remaining)).toEqual([4, 3, 2, 1, 0, 0, 0]);
    });

    it("returns retryAfterMs in milliseconds when denied", async () => {
      for (let i = 0; i < 5; i++) await allow();
      clock.advance(15_000);

      const res = await allow();

      expect(res.body).toMatchObject({
        allowed: false,
        remaining: 0,
        resetAt: T0 + LOGIN_WINDOW_MS,
        retryAfterMs: 45_000,
      });
    });

    it("allows again once the window rolls over", async () => {
      for (let i = 0; i < 6; i++) await allow();
      clock.advance(LOGIN_WINDOW_MS);

      const res = await allow();

      expect(res.body).toMatchObject({
        allowed: true,
        remaining: 4,
        resetAt: T0 + 2 * LOGIN_WINDOW_MS,
      });
    });

    it.each([
      { policy: "default", limit: 100 },
      { policy: "login", limit: 5 },
      { policy: "search", limit: 30 },
    ])("applies the configured limit for '$policy' ($limit)", async ({ policy, limit }) => {
      const res = await allow({ key: "user-1", policy });

      expect(res.body).toMatchObject({ policy, limit, remaining: limit - 1 });
    });

    it("counts trimmed and untrimmed keys as the same key", async () => {
      await allow({ key: "  user-1  ", policy: " login " });
      const res = await allow({ key: "user-1", policy: "login" });

      expect(res.body).toMatchObject({ key: "user-1", policy: "login", remaining: 3 });
    });

    it("ignores unknown body fields", async () => {
      const res = await allow({ key: "user-1", policy: "login", cost: 100 });

      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty("cost");
      expect(res.body.remaining).toBe(4);
    });

    describe("validation (400 BAD_REQUEST)", () => {
      it.each([
        { case: "missing key", body: { policy: "login" }, path: "key" },
        { case: "missing policy", body: { key: "user-1" }, path: "policy" },
        { case: "empty key", body: { key: "", policy: "login" }, path: "key" },
        { case: "whitespace-only key", body: { key: "   ", policy: "login" }, path: "key" },
        { case: "257-character key", body: { key: "k".repeat(257), policy: "login" }, path: "key" },
        { case: "65-character policy", body: { key: "user-1", policy: "p".repeat(65) }, path: "policy" },
        { case: "policy with invalid characters", body: { key: "user-1", policy: "log in" }, path: "policy" },
        { case: "numeric key", body: { key: 42, policy: "login" }, path: "key" },
        { case: "null policy", body: { key: "user-1", policy: null }, path: "policy" },
        { case: "array key", body: { key: ["a"], policy: "login" }, path: "key" },
        { case: "empty object", body: {}, path: "key" },
        { case: "array body", body: [], path: "" },
      ])("rejects $case", async ({ body, path }) => {
        const res = await allow(body);

        expect(res.status).toBe(400);
        expect(res.body.error).toMatchObject({
          code: "BAD_REQUEST",
          message: "Request validation failed",
        });
        expect(res.body.error.details).toContainEqual({
          path,
          message: expect.any(String),
        });
      });

      it.each([
        { case: "no body", send: (r: request.Test) => r },
        {
          case: "a text/plain body",
          send: (r: request.Test) =>
            r.set("Content-Type", "text/plain").send('{"key":"user-1","policy":"login"}'),
        },
        {
          case: "a form-encoded body",
          send: (r: request.Test) => r.type("form").send({ key: "user-1", policy: "login" }),
        },
      ])("rejects $case (body is not parsed as JSON)", async ({ send }) => {
        const res = await send(request(app).post(ALLOW));

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("BAD_REQUEST");
        expect(res.body.error.details).toContainEqual({ path: "", message: expect.any(String) });
      });

      it("does not consume a request when validation fails", async () => {
        await allow({ key: "user-1" });

        const res = await status();
        expect(res.body.used).toBe(0);
      });
    });

    it.each([
      { case: "truncated JSON", raw: '{"key":' },
      { case: "unquoted keys", raw: "{key: 'user-1'}" },
      { case: "a bare string (strict mode)", raw: '"user-1"' },
      { case: "a bare number (strict mode)", raw: "42" },
    ])("returns 400 INVALID_JSON for $case", async ({ raw }) => {
      const res = await request(app)
        .post(ALLOW)
        .set("Content-Type", "application/json")
        .send(raw);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: { code: "INVALID_JSON", message: "Request body is not valid JSON" },
      });
    });

    it.each(["nope", "LOGIN", "constructor", "toString", "__proto__", "hasOwnProperty"])(
      "returns 404 POLICY_NOT_FOUND for policy %p",
      async (policy) => {
        const res = await allow({ key: "user-1", policy });

        expect(res.status).toBe(404);
        expect(res.body).toEqual({
          error: { code: "POLICY_NOT_FOUND", message: `Unknown policy "${policy}"` },
        });
      },
    );
  });

  describe("GET /v1/status", () => {
    it("returns 200 with full capacity for an unseen key", async () => {
      const res = await status();

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        key: "user-1",
        policy: "login",
        limit: 5,
        used: 0,
        remaining: 5,
        resetAt: T0 + LOGIN_WINDOW_MS,
      });
    });

    it("reflects requests made through /v1/allow", async () => {
      await allow();
      await allow();

      const res = await status();

      expect(res.body).toMatchObject({ used: 2, remaining: 3 });
    });

    it("does not consume a request", async () => {
      for (let i = 0; i < 10; i++) await status();

      const res = await allow();

      expect(res.body).toMatchObject({ allowed: true, remaining: 4 });
    });

    it("reports a fresh window after the stored one expires", async () => {
      for (let i = 0; i < 5; i++) await allow();
      clock.advance(LOGIN_WINDOW_MS + 1);

      const res = await status();

      expect(res.body).toMatchObject({
        used: 0,
        remaining: 5,
        resetAt: T0 + 2 * LOGIN_WINDOW_MS,
      });
    });

    it("trims query values", async () => {
      await allow();

      const res = await status({ key: " user-1 ", policy: " login " });

      expect(res.body).toMatchObject({ key: "user-1", policy: "login", used: 1 });
    });

    describe("validation (400 BAD_REQUEST)", () => {
      it.each([
        { case: "no query", url: STATUS, path: "key" },
        { case: "missing key", url: `${STATUS}?policy=login`, path: "key" },
        { case: "missing policy", url: `${STATUS}?key=user-1`, path: "policy" },
        { case: "empty key", url: `${STATUS}?key=&policy=login`, path: "key" },
        { case: "repeated key", url: `${STATUS}?key=a&key=b&policy=login`, path: "key" },
        { case: "repeated policy", url: `${STATUS}?key=a&policy=login&policy=search`, path: "policy" },
        { case: "bracketed key (not parsed as nested)", url: `${STATUS}?key[a]=1&policy=login`, path: "key" },
        { case: "policy with invalid characters", url: `${STATUS}?key=a&policy=log%20in`, path: "policy" },
        { case: "257-character key", url: `${STATUS}?key=${"k".repeat(257)}&policy=login`, path: "key" },
      ])("rejects $case", async ({ url, path }) => {
        const res = await request(app).get(url);

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("BAD_REQUEST");
        expect(res.body.error.details).toContainEqual({ path, message: expect.any(String) });
      });
    });

    it.each(["nope", "constructor", "__proto__"])(
      "returns 404 POLICY_NOT_FOUND for policy %p",
      async (policy) => {
        const res = await status({ key: "user-1", policy });

        expect(res.status).toBe(404);
        expect(res.body.error).toEqual({
          code: "POLICY_NOT_FOUND",
          message: `Unknown policy "${policy}"`,
        });
      },
    );
  });
});
