import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { audit } from "./record";
import { auditContext, auditSkip } from "./middleware";
import { log } from "../log";
import { asyncHandler } from "../middleware/errorHandler";
import { now } from "../clock";

// auditContext's fallback writes through the module-level `db` singleton
// (server/src/db/index.ts), so point it at our in-memory test DB before the
// module is imported. vi.mock's factory is hoisted above these imports by
// vitest, so the mocked module is already in place when ./middleware (which
// imports "../db") is loaded above.
let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

vi.mock("../db", () => ({
  get db() {
    return db;
  },
  get sqlite() {
    return sqlite;
  },
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(auditContext);

  app.post(
    "/api/audited",
    asyncHandler(async (_req, res) => {
      audit(db, { action: "dev.signups_wiped", bingoId: null, entity: { type: "bingo", id: null }, details: { deleted: 1 } });
      res.status(200).json({ ok: true });
    }),
  );

  app.post(
    "/api/unaudited",
    asyncHandler(async (_req, res) => {
      res.status(200).json({ ok: true });
    }),
  );

  app.post("/api/skipped", auditSkip("read-only analyze"), (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.post("/api/clock", (_req, res) => {
    res.status(200).json({ now: now().toISOString() });
  });

  app.get("/api/read-only", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.post("/api/failed", (_req, res) => {
    res.status(400).json({ error: "bad request" });
  });

  return app;
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
  warnSpy = vi.spyOn(log, "warn").mockImplementation(() => {});
});
afterEach(() => {
  sqlite.close();
  warnSpy.mockRestore();
});

async function post(server: import("http").Server, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const port = (server.address() as { port: number }).port;
  return fetch(`http://localhost:${port}${path}`, {
    method: path.includes("read-only") ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("audit fallback middleware", () => {
  it("does not double-record a mutation the handler already audited", async () => {
    const app = buildApp();
    const server = app.listen(0);
    try {
      await post(server, "/api/audited");
      const rows = db.select().from(schema.auditLog).all();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.action).toBe("dev.signups_wiped");
    } finally {
      server.close();
    }
  });

  it("records an http.mutation row with a redacted body for an unaudited successful mutation", async () => {
    const app = buildApp();
    const server = app.listen(0);
    try {
      await post(server, "/api/unaudited", { womGroupVerificationCode: "topsecret", name: "ok" });
      const rows = db.select().from(schema.auditLog).all();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.action).toBe("http.mutation");
      const details = JSON.parse(rows[0]!.details);
      expect(details.body.womGroupVerificationCode).toBe("[redacted]");
      expect(details.body.name).toBe("ok");
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      server.close();
    }
  });

  it("does not fire for a GET request", async () => {
    const app = buildApp();
    const server = app.listen(0);
    try {
      await post(server, "/api/read-only");
      expect(db.select().from(schema.auditLog).all()).toHaveLength(0);
    } finally {
      server.close();
    }
  });

  it("does not fire for a failed (4xx) mutation", async () => {
    const app = buildApp();
    const server = app.listen(0);
    try {
      await post(server, "/api/failed");
      expect(db.select().from(schema.auditLog).all()).toHaveLength(0);
    } finally {
      server.close();
    }
  });

  it("does not fire for a route marked auditSkip", async () => {
    const app = buildApp();
    const server = app.listen(0);
    try {
      await post(server, "/api/skipped");
      expect(db.select().from(schema.auditLog).all()).toHaveLength(0);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
  });

  it("populates routePath in the fallback details once Express has matched the route", async () => {
    const app = buildApp();
    const server = app.listen(0);
    try {
      await post(server, "/api/unaudited");
      const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "http.mutation")).get()!;
      const details = JSON.parse(row.details);
      expect(details.routePath).toBe("/api/unaudited");
    } finally {
      server.close();
    }
  });
});

describe("X-Dev-Now (dev-only request clock)", () => {
  const AT = "2026-01-05T10:00:00.000Z";
  const saved = { NODE_ENV: process.env.NODE_ENV, DEV_LOGIN_ENABLED: process.env.DEV_LOGIN_ENABLED };
  afterEach(() => {
    process.env.NODE_ENV = saved.NODE_ENV;
    if (saved.DEV_LOGIN_ENABLED === undefined) delete process.env.DEV_LOGIN_ENABLED;
    else process.env.DEV_LOGIN_ENABLED = saved.DEV_LOGIN_ENABLED;
  });

  it("in dev mode, sets the request's clock and the time of the rows it audits", async () => {
    process.env.DEV_LOGIN_ENABLED = "true";
    const server = buildApp().listen(0);
    try {
      const clock = (await (await post(server, "/api/clock", undefined, { "X-Dev-Now": AT })).json()) as { now: string };
      expect(clock.now).toBe(AT);

      await post(server, "/api/audited", undefined, { "X-Dev-Now": AT });
      expect(db.select().from(schema.auditLog).all()[0]!.createdAt.toISOString()).toBe(AT);

      // The http.mutation fallback runs after the response, outside the request's async context: it must still carry the time.
      await post(server, "/api/unaudited", undefined, { "X-Dev-Now": AT });
      const fallback = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "http.mutation")).get()!;
      expect(fallback.createdAt.toISOString()).toBe(AT);
    } finally {
      server.close();
    }
  });

  it("rejects a header that is not a date", async () => {
    process.env.DEV_LOGIN_ENABLED = "true";
    const server = buildApp().listen(0);
    try {
      const res = await post(server, "/api/clock", undefined, { "X-Dev-Now": "yesterday-ish" });
      expect(res.status).toBe(400);
    } finally {
      server.close();
    }
  });

  it("is ignored when dev mode is off, and in production even if the flag is set", async () => {
    const server = buildApp().listen(0);
    try {
      delete process.env.DEV_LOGIN_ENABLED;
      let clock = (await (await post(server, "/api/clock", undefined, { "X-Dev-Now": AT })).json()) as { now: string };
      expect(clock.now).not.toBe(AT);

      process.env.DEV_LOGIN_ENABLED = "true";
      process.env.NODE_ENV = "production";
      clock = (await (await post(server, "/api/clock", undefined, { "X-Dev-Now": AT })).json()) as { now: string };
      expect(clock.now).not.toBe(AT);

      const garbage = await post(server, "/api/clock", undefined, { "X-Dev-Now": "not a date" });
      expect(garbage.status).toBe(200); // outside dev mode the header is not even looked at
    } finally {
      server.close();
    }
  });
});
