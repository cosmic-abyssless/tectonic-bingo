// A Borrowed account (CONTEXT.md "Signup"): an Admin sets a Player's Signup to play on an OSRS account they don't own,
// with a reason, from Signups closed until Finished, and sets it back the same way. Real routers over a real in-memory
// DB, with the logged-in user faked, hit over HTTP; the clan API and Wise Old Man are faked.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { eq } from "drizzle-orm";
import type { PlayerProfile, Signup, Stage } from "@bingo/shared";
import * as schema from "../db/schema";
import type { SessionUser } from "../types";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { WomLookup } from "../services/womService";

const fakes = vi.hoisted(() => ({
  // The clan API's answer for whoever is asked about: `enabled` false is no clan integration.
  membership: { enabled: true, member: null as { rsns: { rsn: string; wom_id: string }[] } | null },
  lookupPlayer: null as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock("../ocr", () => ({
  isOcrEnabled: () => false,
  analyzeSubmissionScreenshot: vi.fn(),
}));
vi.mock("../ws", () => ({ broadcast: vi.fn() }));
vi.mock("../db", async () => {
  const { createTestDb } = await import("../testUtils/testDb");
  return { ...createTestDb(), DB_PATH: ":memory:", BUSY_TIMEOUT_MS: 0 };
});
vi.mock("../services/tectonicMembership", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/tectonicMembership")>()),
  getTectonicMembership: vi.fn(async () => fakes.membership),
}));
vi.mock("../services/womService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/womService")>();
  fakes.lookupPlayer = vi.fn();
  return { ...actual, getWomClient: () => ({ lookupPlayer: fakes.lookupPlayer }) };
});
vi.mock("../services/playerStatsService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/playerStatsService")>()),
  fetchAndPersistPlayerStats: vi.fn(async () => undefined),
}));
vi.mock("../services/womCompetitionService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/womCompetitionService")>()),
  syncWomCompetition: vi.fn(async () => undefined),
}));

let db: BetterSQLite3Database<typeof schema>;
let sqlite: Database.Database;
let broadcast: ReturnType<typeof vi.fn>;
let fetchStats: ReturnType<typeof vi.fn>;
let syncWom: ReturnType<typeof vi.fn>;
let admin: SessionUser;
let mod: SessionUser;
let alice: SessionUser;
let carol: SessionUser;
let bingo: typeof schema.bingos.$inferSelect;
let aliceSignup: typeof schema.signups.$inferSelect;
let actingAs: SessionUser | null = null;
let server: Server;
let base: string;

beforeAll(async () => {
  ({ db, sqlite } = (await import("../db")) as unknown as { db: typeof db; sqlite: typeof sqlite });
  broadcast = (await import("../ws")).broadcast as unknown as ReturnType<typeof vi.fn>;
  fetchStats = (await import("../services/playerStatsService")).fetchAndPersistPlayerStats as unknown as ReturnType<typeof vi.fn>;
  syncWom = (await import("../services/womCompetitionService")).syncWomCompetition as unknown as ReturnType<typeof vi.fn>;
  const { default: bingosRouter } = await import("./bingos");
  const { default: adminRouter } = await import("./admin");
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
  app.use("/api/bingos/:slug/admin", adminRouter);
  app.use("/api/bingos", bingosRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/bingos`;
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

async function call<T = { error?: string; code?: string }>(as: SessionUser, method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  actingAs = as;
  const res = await fetch(`${base}/${bingo.slug}${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as T };
}

const setAccount = (as: SessionUser, body: { rsn?: string; reason?: string; ownAccount?: boolean }, signupId = aliceSignup.id) =>
  call<{ signup?: Signup; error?: string; code?: string }>(as, "PUT", `/admin/signups/${signupId}/account`, body);

const womFinds = (id: number, displayName: string) => fakes.lookupPlayer.mockResolvedValueOnce({ status: "found", player: { id, username: displayName.toLowerCase(), displayName } } satisfies WomLookup);
const signupOf = (id: string) => db.select().from(schema.signups).where(eq(schema.signups.id, id)).get()!;
const auditRows = () => db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "signup.account_borrowed")).all();

beforeEach(() => {
  wipe();
  broadcast.mockClear();
  fetchStats.mockClear();
  syncWom.mockClear();
  fakes.lookupPlayer.mockReset();
  // Alice's own clan accounts.
  fakes.membership = { enabled: true, member: { rsns: [{ rsn: "Alice Main", wom_id: "100" }, { rsn: "Alice Alt", wom_id: "101" }] } };
  const user = (name: string, isAdmin = false) => db.insert(schema.users).values({ discordId: name, discordUsername: name, isAdmin }).returning().get();
  admin = user("admin", true);
  mod = user("mod");
  alice = user("alice_dc");
  carol = user("carol_dc");
  bingo = db.insert(schema.bingos).values({ slug: "b1", name: "B1", boardRows: 5, boardCols: 5, createdByUserId: admin.id, stage: "live" }).returning().get();
  db.insert(schema.bingoModerators).values({ bingoId: bingo.id, userId: mod.id }).run();
  aliceSignup = db.insert(schema.signups).values({ bingoId: bingo.id, userId: alice.id, rsn: "Alice Main", womId: "100", rsnVerified: true }).returning().get();
  db.insert(schema.signups).values({ bingoId: bingo.id, userId: carol.id, rsn: "Carol", womId: "300" }).run();
});

describe("setting a borrowed account", () => {
  it("puts the Signup on the account Wise Old Man knows, by its WOM id and name, and audits it with the reason", async () => {
    womFinds(200, "Bob");
    const res = await setAccount(admin, { rsn: "bob", reason: "Her account is banned for the week" });
    expect(res.status).toBe(200);
    expect(res.body.signup).toMatchObject({ rsn: "Bob", womId: "200", rsnVerified: false, accountBorrowed: true });
    expect(fakes.lookupPlayer).toHaveBeenCalledWith("bob");

    const [row] = auditRows();
    expect(row).toMatchObject({ actorUserId: admin.id, actorRole: "admin", onBehalfOfUserId: alice.id, entityId: aliceSignup.id, entityLabel: "Bob" });
    expect(JSON.parse(row!.details)).toEqual({ before: "Alice Main", after: "Bob", borrowed: true, womId: "200", reason: "Her account is banned for the week", player: "alice_dc" });
  });

  it("refreshes the account's stats, swaps it into the WOM competition and tells every view the name changed", async () => {
    womFinds(200, "Bob");
    await setAccount(admin, { rsn: "Bob", reason: "Borrowing" });
    // Peak CA goes by the Player's own clan RSNs.
    expect(fetchStats).toHaveBeenCalledWith(expect.anything(), aliceSignup.id, "Bob", { discordId: "alice_dc", linkedRsns: ["Alice Main", "Alice Alt"] });
    expect(syncWom).toHaveBeenCalledWith(expect.anything(), bingo.id);
    expect(broadcast).toHaveBeenCalledWith({ type: "player_renamed", bingoId: bingo.id, payload: { userId: alice.id } });
    expect(broadcast).toHaveBeenCalledWith({ type: "bingo_changed", bingoId: bingo.id, payload: {} });
  });

  it("leaves their Team, roles and Discord account alone", async () => {
    const team = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: alice.id, name: "Team A", codeword: "alpha" }).returning().get();
    db.insert(schema.teamMembers).values({ teamId: team.id, userId: alice.id, isCaptain: true }).run();
    womFinds(200, "Bob");
    expect((await setAccount(admin, { rsn: "Bob", reason: "Borrowing" })).status).toBe(200);
    expect(db.select().from(schema.teamMembers).where(eq(schema.teamMembers.userId, alice.id)).all()).toMatchObject([{ teamId: team.id, isCaptain: true }]);
    expect(db.select().from(schema.users).where(eq(schema.users.id, alice.id)).get()!.discordId).toBe("alice_dc");
  });

  it("is for Admins only, not Moderators", async () => {
    expect((await setAccount(mod, { rsn: "Bob", reason: "Borrowing" })).status).toBe(403);
    expect(signupOf(aliceSignup.id).rsn).toBe("Alice Main");
  });

  it("is open from Signups closed until Finished, and refused otherwise", async () => {
    for (const stage of ["planning", "signup", "complete"] as const) {
      setStage(stage);
      expect((await setAccount(admin, { rsn: "Bob", reason: "Borrowing" })).status).toBe(400);
    }
    for (const stage of ["captains", "draft", "reveal", "live"] as const) {
      setStage(stage);
      womFinds(200 + stage.length, `Bob${stage}`);
      expect((await setAccount(admin, { rsn: `Bob${stage}`, reason: "Borrowing" })).status).toBe(200);
    }
    expect(fakes.lookupPlayer).toHaveBeenCalledTimes(4);
  });

  it("needs a reason and an RSN", async () => {
    womFinds(200, "Bob");
    expect(await setAccount(admin, { rsn: "Bob", reason: "  " })).toMatchObject({ status: 400, body: { error: "Give a reason" } });
    expect((await setAccount(admin, { reason: "Borrowing" })).status).toBe(400);
    expect(auditRows()).toHaveLength(0);
  });

  it("refuses an account Wise Old Man doesn't track, saying to track it first", async () => {
    fakes.lookupPlayer.mockResolvedValueOnce({ status: "not_found" });
    const res = await setAccount(admin, { rsn: "Nobody", reason: "Borrowing" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("wom_not_found");
    expect(res.body.error).toContain("wiseoldman.net");
    expect(signupOf(aliceSignup.id).accountBorrowed).toBe(false);
  });

  it("refuses with try again when Wise Old Man can't be reached", async () => {
    fakes.lookupPlayer.mockResolvedValueOnce({ status: "unavailable" });
    const res = await setAccount(admin, { rsn: "Bob", reason: "Borrowing" });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("wom_unavailable");
    expect(res.body.error).toContain("Try again");
  });

  it("refuses an account someone else in the bingo is on, by RSN in any case or by WOM id, naming them", async () => {
    womFinds(999, "Carol");
    expect(await setAccount(admin, { rsn: "carol", reason: "Borrowing" })).toMatchObject({ status: 409, body: { error: "carol_dc is already signed up on Carol in this bingo" } });
    womFinds(300, "Carol Renamed");
    expect((await setAccount(admin, { rsn: "Carol Renamed", reason: "Borrowing" })).status).toBe(409);
    // A withdrawn Signup doesn't hold the account.
    db.update(schema.signups).set({ status: "withdrawn" }).where(eq(schema.signups.userId, carol.id)).run();
    womFinds(300, "Carol");
    expect((await setAccount(admin, { rsn: "Carol", reason: "Borrowing" })).status).toBe(200);
  });

  it("refuses one of the Player's own clan RSNs: that isn't a borrowed account", async () => {
    const res = await setAccount(admin, { rsn: "alice alt", reason: "Borrowing" });
    expect(res.status).toBe(400);
    expect(fakes.lookupPlayer).not.toHaveBeenCalled();
  });

  it("takes the RSN without asking Wise Old Man in a test data Bingo", async () => {
    db.update(schema.bingos).set({ slug: "testdata-x" }).where(eq(schema.bingos.id, bingo.id)).run();
    bingo = { ...bingo, slug: "testdata-x" };
    const res = await setAccount(admin, { rsn: "Bob", reason: "Borrowing" });
    expect(res.body.signup).toMatchObject({ rsn: "Bob", womId: null, accountBorrowed: true });
    expect(fakes.lookupPlayer).not.toHaveBeenCalled();
  });
});

describe("setting it back", () => {
  beforeEach(async () => {
    womFinds(200, "Bob");
    await setAccount(admin, { rsn: "Bob", reason: "Borrowing" });
  });

  it("puts them back on one of their own clan RSNs, verified with its WOM id, and audits which way it went", async () => {
    const res = await setAccount(admin, { rsn: "alice main", reason: "Her account is back" });
    expect(res.body.signup).toMatchObject({ rsn: "Alice Main", womId: "100", rsnVerified: true, accountBorrowed: false });
    expect(fakes.lookupPlayer).toHaveBeenCalledTimes(1);
    const back = auditRows().at(-1)!;
    expect(JSON.parse(back.details)).toMatchObject({ before: "Bob", after: "Alice Main", borrowed: false, womId: "100", reason: "Her account is back" });
  });

  it("with Back to their own account, takes it as their own (unverified) when there's no clan integration to check it", async () => {
    fakes.membership = { enabled: false, member: null };
    const res = await setAccount(admin, { rsn: "Alice Main", reason: "Back", ownAccount: true });
    expect(res.body.signup).toMatchObject({ rsn: "Alice Main", womId: null, rsnVerified: false, accountBorrowed: false });
  });

  it("with Back to their own account, refuses an RSN that isn't theirs when the clan can check it", async () => {
    expect((await setAccount(admin, { rsn: "Dave", reason: "Back", ownAccount: true })).status).toBe(400);
    expect(signupOf(aliceSignup.id)).toMatchObject({ rsn: "Bob", accountBorrowed: true });
  });

  it("can also move them to another borrowed account", async () => {
    womFinds(400, "Eve");
    expect((await setAccount(admin, { rsn: "Eve", reason: "Bob needs his back" })).body.signup).toMatchObject({ rsn: "Eve", womId: "400", accountBorrowed: true });
  });

  it("refuses Back to their own account when they're already on it", async () => {
    await setAccount(admin, { rsn: "Alice Main", reason: "Back" });
    expect((await setAccount(admin, { rsn: "Alice Alt", reason: "Back", ownAccount: true })).status).toBe(400);
  });
});

describe("the player card", () => {
  it("says the Signup is on a borrowed account, with the Signup for an Admin's action", async () => {
    womFinds(200, "Bob");
    await setAccount(admin, { rsn: "Bob", reason: "Borrowing" });
    const res = await call<{ player: PlayerProfile }>(admin, "GET", `/players/${alice.id}`);
    expect(res.body.player).toMatchObject({ rsn: "Bob", signupId: aliceSignup.id, accountBorrowed: true });
  });
});
