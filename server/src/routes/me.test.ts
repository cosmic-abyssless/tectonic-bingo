// The Tutorial's "seen" (CONTEXT.md "Tutorial"): recorded per account on the server, so finishing or skipping it on one
// device keeps it from starting on any other, and it comes back with the viewer's own record on /api/me.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import type { MeResponse } from "@bingo/shared";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";

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

let viewerId: string | null;
let server: Server;

async function call(method: "GET" | "POST", path: string) {
  const port = (server.address() as { port: number }).port;
  return fetch(`http://localhost:${port}${path}`, { method });
}

beforeEach(async () => {
  ({ sqlite, db } = createTestDb());
  const { eq } = await import("drizzle-orm");
  const { default: meRouter } = await import("./me");
  const { auditContext } = await import("../audit/middleware");
  const app = express();
  // Stands in for passport: the session user is the full row, as deserializeUser loads it.
  app.use((req, _res, next) => {
    req.user = viewerId ? db.select().from(schema.users).where(eq(schema.users.id, viewerId)).get() : undefined;
    req.isAuthenticated = (() => !!req.user) as typeof req.isAuthenticated;
    next();
  });
  app.use(auditContext);
  app.use("/api/me", meRouter);
  server = app.listen(0);
});
afterEach(() => {
  server.close();
  sqlite.close();
});

const player = () => db.insert(schema.users).values({ discordId: "p-id", discordUsername: "p" }).returning().get();

describe("POST /api/me/tutorial-seen", () => {
  it("records that the account has seen the Tutorial, and /api/me says so from then on", async () => {
    viewerId = player().id;
    const before = (await (await call("GET", "/api/me")).json()) as MeResponse;
    expect(before.user.tutorialSeenAt).toBeNull();

    const res = await call("POST", "/api/me/tutorial-seen");
    expect(res.status).toBe(200);
    const { user } = (await res.json()) as MeResponse;
    expect(user.id).toBe(viewerId);
    expect(user.tutorialSeenAt).not.toBeNull();

    const after = (await (await call("GET", "/api/me")).json()) as MeResponse;
    expect(after.user.tutorialSeenAt).toBe(user.tutorialSeenAt);
  });

  it("keeps the first time: seeing it again changes nothing", async () => {
    viewerId = player().id;
    const first = new Date("2026-09-01T12:00:00Z");
    db.update(schema.users).set({ tutorialSeenAt: first }).run();
    const { user } = (await (await call("POST", "/api/me/tutorial-seen")).json()) as MeResponse;
    expect(new Date(user.tutorialSeenAt!).getTime()).toBe(first.getTime());
  });

  it("is skipped by the audit log (nothing recorded, not even the unaudited-mutation fallback)", async () => {
    viewerId = player().id;
    await call("POST", "/api/me/tutorial-seen");
    expect(db.select().from(schema.auditLog).all()).toEqual([]);
  });

  it("needs a signed-in account", async () => {
    viewerId = null;
    expect((await call("POST", "/api/me/tutorial-seen")).status).toBe(401);
  });
});
