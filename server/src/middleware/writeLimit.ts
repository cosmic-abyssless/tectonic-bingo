import type { NextFunction, Request, RequestHandler, Response } from "express";
import { log, requestPath, type LogFields } from "../log";
import { TESTDATA_PREFIX } from "../services/devTestDataService";

// One user's writes are capped (docs/postmortems/2026-10-03-colour-picker.md, #454): on 2026-10-03 one Admin's page sent
// up to 9 Team saves a second, and every page that had it open could have gone on doing so until reloaded. Counted per
// user over a sliding window, in memory: the server is a single process.

export const WRITE_LIMIT_MESSAGE = "Slow down: too many changes in a few seconds. Try again in a moment.";
export const WRITE_LIMIT_WINDOW_MS = 10_000;
const DEFAULT_PER_WINDOW = 30;

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// API writes that aren't capped, by path (the route isn't matched yet when this runs).
const EXEMPT_PATHS = [
  /^\/api\/client-errors(\/|$)/, // has its own limit (routes/clientErrors.ts)
  /^\/api\/bingos\/[^/]+\/achievements\/opened$/, // the Achievements' page-open signal, sent on every Tile opened
  /^\/api\/bingos\/[^/]+\/feedback(\/|$)/, // anonymous end to end (ADR 0002): nothing may tie a request there to its user
];

/**
 * How many writes per user per 10 seconds (WRITE_LIMIT_PER_10S, default 30), or null with WRITE_LIMIT_DISABLED=true.
 * A value that isn't a positive whole number is warned about and the default used: 0 doesn't switch it off.
 */
export function writeLimitPerWindow(env: NodeJS.ProcessEnv = process.env, warn: (msg: string, fields?: LogFields) => void = log.warn): number | null {
  if (env.WRITE_LIMIT_DISABLED === "true") return null;
  const value = env.WRITE_LIMIT_PER_10S;
  if (!value) return DEFAULT_PER_WINDOW;
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  warn(`WRITE_LIMIT_PER_10S must be a positive whole number, so the default of ${DEFAULT_PER_WINDOW} applies; WRITE_LIMIT_DISABLED=true switches the limit off`, { value });
  return DEFAULT_PER_WINDOW;
}

/** Each user's writes over the last 10 seconds. */
export class WriteLimit {
  private writes = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(
    readonly perWindow: number,
    private now: () => number = Date.now,
  ) {}

  /** Counts one write and returns 0, or, over the limit, counts nothing and returns how long until a write is allowed, in ms. */
  take(userId: string): number {
    const now = this.now();
    this.sweep(now);
    const recent = (this.writes.get(userId) ?? []).filter((at) => at > now - WRITE_LIMIT_WINDOW_MS);
    this.writes.set(userId, recent);
    if (recent.length >= this.perWindow) return recent[0] + WRITE_LIMIT_WINDOW_MS - now;
    recent.push(now);
    return 0;
  }

  /** Forgets the users who've stopped writing, so the map doesn't grow with every user ever seen. */
  private sweep(now: number): void {
    if (now - this.lastSweep < WRITE_LIMIT_WINDOW_MS) return;
    this.lastSweep = now;
    for (const [userId, times] of this.writes) {
      if (times[times.length - 1]! <= now - WRITE_LIMIT_WINDOW_MS) this.writes.delete(userId);
    }
  }
}

/** A refused write, for the load warnings: the user, and where it went without any ids ("/api/bingos/:slug/admin"). */
export interface WriteLimitHit {
  userId: string;
  method: string;
  area: string;
  perWindow: number;
}

/** The part of the API a path is in, without the Bingo's slug or any ids. */
export function apiArea(path: string): string {
  const bingo = /^\/api\/bingos\/[^/]+(\/[^/]+)?/.exec(path);
  if (bingo) return `/api/bingos/:slug${bingo[1] ?? ""}`;
  return /^\/api\/[^/]+/.exec(path)?.[0] ?? "/api";
}

/** The test data generator writes through the real endpoints at speed: it sends X-Dev-Skip-Integrations and plays testdata- Bingos. */
function isGenerator(req: Request, path: string): boolean {
  return req.audit?.skipIntegrations === true || !!/^\/api\/bingos\/([^/]+)/.exec(path)?.[1]?.startsWith(TESTDATA_PREFIX);
}

/**
 * Refuses a logged-in user's API write over the limit with a 429, the app's usual { error, code } and a Retry-After.
 * Reads, anonymous requests, logins (/auth), the MCP server and the generator aren't counted, and nor is a refused write.
 * Mount after auditContext (whose context says whether the request is the generator's).
 */
export function writeLimitMiddleware(limit: WriteLimit, onLimited?: (hit: WriteLimitHit) => void): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const path = requestPath(req.originalUrl || req.url);
    const userId = req.user?.id;
    if (!userId || READ_METHODS.has(req.method) || !path.startsWith("/api/") || EXEMPT_PATHS.some((p) => p.test(path)) || isGenerator(req, path)) {
      next();
      return;
    }
    const waitMs = limit.take(userId);
    if (waitMs === 0) {
      next();
      return;
    }
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil(waitMs / 1000))));
    res.status(429).json({ error: WRITE_LIMIT_MESSAGE, code: "write_limited" });
    onLimited?.({ userId, method: req.method, area: apiArea(path), perWindow: limit.perWindow });
  };
}
