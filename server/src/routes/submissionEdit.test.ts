// The mod queue's Edit over HTTP: a real mod router over a real in-memory DB, with the logged-in user faked.
// What an edit does is submissionEdit.test.ts's; this pins who may make one and what the route answers.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { EditSubmissionInput } from "@bingo/shared";
import * as schema from "../db/schema";
import type { SessionUser } from "../types";

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
let actingAs: SessionUser | null = null;
let server: Server;
let base: string;

beforeAll(async () => {
  ({ db, sqlite } = (await import("../db")) as unknown as { db: typeof db; sqlite: typeof sqlite });
  const { default: modRouter } = await import("./mod");
  const { errorHandler } = await import("../middleware/errorHandler");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { user?: SessionUser }).user = actingAs ?? undefined;
    req.isAuthenticated = (() => !!actingAs) as typeof req.isAuthenticated;
    next();
  });
  app.use("/api/bingos/:slug/mod", modRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/bingos/ed/mod`;
});

afterAll(() => {
  server.close();
});

let fx: Awaited<ReturnType<typeof seed>>;

async function seed() {
  sqlite.pragma("foreign_keys = OFF");
  for (const { name } of sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'").all() as { name: string }[]) {
    sqlite.prepare(`DELETE FROM "${name}"`).run();
  }
  sqlite.pragma("foreign_keys = ON");
  const { addModerator } = await import("../services/bingoService");
  const { createTask, createTile } = await import("../services/boardService");
  const { createSubmission } = await import("../services/submissionService");
  const user = (name: string): SessionUser => db.insert(schema.users).values({ discordId: name, discordUsername: name }).returning().get();
  const [mod, alice, bob] = [user("mod"), user("alice"), user("bob")];
  const startsAt = new Date(Math.floor((Date.now() - 24 * 3_600_000) / 1000) * 1000);
  const bingo = db.insert(schema.bingos).values({ slug: "ed", name: "Edit", boardRows: 1, boardCols: 1, createdByUserId: mod.id, stage: "live", startsAt }).returning().get();
  addModerator(db, { bingoId: bingo.id, userId: mod.id });
  const team = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: alice.id, name: "Team A", codeword: "a" }).returning().get();
  db.insert(schema.teamMembers).values([{ teamId: team.id, userId: alice.id, isCaptain: true }, { teamId: team.id, userId: bob.id }]).run();
  const tile = createTile(db, { bingoId: bingo.id, name: "ZULRAH", boardRow: 0, boardCol: 0, hasFreezePeriod: true, freezeDurationMinutes: 120 });
  const fang = createTask(db, tile.id, { kind: "ITEM", itemName: "Tanzanite fang", label: "Fang", points: 10 });
  const submission = createSubmission(db, bingo, { teamId: team.id, submittedByUserId: alice.id, claims: [{ nodeId: fang.id, itemName: "Tanzanite fang" }], screenshotUrl: "/x.png", now: new Date(startsAt.getTime() + 3 * 3_600_000) });
  const form: EditSubmissionInput = {
    expectedUpdatedAt: submission.updatedAt.toISOString(),
    submittedByUserId: alice.id,
    submittedAt: submission.submittedAt.toISOString(),
    status: "pending",
    reviewerNotes: null,
    kind: "drop",
    claims: [{ nodeId: fang.id, quantity: 1 }],
  };
  return { mod, alice, bob, startsAt, submission, form };
}

beforeEach(async () => {
  fx = await seed();
});

async function put(as: SessionUser, body: Partial<EditSubmissionInput>) {
  actingAs = as;
  const res = await fetch(`${base}/submissions/${fx.submission.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...fx.form, ...body }) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("PUT /mod/submissions/:id", () => {
  it("saves a Moderator's edit and answers with the submission and the warnings it was saved over", async () => {
    const { status, body } = await put(fx.mod, { submittedByUserId: fx.bob.id, status: "approved", reviewerNotes: "gg" });
    expect(status).toBe(200);
    expect(body.submission).toMatchObject({ submittedByUserId: fx.bob.id, postedByUserId: fx.alice.id, status: "approved", reviewerNotes: "gg" });
    expect(body.warnings).toEqual([]);
  });

  it("refuses a Player, even on the submission's own Team", async () => {
    expect((await put(fx.alice, { status: "approved" })).status).toBe(403);
  });

  it("answers 422 with the warnings until it's forced", async () => {
    const early = new Date(fx.startsAt.getTime() + 30 * 60_000).toISOString(); // inside ZULRAH's Freeze Period
    const refused = await put(fx.mod, { submittedAt: early });
    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({ code: "edit_warnings", warnings: [{ code: "frozen" }] });
    const forced = await put(fx.mod, { submittedAt: early, force: true });
    expect(forced.status).toBe(200);
    expect(forced.body.warnings).toEqual([expect.objectContaining({ code: "frozen" })]);
  });

  it("answers 409 to a form opened before the submission last changed", async () => {
    expect((await put(fx.mod, { status: "approved" })).status).toBe(200);
    expect((await put(fx.mod, { status: "rejected", reviewerNotes: "no" })).status).toBe(409);
  });
});
