import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";

describe("log", () => {
  const originalLevel = process.env.LOG_LEVEL;
  let stdout: string[];

  beforeEach(async () => {
    process.env.LOG_LEVEL = "info";
    stdout = [];
    vi.resetModules();
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = originalLevel;
  });

  async function load() {
    return import("./log");
  }

  function lastLine(): Record<string, unknown> {
    const line = stdout.at(-1)?.trim();
    expect(line).toBeTruthy();
    return JSON.parse(line!) as Record<string, unknown>;
  }

  it("writes one JSON line with ts, level, and msg", async () => {
    const { log } = await load();
    log.info("server listening", { port: 8080 });
    const row = lastLine();
    expect(row.level).toBe("info");
    expect(row.msg).toBe("server listening");
    expect(row.port).toBe(8080);
    expect(typeof row.ts).toBe("string");
  });

  it("drops records below LOG_LEVEL", async () => {
    process.env.LOG_LEVEL = "warn";
    vi.resetModules();
    const { log } = await load();
    log.info("quiet");
    log.warn("loud");
    expect(stdout.join("")).not.toContain("quiet");
    expect(lastLine().msg).toBe("loud");
  });

  it("serializes errors without dumping the whole object", async () => {
    const { log } = await load();
    const err = new Error("boom");
    log.error("failed", { err, token: "secret-value", cookie: "sid=abc" });
    const row = lastLine();
    expect(row.err).toEqual({ name: "Error", message: "boom", stack: expect.any(String) });
    expect(row).not.toHaveProperty("token");
    expect(row).not.toHaveProperty("cookie");
  });

  it("skips health checks and keeps query strings off the path", async () => {
    const { shouldSkipHttpLog, requestPath } = await load();
    expect(shouldSkipHttpLog("/health")).toBe(true);
    expect(shouldSkipHttpLog("/api/health")).toBe(true);
    expect(shouldSkipHttpLog("/api/bingos/x")).toBe(false);
    expect(requestPath("/api/bingos/x/signup?code=abc")).toBe("/api/bingos/x/signup");
  });
});

describe("requestLog", () => {
  const originalLevel = process.env.LOG_LEVEL;
  let stdout: string[];
  let server: Server | undefined;
  let base: string;

  beforeEach(async () => {
    process.env.LOG_LEVEL = "info";
    stdout = [];
    vi.resetModules();
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });
    const { requestLog } = await import("./log");
    const { errorHandler } = await import("./middleware/errorHandler");
    const { ServiceError } = await import("./services/errors");
    const app = express();
    app.use((req, _res, next) => {
      req.audit = { requestId: "req-1", actorUserId: "user-1", actorType: "user", actorRole: "player", recorded: 0, skip: null };
      next();
    });
    app.use(requestLog);
    app.get("/health", (_req, res) => res.json({ ok: true }));
    app.get("/api/ok", (_req, res) => res.json({ ok: true }));
    app.get("/api/nope", (_req, _res, next) => next(new ServiceError(403, "not in guild")));
    app.get("/api/crash", (_req, _res, next) => next(new Error("kaboom")));
    app.use(errorHandler);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const listening = server!;
    base = `http://127.0.0.1:${(listening.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (originalLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = originalLevel;
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server!.close((err) => (err ? reject(err) : resolve())));
    }
  });

  function lines(): Record<string, unknown>[] {
    return stdout.filter((s) => s.trim()).map((s) => JSON.parse(s.trim()) as Record<string, unknown>);
  }

  it("logs /api requests with requestId and skips /health", async () => {
    await fetch(`${base}/health`);
    await fetch(`${base}/api/ok`);
    const api = lines().filter((row) => row.msg === "request");
    expect(api).toHaveLength(1);
    expect(api[0]).toMatchObject({
      level: "info",
      method: "GET",
      path: "/api/ok",
      status: 200,
      requestId: "req-1",
      userId: "user-1",
    });
    expect(typeof api[0]!.ms).toBe("number");
  });

  it("logs 4xx as warn with the service error message and 5xx as error with a stack", async () => {
    await fetch(`${base}/api/nope`);
    await fetch(`${base}/api/crash`);
    const rows = lines().filter((row) => row.msg === "request");
    expect(rows[0]).toMatchObject({ level: "warn", status: 403, error: "not in guild" });
    expect(rows[0]).not.toHaveProperty("stack");
    expect(rows[1]).toMatchObject({ level: "error", status: 500, error: "kaboom" });
    expect(typeof rows[1]!.stack).toBe("string");
  });
});
