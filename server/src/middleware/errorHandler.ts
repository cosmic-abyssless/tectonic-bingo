import type { NextFunction, Request, Response } from "express";
import { ServiceError } from "../services/errors";

// Catches ServiceError thrown by services (via express-async-errors-free
// try/catch in routes, or a rejected async handler) and shapes the response.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ServiceError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}

// Express 4 doesn't await async route handlers — an exception in one becomes
// an unhandled rejection instead of reaching errorHandler. Wrap handlers with
// this so thrown ServiceErrors (and everything else) route to errorHandler.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
