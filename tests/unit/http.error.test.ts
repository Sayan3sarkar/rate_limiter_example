import { BadRequestError, HttpError, NotFoundError } from "../../src/errors";

describe("HttpError", () => {
  it("stores status, code, message and details", () => {
    const err = new HttpError(418, "TEAPOT", "I'm a teapot", { brew: false });

    expect(err).toMatchObject({
      status: 418,
      code: "TEAPOT",
      message: "I'm a teapot",
      details: { brew: false },
      name: "HttpError",
    });
  });

  it("leaves details undefined when not given", () => {
    expect(new HttpError(500, "X", "x").details).toBeUndefined();
  });

  it.each([
    {
      name: "BadRequestError",
      create: () => new BadRequestError("bad", [{ path: "key" }]),
      expected: { status: 400, code: "BAD_REQUEST", message: "bad", details: [{ path: "key" }] },
    },
    {
      name: "NotFoundError",
      create: () => new NotFoundError("missing"),
      expected: { status: 404, code: "NOT_FOUND", message: "missing", details: undefined },
    },
    {
      name: "NotFoundError",
      create: () => new NotFoundError("no policy", "POLICY_NOT_FOUND"),
      expected: { status: 404, code: "POLICY_NOT_FOUND", message: "no policy", details: undefined },
    },
  ])("$name sets $expected.status / $expected.code", ({ name, create, expected }) => {
    const err = create();

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.name).toBe(name);
    expect(err).toMatchObject(expected);
  });
});
