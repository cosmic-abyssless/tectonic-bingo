import { monitorEventLoopDelay } from "node:perf_hooks";
import { log } from "./log";

// The server's own unsampled load counters (docs/postmortems/2026-10-03-colour-picker.md): when nothing throws but the
// site is slow or flooded, these raise Sentry warning issues that name the cause within seconds. Sentry's traces can't:
// they're sampled per browser page load, so the one page flooding the server is usually not in them at all. Counted per
// process in memory, from every request that reaches the API (middleware/loadWarnings.ts) and a timer on the event loop.

export type LoadWarningKind = "slow_request" | "event_loop_lag" | "user_write_flood" | "request_spike";

export interface LoadWarning {
  kind: LoadWarningKind;
  message: string;
  /** Sentry groups by this: one issue per kind, and for slow_request one per route. Also what's throttled. */
  fingerprint: string[];
  /** No PII: route patterns (never raw URLs), counts and times, and at most a userId and bingoIds. */
  extra: Record<string, unknown>;
}

export interface LoadWarningSettings {
  slowRequestMs: number;
  /** For the routes that are slow by design (SLOW_BY_DESIGN): still reported, so a hang shows. */
  slowByDesignMs: number;
  /** The event loop's p99 lag over a window. */
  eventLoopMs: number;
  userWritesPerMin: number;
  requestsPerMin: number;
  /** Each fingerprint is reported at most once per this. */
  throttleMs: number;
}

export const DEFAULT_LOAD_WARNING_SETTINGS: LoadWarningSettings = {
  slowRequestMs: 3000,
  slowByDesignMs: 30_000,
  eventLoopMs: 500,
  userWritesPerMin: 60,
  // The 2026-10-03 incident peaked at ~3300 a minute; a normal busy hour is ~400.
  requestsPerMin: 2400,
  throttleMs: 10 * 60_000,
};

function positive(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** The thresholds, each overridable from the environment (see .env.example). */
export function loadWarningSettings(env: NodeJS.ProcessEnv = process.env): LoadWarningSettings {
  const d = DEFAULT_LOAD_WARNING_SETTINGS;
  return {
    slowRequestMs: positive(env.LOAD_WARN_SLOW_REQUEST_MS, d.slowRequestMs),
    slowByDesignMs: positive(env.LOAD_WARN_SLOW_BY_DESIGN_MS, d.slowByDesignMs),
    eventLoopMs: positive(env.LOAD_WARN_EVENT_LOOP_MS, d.eventLoopMs),
    userWritesPerMin: positive(env.LOAD_WARN_USER_WRITES_PER_MIN, d.userWritesPerMin),
    requestsPerMin: positive(env.LOAD_WARN_REQUESTS_PER_MIN, d.requestsPerMin),
    throttleMs: positive(env.LOAD_WARN_THROTTLE_MS, d.throttleMs),
  };
}

/** Off with LOAD_WARNINGS_DISABLED=true, and under vitest: a test that wants them builds a LoadWarnings itself. */
export function loadWarningsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LOAD_WARNINGS_DISABLED !== "true" && !env.VITEST;
}

// Routes that are slow by design, by "METHOD /route/pattern": they wait on an upload coming in at the uploader's speed,
// OCR, image processing, an import or export, or an outside API (Wise Old Man, the clan API, Discord). They get
// slowByDesignMs instead of slowRequestMs. The clan API's lookups are cached for a minute, so the hot reads that make
// one (GET /:slug/draft, the player card) aren't here: a slow one of those is load, which is what this is for.
const SLOW_BY_DESIGN = new Set([
  // Uploads (and their display variants, or keying out the background)
  "POST /api/bingos/:slug/submissions",
  "POST /api/bingos/:slug/submissions/analyze", // and OCR
  "POST /api/bingos/:slug/admin/tiles/:id/image",
  "POST /api/bingos/:slug/admin/wrapped-art/:group",
  "POST /api/bingos/:slug/admin/wrapped-art/images/:id",
  "POST /api/bingos/:slug/admin/wrapped-art/images/:id/recut",
  "POST /api/bingos/:slug/admin/historical/screenshots/:key",
  // Import and export (the export embeds every image)
  "GET /api/bingos/:slug/admin/export",
  "POST /api/admin/bingos/import",
  "POST /api/admin/historical-bingos",
  // Wise Old Man
  "POST /api/bingos/:slug/admin/settings/wom-check",
  "PUT /api/bingos/:slug/admin/signups/:signupId/account", // and the clan API
  "POST /api/admin/wom-competitions",
  // The clan API (tectonic-api)
  "GET /api/bingos/:slug/signup/rsns",
  "POST /api/bingos/:slug/signup",
  "PATCH /api/bingos/:slug/signup",
  "GET /api/bingos/:slug/signup/partners",
  "GET /api/bingos/:slug/signup/pairing",
  "GET /api/bingos/:slug/mod/signups",
  "POST /api/bingos/:slug/mod/signups/:signupId/refresh-stats",
  "GET /api/bingos/:slug/admin/late-signup/rsns/:userId",
  "POST /api/bingos/:slug/admin/late-signups",
  // Discord
  "POST /api/bingos/:slug/admin/discord/sync",
  "POST /api/bingos/:slug/admin/discord/remove",
  "GET /auth/discord/callback",
]);

/** The admin MCP server's paths (mcp/router.ts): tool calls run SQL over a database copy, and OAuth calls out. */
export const MCP_PATH = /^\/(mcp|authorize|token|register|revoke|\.well-known)(\/|$)/;

export function isSlowByDesign(method: string, route: string): boolean {
  // The dev tools (the test data generator) do a whole Bingo's work in one request.
  return SLOW_BY_DESIGN.has(`${method} ${route}`) || MCP_PATH.test(route) || route.startsWith("/api/dev/");
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** A request as the counters see it, once it's done. */
export interface FinishedRequest {
  method: string;
  /** The route pattern, e.g. "/api/bingos/:slug/admin/teams/:id"; never the raw URL. */
  route: string;
  ms: number;
  status: number;
  userId?: string | null;
  bingoId?: string | null;
  /** The test data generator's (it writes through the real endpoints at speed): not counted towards write floods. */
  generator?: boolean;
}

/** Event loop lag over a window, in ms. */
export interface EventLoopStats {
  p50: number;
  p99: number;
  max: number;
}

/** Whether a window's event loop lag is worth a warning. */
export function eventLoopLagging(stats: EventLoopStats, thresholdMs: number): boolean {
  return stats.p99 > thresholdMs;
}

/** Counts per key over a sliding window, in one-second buckets, with running totals so adding is cheap. */
export class SlidingCounter {
  private buckets: { start: number; counts: Map<string, number> }[] = [];
  private totals = new Map<string, number>();
  total = 0;

  constructor(
    private windowMs: number,
    private bucketMs = 1000,
  ) {}

  add(now: number, key: string): void {
    this.prune(now);
    const start = now - (now % this.bucketMs);
    let bucket = this.buckets[this.buckets.length - 1];
    if (!bucket || bucket.start !== start) {
      bucket = { start, counts: new Map() };
      this.buckets.push(bucket);
    }
    bucket.counts.set(key, (bucket.counts.get(key) ?? 0) + 1);
    this.totals.set(key, (this.totals.get(key) ?? 0) + 1);
    this.total++;
  }

  /** Drops the buckets that have left the window. */
  prune(now: number): void {
    while (this.buckets.length > 0 && this.buckets[0].start + this.bucketMs <= now - this.windowMs) {
      for (const [key, count] of this.buckets.shift()!.counts) {
        const left = this.totals.get(key)! - count;
        if (left > 0) this.totals.set(key, left);
        else this.totals.delete(key);
        this.total -= count;
      }
    }
  }

  /** The keys with the most counts, most first. */
  top(n: number): { key: string; count: number }[] {
    return [...this.totals]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, n);
  }

  keys(): string[] {
    return [...this.totals.keys()];
  }
}

const MINUTE = 60_000;
const TOP_ROUTES = 5;

interface LoadWarningsOptions {
  settings?: Partial<LoadWarningSettings>;
  /** The clock, in ms (tests pass a fake one). */
  now?: () => number;
  report?: (warning: LoadWarning) => void;
}

/**
 * The counters and their thresholds. Feed it every finished request (recordRequest) and the event loop's lag every
 * window (checkEventLoop); it calls `report` when one crosses a threshold, at most once per fingerprint per throttleMs.
 */
export class LoadWarnings {
  readonly settings: LoadWarningSettings;
  private now: () => number;
  private report: (warning: LoadWarning) => void;
  private lastReported = new Map<string, number>();
  private requests = new SlidingCounter(MINUTE);
  private writesByUser = new Map<string, { routes: SlidingCounter; bingoIds: SlidingCounter }>();
  private lastSweep = 0;

  constructor(options: LoadWarningsOptions = {}) {
    this.settings = { ...DEFAULT_LOAD_WARNING_SETTINGS, ...options.settings };
    this.now = options.now ?? Date.now;
    this.report = options.report ?? reportLoadWarning;
  }

  recordRequest(request: FinishedRequest): void {
    const now = this.now();
    const { method, route, ms, status } = request;
    const label = `${method} ${route}`;
    const s = this.settings;

    const slowMs = isSlowByDesign(method, route) ? s.slowByDesignMs : s.slowRequestMs;
    if (ms > slowMs) {
      this.fire(["slow_request", label], () => ({
        message: `Slow request: ${label} took ${Math.round(ms)} ms`,
        extra: { method, route, ms: Math.round(ms), status, thresholdMs: slowMs },
      }));
    }

    this.requests.add(now, label);
    if (this.requests.total > s.requestsPerMin) {
      const topRoutes = topRoutesOf(this.requests);
      this.fire(["request_spike"], () => ({
        message: `Request spike: ${this.requests.total} requests in a minute, most to ${topRoutes[0].route}`,
        extra: { requests: this.requests.total, thresholdPerMin: s.requestsPerMin, topRoutes },
      }));
    }

    if (!READ_METHODS.has(method) && request.userId && !request.generator) this.recordWrite(now, request.userId, label, request.bingoId);
    this.sweep(now);
  }

  private recordWrite(now: number, userId: string, label: string, bingoId: string | null | undefined): void {
    let writes = this.writesByUser.get(userId);
    if (!writes) {
      writes = { routes: new SlidingCounter(MINUTE), bingoIds: new SlidingCounter(MINUTE) };
      this.writesByUser.set(userId, writes);
    }
    writes.routes.add(now, label);
    if (bingoId) writes.bingoIds.add(now, bingoId);
    else writes.bingoIds.prune(now);
    const s = this.settings;
    if (writes.routes.total > s.userWritesPerMin) {
      const topRoutes = topRoutesOf(writes.routes);
      const { total } = writes.routes;
      const bingoIds = writes.bingoIds.keys();
      this.fire(["user_write_flood"], () => ({
        message: `Write flood: one user made ${total} writes in a minute, most to ${topRoutes[0].route}`,
        extra: { userId, writes: total, thresholdPerMin: s.userWritesPerMin, topRoutes, bingoIds },
      }));
    }
  }

  /** Forgets the users who've stopped writing, once a minute, so the map doesn't grow with every user ever seen. */
  private sweep(now: number): void {
    if (now - this.lastSweep < MINUTE) return;
    this.lastSweep = now;
    for (const [userId, writes] of this.writesByUser) {
      writes.routes.prune(now);
      if (writes.routes.total === 0) this.writesByUser.delete(userId);
    }
  }

  /** One window of event loop lag (from startEventLoopMonitor). */
  checkEventLoop(stats: EventLoopStats, windowMs: number): void {
    const s = this.settings;
    if (!eventLoopLagging(stats, s.eventLoopMs)) return;
    const [p50Ms, p99Ms, maxMs] = [stats.p50, stats.p99, stats.max].map(Math.round);
    this.fire(["event_loop_lag"], () => ({
      message: `Event loop lag: p99 ${p99Ms} ms over the last ${Math.round(windowMs / 1000)} s`,
      extra: { p50Ms, p99Ms, maxMs, windowMs, thresholdMs: s.eventLoopMs },
    }));
  }

  private fire(key: [LoadWarningKind, ...string[]], build: () => Pick<LoadWarning, "message" | "extra">): void {
    const now = this.now();
    const throttleKey = key.join("\u0000");
    const last = this.lastReported.get(throttleKey);
    if (last !== undefined && now - last < this.settings.throttleMs) return;
    this.lastReported.set(throttleKey, now);
    const [kind] = key;
    this.report({ kind, fingerprint: ["load-warning", ...key], ...build() });
  }
}

function topRoutesOf(counter: SlidingCounter): { route: string; count: number }[] {
  return counter.top(TOP_ROUTES).map(({ key, count }) => ({ route: key, count }));
}

/** Logs the warning and sends it to Sentry as a warning issue. Sentry is loaded on demand, as in log.ts. */
export function reportLoadWarning(warning: LoadWarning): void {
  log.warn(warning.message, { loadWarning: warning.kind, ...warning.extra });
  void import("@sentry/node")
    .then((Sentry) =>
      Sentry.captureMessage(warning.message, {
        level: "warning",
        fingerprint: warning.fingerprint,
        tags: { load_warning: warning.kind },
        extra: warning.extra,
      }),
    )
    .catch(() => undefined);
}

/**
 * Samples the event loop's lag and hands each window's p50/p99/max to `warnings`. Returns a stop function. The timer is
 * unref'd, so it never keeps the process alive.
 */
export function startEventLoopMonitor(warnings: LoadWarnings, windowMs = 10_000): () => void {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  const ns = 1e6;
  const timer = setInterval(() => {
    try {
      if (histogram.count > 0) {
        warnings.checkEventLoop({ p50: histogram.percentile(50) / ns, p99: histogram.percentile(99) / ns, max: histogram.max / ns }, windowMs);
      }
    } catch (err) {
      log.warn("event loop check failed", { err });
    }
    histogram.reset();
  }, windowMs);
  timer.unref();
  return () => {
    clearInterval(timer);
    histogram.disable();
  };
}
