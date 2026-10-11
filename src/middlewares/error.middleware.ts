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

/** Responds 404 for any request that didn't match a route. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
};

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

  // Other client errors from express.json() that are safe to expose,
  // e.g. "entity.too.large" (413) -> "ENTITY_TOO_LARGE".
  if (err?.expose && err.status >= 400 && err.status < 500) {
    const code = err.type?.toUpperCase().replace(/\./g, "_") ?? "BAD_REQUEST";
    res
      .status(err.status)
      .json(toErrorResponse(new HttpError(err.status, code, err.message)));
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
