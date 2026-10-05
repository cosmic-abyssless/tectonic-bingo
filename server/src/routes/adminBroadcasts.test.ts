// What an Admin write tells the open pages (docs/postmortems/2026-10-03-colour-picker.md): bingo_changed, which refetches
// the board and everything scored from it, only for the board and settings; anything less sends the narrow event that
// covers it. And a Captain's Pick Rating is told only to the leads who see it. Real routers over a real in-memory DB,
// with the logged-in user faked, hit over HTTP.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import type { BroadcastEvent } from "@bingo/shared";
import * as schema from "../db/schema";
import type { SessionUser } from "../types";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

vi.mock("../ocr", () => ({ isOcrEnabled: () => false, analyzeSubmissionScreenshot: vi.fn() }));
const broadcast = vi.fn<(event: BroadcastEvent, options?: { to?: readonly string[] }) => void>();
vi.mock("../ws", () => ({ broadcast: (event: BroadcastEvent, options?: { to?: readonly string[] }) => broadcast(event, options) }));
vi.mock("../services/womCompetitionService", () => ({ syncWomCompetition: vi.fn(async () => {}), checkWomGroup: vi.fn(async () => ({ ok: true })) }));
vi.mock("../services/discordTeamService", () => ({ syncDiscordTeams: vi.fn(async () => {}), removeDiscordTeams: vi.fn(), getDiscordSyncStatus: vi.fn() }));
import { syncWomCompetition } from "../services/womCompetitionService";
import { syncDiscordTeams } from "../services/discordTeamService";
vi.mock("../db", async () => {
  const { createTestDb } = await import("../testUtils/testDb");
  return { ...createTestDb(), DB_PATH: ":memory:", BUSY_TIMEOUT_MS: 0 };
});

let db: BetterSQLite3Database<typeof schema>;
let sqlite: Database.Database;
let admin: SessionUser;
let captain: SessionUser;
let coCaptain: SessionUser;
let player: SessionUser;
let bingo: typeof schema.bingos.$inferSelect;
let team: typeof schema.teams.$inferSelect;
let actingAs: SessionUser | null = null;
let server: Server;
let base: string;

beforeAll(async () => {
  ({ db, sqlite } = (await import("../db")) as unknown as { db: typeof db; sqlite: typeof sqlite });
  const { default: bingosRouter } = await import("./bingos");
  const { default: adminRouter } = await import("./admin");
  const { errorHandler } = await import("../middleware/errorHandler");
  const { auditContext } = await import("../audit/middleware");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // Stands in for passport: the logged-in user is whoever the test is acting as.
    (req as unknown as { user?: SessionUser }).user = actingAs ?? undefined;
    req.isAuthenticated = (() => !!actingAs) as typeof req.isAuthenticated;
    next();
  });
  app.use(auditContext);
  app.use("/api/bingos/:slug/admin", adminRouter);
  app.use("/api/bingos", bingosRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/bingos/b1`;
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  sqlite.pragma("foreign_keys = OFF");
  for (const { name } of sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'").all() as { name: string }[]) {
    sqlite.prepare(`DELETE FROM "${name}"`).run();
  }
  sqlite.pragma("foreign_keys = ON");
  const user = (name: string, isAdmin = false) => db.insert(schema.users).values({ discordId: name, discordUsername: name, isAdmin, inGuild: true }).returning().get() as SessionUser;
  admin = user("admin", true);
  captain = user("captain");
  coCaptain = user("cocaptain");
  player = user("player");
  bingo = db.insert(schema.bingos).values({ slug: "b1", name: "B1", boardRows: 5, boardCols: 5, createdByUserId: admin.id, stage: "draft" }).returning().get();
  for (const u of [captain, coCaptain, player]) db.insert(schema.signups).values({ bingoId: bingo.id, userId: u.id, rsn: u.discordUsername }).run();
  team = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: captain.id, name: "Team A", codeword: "alpha" }).returning().get();
  db.insert(schema.teamMembers).values({ teamId: team.id, userId: captain.id, isCaptain: true }).run();
  db.insert(schema.teamMembers).values({ teamId: team.id, userId: coCaptain.id, isCoCaptain: true }).run();
  broadcast.mockClear();
  vi.mocked(syncWomCompetition).mockClear();
  vi.mocked(syncDiscordTeams).mockClear();
});

async function call(as: SessionUser, method: string, path: string, body?: unknown) {
  actingAs = as;
  const res = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  // The router broadcasts once the response has finished.
  await new Promise((resolve) => setTimeout(resolve, 20));
  return res.status;
}

/** What was broadcast, leaving out the audit log's own events (every write that's audited sends one). */
const sent = () => broadcast.mock.calls.map(([event]) => event).filter((e) => e.type !== "audit_appended");
const bingoEvent = (type: string, payload: object = {}) => ({ type, bingoId: bingo.id, payload });

describe("an Admin write", () => {
  it("to the settings tells everyone the Bingo changed", async () => {
    expect(await call(admin, "PATCH", "/admin/settings", { description: "New" })).toBe(200);
    expect(sent()).toEqual([bingoEvent("bingo_changed")]);
  });

  it("to the board tells everyone the Bingo changed", async () => {
    expect(await call(admin, "POST", "/admin/categories", { label: "Raids" })).toBe(201);
    expect(sent()).toEqual([bingoEvent("bingo_changed")]);
  });

  it("to a Team (its colour) tells everyone only the Team changed", async () => {
    expect(await call(admin, "PATCH", `/admin/teams/${team.id}`, { color: "#123456" })).toBe(200);
    expect(sent()).toEqual([bingoEvent("team_updated", { teamId: team.id })]);
  });

  it("adding a member tells everyone only the Team changed", async () => {
    expect(await call(admin, "POST", `/admin/teams/${team.id}/members`, { userId: player.id })).toBe(201);
    expect(sent()).toEqual([bingoEvent("team_updated", { teamId: team.id })]);
  });

  it("to the Moderators tells everyone only they changed", async () => {
    expect(await call(admin, "POST", "/admin/mods", { userId: player.id })).toBe(201);
    expect(sent()).toEqual([bingoEvent("mods_changed")]);
  });

  it("to the questions or Superlative categories tells everyone only they changed", async () => {
    expect(await call(admin, "POST", "/admin/questions", { prompt: "Favourite boss?", type: "text" })).toBe(201);
    expect(await call(admin, "POST", "/admin/superlatives", { name: "MVP" })).toBe(201);
    expect(sent()).toEqual([bingoEvent("questions_changed"), bingoEvent("superlative_categories_changed")]);
  });

  it("that changes nothing writes no audit entry, tells nobody and starts no sync (#456)", async () => {
    expect(await call(admin, "PATCH", `/admin/teams/${team.id}`, { color: "#123456" })).toBe(200);
    broadcast.mockClear();
    vi.mocked(syncWomCompetition).mockClear();
    vi.mocked(syncDiscordTeams).mockClear();
    const audited = () => db.select().from(schema.auditLog).all().length;
    const entries = audited();

    expect(await call(admin, "PATCH", `/admin/teams/${team.id}`, { name: "Team A", color: "#123456", codeword: "alpha" })).toBe(200);
    expect(await call(admin, "PATCH", "/admin/settings", { name: "B1", description: bingo.description })).toBe(200);
    expect(broadcast).not.toHaveBeenCalled();
    expect(syncWomCompetition).not.toHaveBeenCalled();
    expect(syncDiscordTeams).not.toHaveBeenCalled();
    expect(audited()).toBe(entries);
  });

  it("to a Team's colour alone syncs Discord but not the WOM competition", async () => {
    expect(await call(admin, "PATCH", `/admin/teams/${team.id}`, { name: "Team A", color: "#654321" })).toBe(200);
    expect(syncDiscordTeams).toHaveBeenCalled();
    expect(syncWomCompetition).not.toHaveBeenCalled();
  });

  it("that's refused, or only reads, tells nobody anything", async () => {
    expect(await call(admin, "PATCH", "/admin/teams/nope", { color: "#123456" })).toBe(404);
    expect(await call(admin, "POST", "/admin/settings/wom-check", { groupId: "1", verificationCode: "x" })).toBe(200);
    expect(sent()).toEqual([]);
  });
});

describe("a Captain's Pick Rating", () => {
  it("is told only to the Team's leads, who are the only ones who see it", async () => {
    const signupId = db.select({ id: schema.signups.id }).from(schema.signups).all()[2]!.id;
    expect(await call(captain, "PUT", `/draft/ratings/${signupId}`, { stars: 2, note: "" })).toBe(200);
    const rated = broadcast.mock.calls.find(([event]) => event.type === "draft_rating_changed");
    expect(rated?.[0]).toEqual(bingoEvent("draft_rating_changed", { teamId: team.id }));
    expect([...(rated?.[1]?.to ?? [])].sort()).toEqual([captain.id, coCaptain.id].sort());
  });
});
