import { z } from "zod";
import { BadRequestError } from "../../src/errors";
import { parseOrThrow } from "../../src/utils/validation";
import { captureError } from "../helpers/test-app";

describe("parseOrThrow", () => {
  const schema = z.object({
    name: z.string().trim().min(1),
    address: z.object({ city: z.string() }),
    tags: z.array(z.string()).optional(),
  });

  it("returns the parsed (transformed) value when input is valid", () => {
    expect(
      parseOrThrow(schema, { name: "  Ada  ", address: { city: "London" }, extra: 1 }),
    ).toEqual({ name: "Ada", address: { city: "London" } });
  });

  it("throws a BadRequestError when input is invalid", () => {
    const err = captureError(() => parseOrThrow(schema, {}));

    expect(err).toBeInstanceOf(BadRequestError);
    expect(err).toMatchObject({
      status: 400,
      code: "BAD_REQUEST",
      message: "Request validation failed",
    });
  });

  it.each([
    {
      case: "top-level fields",
      input: { address: { city: "London" } },
      paths: ["name"],
    },
    {
      case: "nested fields, joined with '.'",
      input: { name: "Ada", address: { city: 42 } },
      paths: ["address.city"],
    },
    {
      case: "array items, joined with their index",
      input: { name: "Ada", address: { city: "London" }, tags: ["ok", 7] },
      paths: ["tags.1"],
    },
    {
      case: "every failing field at once",
      input: { name: "", address: {} },
      paths: ["name", "address.city"],
    },
    {
      case: "the root as an empty path",
      input: undefined,
      paths: [""],
    },
  ])("lists $case in details", ({ input, paths }) => {
    const err = captureError(() => parseOrThrow(schema, input)) as BadRequestError;

    expect(err.details).toEqual(
      paths.map((path) => ({ path, message: expect.any(String) })),
    );
  });
});
