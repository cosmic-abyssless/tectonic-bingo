// Staff (CONTEXT.md "Staff"): granted per Bingo by Admins, they read and mark Buy-ins on the Buy-ins page
// (routes/buyins.ts) while Buy-ins are collected, and get nothing else of the Bingo. A real app over a real in-memory DB,
// with the logged-in user faked, hit over HTTP.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { eq } from "drizzle-orm";
import type { BingoPermissionsResponse, BroadcastEvent, BuyinsResponse, Stage } from "@bingo/shared";
import * as schema from "../db/schema";
import type { SessionUser } from "../types";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

vi.mock("../ocr", () => ({
  isOcrEnabled: () => false,
  analyzeSubmissionScreenshot: vi.fn(),
}));
const broadcast = vi.fn<(event: BroadcastEvent) => void>();
vi.mock("../ws", () => ({ broadcast: (event: BroadcastEvent) => broadcast(event) }));
vi.mock("../services/womCompetitionService", () => ({ syncWomCompetition: vi.fn(async () => {}), syncWomCompetitionAfterDraft: vi.fn(async () => {}), checkWomGroup: vi.fn() }));
vi.mock("../db", async () => {
  const { createTestDb } = await import("../testUtils/testDb");
  return { ...createTestDb(), DB_PATH: ":memory:", BUSY_TIMEOUT_MS: 0 };
});

let db: BetterSQLite3Database<typeof schema>;
let sqlite: Database.Database;
type Person = "admin" | "mod" | "staff" | "playingStaff" | "player";
let people: Record<Person, SessionUser>;
let bingo: typeof schema.bingos.$inferSelect;
let signupId: string;
let actingAs: SessionUser | null = null;
let server: Server;
let base: string;

beforeAll(async () => {
  ({ db, sqlite } = (await import("../db")) as unknown as { db: typeof db; sqlite: typeof sqlite });
  const { default: bingosRouter } = await import("./bingos");
  const { default: modRouter } = await import("./mod");
  const { default: buyinsRouter } = await import("./buyins");
  const { default: adminRouter } = await import("./admin");
  const { broadcastAccessChanges } = await import("../middleware/broadcastAccessChanges");
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
  // Mounted as index.ts mounts them.
  app.use("/api/bingos/:slug", broadcastAccessChanges);
  app.use("/api/bingos", bingosRouter);
  app.use("/api/bingos/:slug/mod", modRouter);
  app.use("/api/bingos/:slug/buyins", buyinsRouter);
  app.use("/api/bingos/:slug/admin", adminRouter);
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

function setStage(stage: Stage) {
  db.update(schema.bingos).set({ stage }).where(eq(schema.bingos.id, bingo.id)).run();
}

async function call(as: Person, method: string, path: string, body?: unknown) {
  actingAs = people[as];
  const res = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as Record<string, unknown> };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(() => {
  wipe();
  broadcast.mockClear();
  people = {
    admin: user("admin", { isAdmin: true }),
    mod: user("mod"),
    staff: user("staff"),
    playingStaff: user("playingStaff"),
    player: user("player"),
  };
  bingo = db.insert(schema.bingos).values({ slug: "b1", name: "B1", boardRows: 5, boardCols: 5, createdByUserId: people.admin.id, stage: "signup", buyinAmount: 5_000_000 }).returning().get();
  db.insert(schema.bingoModerators).values({ bingoId: bingo.id, userId: people.mod.id }).run();
  db.insert(schema.bingoStaff).values([{ bingoId: bingo.id, userId: people.staff.id }, { bingoId: bingo.id, userId: people.playingStaff.id }]).run();
  signupId = db.insert(schema.signups).values({ bingoId: bingo.id, userId: people.player.id, rsn: "PlayerRsn" }).returning().get().id;
  db.insert(schema.signups).values({ bingoId: bingo.id, userId: people.playingStaff.id, rsn: "StaffRsn" }).run();
  const question = db.insert(schema.signupQuestions).values({ bingoId: bingo.id, prompt: "Favourite boss?", type: "text" }).returning().get();
  db.insert(schema.signupAnswers).values({ signupId, questionId: question.id, value: "Vorkath" }).run();
});

describe("Staff, alone", () => {
  it("get the Buy-ins page with each signup's RSN, Discord name and Buy-in, and nothing else of it", async () => {
    const { status, body } = await call("staff", "GET", "/bingos/b1/buyins");
    expect(status).toBe(200);
    const { buyins, collectors } = body as unknown as BuyinsResponse;
    expect(buyins.map((b) => b.user.rsn).sort()).toEqual(["PlayerRsn", "StaffRsn"]);
    expect(Object.keys(buyins[0]!).sort()).toEqual(["collectedBy", "receivedAt", "recordedBy", "signupId", "user"]);
    const text = JSON.stringify(body);
    expect(text).not.toContain("Vorkath");
    expect(text).not.toMatch(/answers|caCurrent|womStats|rating/i);
    expect(collectors.map((c) => c.id).sort()).toEqual([people.mod.id, people.staff.id, people.playingStaff.id].sort());
  });

  it("mark a Buy-in, recorded as Staff, and see who collected and recorded it", async () => {
    expect((await call("staff", "PATCH", `/bingos/b1/buyins/${signupId}`, { received: true, collectedByUserId: people.staff.id })).status).toBe(204);
    const { body } = await call("staff", "GET", "/bingos/b1/buyins");
    const entry = (body as unknown as BuyinsResponse).buyins.find((b) => b.signupId === signupId)!;
    expect(entry.receivedAt).not.toBeNull();
    expect(entry.collectedBy?.id).toBe(people.staff.id);
    expect(entry.recordedBy?.id).toBe(people.staff.id);
    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "signup.buyin_marked")).get()!;
    expect(row.actorRole).toBe("staff");
    expect(row.actorUserId).toBe(people.staff.id);
    // The Pot counts it, and Staff see the Pot with the Bingo's name and stage.
    const shell = await call("staff", "GET", "/bingos/b1");
    expect(shell.body).toMatchObject({ bingo: { name: "B1", stage: "signup" }, potTotal: 5_000_000, teams: [] });
  });

  it("work in every stage Buy-ins are collected in, and are refused in the others", async () => {
    for (const stage of ["signup", "captains", "draft", "reveal"] as const) {
      setStage(stage);
      expect((await call("staff", "GET", "/bingos/b1/buyins")).status, stage).toBe(200);
      expect((await call("staff", "PATCH", `/bingos/b1/buyins/${signupId}`, { received: true })).status, stage).toBe(204);
    }
    for (const stage of ["live", "complete"] as const) {
      setStage(stage);
      expect((await call("staff", "GET", "/bingos/b1/buyins")).status, stage).toBe(400);
      expect((await call("staff", "PATCH", `/bingos/b1/buyins/${signupId}`, { received: false })).status, stage).toBe(400);
    }
    setStage("planning");
    expect((await call("staff", "GET", "/bingos/b1/buyins")).status).toBe(404);
  });

  it("get no signup answers, Teams, audit log or mod panel", async () => {
    setStage("draft");
    expect((await call("staff", "GET", "/bingos/b1/mod/signups")).status).toBe(403);
    expect((await call("staff", "GET", "/bingos/b1/mod/audit-log")).status).toBe(403);
    expect((await call("staff", "PATCH", `/bingos/b1/mod/signups/${signupId}/buyin`, { received: true })).status).toBe(403);
    expect((await call("staff", "GET", "/bingos/b1/draft")).status).toBeGreaterThanOrEqual(403);
    expect((await call("staff", "GET", "/bingos/b1/board")).status).toBe(403);
    const shell = await call("staff", "GET", "/bingos/b1");
    expect(shell.body.teams).toEqual([]);
    expect(shell.body.viewer).toMatchObject({ canSee: false });
  });

  it("can't mark another Bingo's signup", async () => {
    const other = db.insert(schema.bingos).values({ slug: "b2", name: "B2", boardRows: 5, boardCols: 5, createdByUserId: people.admin.id, stage: "signup" }).returning().get();
    const elsewhere = db.insert(schema.signups).values({ bingoId: other.id, userId: people.mod.id, rsn: "Elsewhere" }).returning().get();
    expect((await call("staff", "PATCH", `/bingos/b1/buyins/${elsewhere.id}`, { received: true })).status).toBe(404);
  });
});

describe("Staff who also play", () => {
  it("see the Bingo as a Player as well, and keep their Buy-ins page", async () => {
    setStage("captains");
    const { body } = await call("playingStaff", "GET", "/bingos/b1/permissions");
    const permissions = body as unknown as BingoPermissionsResponse;
    expect(permissions.roles).toEqual(["staff", "player"]);
    expect(permissions.allowed).toEqual(expect.arrayContaining(["view_bingo", "view_buyins", "mark_buyins"]));
    expect(permissions.allowed).not.toContain("moderate_bingo");
    expect((await call("playingStaff", "GET", "/bingos/b1/buyins")).status).toBe(200);
    expect((await call("playingStaff", "GET", "/bingos/b1/mod/audit-log")).status).toBe(403);
  });
});

describe("Moderators and Admins", () => {
  it("keep their Buy-in powers, on the Buy-ins page too", async () => {
    expect((await call("mod", "GET", "/bingos/b1/buyins")).status).toBe(200);
    expect((await call("mod", "PATCH", `/bingos/b1/buyins/${signupId}`, { received: true })).status).toBe(204);
    expect((await call("mod", "PATCH", `/bingos/b1/mod/signups/${signupId}/buyin`, { received: true })).status).toBe(200);
    expect((await call("admin", "PATCH", `/bingos/b1/buyins/${signupId}`, { received: false })).status).toBe(204);
    const roles = db.select({ role: schema.auditLog.actorRole }).from(schema.auditLog).where(eq(schema.auditLog.action, "signup.buyin_marked")).all().map((r) => r.role);
    expect(roles).toEqual(["mod", "mod", "admin"]);
  });

  it("refuse the Buy-ins page to a Player", async () => {
    expect((await call("player", "GET", "/bingos/b1/buyins")).status).toBe(403);
    expect((await call("player", "PATCH", `/bingos/b1/buyins/${signupId}`, { received: true })).status).toBe(403);
  });
});

describe("granting Staff", () => {
  it("lets an Admin add and remove Staff, audited, and tells them with access_changed", async () => {
    const added = await call("admin", "POST", "/bingos/b1/admin/staff", { userId: people.player.id });
    expect(added.status).toBe(201);
    await settled();
    expect((await call("admin", "GET", "/bingos/b1/admin/staff")).body.staff).toHaveLength(3);
    expect((await call("player", "GET", "/bingos/b1/buyins")).status).toBe(200);

    broadcast.mockClear();
    expect((await call("admin", "DELETE", `/bingos/b1/admin/staff/${people.staff.id}`)).status).toBe(204);
    await settled();
    const changes = broadcast.mock.calls.map(([e]) => e).filter((e) => e.type === "access_changed");
    expect(changes).toEqual([{ type: "access_changed", bingoId: bingo.id, payload: { userIds: [people.staff.id] } }]);
    expect((await call("staff", "GET", "/bingos/b1/buyins")).status).toBe(403);

    const actions = db.select({ action: schema.auditLog.action, actorRole: schema.auditLog.actorRole }).from(schema.auditLog).all().filter((r) => r.action.startsWith("staff."));
    expect(actions).toEqual([
      { action: "staff.added", actorRole: "admin" },
      { action: "staff.removed", actorRole: "admin" },
    ]);
  });

  it("works out Staff's roles for everyone at once as bingoRoles does one user at a time", async () => {
    const { bingoRoles, bingoRolesOfEveryone } = await import("../services/permissions");
    for (const stage of ["planning", "signup", "captains", "draft", "reveal", "live", "complete"] as const) {
      setStage(stage);
      const fresh = db.select().from(schema.bingos).where(eq(schema.bingos.id, bingo.id)).get()!;
      const everyone = bingoRolesOfEveryone(db, fresh);
      for (const p of ["mod", "staff", "playingStaff", "player"] as const) {
        expect(everyone.get(people[p].id) ?? [], `${stage} ${p}`).toEqual(bingoRoles(db, fresh, people[p]));
      }
    }
  });

  it("is for Admins only", async () => {
    expect((await call("mod", "POST", "/bingos/b1/admin/staff", { userId: people.player.id })).status).toBe(403);
    expect((await call("staff", "POST", "/bingos/b1/admin/staff", { userId: people.player.id })).status).toBe(403);
  });
});
