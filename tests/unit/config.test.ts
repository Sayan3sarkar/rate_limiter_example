import { config } from "../../src/config";

describe("config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("nodeEnv", () => {
    it("reads NODE_ENV", () => {
      process.env.NODE_ENV = "production";

      expect(config.nodeEnv).toBe("production");
    });

    it("defaults to 'development' when NODE_ENV is unset", () => {
      delete process.env.NODE_ENV;

      expect(config.nodeEnv).toBe("development");
    });
  });

  describe("port", () => {
    it.each([
      { value: "8080", expected: 8080 },
      { value: "1", expected: 1 },
      { value: undefined, expected: 3000 },
      { value: "", expected: 3000 },
      { value: "0", expected: 3000 },
      { value: "abc", expected: 3000 },
    ])("returns $expected when PORT is $value", ({ value, expected }) => {
      if (value === undefined) delete process.env.PORT;
      else process.env.PORT = value;

      expect(config.port).toBe(expected);
    });
  });

  describe("prefix", () => {
    it("reads PREFIX", () => {
      process.env.PREFIX = "/api";

      expect(config.prefix).toBe("/api");
    });

    it("defaults to '/rate_limiter' when PREFIX is unset", () => {
      delete process.env.PREFIX;

      expect(config.prefix).toBe("/rate_limiter");
    });
  });

  describe("rateLimitMaxKeys", () => {
    it.each([
      { value: "500", expected: 500 },
      { value: "1", expected: 1 },
      { value: undefined, expected: 10_000 },
      { value: "", expected: 10_000 },
      { value: "0", expected: 10_000 },
      { value: "-5", expected: 10_000 },
      { value: "abc", expected: 10_000 },
      { value: "1.5", expected: 10_000 },
    ])("returns $expected when RATE_LIMIT_MAX_KEYS is $value", ({ value, expected }) => {
      if (value === undefined) delete process.env.RATE_LIMIT_MAX_KEYS;
      else process.env.RATE_LIMIT_MAX_KEYS = value;

      expect(config.rateLimitMaxKeys).toBe(expected);
    });
  });

  it("reads values on every access, not once at startup", () => {
    process.env.PORT = "4000";
    expect(config.port).toBe(4000);

    process.env.PORT = "5000";
    expect(config.port).toBe(5000);
  });

  describe(".env loading", () => {
    it("loads the .env file when the module is first imported", () => {
      const loadEnvFile = jest.spyOn(process, "loadEnvFile").mockImplementation(() => {});

      jest.isolateModules(() => require("../../src/config"));

      expect(loadEnvFile).toHaveBeenCalledTimes(1);
    });

    it("falls back to the process environment when there is no .env file", () => {
      jest.spyOn(process, "loadEnvFile").mockImplementation(() => {
        throw Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });
      });
      process.env.PORT = "7000";

      let isolatedConfig: typeof config | undefined;
      expect(() =>
        jest.isolateModules(() => {
          isolatedConfig = require("../../src/config").config;
        }),
      ).not.toThrow();
      expect(isolatedConfig?.port).toBe(7000);
    });
  });
});
