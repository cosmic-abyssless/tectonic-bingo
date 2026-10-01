// The viewer's resolved Actions (GET /api/bingos/:slug/permissions), and the access_changed broadcast that tells a
// client to ask again when a write changes someone's roles (middleware/broadcastAccessChanges.ts). A real app over a
// real in-memory DB, with the logged-in user faked, hit over HTTP.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { eq } from "drizzle-orm";
import type { BingoPermissionsResponse, BroadcastEvent, Stage } from "@bingo/shared";
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
vi.mock("../services/womCompetitionService", () => ({ syncWomCompetition: vi.fn(async () => {}), checkWomGroup: vi.fn() }));
vi.mock("../db", async () => {
  const { createTestDb } = await import("../testUtils/testDb");
  return { ...createTestDb(), DB_PATH: ":memory:", BUSY_TIMEOUT_MS: 0 };
});

let db: BetterSQLite3Database<typeof schema>;
let sqlite: Database.Database;
type Person = "admin" | "mod" | "captain" | "member" | "signedUp" | "stranger";
let people: Record<Person, SessionUser>;
let bingo: typeof schema.bingos.$inferSelect;
let team: typeof schema.teams.$inferSelect;
let actingAs: SessionUser | null = null;
let server: Server;
let base: string;

beforeAll(async () => {
  ({ db, sqlite } = (await import("../db")) as unknown as { db: typeof db; sqlite: typeof sqlite });
  const { default: bingosRouter } = await import("./bingos");
  const { default: adminRouter } = await import("./admin");
  const { default: siteAdminRouter } = await import("./siteAdmin");
  const { broadcastAccessChanges } = await import("../middleware/broadcastAccessChanges");
  const { errorHandler } = await import("../middleware/errorHandler");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // Stands in for passport: the logged-in user is whoever the test is acting as, as deserializeUser loads them.
    (req as unknown as { user?: SessionUser }).user = actingAs ? db.select().from(schema.users).where(eq(schema.users.id, actingAs.id)).get() : undefined;
    req.isAuthenticated = (() => !!actingAs) as typeof req.isAuthenticated;
    next();
  });
  // Mounted as index.ts mounts them.
  app.use("/api/admin", siteAdminRouter);
  app.use("/api/bingos/:slug", broadcastAccessChanges);
  app.use("/api/bingos", bingosRouter);
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

async function permissionsOf(as: Person): Promise<BingoPermissionsResponse> {
  const { status, body } = await call(as, "GET", "/bingos/b1/permissions");
  expect(status).toBe(200);
  return body as unknown as BingoPermissionsResponse;
}

/** The users each access_changed broadcast named, in order. */
function accessChanges(): { bingoId: string | null; userIds: string[] }[] {
  return broadcast.mock.calls
    .map(([event]) => event)
    .filter((event): event is Extract<BroadcastEvent, { type: "access_changed" }> => event.type === "access_changed")
    .map((event) => ({ bingoId: event.bingoId, userIds: [...event.payload.userIds].sort() }));
}

// The response is sent before the finish handler that broadcasts runs: give it a turn.
const settled = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(() => {
  wipe();
  broadcast.mockClear();
  people = {
    admin: user("admin", { isAdmin: true }),
    mod: user("mod"),
    captain: user("captain"),
    member: user("member"),
    signedUp: user("signedUp"),
    stranger: user("stranger"),
  };
  bingo = db.insert(schema.bingos).values({ slug: "b1", name: "B1", boardRows: 5, boardCols: 5, createdByUserId: people.admin.id, stage: "live" }).returning().get();
  db.insert(schema.bingoModerators).values({ bingoId: bingo.id, userId: people.mod.id }).run();
  for (const p of ["captain", "member", "signedUp"] as const) db.insert(schema.signups).values({ bingoId: bingo.id, userId: people[p].id, rsn: p }).run();
  team = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: people.captain.id, name: "Team A", codeword: "alpha" }).returning().get();
  db.insert(schema.teamMembers)
    .values([
      { teamId: team.id, userId: people.captain.id, isCaptain: true },
      { teamId: team.id, userId: people.member.id },
    ])
    .run();
});

describe("GET /api/bingos/:slug/permissions", () => {
  it("gives a Captain their Actions, with why the ones closed in this stage are closed", async () => {
    const live = await permissionsOf("captain");
    expect(live.roles).toEqual(["captain", "player"]);
    expect(live.allowed).toContain("view_bingo");
    expect(live.allowed).toContain("view_team_stats");
    expect(live.allowed).not.toContain("rename_team");
    expect(live.reasons.rename_team).toBe("Team names are locked once the Bingo is Live");
    expect(live.reasons.rate_picks).toBe("Ratings are locked once the bingo is live");
    expect(live.reasons.make_draft_pick).toBe("Picks can only be made during the draft stage");
    // Nothing a Captain's roles don't grant: that's not shown at all.
    expect(live.reasons.moderate_bingo).toBeUndefined();
    expect(live.allowed).not.toContain("moderate_bingo");

    setStage("reveal");
    const reveal = await permissionsOf("captain");
    expect(reveal.allowed).toContain("rename_team");
    expect(reveal.reasons.rename_team).toBeUndefined();
  });

  it("gives a Moderator the mod panel, and an Admin everything but what a rule closes", async () => {
    const mod = await permissionsOf("mod");
    expect(mod.roles).toEqual(["moderator"]);
    expect(mod.allowed).toContain("moderate_bingo");
    expect(mod.allowed).not.toContain("administer_bingo");

    const admin = await permissionsOf("admin");
    expect(admin.roles).toEqual(["admin"]);
    expect(admin.allowed).toContain("administer_bingo");
    expect(admin.allowed).not.toContain("run_draft");
    expect(admin.reasons.run_draft).toBe("Picks can only be undone during the draft stage");
  });

  it("answers someone who isn't part of the bingo with nothing, rather than refusing", async () => {
    expect(await permissionsOf("stranger")).toEqual({ roles: [], allowed: [], reasons: {} });
  });

  it("refuses with the same words the client shows", async () => {
    const { status, body } = await call("captain", "PUT", "/bingos/b1/draft/ratings/whatever", { stars: 3 });
    expect(status).toBe(400);
    expect(body.error).toBe((await permissionsOf("captain")).reasons.rate_picks);
  });
});

describe("access_changed", () => {
  it("names a Moderator added, and again when removed", async () => {
    expect((await call("admin", "POST", "/bingos/b1/admin/mods", { userId: people.stranger.id })).status).toBe(201);
    await settled();
    expect(accessChanges()).toEqual([{ bingoId: bingo.id, userIds: [people.stranger.id] }]);

    broadcast.mockClear();
    expect((await call("admin", "DELETE", `/bingos/b1/admin/mods/${people.mod.id}`)).status).toBe(204);
    await settled();
    expect(accessChanges()).toEqual([{ bingoId: bingo.id, userIds: [people.mod.id] }]);
  });

  it("names the Captain and their replacement when a Captain is removed from their Team", async () => {
    const { status } = await call("admin", "DELETE", `/bingos/b1/admin/teams/${team.id}/members/${people.captain.id}`, { replacementUserId: people.member.id });
    expect(status).toBe(204);
    await settled();
    expect(accessChanges()).toEqual([{ bingoId: bingo.id, userIds: [people.captain.id, people.member.id].sort() }]);
  });

  it("names a Player who withdraws while Signups are open", async () => {
    setStage("signup");
    expect((await call("signedUp", "DELETE", "/bingos/b1/signup")).status).toBeLessThan(300);
    await settled();
    expect(accessChanges()).toEqual([{ bingoId: bingo.id, userIds: [people.signedUp.id] }]);
  });

  it("names a user whose Admin flag changes, for every bingo at once", async () => {
    const before = process.env.ADMIN_DISCORD_IDS;
    process.env.ADMIN_DISCORD_IDS = "admin";
    try {
      const { status } = await call("admin", "PATCH", `/admin/users/${people.stranger.id}`, { isAdmin: true });
      expect(status).toBe(200);
      expect(accessChanges()).toEqual([{ bingoId: null, userIds: [people.stranger.id] }]);
    } finally {
      process.env.ADMIN_DISCORD_IDS = before;
    }
  });

  it("works out everyone's roles as bingoRoles does one user at a time", async () => {
    const { bingoRoles, bingoRolesOfEveryone } = await import("../services/permissions");
    for (const stage of ["planning", "signup", "captains", "draft", "reveal", "live", "complete"] as const) {
      setStage(stage);
      const fresh = db.select().from(schema.bingos).where(eq(schema.bingos.id, bingo.id)).get()!;
      const everyone = bingoRolesOfEveryone(db, fresh);
      for (const p of ["mod", "captain", "member", "signedUp", "stranger"] as const) {
        expect(everyone.get(people[p].id) ?? [], `${stage} ${p}`).toEqual(bingoRoles(db, fresh, people[p]));
      }
    }
  });

  it("stays quiet for a write that changes nobody's roles, and for a refused one", async () => {
    expect((await call("admin", "PATCH", `/bingos/b1/admin/teams/${team.id}`, { name: "Renamed" })).status).toBe(200);
    expect((await call("stranger", "POST", "/bingos/b1/admin/mods", { userId: people.stranger.id })).status).toBe(403);
    await settled();
    expect(accessChanges()).toEqual([]);
  });
});
