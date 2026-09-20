import type { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import { ServiceError } from "../services/errors";
import { MAX_UPLOAD_MB } from "./upload";
import { runWithAuditContext } from "../audit/context";

// Catches ServiceError thrown by services (via express-async-errors-free
// try/catch in routes, or a rejected async handler) and shapes the response.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  res.locals.error = err;
  if (err instanceof ServiceError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof MulterError && err.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: `That image is too large — the limit is ${MAX_UPLOAD_MB} MB` });
    return;
  }
  res.status(500).json({ error: "Internal server error" });
}

// Express 4 doesn't await async route handlers — an exception in one becomes
// an unhandled rejection instead of reaching errorHandler. Wrap handlers with
// this so thrown ServiceErrors (and everything else) route to errorHandler.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const run = () => fn(req, res, next).catch(next);
    // multer/busboy resume a multipart request via stream events on the
    // pre-existing socket, which do not carry the AsyncLocalStorage store
    // that auditContext created earlier in the request — without
    // re-entering it here, every multipart route (e.g. submission creation)
    // would silently lose actor attribution and get audited as "system".
    req.audit ? runWithAuditContext(req.audit, run) : run();
  };
}
