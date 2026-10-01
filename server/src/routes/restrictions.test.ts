// Restrictions (CONTEXT.md "Restriction"): who may apply and lift them, what they refuse, and that the restricted user
// is told why, both by the permissions response and by the endpoint's 403. Real routers over a real in-memory DB, with
// the logged-in user faked, hit over HTTP.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { eq } from "drizzle-orm";
import type { BingoPermissionsResponse, RosterEntry, Stage } from "@bingo/shared";
import * as schema from "../db/schema";
import type { SessionUser } from "../types";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

vi.mock("../ocr", () => ({
  isOcrEnabled: () => false,
  analyzeSubmissionScreenshot: vi.fn(),
}));
vi.mock("../ws", () => ({ broadcast: vi.fn() }));
vi.mock("../db", async () => {
  const { createTestDb } = await import("../testUtils/testDb");
  return { ...createTestDb(), DB_PATH: ":memory:", BUSY_TIMEOUT_MS: 0 };
});

let db: BetterSQLite3Database<typeof schema>;
let sqlite: Database.Database;
let broadcast: ReturnType<typeof vi.fn>;
let admin: SessionUser;
let mod: SessionUser;
let otherMod: SessionUser;
let captain: SessionUser;
let player: SessionUser;
let bingo: typeof schema.bingos.$inferSelect;
let team: typeof schema.teams.$inferSelect;
let actingAs: SessionUser | null = null;
let server: Server;
let base: string;

beforeAll(async () => {
  ({ db, sqlite } = (await import("../db")) as unknown as { db: typeof db; sqlite: typeof sqlite });
  broadcast = (await import("../ws")).broadcast as unknown as ReturnType<typeof vi.fn>;
  const { default: bingosRouter } = await import("./bingos");
  const { default: modRouter } = await import("./mod");
  const { default: buyinsRouter } = await import("./buyins");
  const { auditContext } = await import("../audit/middleware");
  const { errorHandler } = await import("../middleware/errorHandler");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // Stands in for passport: the logged-in user is whoever the test is acting as.
    (req as unknown as { user?: SessionUser }).user = actingAs ?? undefined;
    req.isAuthenticated = (() => !!actingAs) as typeof req.isAuthenticated;
    next();
  });
  app.use(auditContext);
  app.use("/api/bingos/:slug/mod", modRouter);
  app.use("/api/bingos/:slug/buyins", buyinsRouter);
  app.use("/api/bingos", bingosRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/bingos/b1`;
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

function setStage(stage: Stage) {
  db.update(schema.bingos).set({ stage }).where(eq(schema.bingos.id, bingo.id)).run();
}

async function call<T = { error?: string }>(as: SessionUser, method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  actingAs = as;
  const res = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (res.status === 204 ? undefined : await res.json()) as T };
}

const restrict = (as: SessionUser, userId: string, action: string, reason = "Spamming the team chat") =>
  call<{ restriction?: { id: string }; error?: string }>(as, "POST", "/mod/restrictions", { userId, action, reason });

function auditRows(action: string) {
  return db.select().from(schema.auditLog).where(eq(schema.auditLog.action, action)).all();
}

beforeEach(() => {
  wipe();
  broadcast.mockClear();
  const user = (name: string, isAdmin = false) => db.insert(schema.users).values({ discordId: name, discordUsername: name, isAdmin }).returning().get();
  admin = user("admin", true);
  mod = user("mod");
  otherMod = user("othermod");
  captain = user("captain");
  player = user("player");
  bingo = db.insert(schema.bingos).values({ slug: "b1", name: "B1", boardRows: 5, boardCols: 5, createdByUserId: admin.id, stage: "reveal" }).returning().get();
  for (const m of [mod, otherMod]) db.insert(schema.bingoModerators).values({ bingoId: bingo.id, userId: m.id }).run();
  for (const p of [captain, player]) db.insert(schema.signups).values({ bingoId: bingo.id, userId: p.id, rsn: p.discordUsername }).run();
  team = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: captain.id, name: "Team A", codeword: "alpha" }).returning().get();
  db.insert(schema.teamMembers).values({ teamId: team.id, userId: captain.id, isCaptain: true }).run();
  db.insert(schema.teamMembers).values({ teamId: team.id, userId: player.id }).run();
});

describe("a Restriction", () => {
  it("takes the Action from the user, who sees why, until it's lifted", async () => {
    const applied = await restrict(mod, captain.id, "rename_team", "Offensive team names.");
    expect(applied.status).toBe(201);
    // The restricted user's client is told to refetch its Actions.
    expect(broadcast).toHaveBeenCalledWith({ type: "access_changed", bingoId: bingo.id, payload: { userIds: [captain.id] } });

    const permissions = await call<BingoPermissionsResponse>(captain, "GET", "/permissions");
    expect(permissions.body.allowed).not.toContain("rename_team");
    expect(permissions.body.reasons.rename_team).toBe("Restricted: Offensive team names");
    expect(await call(captain, "PATCH", `/teams/${team.id}`, { name: "Renamed" })).toEqual({ status: 403, body: { error: "Restricted: Offensive team names" } });

    expect((await call(mod, "DELETE", `/mod/restrictions/${applied.body.restriction!.id}`)).status).toBe(204);
    expect((await call<BingoPermissionsResponse>(captain, "GET", "/permissions")).body.allowed).toContain("rename_team");
    expect((await call(captain, "PATCH", `/teams/${team.id}`, { name: "Renamed" })).status).toBe(200);
  });

  it("is audited, applied and lifted, with who did it and the reason", async () => {
    const applied = await restrict(mod, player.id, "react", "Reaction spam");
    await call(admin, "DELETE", `/mod/restrictions/${applied.body.restriction!.id}`);
    const [appliedRow] = auditRows("restriction.applied");
    expect(appliedRow).toMatchObject({ actorUserId: mod.id, actorRole: "mod", entityId: player.id, visibility: "mods" });
    expect(JSON.parse(appliedRow!.details)).toMatchObject({ userId: player.id, action: "react", reason: "Reaction spam" });
    const [liftedRow] = auditRows("restriction.lifted");
    expect(liftedRow).toMatchObject({ actorUserId: admin.id, actorRole: "admin", entityId: player.id });
    expect(JSON.parse(liftedRow!.details)).toMatchObject({ action: "react", reason: "Reaction spam" });
  });

  it("with a wildcard takes every Action it covers", async () => {
    setStage("live");
    await restrict(mod, player.id, "submit*", "Posting other people's drops");
    const { body } = await call<BingoPermissionsResponse>(player, "GET", "/permissions");
    expect(body.reasons.submit).toBe("Restricted: Posting other people's drops");
    expect(body.allowed).toContain("react");
    expect(await call(player, "POST", "/submissions", {})).toEqual({ status: 403, body: { error: "Restricted: Posting other people's drops" } });
    // The screenshot analysis is part of submitting.
    expect((await call(player, "POST", "/submissions/analyze", {})).status).toBe(403);
  });

  it("refuses a reaction", async () => {
    setStage("live");
    const submission = db
      .insert(schema.submissions)
      .values({ teamId: team.id, submittedByUserId: captain.id })
      .returning()
      .get();
    await restrict(mod, player.id, "react", "Reaction spam");
    expect(await call(player, "PUT", `/submissions/${submission.id}/reactions`, { emoji: "🔥", reacted: true })).toEqual({ status: 403, body: { error: "Restricted: Reaction spam" } });
    expect((await call(captain, "PUT", `/submissions/${submission.id}/reactions`, { emoji: "🔥", reacted: true })).status).toBe(200);
  });

  it("shows on the user's roster row, for the Moderators and Admins", async () => {
    await restrict(mod, player.id, "react", "Reaction spam");
    const { body } = await call<{ signups: RosterEntry[] }>(admin, "GET", "/mod/signups");
    const row = body.signups.find((s) => s.user.id === player.id)!;
    expect(row.restrictions).toEqual([expect.objectContaining({ action: "react", reason: "Reaction spam", appliedByLabel: expect.any(String) })]);
    expect(body.signups.find((s) => s.user.id === captain.id)!.restrictions).toEqual([]);
    // Each row says whether the viewer may restrict them: a Moderator who plays only for an Admin.
    db.insert(schema.signups).values({ bingoId: bingo.id, userId: otherMod.id, rsn: "othermod" }).run();
    const restrictable = async (as: SessionUser) =>
      Object.fromEntries((await call<{ signups: RosterEntry[] }>(as, "GET", "/mod/signups")).body.signups.map((s) => [s.user.discordUsername, s.restrictable]));
    expect(await restrictable(admin)).toEqual({ captain: true, player: true, othermod: true });
    expect(await restrictable(mod)).toEqual({ captain: true, player: true, othermod: false });
    // Not for anyone else.
    expect((await call(captain, "GET", "/mod/signups")).status).toBe(403);
  });
});

describe("applying a Restriction", () => {
  it("is refused for what a user sees, a Captain's Draft pick, or anything else not restrictable", async () => {
    for (const action of ["view_bingo", "view_*", "make_draft_pick", "moderate_bingo", "nonsense"]) {
      const { status } = await restrict(admin, captain.id, action);
      expect(status, action).toBe(400);
    }
    expect(auditRows("restriction.applied")).toHaveLength(0);
  });

  it("needs a reason", async () => {
    expect(await restrict(mod, player.id, "react", "   ")).toEqual({ status: 400, body: { error: "A Restriction needs a reason" } });
  });

  it("is refused on an Admin, by anyone", async () => {
    expect(await restrict(admin, admin.id, "submit")).toEqual({ status: 403, body: { error: "Admins can't be restricted" } });
    expect((await restrict(mod, admin.id, "submit")).status).toBe(403);
  });

  it("by a Moderator is refused on a Moderator, and allowed on Captains and Players", async () => {
    expect(await restrict(mod, otherMod.id, "submit_for_any_team")).toEqual({ status: 403, body: { error: "Moderators can only restrict Captains and Players" } });
    // A Moderator who also plays is still a Moderator.
    db.insert(schema.teamMembers).values({ teamId: team.id, userId: otherMod.id }).run();
    expect((await restrict(mod, otherMod.id, "react")).status).toBe(403);
    expect((await restrict(mod, captain.id, "rate_picks")).status).toBe(201);
    expect((await restrict(mod, player.id, "submit")).status).toBe(201);
  });

  it("by a Moderator is refused on Staff; an Admin's takes their Buy-in marking", async () => {
    const staff = db.insert(schema.users).values({ discordId: "staff", discordUsername: "staff" }).returning().get();
    db.insert(schema.bingoStaff).values({ bingoId: bingo.id, userId: staff.id }).run();
    const signup = db.select().from(schema.signups).where(eq(schema.signups.userId, player.id)).get()!;
    expect((await restrict(mod, staff.id, "mark_buyins")).status).toBe(403);
    expect((await call(staff, "PATCH", `/buyins/${signup.id}`, { received: true })).status).toBe(204);
    expect((await restrict(admin, staff.id, "mark_buyins", "Marked Buy-ins nobody paid")).status).toBe(201);
    expect(await call(staff, "PATCH", `/buyins/${signup.id}`, { received: false })).toEqual({ status: 403, body: { error: "Restricted: Marked Buy-ins nobody paid" } });
    // They still see the page.
    expect((await call(staff, "GET", "/buyins")).status).toBe(200);
  });

  it("by an Admin on a Moderator's Buy-in marking holds in the mod panel too", async () => {
    const signup = db.select().from(schema.signups).where(eq(schema.signups.userId, player.id)).get()!;
    await restrict(admin, otherMod.id, "mark_buyins", "Marked Buy-ins nobody paid");
    expect(await call(otherMod, "PATCH", `/mod/signups/${signup.id}/buyin`, { received: true })).toEqual({ status: 403, body: { error: "Restricted: Marked Buy-ins nobody paid" } });
    expect((await call(mod, "PATCH", `/mod/signups/${signup.id}/buyin`, { received: true })).status).toBe(200);
  });

  it("by an Admin is allowed on a Moderator", async () => {
    expect((await restrict(admin, otherMod.id, "submit_for_any_team")).status).toBe(201);
  });

  it("is refused for someone not part of the Bingo, and twice for the same thing", async () => {
    const outsider = db.insert(schema.users).values({ discordId: "outsider", discordUsername: "outsider" }).returning().get();
    expect((await restrict(admin, outsider.id, "submit")).status).toBe(400);
    expect((await restrict(mod, player.id, "react")).status).toBe(201);
    expect((await restrict(mod, player.id, "react")).status).toBe(409);
  });

  it("isn't for Captains or Players", async () => {
    expect((await restrict(captain, player.id, "react")).status).toBe(403);
  });
});

describe("lifting a Restriction", () => {
  it("by a Moderator is refused on one an Admin put on a Moderator", async () => {
    const { body } = await restrict(admin, otherMod.id, "submit_for_any_team");
    expect((await call(mod, "DELETE", `/mod/restrictions/${body.restriction!.id}`)).status).toBe(403);
    expect((await call(admin, "DELETE", `/mod/restrictions/${body.restriction!.id}`)).status).toBe(204);
    expect((await call(admin, "DELETE", `/mod/restrictions/${body.restriction!.id}`)).status).toBe(404);
  });
});
