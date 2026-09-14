// App-level middleware that opens the per-request AuditContext, plus the
// fallback net that catches any successful mutation nothing else audited.
import crypto from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { db } from "../db";
import { runWithAuditContext, type AuditContext } from "./context";
import { audit, redactBody } from "./record";

// Mount after passport.session() (so req.user is populated) and before the
// routers, in server/src/index.ts.
export function auditContext(req: Request, res: Response, next: NextFunction): void {
  const ctx: AuditContext = {
    requestId: crypto.randomUUID(),
    actorUserId: req.user?.id ?? null,
    actorType: req.user ? "user" : "system",
    actorRole: req.user?.isAdmin ? "admin" : "player",
    recorded: 0,
    skip: null,
  };
  req.audit = ctx;

  // Closes over `ctx` directly rather than calling getAuditContext(): a
  // res.on("finish") callback fires outside the AsyncLocalStorage run() that
  // wrapped the handler, so the ambient store would already be gone.
  res.on("finish", () => {
    const isMutation = req.method !== "GET" && req.originalUrl.startsWith("/api/");
    if (!isMutation || res.statusCode >= 400 || ctx.recorded > 0 || ctx.skip) return;

    audit(db, {
      action: "http.mutation",
      bingoId: req.bingo?.id ?? null,
      entity: { type: "http", id: null, label: `${req.method} ${req.originalUrl}` },
      details: {
        method: req.method,
        originalUrl: req.originalUrl,
        routePath: req.route?.path ?? null,
        params: req.params,
        body: redactBody(req.body),
        file: req.file?.filename ?? null,
      },
    });
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[audit] unaudited mutation: ${req.method} ${req.originalUrl} — add it to AUDITED_ROUTES or mark it auditSkip()`);
    }
  });

  runWithAuditContext(ctx, next);
}

/** Marks a route as a deliberate audit no-op (e.g. a read-only analyze endpoint), so the fallback doesn't fire for it. Also carries `.auditSkipReason` for routeCoverage.test.ts to recognize. */
export function auditSkip(reason: string): RequestHandler {
  const handler: RequestHandler = (req, _res, next) => {
    if (req.audit) req.audit.skip = reason;
    next();
  };
  (handler as RequestHandler & { auditSkipReason: string }).auditSkipReason = reason;
  return handler;
}
