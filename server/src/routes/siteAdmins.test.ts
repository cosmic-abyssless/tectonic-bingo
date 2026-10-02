// Owners and site admins (#413; CONTEXT.md "Owner"): the Site admins list every Admin sees, and granting and revoking
// site admin, which only Owners may do and never to an Owner. A real app over a real in-memory DB, with the logged-in
// user faked, hit over HTTP.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { eq } from "drizzle-orm";
import type { BroadcastEvent, SiteAdminsResponse } from "@bingo/shared";
import * as schema from "../db/schema";
import type { SessionUser } from "../types";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

const broadcast = vi.fn<(event: BroadcastEvent) => void>();
vi.mock("../ws", () => ({ broadcast: (event: BroadcastEvent) => broadcast(event) }));
vi.mock("../db", async () => {
  const { createTestDb } = await import("../testUtils/testDb");
  return { ...createTestDb(), DB_PATH: ":memory:", BUSY_TIMEOUT_MS: 0 };
});

let db: BetterSQLite3Database<typeof schema>;
let sqlite: Database.Database;
type Person = "owner" | "otherOwner" | "admin" | "zed" | "member";
let people: Record<Person, SessionUser>;
let actingAs: SessionUser | null = null;
let server: Server;
let base: string;
const envBefore = process.env.ADMIN_DISCORD_IDS;

beforeAll(async () => {
  ({ db, sqlite } = (await import("../db")) as unknown as { db: typeof db; sqlite: typeof sqlite });
  const { default: siteAdminRouter } = await import("./siteAdmin");
  const { default: meRouter } = await import("./me");
  const { auditContext } = await import("../audit/middleware");
  const { errorHandler } = await import("../middleware/errorHandler");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // Stands in for passport: the logged-in user is whoever the test is acting as, as deserializeUser loads them.
    (req as unknown as { user?: SessionUser }).user = actingAs ? db.select().from(schema.users).where(eq(schema.users.id, actingAs.id)).get() : undefined;
    req.isAuthenticated = (() => !!actingAs) as typeof req.isAuthenticated;
    next();
  });
  app.use(auditContext);
  app.use("/api/admin", siteAdminRouter);
  app.use("/api/me", meRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(() => {
  server.close();
});

function wipe() {
  sqlite.pragma("foreign_keys = OFF");
  for (const { name } of sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'").all() as { name: string }[]) {
    sqlite.prepare(`DELETE FROM "${name}"`).run();
  }
  sqlite.pragma("foreign_keys = ON");
}

function user(discordId: string, extra: Partial<SessionUser> = {}): SessionUser {
  return db.insert(schema.users).values({ discordId, discordUsername: discordId, ...extra }).returning().get();
}

async function call(as: Person, method: string, path: string, body?: unknown) {
  actingAs = people[as];
  const res = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as Record<string, unknown> };
}

const isAdmin = (who: Person) => db.select().from(schema.users).where(eq(schema.users.id, people[who].id)).get()!.isAdmin;

beforeEach(() => {
  wipe();
  broadcast.mockClear();
  // "never" is an Owner who has never signed in: no account yet.
  process.env.ADMIN_DISCORD_IDS = "owner-id,never-id,other-owner-id";
  people = {
    owner: user("owner-id", { isAdmin: true, discordGlobalName: "Olive" }),
    otherOwner: user("other-owner-id", { isAdmin: true, discordGlobalName: "Oscar" }),
    zed: user("zed-id", { isAdmin: true, discordGlobalName: "zed" }),
    admin: user("admin-id", { isAdmin: true, discordGlobalName: "Amy" }),
    member: user("member-id", { discordGlobalName: "Mo" }),
  };
});

afterEach(() => {
  process.env.ADMIN_DISCORD_IDS = envBefore;
});

describe("GET /api/admin/site-admins", () => {
  it("lists the Owners in ADMIN_DISCORD_IDS order, one who never signed in included, then the other site admins by name", async () => {
    for (const as of ["owner", "admin"] as const) {
      const { status, body } = await call(as, "GET", "/admin/site-admins");
      expect(status).toBe(200);
      const list = body as unknown as SiteAdminsResponse;
      expect(list.owners.map((o) => [o.discordId, o.user?.id ?? null])).toEqual([
        ["owner-id", people.owner.id],
        ["never-id", null],
        ["other-owner-id", people.otherOwner.id],
      ]);
      expect(list.admins.map((u) => u.id)).toEqual([people.admin.id, people.zed.id]);
    }
  });

  it("is for site admins only", async () => {
    expect((await call("member", "GET", "/admin/site-admins")).status).toBe(403);
  });

  it("lists someone taken off ADMIN_DISCORD_IDS as a plain site admin, with no data change", async () => {
    process.env.ADMIN_DISCORD_IDS = "owner-id";
    const list = (await call("admin", "GET", "/admin/site-admins")).body as unknown as SiteAdminsResponse;
    expect(list.owners.map((o) => o.discordId)).toEqual(["owner-id"]);
    expect(list.admins.map((u) => u.id)).toEqual([people.admin.id, people.otherOwner.id, people.zed.id]);
    // And an Owner can revoke them now.
    expect((await call("owner", "PATCH", `/admin/users/${people.otherOwner.id}`, { isAdmin: false })).status).toBe(200);
    expect(isAdmin("otherOwner")).toBe(false);
  });
});

describe("PATCH /api/admin/users/:id", () => {
  it("lets an Owner revoke a site admin: audited, their Claude connections ended, everyone told", async () => {
    const { status } = await call("owner", "PATCH", `/admin/users/${people.admin.id}`, { isAdmin: false });
    expect(status).toBe(200);
    expect(isAdmin("admin")).toBe(false);
    const entries = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "user.admin_changed")).all();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.actorUserId).toBe(people.owner.id);
    expect(broadcast).toHaveBeenCalledWith({ type: "access_changed", bingoId: null, payload: { userIds: [people.admin.id] } });
  });

  it("lets an Owner grant site admin", async () => {
    expect((await call("owner", "PATCH", `/admin/users/${people.member.id}`, { isAdmin: true })).status).toBe(200);
    expect(isAdmin("member")).toBe(true);
  });

  it("refuses revoking an Owner, another Owner or themselves", async () => {
    for (const target of ["otherOwner", "owner"] as const) {
      const { status, body } = await call("owner", "PATCH", `/admin/users/${people[target].id}`, { isAdmin: false });
      expect(status, target).toBe(403);
      expect(body.error).toMatch(/Remove them from ADMIN_DISCORD_IDS first/);
      expect(isAdmin(target)).toBe(true);
    }
  });

  it("refuses granting or revoking from a site admin who isn't an Owner", async () => {
    expect((await call("admin", "PATCH", `/admin/users/${people.zed.id}`, { isAdmin: false })).status).toBe(403);
    expect((await call("admin", "PATCH", `/admin/users/${people.member.id}`, { isAdmin: true })).status).toBe(403);
    expect(isAdmin("zed")).toBe(true);
    expect(isAdmin("member")).toBe(false);
  });
});

describe("Owner-only Claude connections", () => {
  it("shows everyone's connections to Owners only", async () => {
    expect((await call("owner", "GET", "/admin/mcp-connections")).status).toBe(200);
    expect((await call("admin", "GET", "/admin/mcp-connections")).status).toBe(403);
  });
});

describe("GET /api/me isOwner", () => {
  it("says whether the viewer is an Owner", async () => {
    expect((await call("owner", "GET", "/me")).body.isOwner).toBe(true);
    expect((await call("admin", "GET", "/me")).body.isOwner).toBe(false);
    expect((await call("member", "GET", "/me")).body.isOwner).toBe(false);
  });
});
