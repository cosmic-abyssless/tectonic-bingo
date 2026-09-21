import { MulterError } from "multer";
import { ServiceError } from "./services/errors";

/**
 * Whether an error that reached Express's error handler is a bug worth reporting to Sentry, as opposed to the request
 * simply being refused: a ServiceError below 500 is the app saying no on purpose, an upload that is too large is the
 * user's doing, and anything Express or a body parser raises with a 4xx status (malformed JSON, payload too large)
 * is a bad request. Everything else is unexpected, and so is a ServiceError that is itself a 500.
 */
export function shouldReportError(err: unknown): boolean {
  if (err instanceof ServiceError) return err.status >= 500;
  if (err instanceof MulterError) return false;
  const { status, statusCode } = (err ?? {}) as { status?: unknown; statusCode?: unknown };
  const code = typeof status === "number" ? status : typeof statusCode === "number" ? statusCode : undefined;
  return code === undefined || code >= 500;
}
