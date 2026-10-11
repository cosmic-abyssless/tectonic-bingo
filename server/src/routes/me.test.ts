// The Tutorial's "seen" (CONTEXT.md "Tutorial"): recorded per account on the server, so finishing or skipping it on one
// device keeps it from starting on any other, and it comes back with the viewer's own record on /api/me.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import type { MeResponse, NotificationInboxResponse } from "@bingo/shared";
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

async function call(method: "GET" | "POST" | "DELETE", path: string, body?: unknown) {
  const port = (server.address() as { port: number }).port;
  return fetch(`http://localhost:${port}${path}`, body === undefined ? { method } : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(async () => {
  ({ sqlite, db } = createTestDb());
  const { eq } = await import("drizzle-orm");
  const { default: meRouter } = await import("./me");
  const { auditContext } = await import("../audit/middleware");
  const app = express();
  app.use(express.json());
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

describe("POST /api/me/notifications/discord-test", () => {
  const sentTo: string[] = [];
  beforeEach(async () => {
    sentTo.length = 0;
    const { setDiscordDmApiForTests } = await import("../services/notificationDm");
    setDiscordDmApiForTests({ send: async (discordId) => void sentTo.push(discordId) });
  });
  afterEach(async () => {
    const { setDiscordDmApiForTests } = await import("../services/notificationDm");
    setDiscordDmApiForTests(undefined);
  });

  it("is a Site admin's, to check that DMs go out at all", async () => {
    viewerId = db.insert(schema.users).values({ discordId: "a-id", discordUsername: "a", isAdmin: true }).returning().get().id;
    const res = await call("POST", "/api/me/notifications/discord-test");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
    expect(sentTo).toEqual(["a-id"]);
  });

  it("is refused to anyone else Discord hasn't refused, and is their Try again once it has", async () => {
    const p = player();
    viewerId = p.id;
    expect((await call("POST", "/api/me/notifications/discord-test")).status).toBe(403);
    expect(sentTo).toEqual([]);

    const { setDiscordUnreachable, updateSettings } = await import("../services/notificationService");
    updateSettings(db, p.id, { level: "discord" });
    setDiscordUnreachable(db, p.id, new Date());
    expect((await call("POST", "/api/me/notifications/discord-test")).status).toBe(200);
    expect(sentTo).toEqual(["p-id"]);
  });
});

describe("the Inbox: the Mod panel's queue seen, and Clear", () => {
  it("marks only that Bingo's queue Notifications read, then Clear empties the Inbox, with nothing audited", async () => {
    const p = player();
    viewerId = p.id;
    const { updateSettings } = await import("../services/notificationService");
    updateSettings(db, p.id, { level: "app" });
    const at = new Date();
    db.insert(schema.notifications)
      .values([
        { userId: p.id, bingoId: "b1", kind: "submissions_waiting", title: "Submission waiting", createdAt: at },
        { userId: p.id, bingoId: "b2", kind: "submissions_waiting", title: "Submission waiting", createdAt: at },
        { userId: p.id, bingoId: "b1", kind: "drop_rejected", title: "Your drop was rejected", createdAt: at },
      ])
      .run();

    expect((await call("POST", "/api/me/notifications/read-mod-queue", {})).status).toBe(400);
    const seen = (await (await call("POST", "/api/me/notifications/read-mod-queue", { bingoId: "b1" })).json()) as NotificationInboxResponse;
    expect(seen.unread).toBe(2);
    expect(seen.notifications.filter((n) => n.readAt).map((n) => [n.bingoId, n.kind])).toEqual([["b1", "submissions_waiting"]]);

    const cleared = (await (await call("DELETE", "/api/me/notifications")).json()) as NotificationInboxResponse;
    expect(cleared).toEqual({ notifications: [], unread: 0 });
    expect(db.select().from(schema.auditLog).all()).toEqual([]);
  });
});
