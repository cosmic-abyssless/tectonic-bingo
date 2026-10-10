// Who can see a bingo (CONTEXT.md "Player"), answered by the routes themselves: a real bingos router over a real
// in-memory DB, with the logged-in user faked, hit over HTTP.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { eq } from "drizzle-orm";
import type { BingoShellResponse, Stage } from "@bingo/shared";
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
type Person = "admin" | "mod" | "captainA" | "memberA" | "captainB" | "signedUp" | "extra" | "cutMe" | "withdrawn" | "stranger";
let people: Record<Person, SessionUser>;
let bingo: typeof schema.bingos.$inferSelect;
let teamA: typeof schema.teams.$inferSelect;
let teamB: typeof schema.teams.$inferSelect;
let actingAs: SessionUser | null = null;
let server: Server;
let base: string;

beforeAll(async () => {
  ({ db, sqlite } = (await import("../db")) as unknown as { db: typeof db; sqlite: typeof sqlite });
  const { default: bingosRouter } = await import("./bingos");
  const { default: modRouter } = await import("./mod");
  const { errorHandler } = await import("../middleware/errorHandler");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // Stands in for passport: the logged-in user is whoever the test is acting as.
    (req as unknown as { user?: SessionUser }).user = actingAs ?? undefined;
    req.isAuthenticated = (() => !!actingAs) as typeof req.isAuthenticated;
    next();
  });
  app.use("/api/bingos/:slug/mod", modRouter);
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

function user(discordId: string, extra: Partial<SessionUser> = {}): SessionUser {
  return db.insert(schema.users).values({ discordId, discordUsername: discordId, ...extra }).returning().get();
}

function signUp(u: SessionUser, extra: Partial<typeof schema.signups.$inferInsert> = {}) {
  db.insert(schema.signups).values({ bingoId: bingo.id, userId: u.id, rsn: u.discordId, ...extra }).run();
}

function setStage(stage: Stage, extra: Partial<typeof schema.bingos.$inferInsert> = {}) {
  db.update(schema.bingos).set({ stage, rulesMarkdown: "# Rules", ...extra }).where(eq(schema.bingos.id, bingo.id)).run();
}

async function get(as: Person, path: string) {
  actingAs = people[as];
  const res = await fetch(`${base}${path}`);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  wipe();
  people = {
    admin: user("admin", { isAdmin: true }),
    mod: user("mod"),
    captainA: user("captainA"),
    memberA: user("memberA"),
    captainB: user("captainB"),
    signedUp: user("signedUp"),
    extra: user("extra"),
    cutMe: user("cutMe"),
    withdrawn: user("withdrawn"),
    stranger: user("stranger"),
  };
  bingo = db.insert(schema.bingos).values({ slug: "b1", name: "B1", boardRows: 5, boardCols: 5, createdByUserId: people.admin.id, stage: "signup" }).returning().get();
  db.insert(schema.bingoModerators).values({ bingoId: bingo.id, userId: people.mod.id }).run();
  // Signed up in this order, so with two teams and three undrafted singles the newest (cutMe) is cut.
  for (const p of ["captainA", "memberA", "captainB", "signedUp", "extra", "cutMe"] as const) signUp(people[p], p === "memberA" ? { runeProfileDataJson: "{}" } : {});
  signUp(people.withdrawn, { status: "withdrawn" });
  teamA = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: people.captainA.id, name: "Team A", codeword: "alpha" }).returning().get();
  teamB = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: people.captainB.id, name: "Team B", codeword: "bravo" }).returning().get();
  db.insert(schema.teamMembers)
    .values([
      { teamId: teamA.id, userId: people.captainA.id, isCaptain: true },
      { teamId: teamA.id, userId: people.memberA.id },
      { teamId: teamB.id, userId: people.captainB.id, isCaptain: true },
    ])
    .run();
  for (const [team, by] of [[teamA, people.memberA], [teamB, people.captainB]] as const) {
    const submission = db.insert(schema.submissions).values({ teamId: team.id, submittedByUserId: by.id }).returning().get();
    db.insert(schema.submissionScreenshots).values({ submissionId: submission.id, storageUrl: `/uploads/${team.name}.png` }).run();
    db.insert(schema.auditLog)
      .values({ bingoId: bingo.id, teamId: team.id, action: "submission.created", visibility: "team", actorType: "user", actorRole: "player", actorUserId: by.id, entityType: "submission", entityId: submission.id, details: JSON.stringify({ tileId: "t", tileName: "Tile", taskLabels: [], claims: [], screenshotUrl: `/uploads/${team.name}.png` }) })
      .run();
  }
});

const contentRoutes = () => [
  "/b1/board",
  "/b1/stats",
  `/b1/teams/${teamA.id}/progress`,
  `/b1/teams/${teamA.id}/submissions`,
  `/b1/teams/${teamA.id}/activity`,
  "/b1/achievements",
  `/b1/players/${people.memberA.id}`,
  "/b1/draft",
  "/b1/rewind",
];

// Asked for by every bingo page, so it answers with nothing rather than refusing.
async function accountTypesOf(p: Person) {
  const { status, body } = await get(p, "/b1/account-types");
  expect(status).toBe(200);
  return Object.keys(body.accountTypes as object).length;
}

describe("a Planning bingo", () => {
  beforeEach(() => setStage("planning"));

  it("isn't listed to anyone but its mods and the admins", async () => {
    for (const p of ["stranger", "signedUp", "memberA"] as const) expect((await get(p, "/")).body.bingos, p).toEqual([]);
    for (const p of ["mod", "admin"] as const) expect(((await get(p, "/")).body.bingos as unknown[]).length, p).toBe(1);
  });

  it("404s on every route for everyone else, Players included", async () => {
    for (const p of ["stranger", "signedUp", "captainA"] as const) {
      for (const path of ["/b1", "/b1/signup", "/b1/signup/questions", ...contentRoutes()]) expect((await get(p, path)).status, `${p} ${path}`).toBe(404);
    }
  });
});

describe("while signups are open", () => {
  it("gives someone with no signup only the landing data", async () => {
    const { status, body } = await get("stranger", "/b1");
    expect(status).toBe(200);
    const shell = body as unknown as BingoShellResponse;
    expect(shell.bingo.name).toBe("B1");
    expect(shell.teams).toEqual([]);
    expect(shell.categories).toEqual([]);
    expect(shell.viewer).toEqual({ canSee: false, isPlayer: false, isCut: false, removedFromTeam: null });
    expect((await get("stranger", "/b1/signup/questions")).status).toBe(200);
    expect((await get("stranger", "/b1/signup/partners")).status).toBe(200);
    for (const path of contentRoutes()) expect((await get("stranger", path)).status, path).toBe(403);
  });

  it("shows a Player the rosters", async () => {
    const shell = (await get("signedUp", "/b1")).body as unknown as BingoShellResponse;
    expect(shell.viewer.canSee).toBe(true);
    expect(shell.teams).toHaveLength(2);
  });
});

describe("scouting", () => {
  type Pool = { entries: { signup: { id: string; userId: string }; answers: unknown[] | null }[] }[];
  const entries = (body: Record<string, unknown>) => (body.pool as Pool).flatMap((unit) => unit.entries);

  beforeEach(() => {
    const signupId = db.select({ id: schema.signups.id }).from(schema.signups).where(eq(schema.signups.userId, people.signedUp.id)).get()!.id;
    db.insert(schema.pickRatings).values({ teamId: teamA.id, signupId, stars: 3, note: "Great" }).run();
  });

  it("is for leads and mods only while Signups are open", async () => {
    const { status, body } = await get("signedUp", "/b1/draft");
    expect(status).toBe(403);
    expect(body.error).toMatch(/captains and mods/);
    for (const p of ["captainA", "mod"] as const) expect((await get(p, "/b1/draft")).status, p).toBe(200);
  });

  it("opens to every Player once Signups are closed, without answers or ratings", async () => {
    setStage("captains");
    const { status, body } = await get("signedUp", "/b1/draft");
    expect(status).toBe(200);
    expect(entries(body).length).toBeGreaterThan(0);
    expect(entries(body).every((e) => e.answers === null)).toBe(true);
    expect(body.ratings).toEqual({});
  });

  it("still gives a Captain answers and their Team's ratings once Signups are closed", async () => {
    setStage("captains");
    const { status, body } = await get("captainA", "/b1/draft");
    expect(status).toBe(200);
    expect(entries(body).every((e) => Array.isArray(e.answers))).toBe(true);
    expect(Object.values(body.ratings as object)).toEqual([{ stars: 3, note: "Great" }]);
  });

  it("stays closed to someone without an active Signup once Signups are closed", async () => {
    setStage("captains");
    for (const p of ["stranger", "withdrawn"] as const) expect((await get(p, "/b1/draft")).status, p).toBe(403);
  });
});

describe.each(["captains", "draft", "reveal", "live"] as const)("at %s", (stage) => {
  beforeEach(() => setStage(stage));

  it("refuses every content route to a member with no signup, and to a withdrawn signup", async () => {
    for (const p of ["stranger", "withdrawn"] as const) {
      const shell = (await get(p, "/b1")).body as unknown as BingoShellResponse;
      expect(shell.viewer, p).toEqual({ canSee: false, isPlayer: false, isCut: false, removedFromTeam: null });
      expect(shell.teams).toEqual([]);
      expect(shell.bingo.rulesMarkdown).toBeNull();
      for (const path of [...contentRoutes(), "/b1/signup/questions"]) expect((await get(p, path)).status, `${p} ${path}`).toBe(403);
      expect(await accountTypesOf(p)).toBe(0);
    }
    expect(await accountTypesOf("memberA")).toBe(1);
  });

  it("answers the signup helpers to the mods only", async () => {
    for (const path of ["/b1/signup/partners", "/b1/signup/unpaired", "/b1/signup/pairing"]) {
      expect((await get("signedUp", path)).status, path).toBe(403);
      expect((await get("mod", path)).status, path).toBe(200);
    }
  });

  it("lets a team's players see their own team", async () => {
    expect((await get("memberA", `/b1/teams/${teamA.id}/progress`)).status).toBe(200);
    expect((await get("memberA", `/b1/teams/${teamA.id}/submissions`)).status).toBe(200);
    expect((await get("memberA", `/b1/teams/${teamB.id}/submissions`)).status).toBe(403);
    expect((await get("memberA", `/b1/teams/${teamB.id}/activity`)).status).toBe(403);
  });
});

describe("the draft", () => {
  beforeEach(() => setStage("draft"));

  it("can be watched by signups who haven't been picked yet", async () => {
    expect((await get("signedUp", "/b1/draft")).status).toBe(200);
    expect((await get("extra", "/b1/draft")).status).toBe(200);
  });

  it("is closed to a Cut signup, who is told so", async () => {
    const shell = (await get("cutMe", "/b1")).body as unknown as BingoShellResponse;
    expect(shell.viewer).toEqual({ canSee: false, isPlayer: false, isCut: true, removedFromTeam: null });
    expect((await get("cutMe", "/b1/draft")).status).toBe(403);
    expect((await get("cutMe", "/b1/board")).status).toBe(403);
  });

  it("is closed to a withdrawn signup", async () => {
    expect((await get("withdrawn", "/b1/draft")).status).toBe(403);
  });
});

describe("from Board revealed on", () => {
  beforeEach(() => setStage("live"));

  it("an active signup left off every team is Cut", async () => {
    const shell = (await get("signedUp", "/b1")).body as unknown as BingoShellResponse;
    expect(shell.viewer).toEqual({ canSee: false, isPlayer: false, isCut: true, removedFromTeam: null });
  });

  it("tells a Player an Admin removed from their Team so, until a Late signup brings them back", async () => {
    const { removeTeamMember } = await import("../services/teamService");
    const { createLateSignup } = await import("../services/signupService");
    removeTeamMember(db, teamA.id, people.memberA.id, { reason: "Had to leave" });
    const shell = (await get("memberA", "/b1")).body as unknown as BingoShellResponse;
    expect(shell.viewer).toEqual({ canSee: false, isPlayer: false, isCut: false, removedFromTeam: "Team A" });
    expect((await get("memberA", "/b1/board")).status).toBe(403);
    // Someone who withdrew in another way isn't told they were removed.
    expect(((await get("withdrawn", "/b1")).body as unknown as BingoShellResponse).viewer.removedFromTeam).toBeNull();

    const live = db.select().from(schema.bingos).where(eq(schema.bingos.id, bingo.id)).get()!;
    createLateSignup(db, live, { userId: people.memberA.id, rsn: "memberA", teamId: teamB.id });
    const back = (await get("memberA", "/b1")).body as unknown as BingoShellResponse;
    expect(back.viewer).toMatchObject({ canSee: true, removedFromTeam: null });
  });
});

describe("player cards", () => {
  beforeEach(() => setStage("live"));

  it("open only for someone who can see the bingo, and only for people in it", async () => {
    expect((await get("memberA", `/b1/players/${people.captainB.id}`)).status).toBe(200);
    expect((await get("memberA", `/b1/players/${people.stranger.id}`)).status).toBe(404);
    expect((await get("memberA", `/b1/players/${people.withdrawn.id}`)).status).toBe(404);
    expect((await get("stranger", `/b1/players/${people.memberA.id}`)).status).toBe(403);
    expect((await get("mod", `/b1/players/${people.stranger.id}`)).status).toBe(200);
  });

  it("show a Moderator or Admin the player's roles and Restrictions, and what they may do about them", async () => {
    db.insert(schema.bingoRestrictions).values({ bingoId: bingo.id, userId: people.captainA.id, action: "react", reason: "Spam", appliedByUserId: people.mod.id, appliedAt: new Date() }).run();
    const access = async (as: Person, of: Person) => ((await get(as, `/b1/players/${people[of].id}`)).body.player as { access: unknown }).access;

    expect(await access("memberA", "captainA")).toBeNull();
    expect(await access("mod", "captainA")).toMatchObject({ roles: ["captain", "player"], restrictions: [{ action: "react", reason: "Spam" }], restrictable: true, liftable: true });
    // A Moderator can't restrict another Moderator; an Admin can, and can lift anything, but no one restricts an Admin.
    db.insert(schema.bingoModerators).values({ bingoId: bingo.id, userId: people.memberA.id }).run();
    expect(await access("mod", "memberA")).toMatchObject({ roles: ["moderator", "player"], restrictable: false, liftable: false });
    expect(await access("admin", "memberA")).toMatchObject({ restrictable: true, liftable: true });
    expect(await access("mod", "admin")).toMatchObject({ roles: ["admin"], restrictions: [], restrictable: false });
    // Someone in no role here has nothing to restrict.
    expect(await access("mod", "stranger")).toMatchObject({ roles: [], restrictable: false });
  });
});

describe("a Finished bingo", () => {
  beforeEach(() => setStage("complete"));

  it("is readable by a member with no signup: board, stats, final teams, every team's submissions and activity", async () => {
    const shell = (await get("stranger", "/b1")).body as unknown as BingoShellResponse;
    expect(shell.viewer.canSee).toBe(true);
    expect(shell.teams).toHaveLength(2);
    expect(shell.bingo.rulesMarkdown).toBe("# Rules");
    for (const path of ["/b1/board", "/b1/stats", "/b1/draft", "/b1/rewind", `/b1/teams/${teamA.id}/progress`, `/b1/players/${people.memberA.id}`]) {
      expect((await get("stranger", path)).status, path).toBe(200);
    }
    expect(await accountTypesOf("stranger")).toBe(1);
    const { body } = await get("stranger", `/b1/teams/${teamA.id}/submissions`);
    expect((body.submissions as { screenshots: unknown[] }[])[0]!.screenshots).toHaveLength(1);
    const activity = await get("stranger", `/b1/teams/${teamA.id}/activity`);
    expect(activity.status).toBe(200);
    expect((activity.body.entries as { details: { screenshotUrl?: string } }[])[0]!.details.screenshotUrl).toBe("/uploads/Team A.png");
  });

  it("with screenshots switched off, hides other teams' screenshots from everyone but the mods", async () => {
    setStage("complete", { showScreenshotsWhenFinished: false });
    const screenshotsOf = async (p: Person, team: typeof teamA) => {
      const { status, body } = await get(p, `/b1/teams/${team.id}/submissions`);
      expect(status).toBe(200);
      const [submission] = body.submissions as { screenshots: unknown[] }[];
      return submission!.screenshots.length;
    };
    expect(await screenshotsOf("stranger", teamA)).toBe(0);
    expect(await screenshotsOf("memberA", teamB)).toBe(0);
    expect(await screenshotsOf("memberA", teamA)).toBe(1);
    expect(await screenshotsOf("mod", teamB)).toBe(1);
    const activity = await get("stranger", `/b1/teams/${teamA.id}/activity`);
    const [entry] = activity.body.entries as { details: Record<string, unknown> }[];
    expect(entry!.details).not.toHaveProperty("screenshotUrl");
    expect(entry!.details.tileName).toBe("Tile");

    // Rewind follows the same rule (it plays approved and rejected Submissions only).
    db.update(schema.submissions).set({ status: "approved" }).run();
    const rewindScreenshots = async (p: Person) => {
      const { status, body } = await get(p, "/b1/rewind");
      expect(status).toBe(200);
      return Object.fromEntries((body.submissions as { teamId: string; screenshotUrl: string | null }[]).map((sub) => [sub.teamId, sub.screenshotUrl]));
    };
    expect(await rewindScreenshots("memberA")).toEqual({ [teamA.id]: "/uploads/Team A.png", [teamB.id]: null });
    expect(await rewindScreenshots("stranger")).toEqual({ [teamA.id]: null, [teamB.id]: null });
    expect(await rewindScreenshots("mod")).toEqual({ [teamA.id]: "/uploads/Team A.png", [teamB.id]: "/uploads/Team B.png" });
  });
});

describe("mods and admins", () => {
  it.each(["planning", "signup", "captains", "draft", "reveal", "live", "complete"] as const)("see everything at %s", async (stage) => {
    setStage(stage);
    for (const p of ["mod", "admin"] as const) {
      const shell = (await get(p, "/b1")).body as unknown as BingoShellResponse;
      expect(shell.viewer.canSee).toBe(true);
      expect(shell.teams).toHaveLength(2);
      for (const path of ["/b1/board", "/b1/stats", `/b1/teams/${teamB.id}/submissions`, `/b1/teams/${teamB.id}/activity`, `/b1/players/${people.memberA.id}`]) {
        expect((await get(p, path)).status, `${p} ${path}`).toBe(200);
      }
    }
  });
});

describe("a Moderator who also plays", () => {
  beforeEach(() => {
    db.insert(schema.bingoModerators).values({ bingoId: bingo.id, userId: people.memberA.id }).run();
  });

  it("sees only their own Team while Live, as their teammates do", async () => {
    setStage("live");
    for (const path of [`/b1/teams/${teamA.id}/progress`, `/b1/teams/${teamA.id}/submissions`, "/b1/stats"]) {
      expect((await get("memberA", path)).status, path).toBe(200);
    }
    for (const path of [`/b1/teams/${teamB.id}/progress`, `/b1/teams/${teamB.id}/submissions`, `/b1/teams/${teamB.id}/activity`]) {
      expect((await get("memberA", path)).status, path).toBe(403);
    }
    expect((await get("memberA", "/b1/stats")).body).toEqual((await get("captainA", "/b1/stats")).body);
  });

  it("still reviews every Team's Submissions", async () => {
    setStage("live");
    const { status, body } = await get("memberA", "/b1/mod/submissions");
    expect(status).toBe(200);
    const submissions = body.submissions as { submission: { id: string }; team: { id: string } }[];
    expect(new Set(submissions.map((s) => s.team.id))).toEqual(new Set([teamA.id, teamB.id]));
    const teamBSubmission = submissions.find((s) => s.team.id === teamB.id)!.submission;
    actingAs = people.memberA;
    const review = await fetch(`${base}/b1/mod/submissions/${teamBSubmission.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "approve" }) });
    expect(review.status, await review.clone().text()).toBe(200);
  });

  it("sees every Team once the Bingo is Finished", async () => {
    setStage("complete");
    expect((await get("memberA", `/b1/teams/${teamB.id}/progress`)).status).toBe(200);
    expect((await get("memberA", "/b1/stats")).body).toEqual((await get("mod", "/b1/stats")).body);
  });
});
