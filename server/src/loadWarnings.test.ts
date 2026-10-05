import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LOAD_WARNING_SETTINGS,
  LoadWarnings,
  eventLoopLagging,
  isSlowByDesign,
  loadWarningSettings,
  loadWarningsEnabled,
  type FinishedRequest,
  type LoadWarning,
  type LoadWarningSettings,
} from "./loadWarnings";

function setup(settings: Partial<LoadWarningSettings> = {}) {
  let t = 1_000_000;
  const reported: LoadWarning[] = [];
  const warnings = new LoadWarnings({ settings, now: () => t, report: (w) => reported.push(w) });
  const request = (r: Partial<FinishedRequest> = {}) =>
    warnings.recordRequest({ method: "GET", route: "/api/bingos/:slug/board", ms: 10, status: 200, ...r });
  const write = (r: Partial<FinishedRequest> = {}) =>
    request({ method: "PATCH", route: "/api/bingos/:slug/admin/teams/:id", userId: "u1", bingoId: "b1", ...r });
  return {
    warnings,
    reported,
    request,
    write,
    advance: (ms: number) => (t += ms),
    kinds: () => reported.map((w) => w.kind),
  };
}

function times(n: number, fn: () => void): void {
  for (let i = 0; i < n; i++) fn();
}

describe("slow_request", () => {
  it("fires over the threshold, not at it", () => {
    const { request, reported } = setup();
    request({ ms: 3000 });
    expect(reported).toEqual([]);
    request({ method: "PATCH", route: "/api/bingos/:slug/admin/teams/:id", ms: 3001, status: 200 });
    expect(reported).toEqual([
      {
        kind: "slow_request",
        message: "Slow request: PATCH /api/bingos/:slug/admin/teams/:id took 3001 ms",
        fingerprint: ["load-warning", "slow_request", "PATCH /api/bingos/:slug/admin/teams/:id"],
        extra: { method: "PATCH", route: "/api/bingos/:slug/admin/teams/:id", ms: 3001, status: 200, thresholdMs: 3000 },
      },
    ]);
  });

  it("is one per route per throttle window", () => {
    const { request, advance, reported } = setup();
    request({ ms: 5000 });
    request({ ms: 5000 });
    request({ route: "/api/bingos/:slug", ms: 5000 });
    expect(reported.map((w) => w.extra.route)).toEqual(["/api/bingos/:slug/board", "/api/bingos/:slug"]);
    advance(10 * 60_000 - 1);
    request({ ms: 5000 });
    expect(reported).toHaveLength(2);
    advance(1);
    request({ ms: 5000 });
    expect(reported).toHaveLength(3);
  });

  it("gives the routes that are slow by design their own threshold", () => {
    const { request, reported } = setup();
    request({ method: "POST", route: "/api/bingos/:slug/submissions/analyze", ms: 29_000 });
    request({ method: "POST", route: "/mcp", ms: 29_000 });
    request({ method: "GET", route: "/api/bingos/:slug/admin/export", ms: 29_000 });
    expect(reported).toEqual([]);
    // Still reported when it hangs.
    request({ method: "POST", route: "/api/bingos/:slug/submissions/analyze", ms: 30_001 });
    expect(reported.map((w) => w.extra.thresholdMs)).toEqual([30_000]);
  });

  it("never times the MCP endpoint, whose stream the client may hold open, but still times its sign-in", () => {
    const { request, reported } = setup();
    request({ method: "POST", route: "/mcp", ms: 212_027 });
    expect(reported).toEqual([]);
    request({ method: "POST", route: "/token", ms: 30_001 });
    expect(reported.map((w) => w.message)).toEqual(["Slow request: POST /token took 30001 ms"]);
  });

  it("knows which routes are slow by design, by method too", () => {
    expect(isSlowByDesign("POST", "/api/bingos/:slug/submissions")).toBe(true);
    expect(isSlowByDesign("GET", "/api/bingos/:slug/submissions")).toBe(false);
    expect(isSlowByDesign("POST", "/api/admin/bingos/import")).toBe(true);
    expect(isSlowByDesign("POST", "/token")).toBe(true);
    expect(isSlowByDesign("POST", "/api/dev/generate")).toBe(true);
    expect(isSlowByDesign("GET", "/api/bingos/:slug/draft")).toBe(false);
  });
});

describe("write_limited", () => {
  it("fires when the write limit refuses a write, once per throttle window", () => {
    const { warnings, advance, reported, kinds } = setup();
    const hit = { userId: "u1", method: "PATCH", area: "/api/bingos/:slug/admin", perWindow: 30 };
    times(5, () => warnings.recordWriteLimited(hit));
    expect(reported).toEqual([
      {
        kind: "write_limited",
        message: "Write limit: one user went over 30 writes in 10 s, refused at PATCH /api/bingos/:slug/admin",
        fingerprint: ["load-warning", "write_limited"],
        extra: hit,
      },
    ]);
    advance(10 * 60_000);
    warnings.recordWriteLimited({ ...hit, userId: "u2" });
    expect(kinds()).toEqual(["write_limited", "write_limited"]);
  });
});

describe("user_write_flood", () => {
  it("fires on the write past the limit, naming the user, routes and Bingos", () => {
    const { write, reported } = setup();
    times(55, () => write());
    times(5, () => write({ method: "POST", route: "/api/bingos/:slug/admin/teams", bingoId: "b2" }));
    expect(reported).toEqual([]);
    write();
    expect(reported).toEqual([
      {
        kind: "user_write_flood",
        message: "Write flood: one user made 61 writes in a minute, most to PATCH /api/bingos/:slug/admin/teams/:id",
        fingerprint: ["load-warning", "user_write_flood"],
        extra: {
          userId: "u1",
          writes: 61,
          thresholdPerMin: 60,
          topRoutes: [
            { route: "PATCH /api/bingos/:slug/admin/teams/:id", count: 56 },
            { route: "POST /api/bingos/:slug/admin/teams", count: 5 },
          ],
          bingoIds: ["b1", "b2"],
        },
      },
    ]);
  });

  it("counts each user's writes on their own, and not reads", () => {
    const { write, request, reported } = setup();
    times(60, () => write());
    times(60, () => write({ userId: "u2" }));
    times(100, () => request({ userId: "u1" }));
    times(10, () => write({ userId: null }));
    expect(reported).toEqual([]);
  });

  it("is once per throttle window, whoever floods", () => {
    const { write, advance, kinds } = setup();
    times(100, () => write());
    times(100, () => write({ userId: "u2" }));
    expect(kinds()).toEqual(["user_write_flood"]);
    advance(10 * 60_000);
    times(61, () => write({ userId: "u2" }));
    expect(kinds()).toEqual(["user_write_flood", "user_write_flood"]);
  });

  it("forgets writes older than a minute", () => {
    const { write, advance, reported } = setup();
    times(60, () => write());
    advance(61_000);
    times(60, () => write());
    expect(reported).toEqual([]);
    write();
    expect(reported).toHaveLength(1);
  });

  it("leaves out the test data generator's writes", () => {
    const { write, reported } = setup();
    times(200, () => write({ generator: true }));
    expect(reported).toEqual([]);
  });
});

describe("request_spike", () => {
  it("fires on the request past the limit, with the top routes", () => {
    const { request, reported } = setup({ requestsPerMin: 10 });
    times(7, () => request());
    times(3, () => request({ route: "/api/bingos/:slug/teams/:teamId/progress" }));
    expect(reported).toEqual([]);
    request();
    expect(reported).toEqual([
      {
        kind: "request_spike",
        message: "Request spike: 11 requests in a minute, most to GET /api/bingos/:slug/board",
        fingerprint: ["load-warning", "request_spike"],
        extra: {
          requests: 11,
          thresholdPerMin: 10,
          topRoutes: [
            { route: "GET /api/bingos/:slug/board", count: 8 },
            { route: "GET /api/bingos/:slug/teams/:teamId/progress", count: 3 },
          ],
        },
      },
    ]);
  });

  it("forgets requests older than a minute, and is once per throttle window", () => {
    const { request, advance, kinds } = setup({ requestsPerMin: 10 });
    times(8, () => request());
    advance(30_000);
    times(2, () => request());
    advance(31_000);
    // The first 8 have left the window.
    times(8, () => request());
    expect(kinds()).toEqual([]);
    request();
    times(20, () => request());
    expect(kinds()).toEqual(["request_spike"]);
  });

  it("defaults to 2400 a minute", () => {
    const { request, kinds } = setup();
    times(2400, () => request());
    expect(kinds()).toEqual([]);
    request();
    expect(kinds()).toEqual(["request_spike"]);
  });
});

describe("event_loop_lag", () => {
  it("lags when the window's p99 is over the threshold", () => {
    expect(eventLoopLagging({ p50: 20, p99: 500, max: 2000 }, 500)).toBe(false);
    expect(eventLoopLagging({ p50: 20, p99: 501, max: 600 }, 500)).toBe(true);
  });

  it("reports the window's p50/p99/max, once per throttle window", () => {
    const { warnings, advance, reported } = setup();
    warnings.checkEventLoop({ p50: 12.4, p99: 300, max: 900 }, 10_000);
    expect(reported).toEqual([]);
    warnings.checkEventLoop({ p50: 40.2, p99: 812.6, max: 1503.1 }, 10_000);
    warnings.checkEventLoop({ p50: 40, p99: 900, max: 1500 }, 10_000);
    expect(reported).toEqual([
      {
        kind: "event_loop_lag",
        message: "Event loop lag: p99 813 ms over the last 10 s",
        fingerprint: ["load-warning", "event_loop_lag"],
        extra: { p50Ms: 40, p99Ms: 813, maxMs: 1503, windowMs: 10_000, thresholdMs: 500 },
      },
    ]);
    advance(10 * 60_000);
    warnings.checkEventLoop({ p50: 40, p99: 900, max: 1500 }, 10_000);
    expect(reported).toHaveLength(2);
  });
});

describe("settings", () => {
  it("come from the environment, with defaults", () => {
    expect(loadWarningSettings({})).toEqual(DEFAULT_LOAD_WARNING_SETTINGS);
    expect(loadWarningSettings({ LOAD_WARN_SLOW_REQUEST_MS: "5000", LOAD_WARN_USER_WRITES_PER_MIN: "nope", LOAD_WARN_THROTTLE_MS: "0" })).toEqual({
      ...DEFAULT_LOAD_WARNING_SETTINGS,
      slowRequestMs: 5000,
    });
  });

  it("are off when disabled, and under vitest", () => {
    expect(loadWarningsEnabled({})).toBe(true);
    expect(loadWarningsEnabled({ LOAD_WARNINGS_DISABLED: "true" })).toBe(false);
    expect(loadWarningsEnabled({ VITEST: "true" })).toBe(false);
    expect(loadWarningsEnabled()).toBe(false);
  });
});

describe("reportLoadWarning", () => {
  it("logs the warning and sends it to Sentry as a warning", async () => {
    vi.resetModules();
    const captureMessage = vi.fn();
    vi.doMock("@sentry/node", () => ({ captureMessage }));
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const { reportLoadWarning } = await import("./loadWarnings");
      reportLoadWarning({ kind: "request_spike", message: "Request spike", fingerprint: ["load-warning", "request_spike"], extra: { requests: 2401 } });
      await vi.waitFor(() => expect(captureMessage).toHaveBeenCalled());
      expect(captureMessage).toHaveBeenCalledWith("Request spike", {
        level: "warning",
        fingerprint: ["load-warning", "request_spike"],
        tags: { load_warning: "request_spike" },
        extra: { requests: 2401 },
      });
      expect(JSON.parse(String(write.mock.calls[0][0]))).toMatchObject({ level: "warn", msg: "Request spike", loadWarning: "request_spike", requests: 2401 });
    } finally {
      write.mockRestore();
      vi.doUnmock("@sentry/node");
    }
  });
});
