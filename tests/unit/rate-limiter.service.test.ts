import { Policy } from "../../src/config/policies";
import { NotFoundError } from "../../src/errors";
import { FixedWindowRateLimiter } from "../../src/rate-limiter";
import { captureError, FakeClock, T0 } from "../helpers/test-app";

const WINDOW_MS = 1_000;

const POLICIES: Record<string, Policy> = {
  basic: { limit: 3, windowMs: WINDOW_MS },
  single: { limit: 1, windowMs: WINDOW_MS },
  closed: { limit: 0, windowMs: WINDOW_MS },
  minute: { limit: 2, windowMs: 60_000 },
};

describe("FixedWindowRateLimiter", () => {
  let clock: FakeClock;
  let limiter: FixedWindowRateLimiter;

  beforeEach(() => {
    clock = new FakeClock(T0);
    limiter = new FixedWindowRateLimiter(POLICIES, clock.now);
  });

  /** Sends `count` requests and returns each decision. */
  const send = (count: number, key = "user-1", policy = "basic") =>
    Array.from({ length: count }, () => limiter.allow(key, policy));

  describe("allow()", () => {
    it("allows the first request and returns the full decision", () => {
      expect(limiter.allow("user-1", "basic")).toEqual({
        key: "user-1",
        policy: "basic",
        limit: 3,
        allowed: true,
        remaining: 2,
        resetAt: T0 + WINDOW_MS,
      });
    });

    it.each([
      { policy: "basic", limit: 3 },
      { policy: "single", limit: 1 },
      { policy: "minute", limit: 2 },
    ])(
      "allows exactly $limit request(s) per window for '$policy', then denies",
      ({ policy, limit }) => {
        const allowed = send(limit + 2, "user-1", policy).map((d) => d.allowed);

        expect(allowed).toEqual([...Array(limit).fill(true), false, false]);
      },
    );

    it("decrements remaining with each allowed request down to 0", () => {
      expect(send(3).map((d) => d.remaining)).toEqual([2, 1, 0]);
    });

    it("denies with remaining 0 and retryAfterMs once the limit is reached", () => {
      send(3);
      clock.advance(250);

      expect(limiter.allow("user-1", "basic")).toEqual({
        key: "user-1",
        policy: "basic",
        limit: 3,
        allowed: false,
        remaining: 0,
        resetAt: T0 + WINDOW_MS,
        retryAfterMs: 750,
      });
    });

    it.each([
      { elapsed: 0, retryAfterMs: 1_000 },
      { elapsed: 1, retryAfterMs: 999 },
      { elapsed: 500, retryAfterMs: 500 },
      { elapsed: 999, retryAfterMs: 1 },
    ])(
      "returns retryAfterMs in milliseconds ($elapsed ms into the window -> $retryAfterMs)",
      ({ elapsed, retryAfterMs }) => {
        limiter.allow("user-1", "single");
        clock.advance(elapsed);

        expect(limiter.allow("user-1", "single").retryAfterMs).toBe(retryAfterMs);
      },
    );

    it("omits retryAfterMs from allowed decisions", () => {
      expect(limiter.allow("user-1", "basic")).not.toHaveProperty("retryAfterMs");
    });

    it("does not count denied requests against the window", () => {
      send(3);
      send(5);

      expect(limiter.status("user-1", "basic").used).toBe(3);
    });

    it("always denies when the policy limit is 0", () => {
      expect(limiter.allow("user-1", "closed")).toMatchObject({
        allowed: false,
        remaining: 0,
        retryAfterMs: WINDOW_MS,
      });
    });

    it("uses Date.now when no clock is injected", () => {
      jest.spyOn(Date, "now").mockReturnValue(T0 + 123);
      const realClockLimiter = new FixedWindowRateLimiter(POLICIES);

      expect(realClockLimiter.allow("user-1", "basic").resetAt).toBe(T0 + WINDOW_MS);
      expect(Date.now).toHaveBeenCalled();
    });

    describe("window boundaries", () => {
      beforeEach(() => send(3));

      it("still denies on the last millisecond of the window", () => {
        clock.advance(WINDOW_MS - 1);

        expect(limiter.allow("user-1", "basic").allowed).toBe(false);
      });

      it("resets the counter when the next window starts", () => {
        clock.advance(WINDOW_MS);

        expect(limiter.allow("user-1", "basic")).toMatchObject({
          allowed: true,
          remaining: 2,
          resetAt: T0 + 2 * WINDOW_MS,
        });
      });

      it("resets the counter after several idle windows", () => {
        clock.advance(5.5 * WINDOW_MS);

        expect(limiter.allow("user-1", "basic")).toMatchObject({
          allowed: true,
          remaining: 2,
          resetAt: T0 + 6 * WINDOW_MS,
        });
      });
    });

    it("aligns windows to the epoch, not to the first request", () => {
      clock.advance(700);

      expect(limiter.allow("user-1", "basic").resetAt).toBe(T0 + WINDOW_MS);
    });

    describe("isolation", () => {
      it("keeps separate counters per key", () => {
        send(3, "user-1");

        expect(limiter.allow("user-2", "basic").allowed).toBe(true);
      });

      it("keeps separate counters per policy for the same key", () => {
        send(3, "user-1", "basic");

        expect(limiter.allow("user-1", "single").allowed).toBe(true);
      });

      it("treats keys as case-sensitive", () => {
        send(3, "user-1");

        expect(limiter.allow("USER-1", "basic").allowed).toBe(true);
      });

      it("keeps separate state per limiter instance", () => {
        send(3);
        const other = new FixedWindowRateLimiter(POLICIES, clock.now);

        expect(other.allow("user-1", "basic").allowed).toBe(true);
      });
    });
  });

  describe("status()", () => {
    it("reports full capacity for a key that has never been seen", () => {
      expect(limiter.status("user-1", "basic")).toEqual({
        key: "user-1",
        policy: "basic",
        limit: 3,
        used: 0,
        remaining: 3,
        resetAt: T0 + WINDOW_MS,
      });
    });

    it("reports usage within the current window", () => {
      send(2);

      expect(limiter.status("user-1", "basic")).toMatchObject({
        used: 2,
        remaining: 1,
      });
    });

    it("does not consume a request", () => {
      for (let i = 0; i < 10; i++) limiter.status("user-1", "basic");

      expect(send(4).map((d) => d.allowed)).toEqual([true, true, true, false]);
    });

    it("reports 0 remaining once the limit is reached, even after denials", () => {
      send(6);

      expect(limiter.status("user-1", "basic")).toMatchObject({
        used: 3,
        remaining: 0,
      });
    });

    it("reports the current window's resetAt for an unseen key mid-window", () => {
      clock.advance(400);

      expect(limiter.status("user-1", "basic").resetAt).toBe(T0 + WINDOW_MS);
    });

    it.each([
      { elapsed: WINDOW_MS, resetAt: T0 + 2 * WINDOW_MS },
      { elapsed: WINDOW_MS + 1, resetAt: T0 + 2 * WINDOW_MS },
      { elapsed: 5 * WINDOW_MS, resetAt: T0 + 6 * WINDOW_MS },
    ])(
      "reports a fresh window once the stored window has expired ($elapsed ms later)",
      ({ elapsed, resetAt }) => {
        send(3);
        clock.advance(elapsed);

        expect(limiter.status("user-1", "basic")).toMatchObject({
          used: 0,
          remaining: 3,
          resetAt,
        });
      },
    );

    it("still reports the window as full on its last millisecond", () => {
      send(3);
      clock.advance(WINDOW_MS - 1);

      expect(limiter.status("user-1", "basic")).toMatchObject({
        used: 3,
        remaining: 0,
        resetAt: T0 + WINDOW_MS,
      });
    });
  });

  describe("bounded window storage", () => {
    const createLimiter = (maxKeys: number) =>
      new FixedWindowRateLimiter(POLICIES, clock.now, maxKeys);

    it("starts with no tracked keys", () => {
      expect(limiter.trackedKeys).toBe(0);
    });

    it("tracks one window per (policy, key) pair", () => {
      limiter.allow("user-1", "basic");
      limiter.allow("user-1", "basic");
      limiter.allow("user-1", "single");
      limiter.allow("user-2", "basic");

      expect(limiter.trackedKeys).toBe(3);
    });

    it("does not track keys that are only checked with status()", () => {
      limiter.status("user-1", "basic");

      expect(limiter.trackedKeys).toBe(0);
    });

    it("holds at most 10,000 windows by default", () => {
      for (let i = 0; i < 10_005; i++) limiter.allow(`user-${i}`, "minute");

      expect(limiter.trackedKeys).toBe(10_000);
    });

    it.each([1, 2, 50])("holds at most maxKeys (%i) windows", (maxKeys) => {
      const bounded = createLimiter(maxKeys);

      for (let i = 0; i < maxKeys + 5; i++) bounded.allow(`user-${i}`, "minute");

      expect(bounded.trackedKeys).toBe(maxKeys);
    });

    it("restarts the counter of an evicted key", () => {
      const bounded = createLimiter(2);
      bounded.allow("user-1", "minute");
      bounded.allow("user-1", "minute");
      bounded.allow("user-2", "minute");

      bounded.allow("user-3", "minute");

      expect(bounded.status("user-1", "minute").used).toBe(0);
      expect(bounded.allow("user-1", "minute")).toMatchObject({ allowed: true, remaining: 1 });
    });

    it("keeps a key active when allow() is called on it", () => {
      const bounded = createLimiter(2);
      bounded.allow("user-1", "minute");
      bounded.allow("user-2", "minute");
      bounded.allow("user-1", "minute");

      bounded.allow("user-3", "minute");

      expect(bounded.status("user-1", "minute").used).toBe(2);
      expect(bounded.status("user-2", "minute").used).toBe(0);
    });

    it("does not keep a key active when only status() is called on it", () => {
      const bounded = createLimiter(2);
      bounded.allow("user-1", "minute");
      bounded.allow("user-2", "minute");
      bounded.status("user-1", "minute");

      bounded.allow("user-3", "minute");

      expect(bounded.status("user-1", "minute").used).toBe(0);
      expect(bounded.status("user-2", "minute").used).toBe(1);
    });

    it("evicts an idle key whose window has ended before keys still in use", () => {
      const bounded = createLimiter(2);
      bounded.allow("user-1", "basic");
      bounded.allow("user-2", "minute");

      clock.advance(1.5 * WINDOW_MS);
      bounded.allow("user-3", "minute");

      expect(bounded.trackedKeys).toBe(2);
      expect(bounded.status("user-2", "minute").used).toBe(1);
      expect(bounded.status("user-3", "minute").used).toBe(1);
    });

    it("still counts correctly within a window after other keys come and go", () => {
      const bounded = createLimiter(3);
      bounded.allow("user-1", "basic");
      bounded.allow("user-2", "basic");
      bounded.allow("user-1", "basic");
      bounded.allow("user-3", "basic");

      expect(bounded.allow("user-1", "basic")).toMatchObject({ allowed: true, remaining: 0 });
      expect(bounded.allow("user-1", "basic").allowed).toBe(false);
    });
  });

  describe.each(["allow", "status"] as const)("unknown policies in %s()", (method) => {
    it.each([
      "nope",
      "",
      "BASIC",
      "basic ",
      "constructor",
      "toString",
      "__proto__",
      "hasOwnProperty",
      "valueOf",
    ])("rejects %p with a 404 POLICY_NOT_FOUND error", (policyName) => {
      const err = captureError(() => limiter[method]("user-1", policyName));

      expect(err).toBeInstanceOf(NotFoundError);
      expect(err).toMatchObject({
        status: 404,
        code: "POLICY_NOT_FOUND",
        message: `Unknown policy "${policyName}"`,
      });
    });
  });
});
