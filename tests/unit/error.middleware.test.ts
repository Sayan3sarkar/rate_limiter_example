import { NextFunction, Request, Response } from "express";
import { HttpError, NotFoundError } from "../../src/errors";
import { errorHandler, notFoundHandler } from "../../src/middlewares";

const mockResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as typeof res & Response;
};

const req = { method: "GET", path: "/missing" } as Request;

describe("notFoundHandler", () => {
  it.each([
    { method: "GET", path: "/missing" },
    { method: "DELETE", path: "/rate_limiter/v1/allow" },
  ])("forwards a NotFoundError for $method $path", ({ method, path }) => {
    const next = jest.fn() as NextFunction & jest.Mock;

    notFoundHandler({ method, path } as Request, mockResponse(), next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err).toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: `Route ${method} ${path} not found`,
    });
  });
});

describe("errorHandler", () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  const handle = (err: unknown) => {
    const res = mockResponse();
    errorHandler(err, req, res, jest.fn());
    return res;
  };

  describe("HttpError", () => {
    it("responds with its status, code and message", () => {
      const res = handle(new HttpError(409, "CONFLICT", "Already exists"));

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: { code: "CONFLICT", message: "Already exists" },
      });
    });

    it("includes details when present", () => {
      const details = [{ path: "key", message: "Required" }];
      const res = handle(new HttpError(400, "BAD_REQUEST", "Invalid", details));

      expect(res.json).toHaveBeenCalledWith({
        error: { code: "BAD_REQUEST", message: "Invalid", details },
      });
    });

    it.each([null, 0, "", false])("includes falsy details (%p)", (details) => {
      const res = handle(new HttpError(400, "BAD_REQUEST", "Invalid", details));

      expect(res.json.mock.calls[0][0].error).toHaveProperty("details", details);
    });

    it("omits the details key entirely when undefined", () => {
      const res = handle(new NotFoundError("nope"));

      expect(res.json.mock.calls[0][0].error).not.toHaveProperty("details");
    });

    it("does not log client errors", () => {
      handle(new NotFoundError("nope"));

      expect(consoleError).not.toHaveBeenCalled();
    });
  });

  it("maps a JSON parse failure to 400 INVALID_JSON", () => {
    const res = handle(
      Object.assign(new SyntaxError("Unexpected token"), {
        type: "entity.parse.failed",
        status: 400,
        expose: true,
      }),
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "INVALID_JSON", message: "Request body is not valid JSON" },
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  describe("exposed 4xx errors (e.g. from body-parser)", () => {
    it.each([
      { type: "entity.too.large", status: 413, message: "request entity too large", code: "ENTITY_TOO_LARGE" },
      { type: "charset.unsupported", status: 415, message: 'unsupported charset "KLINGON"', code: "CHARSET_UNSUPPORTED" },
      { type: "encoding.unsupported", status: 415, message: 'unsupported content encoding "compress"', code: "ENCODING_UNSUPPORTED" },
      { type: "request.aborted", status: 400, message: "request aborted", code: "REQUEST_ABORTED" },
      { type: undefined, status: 400, message: "bad request", code: "BAD_REQUEST" },
      { type: undefined, status: 499, message: "edge of range", code: "BAD_REQUEST" },
    ])("maps $status ($type) to $code", ({ type, status, message, code }) => {
      const res = handle(Object.assign(new Error(message), { type, status, expose: true }));

      expect(res.status).toHaveBeenCalledWith(status);
      expect(res.json).toHaveBeenCalledWith({ error: { code, message } });
      expect(consoleError).not.toHaveBeenCalled();
    });
  });

  describe("unexpected errors", () => {
    it.each([
      { case: "a plain Error", err: new Error("boom") },
      { case: "a thrown string", err: "boom" },
      { case: "null", err: null },
      { case: "undefined", err: undefined },
      { case: "a 4xx error that is not exposed", err: Object.assign(new Error("secret"), { status: 400, expose: false }) },
      { case: "an exposed 5xx error", err: Object.assign(new Error("upstream"), { status: 503, expose: true }) },
      { case: "an exposed error below 400", err: Object.assign(new Error("redirect"), { status: 302, expose: true }) },
    ])("responds 500 INTERNAL_ERROR for $case and logs it", ({ err }) => {
      const res = handle(err);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: { code: "INTERNAL_ERROR", message: "Internal Server Error" },
      });
      expect(consoleError).toHaveBeenCalledWith(err);
    });

    it("never leaks the original error message", () => {
      const res = handle(new Error("db password is hunter2"));

      expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain("hunter2");
    });
  });
});
