import { ZodType, output } from "zod";
import { BadRequestError } from "../errors";

/**
 * Validates `input` against `schema` and returns the parsed value.
 * Throws a `BadRequestError` listing every failing field when validation fails.
 */
export const parseOrThrow = <T extends ZodType>(
  schema: T,
  input: any,
): output<T> => {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestError(
      "Request validation failed",
      result.error.issues.map(({ path, message }) => ({
        path: path.join("."),
        message,
      })),
    );
  }
  return result.data;
};
