// App-level middleware that opens the per-request AuditContext, plus the
// fallback net that catches any successful mutation nothing else audited.
import crypto from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { db } from "../db";
import { devSkipsIntegrations, isDevModeActive } from "../devMode";
import { runWithAuditContext, type AuditContext } from "./context";
import { audit, redactBody } from "./record";
import { log } from "../log";
import { normalizeTimezone } from "../localTime";

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
    // Achievements' time-of-day/date rules (CONTEXT.md "Achievement"): set once in the client's central request
    // function (see localTime.ts) — a missing or invalid zone reads as UTC.
    timezone: normalizeTimezone(req.header("x-client-timezone")),
  };
  req.audit = ctx;

  // Dev-only clock override: lets the test-data generator play a bingo forward at spoofed times through
  // the real endpoints. Ignored outside dev mode.
  const devNow = isDevModeActive() ? req.header("x-dev-now") : undefined;
  if (devNow) {
    const at = new Date(devNow);
    if (Number.isNaN(at.getTime())) {
      res.status(400).json({ error: "X-Dev-Now must be an ISO date" });
      return;
    }
    ctx.now = at;
  }
  if (devSkipsIntegrations(req.header("x-dev-skip-integrations"))) ctx.skipIntegrations = true;

  // Closes over `ctx` directly rather than calling getAuditContext(): a
  // res.on("finish") callback fires outside the AsyncLocalStorage run() that
  // wrapped the handler, so the ambient store would already be gone.
  res.on("finish", () => {
    const isMutation = req.method !== "GET" && req.originalUrl.startsWith("/api/");
    if (!isMutation || res.statusCode >= 400 || ctx.recorded > 0 || ctx.skip) return;

    audit(db, {
      now: ctx.now,
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
      log.warn("unaudited mutation", { method: req.method, path: req.originalUrl });
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
