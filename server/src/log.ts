import type { NextFunction, Request, Response } from "express";
import { ServiceError } from "./services/errors";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET_KEY = /^(token|cookie|password|secret|authorization|apiKey|api_key)$/i;

export type LogFields = Record<string, unknown>;

function minLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return raw in LEVEL_RANK ? (raw as LogLevel) : "info";
}

function serializeError(err: unknown): { name: string; message: string; stack?: string } {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
  return { name: "Error", message: String(err) };
}

function sanitize(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SECRET_KEY.test(key)) continue;
    if (key === "err" || value instanceof Error) {
      out[key === "err" ? "err" : key] = serializeError(value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function log(level: LogLevel, msg: string, fields: LogFields = {}): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel()]) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...sanitize(fields) });
  process.stdout.write(`${line}\n`);
}

log.debug = (msg: string, fields?: LogFields) => log("debug", msg, fields);
log.info = (msg: string, fields?: LogFields) => log("info", msg, fields);
log.warn = (msg: string, fields?: LogFields) => log("warn", msg, fields);
log.error = (msg: string, fields?: LogFields) => {
  log("error", msg, fields);
  reportLoggedError(msg, fields ?? {});
};

// A logged error that was handled (and so never reaches Express's error handler or the process handlers) is still a
// bug, so it goes to Sentry too. Loaded on demand: most code, and every test, never needs the SDK.
function reportLoggedError(msg: string, fields: LogFields): void {
  const err = fields.err;
  if (!(err instanceof Error)) return;
  const { err: _logged, ...context } = sanitize(fields);
  void import("@sentry/node")
    .then((Sentry) => Sentry.captureException(err, { tags: { source: "log.error" }, extra: { logMessage: msg, ...context } }))
    .catch(() => undefined);
}

export function shouldSkipHttpLog(urlPath: string): boolean {
  return urlPath === "/health" || urlPath === "/api/health";
}

export function requestPath(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

function errorInfo(err: unknown): { error: string; stack?: string } {
  if (err instanceof Error) {
    return err instanceof ServiceError ? { error: err.message } : { error: err.message, stack: err.stack };
  }
  return { error: String(err) };
}

export function requestLog(req: Request, res: Response, next: NextFunction): void {
  const started = Date.now();
  res.on("finish", () => {
    const path = requestPath(req.originalUrl || req.url);
    if (shouldSkipHttpLog(path)) return;
    if (!path.startsWith("/api") && !path.startsWith("/auth")) return;

    const status = res.statusCode;
    const err = res.locals.error as unknown;
    const level: LogLevel = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    const fields: LogFields = {
      method: req.method,
      path,
      status,
      ms: Date.now() - started,
      requestId: req.audit?.requestId,
      userId: req.user?.id ?? req.audit?.actorUserId ?? undefined,
      bingoId: req.bingo?.id,
    };
    if (err) Object.assign(fields, errorInfo(err));
    else if (status >= 400) fields.error = res.statusMessage || String(status);
    log(level, "request", fields);
  });
  next();
}

export function installProcessLogHandlers(): void {
  process.on("uncaughtException", (err) => {
    log.error("uncaughtException", { err });
  });
  process.on("unhandledRejection", (reason) => {
    log.error("unhandledRejection", { err: reason });
  });
}
