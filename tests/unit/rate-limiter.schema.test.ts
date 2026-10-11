import {
  allowBodySchema,
  statusQuerySchema,
} from "../../src/rate-limiter/rate-limiter.schema";

describe.each([
  { name: "allowBodySchema", schema: allowBodySchema },
  { name: "statusQuerySchema", schema: statusQuerySchema },
])("$name", ({ schema }) => {
  describe("valid input", () => {
    it.each([
      {
        case: "simple key and policy",
        input: { key: "user-1", policy: "login" },
        expected: { key: "user-1", policy: "login" },
      },
      {
        case: "surrounding whitespace (trimmed)",
        input: { key: "  user-1  ", policy: "  login  " },
        expected: { key: "user-1", policy: "login" },
      },
      {
        case: "a 1-character key",
        input: { key: "a", policy: "login" },
        expected: { key: "a", policy: "login" },
      },
      {
        case: "a 256-character key (max length)",
        input: { key: "k".repeat(256), policy: "login" },
        expected: { key: "k".repeat(256), policy: "login" },
      },
      {
        case: "a 64-character policy (max length)",
        input: { key: "user-1", policy: "p".repeat(64) },
        expected: { key: "user-1", policy: "p".repeat(64) },
      },
      {
        case: "keys with any characters (IPs, emails, colons, unicode)",
        input: { key: "203.0.113.7:user@example.com/ü", policy: "login" },
        expected: { key: "203.0.113.7:user@example.com/ü", policy: "login" },
      },
      {
        case: "policies with mixed case, digits, '_' and '-'",
        input: { key: "user-1", policy: "Api_v2-Write" },
        expected: { key: "user-1", policy: "Api_v2-Write" },
      },
      {
        case: "unknown extra fields (stripped)",
        input: { key: "user-1", policy: "login", cost: 5 },
        expected: { key: "user-1", policy: "login" },
      },
    ])("accepts $case", ({ input, expected }) => {
      expect(schema.parse(input)).toEqual(expected);
    });
  });

  describe("invalid input", () => {
    it.each([
      { case: "missing key", input: { policy: "login" }, path: ["key"] },
      { case: "missing policy", input: { key: "user-1" }, path: ["policy"] },
      { case: "empty key", input: { key: "", policy: "login" }, path: ["key"] },
      { case: "whitespace-only key", input: { key: "   ", policy: "login" }, path: ["key"] },
      { case: "257-character key", input: { key: "k".repeat(257), policy: "login" }, path: ["key"] },
      { case: "empty policy", input: { key: "user-1", policy: "" }, path: ["policy"] },
      { case: "65-character policy", input: { key: "user-1", policy: "p".repeat(65) }, path: ["policy"] },
      { case: "policy with a space", input: { key: "user-1", policy: "log in" }, path: ["policy"] },
      { case: "policy with a dot", input: { key: "user-1", policy: "log.in" }, path: ["policy"] },
      { case: "policy with a colon", input: { key: "user-1", policy: "a:b" }, path: ["policy"] },
      { case: "policy with unicode", input: { key: "user-1", policy: "lögin" }, path: ["policy"] },
      { case: "numeric key", input: { key: 123, policy: "login" }, path: ["key"] },
      { case: "null key", input: { key: null, policy: "login" }, path: ["key"] },
      { case: "array key", input: { key: ["a", "b"], policy: "login" }, path: ["key"] },
      { case: "object policy", input: { key: "user-1", policy: { name: "login" } }, path: ["policy"] },
      { case: "boolean policy", input: { key: "user-1", policy: true }, path: ["policy"] },
      { case: "undefined input", input: undefined, path: [] },
      { case: "null input", input: null, path: [] },
      { case: "string input", input: "user-1", path: [] },
      { case: "array input", input: [{ key: "user-1", policy: "login" }], path: [] },
    ])("rejects $case", ({ input, path }) => {
      const result = schema.safeParse(input);

      expect(result.success).toBe(false);
      expect(result.error?.issues.map((issue) => issue.path)).toContainEqual(path);
    });

    it("reports every failing field at once", () => {
      const result = schema.safeParse({ key: "", policy: "a b" });

      expect(result.error?.issues.map((issue) => issue.path)).toEqual([
        ["key"],
        ["policy"],
      ]);
    });

    it("uses a descriptive message for invalid policy characters", () => {
      const result = schema.safeParse({ key: "user-1", policy: "a b" });

      expect(result.error?.issues[0].message).toBe(
        "Policy may only contain letters, digits, '_' and '-'",
      );
    });
  });
});
