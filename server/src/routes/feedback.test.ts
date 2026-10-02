// The Feedback form (CONTEXT.md "Feedback form", docs/adr/0002-anonymous-feedback.md): a Finished Bingo's Players answer
// it anonymously, Moderators and Admins read the results. A real app over a real in-memory DB, with the logged-in user
// faked, hit over HTTP, so the routes, the audit log and the request log are all the real ones.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { eq } from "drizzle-orm";
import type { BroadcastEvent, FeedbackFormResponse, FeedbackResultsResponse, SignupQuestion, Stage } from "@bingo/shared";
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

type Person = "admin" | "mod" | "captain" | "coCaptain" | "player" | "otherPlayer" | "cut" | "bystander";
let db: BetterSQLite3Database<typeof schema>;
let sqlite: Database.Database;
let people: Record<Person, SessionUser>;
let bingo: typeof schema.bingos.$inferSelect;
let actingAs: SessionUser | null = null;
let server: Server;
let base: string;
const logged: string[] = [];

const ORIGINAL_SECRET = process.env.FEEDBACK_SECRET;

beforeAll(async () => {
  process.env.FEEDBACK_SECRET = "test-feedback-secret";
  ({ db, sqlite } = (await import("../db")) as unknown as { db: typeof db; sqlite: typeof sqlite });
  const { default: bingosRouter } = await import("./bingos");
  const { default: modRouter } = await import("./mod");
  const { default: adminRouter } = await import("./admin");
  const { auditContext } = await import("../audit/middleware");
  const { requestLog } = await import("../log");
  const { errorHandler } = await import("../middleware/errorHandler");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { user?: SessionUser }).user = actingAs ? db.select().from(schema.users).where(eq(schema.users.id, actingAs.id)).get() : undefined;
    req.isAuthenticated = (() => !!actingAs) as typeof req.isAuthenticated;
    next();
  });
  app.use(auditContext);
  app.use(requestLog);
  app.use("/api/bingos", bingosRouter);
  app.use("/api/bingos/:slug/mod", modRouter);
  app.use("/api/bingos/:slug/admin", adminRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    logged.push(String(chunk));
    return true;
  });
});

afterAll(() => {
  server.close();
  vi.restoreAllMocks();
  if (ORIGINAL_SECRET === undefined) delete process.env.FEEDBACK_SECRET;
  else process.env.FEEDBACK_SECRET = ORIGINAL_SECRET;
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
  bingo = { ...bingo, stage };
}

async function call(as: Person, method: string, path: string, body?: unknown) {
  actingAs = people[as];
  const res = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as Record<string, unknown> };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 20));
const form = async (as: Person) => (await call(as, "GET", "/bingos/b1/feedback")).body as unknown as FeedbackFormResponse;
const results = async (as: Person) => await call(as, "GET", "/bingos/b1/mod/feedback");
const auditActions = () => db.select({ action: schema.auditLog.action }).from(schema.auditLog).all().map((r) => r.action);

let general: SignupQuestion;
let rating: SignupQuestion;
let captainsOnly: SignupQuestion;

async function addQuestion(body: Record<string, unknown>): Promise<SignupQuestion> {
  const { status, body: res } = await call("admin", "POST", "/bingos/b1/admin/questions", { form: "feedback", ...body });
  expect(status).toBe(201);
  return res.question as SignupQuestion;
}

beforeEach(async () => {
  wipe();
  broadcast.mockClear();
  logged.length = 0;
  people = {
    admin: user("admin", { isAdmin: true }),
    mod: user("mod"),
    captain: user("discord-7731-captain"),
    coCaptain: user("coCaptain"),
    player: user("player"),
    otherPlayer: user("otherPlayer"),
    cut: user("cut"),
    bystander: user("bystander"),
  };
  bingo = db.insert(schema.bingos).values({ slug: "b1", name: "B1", boardRows: 3, boardCols: 3, createdByUserId: people.admin.id, stage: "live" }).returning().get();
  db.insert(schema.bingoModerators).values({ bingoId: bingo.id, userId: people.mod.id }).run();
  const team = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: people.captain.id, name: "Red", codeword: "red" }).returning().get();
  db.insert(schema.teamMembers).values([
    { teamId: team.id, userId: people.captain.id, isCaptain: true },
    { teamId: team.id, userId: people.coCaptain.id, isCoCaptain: true },
    { teamId: team.id, userId: people.player.id },
    { teamId: team.id, userId: people.otherPlayer.id },
  ]).run();
  db.insert(schema.signups).values([{ bingoId: bingo.id, userId: people.cut.id, rsn: "Cut" }, { bingoId: bingo.id, userId: people.player.id, rsn: "Player" }]).run();
  general = await addQuestion({ prompt: "How was it?", type: "textarea" });
  rating = await addQuestion({ prompt: "Which was best?", type: "select", optionsJson: JSON.stringify(["Board", "Teams"]), allowOther: true, required: true });
  captainsOnly = await addQuestion({ prompt: "How was the draft?", type: "text", audience: "captains" });
  setStage("complete");
  logged.length = 0;
  broadcast.mockClear();
});

describe("Feedback questions (Admins)", () => {
  it("take every type with Other, helper text, required, order and audience, and no visibility", async () => {
    setStage("signup");
    const created = [
      await addQuestion({ prompt: "Short", type: "text", helperText: "One line", required: true, sortOrder: 9 }),
      await addQuestion({ prompt: "Long", type: "textarea" }),
      await addQuestion({ prompt: "Yes?", type: "boolean" }),
      await addQuestion({ prompt: "One", type: "select", optionsJson: JSON.stringify(["a", "b"]), allowOther: true }),
      await addQuestion({ prompt: "Many", type: "multiselect", optionsJson: JSON.stringify(["a", "b"]), allowOther: true, audience: "captains" }),
      await addQuestion({ prompt: "Who?", type: "member", multiplePicks: true, maxPicks: 2 }),
    ];
    expect(created.map((q) => q.type)).toEqual(["text", "textarea", "boolean", "select", "multiselect", "member"]);
    expect(created[0]).toMatchObject({ form: "feedback", audience: "all", helperText: "One line", required: true, sortOrder: 9 });
    expect(created[4]).toMatchObject({ audience: "captains", allowOther: true });
    const refused = await call("admin", "POST", "/bingos/b1/admin/questions", { form: "feedback", prompt: "X", type: "text", visibility: "mods" });
    expect(refused.status).toBe(400);
    const badAudience = await call("admin", "POST", "/bingos/b1/admin/questions", { prompt: "X", type: "text", audience: "captains" });
    expect(badAudience.status).toBe(400);
  });

  it("are kept apart from the signup form's, and editable in every stage", async () => {
    await call("admin", "POST", "/bingos/b1/admin/questions", { prompt: "Signup one", type: "text" }).then((r) => expect(r.status).toBe(400));
    setStage("signup");
    expect((await call("admin", "POST", "/bingos/b1/admin/questions", { prompt: "Signup one", type: "text" })).status).toBe(201);
    const signupList = (await call("admin", "GET", "/bingos/b1/admin/questions")).body.questions as SignupQuestion[];
    const feedbackList = (await call("admin", "GET", "/bingos/b1/admin/questions?form=feedback")).body.questions as SignupQuestion[];
    expect(signupList.map((q) => q.prompt)).toEqual(["Signup one"]);
    expect(feedbackList.map((q) => q.prompt)).toEqual(["How was it?", "Which was best?", "How was the draft?"]);
    for (const stage of ["planning", "live", "complete"] as const) {
      setStage(stage);
      const patched = await call("admin", "PATCH", `/bingos/b1/admin/questions/${general.id}`, { prompt: `Edited in ${stage}` });
      expect(patched.status).toBe(200);
    }
  });

  it("reorder only their own form, and changes are audited as signup question changes are", async () => {
    const order = [captainsOnly.id, rating.id, general.id];
    const reordered = await call("admin", "POST", "/bingos/b1/admin/questions/reorder", { form: "feedback", orderedIds: order });
    expect((reordered.body.questions as SignupQuestion[]).map((q) => q.id)).toEqual(order);
    await call("admin", "PATCH", `/bingos/b1/admin/questions/${general.id}`, { audience: "captains" });
    expect((await call("admin", "DELETE", `/bingos/b1/admin/questions/${general.id}`)).status).toBe(204);
    const rows = db.select().from(schema.auditLog).where(eq(schema.auditLog.entityType, "question")).orderBy(schema.auditLog.id).all();
    expect(rows.map((r) => r.action)).toEqual(["question.created", "question.created", "question.created", "question.reordered", "question.updated", "question.deleted"]);
    expect(JSON.parse(rows[0]!.details!)).toMatchObject({ form: "feedback" });
  });

  it("go with their answers when deleted, and the Admin is told how many first", async () => {
    await call("player", "PUT", "/bingos/b1/feedback", { answers: [{ questionId: general.id, value: "Great" }, { questionId: rating.id, value: "Board" }] });
    const counts = (await call("admin", "GET", "/bingos/b1/admin/questions?form=feedback")).body.answerCounts as Record<string, number>;
    expect(counts[general.id]).toBe(1);
    await call("admin", "DELETE", `/bingos/b1/admin/questions/${general.id}`);
    expect(db.select().from(schema.feedbackAnswers).all().map((a) => a.questionId)).toEqual([rating.id]);
    const deleted = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "question.deleted")).get()!;
    expect(JSON.parse(deleted.details!)).toMatchObject({ answersDeleted: 1, form: "feedback" });
  });

  it("can't be managed by a Moderator", async () => {
    expect((await call("mod", "POST", "/bingos/b1/admin/questions", { form: "feedback", prompt: "X", type: "text" })).status).toBe(403);
  });
});

describe("answering", () => {
  it("is closed before Finished, and while a Finished Bingo is reopened, but the answers are kept", async () => {
    await call("player", "PUT", "/bingos/b1/feedback", { answers: [{ questionId: general.id, value: "Great" }, { questionId: rating.id, value: "Board" }] });
    for (const stage of ["reveal", "live"] as const) {
      setStage(stage);
      expect(await form("player")).toMatchObject({ open: false, questions: [], answers: [] });
      expect((await call("player", "PUT", "/bingos/b1/feedback", { answers: [{ questionId: general.id, value: "Changed" }, { questionId: rating.id, value: "Teams" }] })).status).toBe(400);
    }
    setStage("complete");
    const reopened = await form("player");
    expect(reopened.open).toBe(true);
    expect(reopened.answers.map((a) => a.value).sort()).toEqual(["Board", "Great"]);
    expect(reopened.responded).toBe(true);
  });

  it("lets a Player submit and later edit their response, and shows it back to them", async () => {
    const first = await call("player", "PUT", "/bingos/b1/feedback", { answers: [{ questionId: general.id, value: "Fine" }, { questionId: rating.id, value: "Board" }] });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ open: true, responded: true, isCaptain: false });
    expect((first.body.questions as SignupQuestion[]).map((q) => q.prompt)).toEqual(["How was it?", "Which was best?"]);
    const edited = await call("player", "PUT", "/bingos/b1/feedback", { answers: [{ questionId: general.id, value: "Better" }, { questionId: rating.id, value: JSON.stringify({ other: "the Draft" }) }] });
    expect(edited.status).toBe(200);
    expect((await form("player")).answers.find((a) => a.questionId === general.id)?.value).toBe("Better");
    expect(db.select().from(schema.feedbackResponses).all()).toHaveLength(1);
  });

  it("refuses a non-Player, a Cut signup and a non-playing Moderator, and an Admin who didn't play", async () => {
    const answers = [{ questionId: general.id, value: "x" }, { questionId: rating.id, value: "Board" }];
    for (const as of ["bystander", "cut", "mod", "admin"] as const) {
      expect((await call(as, "PUT", "/bingos/b1/feedback", { answers })).status, as).toBe(403);
      expect(await form(as)).toMatchObject({ open: false, questions: [] });
    }
    expect(db.select().from(schema.feedbackResponses).all()).toHaveLength(0);
  });

  it("gives a Captain and a co-captain the Captains-only questions, saved as a separate Captain response", async () => {
    for (const as of ["captain", "coCaptain"] as const) {
      const open = await form(as);
      expect(open.isCaptain).toBe(true);
      expect(open.questions.map((q) => q.prompt)).toEqual(["How was it?", "Which was best?", "How was the draft?"]);
      const saved = await call(as, "PUT", "/bingos/b1/feedback", {
        answers: [{ questionId: general.id, value: "ok" }, { questionId: rating.id, value: "Teams" }],
        captainAnswers: [{ questionId: captainsOnly.id, value: "tense" }],
      });
      expect(saved.status).toBe(200);
      expect(saved.body).toMatchObject({ responded: true, respondedAsCaptain: true });
    }
    const rows = db.select().from(schema.feedbackResponses).all();
    expect(rows.map((r) => r.kind).sort()).toEqual(["captain", "captain", "player", "player"]);
  });

  it("refuses a non-Captain who tries to submit Captains-only answers, or to answer that question as a Player", async () => {
    const answers = [{ questionId: general.id, value: "ok" }, { questionId: rating.id, value: "Teams" }];
    expect((await call("player", "PUT", "/bingos/b1/feedback", { answers, captainAnswers: [{ questionId: captainsOnly.id, value: "x" }] })).status).toBe(403);
    expect((await call("player", "PUT", "/bingos/b1/feedback", { answers: [...answers, { questionId: captainsOnly.id, value: "x" }] })).status).toBe(400);
    expect(db.select().from(schema.feedbackResponses).all()).toHaveLength(0);
  });

  it("checks answers like signup answers: required, the options, no repeats, no unknown questions, something answered", async () => {
    const put = (answers: unknown) => call("player", "PUT", "/bingos/b1/feedback", { answers });
    expect((await put([{ questionId: general.id, value: "only this" }])).status).toBe(400); // required one missing
    expect((await put([{ questionId: rating.id, value: "Nonsense" }])).status).toBe(400);
    expect((await put([{ questionId: rating.id, value: "Board" }, { questionId: rating.id, value: "Teams" }])).status).toBe(400);
    expect((await put([{ questionId: "nope", value: "x" }, { questionId: rating.id, value: "Board" }])).status).toBe(400);
    expect((await put([{ questionId: rating.id, value: "Board" }])).status).toBe(200);
    expect((await put([])).status).toBe(400);
  });
});

describe("anonymity", () => {
  it("stores no user id and no time, and nothing that links a Captain's two responses", async () => {
    await call("captain", "PUT", "/bingos/b1/feedback", {
      answers: [{ questionId: general.id, value: "ok" }, { questionId: rating.id, value: "Teams" }],
      captainAnswers: [{ questionId: captainsOnly.id, value: "tense" }],
    });
    const responses = db.select().from(schema.feedbackResponses).all();
    expect(Object.keys(responses[0]!).sort()).toEqual(["bingoId", "id", "kind", "respondentKey"]);
    expect(Object.keys(db.select().from(schema.feedbackAnswers).get()!).sort()).toEqual(["id", "questionId", "responseId", "value"]);
    const [player, captain] = [responses.find((r) => r.kind === "player")!, responses.find((r) => r.kind === "captain")!];
    expect(player.respondentKey).not.toBe(captain.respondentKey);
    // No value of one is in the other, and none contains the user.
    for (const key of Object.keys(player) as (keyof typeof player)[]) if (key !== "bingoId" && key !== "kind") expect(player[key]).not.toBe(captain[key]);
    const everything = JSON.stringify([responses, db.select().from(schema.feedbackAnswers).all()]);
    expect(everything).not.toContain(people.captain.id);
    expect(everything).not.toContain(people.captain.discordId);
    // WITHOUT ROWID: there's no insertion order to read either.
    expect(() => sqlite.prepare("SELECT rowid FROM feedback_responses").all()).toThrow();
    expect(() => sqlite.prepare("SELECT rowid FROM feedback_answers").all()).toThrow();
  });

  it("writes nothing to the audit log, and tells no one over the WebSocket", async () => {
    const before = db.select().from(schema.auditLog).all().length;
    await call("player", "PUT", "/bingos/b1/feedback", { answers: [{ questionId: general.id, value: "a" }, { questionId: rating.id, value: "Board" }] });
    await call("player", "PUT", "/bingos/b1/feedback", { answers: [{ questionId: general.id, value: "b" }, { questionId: rating.id, value: "Teams" }] });
    await call("player", "GET", "/bingos/b1/feedback");
    await settled();
    expect(db.select().from(schema.auditLog).all()).toHaveLength(before);
    expect(auditActions()).not.toContain("http.mutation");
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("keeps the user out of the request log, and out of every API response", async () => {
    const put = await call("player", "PUT", "/bingos/b1/feedback", { answers: [{ questionId: general.id, value: "a" }, { questionId: rating.id, value: "Board" }] });
    await call("player", "GET", "/bingos/b1/feedback");
    await settled();
    const lines = logged.join("").split("\n").filter((l) => l.includes("/feedback"));
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) {
      expect(line).not.toContain(people.player.id);
      expect(JSON.parse(line)).not.toHaveProperty("userId");
    }
    // Control: another route's line does name the user.
    await call("player", "GET", "/bingos/b1");
    await settled();
    expect(logged.join("")).toContain(people.player.id);
    expect(JSON.stringify(put.body)).not.toContain(people.player.id);
    const read = await results("mod");
    expect(JSON.stringify(read.body)).not.toContain(people.player.id);
  });

  it("finds a Player's response again by the HMAC, so a different secret cuts them off but exposes no one", async () => {
    await call("player", "PUT", "/bingos/b1/feedback", { answers: [{ questionId: general.id, value: "a" }, { questionId: rating.id, value: "Board" }] });
    process.env.FEEDBACK_SECRET = "another-secret";
    try {
      expect(await form("player")).toMatchObject({ open: true, responded: false, answers: [] });
    } finally {
      process.env.FEEDBACK_SECRET = "test-feedback-secret";
    }
    expect((await form("player")).responded).toBe(true);
  });

  it("fails clearly, without a secret", async () => {
    delete process.env.FEEDBACK_SECRET;
    try {
      const res = await call("player", "PUT", "/bingos/b1/feedback", { answers: [{ questionId: general.id, value: "a" }, { questionId: rating.id, value: "Board" }] });
      expect(res.status).toBe(500);
    } finally {
      process.env.FEEDBACK_SECRET = "test-feedback-secret";
    }
  });
});

describe("results (Moderators and Admins)", () => {
  async function respond(as: Person, text: string, option: string, captain?: string) {
    const res = await call(as, "PUT", "/bingos/b1/feedback", {
      answers: [{ questionId: general.id, value: text }, { questionId: rating.id, value: option }],
      ...(captain ? { captainAnswers: [{ questionId: captainsOnly.id, value: captain }] } : {}),
    });
    expect(res.status).toBe(200);
  }

  it("count the responses, step through them in a stable shuffled order and total the choices", async () => {
    await respond("player", "p1", "Board");
    await respond("otherPlayer", "p2", "Teams");
    await respond("captain", "p3", JSON.stringify({ other: "hybrid" }), "c1");
    await respond("coCaptain", "p4", "Board", "c2");
    const first = (await results("mod")).body as unknown as FeedbackResultsResponse;
    expect(first.feedback.count).toBe(4);
    expect(first.captain.count).toBe(2);
    expect(first.feedback.totals[rating.id]).toEqual([
      { option: "Board", count: 2 },
      { option: "Teams", count: 1 },
      { option: "Other", count: 1 },
    ]);
    expect(first.captain.totals[captainsOnly.id]).toBeUndefined(); // free text has no totals
    expect(first.feedback.responses.map((r) => r.answers.find((a) => a.questionId === general.id)!.value).sort()).toEqual(["p1", "p2", "p3", "p4"]);
    const again = (await results("admin")).body as unknown as FeedbackResultsResponse;
    expect(again.feedback.responses).toEqual(first.feedback.responses);
    expect(again.captain.responses.map((r) => r.answers[0]!.value).sort()).toEqual(["c1", "c2"]);
    // Order by the responses' ids, not by when they came in.
    const ids = db.select({ id: schema.feedbackResponses.id }).from(schema.feedbackResponses).where(eq(schema.feedbackResponses.kind, "player")).orderBy(schema.feedbackResponses.id).all();
    expect(ids).toHaveLength(4);
  });

  it("are refused to Players and Captains", async () => {
    await respond("player", "p1", "Board");
    for (const as of ["player", "captain", "coCaptain", "bystander"] as const) expect((await results(as)).status, as).toBe(403);
  });

  it("show yes/no totals and member picks by current name", async () => {
    const yesNo = await addQuestion({ prompt: "Again?", type: "boolean" });
    const pick = await addQuestion({ prompt: "MVP?", type: "member" });
    db.update(schema.users).set({ inGuild: true, discordGlobalName: "Zezima" }).where(eq(schema.users.id, people.otherPlayer.id)).run();
    await call("player", "PUT", "/bingos/b1/feedback", {
      answers: [{ questionId: rating.id, value: "Board" }, { questionId: yesNo.id, value: "true" }, { questionId: pick.id, value: JSON.stringify([people.otherPlayer.id]) }],
    });
    const read = (await results("mod")).body as unknown as FeedbackResultsResponse;
    expect(read.feedback.totals[yesNo.id]).toEqual([{ option: "Yes", count: 1 }, { option: "No", count: 0 }]);
    const mvp = read.feedback.responses[0]!.answers.find((a) => a.questionId === pick.id)!.value;
    expect(JSON.parse(mvp)).toEqual([{ id: people.otherPlayer.id, name: expect.any(String) }]);
  });
});
