import { ErrorRequestHandler, RequestHandler } from "express";
import { HttpError, NotFoundError } from "../errors";

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

const toErrorResponse = ({
  code,
  message,
  details,
}: HttpError): ErrorResponse => ({
  error: { code, message, ...(details !== undefined && { details }) },
});

/** Converts thrown errors into the shared `{ error: { code, message, details? } }` shape. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json(toErrorResponse(err));
    return;
  }

  // Raised by express.json() when the request body isn't valid JSON.
  if (err?.type === "entity.parse.failed") {
    res
      .status(400)
      .json(
        toErrorResponse(
          new HttpError(400, "INVALID_JSON", "Request body is not valid JSON"),
        ),
      );
    return;
  }

  console.error(err);
  res
    .status(500)
    .json(
      toErrorResponse(
        new HttpError(500, "INTERNAL_ERROR", "Internal Server Error"),
      ),
    );
};
