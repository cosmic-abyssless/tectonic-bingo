// Responses that list someone other than the viewer send a PublicUser (shared): a name, an avatar and an RSN, never
// the account flags (isAdmin, inGuild) or timestamps on the users row. The viewer's own record (/api/me) and
// site-admin user management keep the full row. These go through the real routers, so a route that joins `users`
// and sends the whole row fails here.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import type { BingoModerator, BingoShellResponse, CaptainCandidatesResponse, MeResponse, PartnerCandidatesResponse, RosterResponse, User } from "@bingo/shared";
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
vi.mock("../ocr", () => ({
  isOcrEnabled: () => false,
  analyzeSubmissionScreenshot: vi.fn(),
}));

const PUBLIC_USER_KEYS = ["discordAvatar", "discordGlobalName", "discordGuildNick", "discordId", "discordUsername", "id", "rsn"];

function expectPublic(user: object | null | undefined) {
  expect(user).toBeTruthy();
  expect(Object.keys(user!).sort()).toEqual(PUBLIC_USER_KEYS);
}

const user = (name: string, isAdmin = false) =>
  db
    .insert(schema.users)
    .values({ discordId: `${name}-id`, discordUsername: name, discordGlobalName: `${name} Global`, discordAvatar: `${name}-avatar`, isAdmin })
    .returning()
    .get();

// A duo bingo in its captains stage: alice captains a team with bob; carol is signed up and not on a team yet (a
// captain candidate); dan is a mod who isn't playing; admin collected carol's buy-in. The viewer is carol, a player.
function seed() {
  const [admin, alice, bob, carol, dan] = [user("admin", true), user("alice"), user("bob"), user("carol"), user("dan")] as const;
  const bingo = db.insert(schema.bingos).values({ slug: "b", name: "B", boardRows: 2, boardCols: 2, createdByUserId: admin.id, stage: "captains", signupMode: "duo" }).returning().get();
  const signup = (userId: string, rsn: string) => db.insert(schema.signups).values({ bingoId: bingo.id, userId, rsn }).returning().get();
  signup(alice.id, "Zezima");
  signup(bob.id, "Lynx Titan");
  const carolSignup = signup(carol.id, "Carol Rsn");
  db.update(schema.signups).set({ buyinReceivedAt: new Date(), buyinCollectedByUserId: admin.id, buyinRecordedByUserId: admin.id }).run();
  const team = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: alice.id, name: "Team", codeword: "word" }).returning().get();
  for (const u of [alice, bob]) db.insert(schema.teamMembers).values({ teamId: team.id, userId: u.id, isCaptain: u === alice }).run();
  db.insert(schema.bingoModerators).values({ bingoId: bingo.id, userId: dan.id }).run();
  return { admin, alice, bob, carol, dan, carolSignup };
}

let viewerId: string;
let server: Server;

async function get<T>(path: string): Promise<T> {
  const port = (server.address() as { port: number }).port;
  const res = await fetch(`http://localhost:${port}${path}`);
  expect(res.status, path).toBe(200);
  return res.json() as Promise<T>;
}

beforeEach(async () => {
  ({ sqlite, db } = createTestDb());
  const { eq } = await import("drizzle-orm");
  const { default: meRouter } = await import("./me");
  const { default: siteAdminRouter } = await import("./siteAdmin");
  const { default: bingosRouter } = await import("./bingos");
  const { default: modRouter } = await import("./mod");
  const { default: adminRouter } = await import("./admin");
  const app = express();
  // Stands in for passport: the session user is the full row, as deserializeUser loads it.
  app.use((req, _res, next) => {
    req.user = db.select().from(schema.users).where(eq(schema.users.id, viewerId)).get();
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    next();
  });
  app.use("/api/me", meRouter);
  app.use("/api/admin", siteAdminRouter);
  app.use("/api/bingos", bingosRouter);
  app.use("/api/bingos/:slug/mod", modRouter);
  app.use("/api/bingos/:slug/admin", adminRouter);
  server = app.listen(0);
});
afterEach(() => {
  server.close();
  sqlite.close();
});

describe("other people are sent as PublicUsers", () => {
  it("in the Bingo shell's team rosters", async () => {
    const { carol } = seed();
    viewerId = carol.id;
    const { teams } = await get<BingoShellResponse>("/api/bingos/b");
    expect(teams[0].members).toHaveLength(2);
    for (const m of teams[0].members) expectPublic(m.user);
    expect(teams[0].members[0].user).toMatchObject({ discordAvatar: "alice-avatar", rsn: "Zezima" });
  });

  it("in the duo partners list", async () => {
    const { carol } = seed();
    viewerId = carol.id;
    const { candidates } = await get<PartnerCandidatesResponse>("/api/bingos/b/signup/partners");
    expect(candidates.map((c) => c.discordId).sort()).toEqual(["alice-id", "bob-id"]);
    for (const c of candidates) expectPublic(c.user);
    expect(candidates.find((c) => c.discordId === "alice-id")!.user).toMatchObject({ discordAvatar: "alice-avatar", rsn: "Zezima" });
  });

  it("in the mod signup roster, both the player and who collected the buy-in", async () => {
    const { dan } = seed();
    viewerId = dan.id;
    const { signups } = await get<RosterResponse>("/api/bingos/b/mod/signups");
    expect(signups).toHaveLength(3);
    for (const s of signups) {
      expectPublic(s.user);
      expectPublic(s.collectedByUser);
    }
    expect(signups[0].collectedByUser).toMatchObject({ discordUsername: "admin", rsn: null });
  });

  it("in the moderator lists", async () => {
    const { admin, dan } = seed();
    viewerId = dan.id;
    const forMods = await get<{ mods: BingoModerator[] }>("/api/bingos/b/mod/moderators");
    viewerId = admin.id;
    const forAdmins = await get<{ mods: BingoModerator[] }>("/api/bingos/b/admin/mods");
    for (const { mods } of [forMods, forAdmins]) {
      expect(mods).toHaveLength(1);
      expectPublic(mods[0].user);
      expect(mods[0].user).toMatchObject({ discordUsername: "dan", rsn: null });
    }
  });

  it("in the captain candidates", async () => {
    const { admin } = seed();
    viewerId = admin.id;
    const { candidates } = await get<CaptainCandidatesResponse>("/api/bingos/b/admin/captain-candidates");
    expect(candidates).toHaveLength(1);
    expectPublic(candidates[0].user);
    expect(candidates[0].user).toMatchObject({ discordUsername: "carol", rsn: "Carol Rsn" });
  });
});

describe("the full user row", () => {
  it("is still the viewer's own record on /api/me", async () => {
    const { admin } = seed();
    viewerId = admin.id;
    const { user } = await get<MeResponse>("/api/me");
    expect(user).toMatchObject({ id: admin.id, isAdmin: true, inGuild: true });
    expect(user).toHaveProperty("createdAt");
  });

  it("is still what site-admin user search lists", async () => {
    const { admin } = seed();
    viewerId = admin.id;
    const { users } = await get<{ users: User[] }>("/api/admin/users?q=admin");
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ isAdmin: true, inGuild: true });
    expect(users[0]).toHaveProperty("updatedAt");
  });
});
