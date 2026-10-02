// feedback.ts: the Feedback questions the Admin adds, and the responses a Finished Bingo's Players send, checked against
// the real services behind the endpoints (the session below calls them as the routes would).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../../db/schema";
import { createTestDb } from "../../testUtils/testDb";
import { createQuestion, getQuestions } from "../../services/signupService";
import { getFeedbackResults, submitFeedback } from "../../services/feedbackService";
import type { Api } from "./client";
import { DEFAULT_FEEDBACK_QUESTIONS, ensureFeedbackQuestions, runFeedback } from "./feedback";
import { makePlayers, type Player } from "./people";
import { Rng } from "./rng";

vi.mock("../../ws", () => ({ broadcast: vi.fn() }));

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;
let bingo: typeof schema.bingos.$inferSelect;

const ORIGINAL_SECRET = process.env.FEEDBACK_SECRET;
beforeEach(() => {
  process.env.FEEDBACK_SECRET = "generator-test-secret";
  ({ sqlite, db } = createTestDb());
  const admin = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin", isAdmin: true }).returning().get();
  bingo = db.insert(schema.bingos).values({ slug: "testdata-fb", name: "FB", boardRows: 3, boardCols: 3, createdByUserId: admin.id, stage: "complete" }).returning().get();
});
afterEach(() => {
  sqlite.close();
  if (ORIGINAL_SECRET === undefined) delete process.env.FEEDBACK_SECRET;
  else process.env.FEEDBACK_SECRET = ORIGINAL_SECRET;
});

/** An Api whose requests go straight to the services, as the routes would. */
function fakeApi(): Api {
  const session = (discordId: string | null) => {
    const user = () => db.select().from(schema.users).where(eq(schema.users.discordId, discordId!)).get()!;
    return {
      get: async (path: string) => {
        if (path.endsWith("/admin/questions?form=feedback")) return { questions: getQuestions(db, bingo.id, "feedback") };
        if (path.endsWith("/mod/feedback")) return getFeedbackResults(db, bingo);
        throw new Error(`unexpected GET ${path}`);
      },
      post: async (path: string, body: Record<string, unknown>) => {
        if (!path.endsWith("/admin/questions")) throw new Error(`unexpected POST ${path}`);
        return { question: createQuestion(db, { bingoId: bingo.id, ...(body as object) } as never) };
      },
      put: async (path: string, body: never) => {
        if (!path.endsWith("/feedback")) throw new Error(`unexpected PUT ${path}`);
        return submitFeedback(db, bingo, user(), body);
      },
    };
  };
  return { as: session } as unknown as Api;
}

describe("ensureFeedbackQuestions", () => {
  it("adds every question type, Captains-only ones included, through the real validation", async () => {
    const questions = await ensureFeedbackQuestions(fakeApi(), "admin", bingo.slug, new Date());
    expect(questions).toHaveLength(DEFAULT_FEEDBACK_QUESTIONS.length);
    expect(new Set(questions.map((q) => q.type))).toEqual(new Set(["text", "textarea", "select", "multiselect", "boolean", "member"]));
    expect(questions.some((q) => q.audience === "captains")).toBe(true);
    expect(questions.every((q) => q.form === "feedback")).toBe(true);
    expect(getQuestions(db, bingo.id, "signup")).toEqual([]);
  });

  it("leaves a board's own Feedback questions alone", async () => {
    createQuestion(db, { bingoId: bingo.id, form: "feedback", prompt: "Mine", type: "text" });
    const questions = await ensureFeedbackQuestions(fakeApi(), "admin", bingo.slug, new Date());
    expect(questions.map((q) => q.prompt)).toEqual(["Mine"]);
  });
});

describe("runFeedback", () => {
  function seedTeams(players: Player[]) {
    const [captain, coCaptain, ...rest] = players;
    for (const p of players) {
      p.userId = db.insert(schema.users).values({ discordId: p.discordId, discordUsername: p.discordName, inGuild: true }).returning().get().id;
    }
    const team = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: captain!.userId!, name: "Red", codeword: "red" }).returning().get();
    db.insert(schema.teamMembers).values([
      { teamId: team.id, userId: captain!.userId!, isCaptain: true },
      { teamId: team.id, userId: coCaptain!.userId!, isCoCaptain: true },
      ...rest.map((p) => ({ teamId: team.id, userId: p.userId! })),
    ]).run();
    return { members: players, leads: [captain!, coCaptain!] };
  }

  it("has most Players answer, Captains also their own questions, and matches the results to what it sent", async () => {
    const players = makePlayers(new Rng(4), 30, "testdata-fb");
    const team = seedTeams(players);
    await ensureFeedbackQuestions(fakeApi(), "admin", bingo.slug, new Date());
    const run = await runFeedback({ api: fakeApi(), admin: "admin", slug: bingo.slug, teams: [team], players, rng: new Rng(11), from: new Date() });
    expect(run.problems).toEqual([]);
    expect(run.responses).toBeGreaterThan(10);
    expect(run.responses).toBeLessThan(players.length);
    expect(run.captainResponses).toBeGreaterThan(0);
    expect(run.captainResponses).toBeLessThanOrEqual(2);
    const results = getFeedbackResults(db, bingo);
    expect(results.feedback.count).toBe(run.responses);
    expect(results.captain.count).toBe(run.captainResponses);
    // Nothing links a response to a Player or the audit log.
    expect(db.select().from(schema.auditLog).all().filter((r) => r.action.startsWith("feedback"))).toEqual([]);
  });

  it("leaves the --me player to find their card", async () => {
    const players = makePlayers(new Rng(5), 12, "testdata-fb");
    players[5]!.isMe = true;
    const team = seedTeams(players);
    await ensureFeedbackQuestions(fakeApi(), "admin", bingo.slug, new Date());
    await runFeedback({ api: fakeApi(), admin: "admin", slug: bingo.slug, teams: [team], players, rng: new Rng(2), from: new Date() });
    const me = db.select().from(schema.users).where(eq(schema.users.id, players[5]!.userId!)).get()!;
    const form = (await import("../../services/feedbackService")).getFeedbackForm(db, bingo, me);
    expect(form).toMatchObject({ open: true, responded: false });
  });

  it("repeats for a seed", async () => {
    const run = async () => {
      sqlite.close();
      ({ sqlite, db } = createTestDb());
      const admin = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin", isAdmin: true }).returning().get();
      bingo = db.insert(schema.bingos).values({ slug: "testdata-fb", name: "FB", boardRows: 3, boardCols: 3, createdByUserId: admin.id, stage: "complete" }).returning().get();
      const players = makePlayers(new Rng(4), 20, "testdata-fb");
      const team = seedTeams(players);
      await ensureFeedbackQuestions(fakeApi(), "admin", bingo.slug, new Date());
      const { responses, captainResponses } = await runFeedback({ api: fakeApi(), admin: "admin", slug: bingo.slug, teams: [team], players, rng: new Rng(3), from: new Date() });
      return [responses, captainResponses];
    };
    expect(await run()).toEqual(await run());
  });
});
