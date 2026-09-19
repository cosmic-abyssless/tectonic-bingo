import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { bingos } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { addModerator, advanceStage, assertBoardEditable, createBingo, deleteBingo, removeModerator, toPublicBingo, updateBingoSettings } from "./bingoService";
import { effectiveStartsAt } from "./bingoStart";
import { createTask, createTile } from "./boardService";
import { createTeam } from "./teamService";
import { ServiceError } from "./errors";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

function seedBingo(overrides: Partial<typeof schema.bingos.$inferInsert> = {}) {
  const [admin] = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().all();
  return db.insert(schema.bingos).values({ slug: "test", name: "Test", boardRows: 3, boardCols: 3, createdByUserId: admin.id, stage: "reveal", ...overrides }).returning().get();
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

describe("advanceStage", () => {
  // The start date is only ever what an admin set. What tile freezes (and the submission gate) run from is
  // the "effective" start: that date, or else when the bingo was last put live (see bingoStart.ts).
  it("never writes a start date: going live with none set leaves it empty, and counts from the moment it went live", () => {
    const bingo = seedBingo({ startsAt: null });
    const now = new Date("2026-03-01T00:00:00Z");

    const updated = advanceStage(db, { bingoId: bingo.id, toStage: "live", changedByUserId: bingo.createdByUserId, now });

    expect(updated.startsAt).toBeNull();
    expect(effectiveStartsAt(db, updated)).toEqual(now);
  });

  it("leaves a start date an admin set alone, whether it is still ahead or already past", () => {
    const now = new Date("2026-03-01T00:00:00Z");
    const bingo = seedBingo();
    for (const scheduled of [new Date("2099-01-01T00:00:00Z"), new Date("2026-02-27T18:00:00Z")]) {
      db.update(bingos).set({ stage: "reveal", startsAt: scheduled }).where(eq(bingos.id, bingo.id)).run();
      const updated = advanceStage(db, { bingoId: bingo.id, toStage: "live", changedByUserId: bingo.createdByUserId, now });
      expect(updated.startsAt).toEqual(scheduled);
      expect(effectiveStartsAt(db, updated)).toEqual(scheduled); // the admin's date wins over the moment it went live
    }
  });

  it("restarts the count when the bingo is put live again (reveal, live, reveal, live), if no start date is set", () => {
    const bingo = seedBingo({ startsAt: null });
    const by = bingo.createdByUserId;
    const first = new Date("2026-03-01T10:00:00Z");
    const second = new Date("2026-03-03T09:00:00Z");

    advanceStage(db, { bingoId: bingo.id, toStage: "live", changedByUserId: by, now: first });
    advanceStage(db, { bingoId: bingo.id, toStage: "reveal", changedByUserId: by, now: new Date("2026-03-02T00:00:00Z") });
    expect(effectiveStartsAt(db, db.select().from(bingos).where(eq(bingos.id, bingo.id)).get()!)).toEqual(first); // while it's back in reveal: still the last time it was live

    const live = advanceStage(db, { bingoId: bingo.id, toStage: "live", changedByUserId: by, now: second });
    expect(effectiveStartsAt(db, live)).toEqual(second);
  });

  it("has no effective start while the bingo has never been live and no date is set", () => {
    const bingo = seedBingo({ startsAt: null });
    expect(effectiveStartsAt(db, bingo)).toBeNull();
  });

  it("records the transition with the time it happened", () => {
    const bingo = seedBingo({ startsAt: null });
    const now = new Date("2026-03-01T00:00:00Z");
    advanceStage(db, { bingoId: bingo.id, toStage: "live", changedByUserId: bingo.createdByUserId, now });
    expect(db.select().from(schema.stageTransitions).where(eq(schema.stageTransitions.bingoId, bingo.id)).get()!.createdAt).toEqual(now);
  });

  it("does not touch startsAt for transitions other than going live", () => {
    const bingo = seedBingo({ stage: "draft", startsAt: null });

    const updated = advanceStage(db, { bingoId: bingo.id, toStage: "reveal", changedByUserId: bingo.createdByUserId });

    expect(updated.startsAt).toBeNull();
  });

  it("allows skipping stages and records the jump as one transition", () => {
    const bingo = seedBingo({ stage: "signup" });
    const updated = advanceStage(db, { bingoId: bingo.id, toStage: "live", changedByUserId: bingo.createdByUserId });
    expect(updated.stage).toBe("live");
    const rows = db.select().from(schema.stageTransitions).where(eq(schema.stageTransitions.bingoId, bingo.id)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ fromStage: "signup", toStage: "live" });
  });

  it("allows jumping back several stages", () => {
    const bingo = seedBingo({ stage: "live" });
    expect(advanceStage(db, { bingoId: bingo.id, toStage: "signup", changedByUserId: bingo.createdByUserId }).stage).toBe("signup");
  });

  it("rejects moving to the current stage", () => {
    const bingo = seedBingo({ stage: "signup" });
    expect(() => advanceStage(db, { bingoId: bingo.id, toStage: "signup", changedByUserId: bingo.createdByUserId })).toThrow();
  });

  it("records the transition in stageTransitions", () => {
    const bingo = seedBingo();
    advanceStage(db, { bingoId: bingo.id, toStage: "live", changedByUserId: bingo.createdByUserId });
    const rows = db.select().from(schema.stageTransitions).where(eq(schema.stageTransitions.bingoId, bingo.id)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ fromStage: "reveal", toStage: "live" });
  });

  it("updates the stage on the bingos row", () => {
    const bingo = seedBingo({ startsAt: null });
    advanceStage(db, { bingoId: bingo.id, toStage: "live", changedByUserId: bingo.createdByUserId });
    expect(db.select().from(bingos).where(eq(bingos.id, bingo.id)).get()!.stage).toBe("live");
  });
});

describe("toPublicBingo", () => {
  it("strips womGroupVerificationCode but keeps every other field", () => {
    const bingo = seedBingo({ womEnabled: true, womGroupId: "123", womGroupVerificationCode: "top-secret" });
    const publicBingo = toPublicBingo(bingo);
    expect(publicBingo).not.toHaveProperty("womGroupVerificationCode");
    expect(publicBingo.womGroupId).toBe("123");
    expect(publicBingo.womEnabled).toBe(true);
    expect(publicBingo.name).toBe(bingo.name);
  });
});

describe("updateBingoSettings — WOM fields", () => {
  it("rejects a non-numeric group ID", () => {
    const bingo = seedBingo();
    expect(() => updateBingoSettings(db, bingo.id, { womGroupId: "not-a-number" })).toThrow(ServiceError);
  });

  it("accepts a numeric group ID and persists WOM settings", () => {
    const bingo = seedBingo();
    const updated = updateBingoSettings(db, bingo.id, { womEnabled: true, womGroupId: "456", womGroupVerificationCode: "secret" });
    expect(updated.womEnabled).toBe(true);
    expect(updated.womGroupId).toBe("456");
    expect(updated.womGroupVerificationCode).toBe("secret");
  });

  it("allows clearing the group ID", () => {
    const bingo = seedBingo({ womGroupId: "123" });
    const updated = updateBingoSettings(db, bingo.id, { womGroupId: null });
    expect(updated.womGroupId).toBeNull();
  });
});

describe("assertBoardEditable", () => {
  it.each(["planning", "signup", "captains", "draft", "reveal"] as const)("allows edits during %s", (stage) => {
    expect(() => assertBoardEditable(seedBingo({ stage }))).not.toThrow();
  });

  it.each(["live", "complete"] as const)("locks the board during %s", (stage) => {
    expect(() => assertBoardEditable(seedBingo({ stage }))).toThrow(ServiceError);
  });
});

describe("deleteBingo", () => {
  it("removes the bingo and every row that hangs off it, leaving other bingos alone", () => {
    const bingo = seedBingo({ stage: "live" });
    const other = db.insert(schema.bingos).values({ slug: "other", name: "Other", boardRows: 3, boardCols: 3, createdByUserId: bingo.createdByUserId }).returning().get();
    const [player] = db.insert(schema.users).values({ discordId: "player", discordUsername: "player" }).returning().all();

    const question = db.insert(schema.signupQuestions).values({ bingoId: bingo.id, prompt: "Q", type: "text" }).returning().get();
    const signup = db.insert(schema.signups).values({ bingoId: bingo.id, userId: player.id, rsn: "player" }).returning().get();
    db.insert(schema.signupAnswers).values({ signupId: signup.id, questionId: question.id, value: "A" }).run();
    const team = createTeam(db, { bingoId: bingo.id, captainUserId: player.id });
    db.insert(schema.draftPicks).values({ bingoId: bingo.id, teamId: team.id, userId: player.id, pickNumber: 1, pickedByUserId: player.id }).run();
    db.insert(schema.teamPointAdjustments).values({ bingoId: bingo.id, teamId: team.id, amount: 5, reason: "r", createdByUserId: bingo.createdByUserId }).run();
    db.insert(schema.stageTransitions).values({ bingoId: bingo.id, fromStage: "planning", toStage: "live", changedByUserId: bingo.createdByUserId }).run();
    db.insert(schema.bingoModerators).values({ bingoId: bingo.id, userId: player.id }).run();

    const category = db.insert(schema.tileCategories).values({ bingoId: bingo.id, label: "C" }).returning().get();
    const tile = createTile(db, { bingoId: bingo.id, name: "T", boardRow: 0, boardCol: 0, categoryId: category.id });
    const task = createTask(db, tile.id, { kind: "ITEM", label: "Leaf", itemName: "Leaf" });
    db.insert(schema.bingoLines).values({ bingoId: bingo.id, nodeId: tile.nodeId, lineType: "row", lineIndex: 0 }).run();
    db.insert(schema.teamNodeState).values({ teamId: team.id, nodeId: task.id, completedAt: new Date() }).run();
    const submission = db.insert(schema.submissions).values({ teamId: team.id, submittedByUserId: player.id }).returning().get();
    db.insert(schema.submissionScreenshots).values({ submissionId: submission.id, storageUrl: "/x.png" }).run();
    db.insert(schema.claims).values({ submissionId: submission.id, nodeId: task.id }).run();

    deleteBingo(db, bingo.id);

    const tables = [
      schema.bingoModerators, schema.stageTransitions, schema.signupQuestions, schema.signups, schema.signupAnswers, schema.teams, schema.teamMembers,
      schema.draftPicks, schema.nodes, schema.nodeEdges, schema.tileCategories, schema.tiles, schema.bingoLines, schema.teamNodeState, schema.submissions,
      schema.submissionScreenshots, schema.claims, schema.teamPointAdjustments,
    ];
    for (const table of tables) expect(db.select().from(table).all()).toEqual([]);
    expect(db.select().from(bingos).all().map((b) => b.id)).toEqual([other.id]);
  });

  it("404s for an unknown bingo", () => {
    expect(() => deleteBingo(db, "nope")).toThrow(ServiceError);
  });
});

describe("audit trail", () => {
  it("createBingo records bingo.created", () => {
    const [admin] = db.insert(schema.users).values({ discordId: "admin2", discordUsername: "admin2" }).returning().all();
    const bingo = createBingo(db, { slug: "audit-test", name: "Audit Test", boardRows: 3, boardCols: 3, createdByUserId: admin.id });
    const rows = db.select().from(schema.auditLog).where(eq(schema.auditLog.bingoId, bingo.id)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "bingo.created", visibility: "mods" });
    expect(JSON.parse(rows[0]!.details)).toMatchObject({ slug: "audit-test", name: "Audit Test", source: "form" });
  });

  it("createBingo records source: \"import\" when passed explicitly", () => {
    const [admin] = db.insert(schema.users).values({ discordId: "admin3", discordUsername: "admin3" }).returning().all();
    const bingo = createBingo(db, { slug: "import-test", name: "Import Test", boardRows: 3, boardCols: 3, createdByUserId: admin.id, source: "import" });
    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.bingoId, bingo.id)).get()!;
    expect(JSON.parse(row.details)).toMatchObject({ source: "import" });
  });

  it("advanceStage records stage.changed with from/to", () => {
    const bingo = seedBingo({ stage: "signup" });
    advanceStage(db, { bingoId: bingo.id, toStage: "live", changedByUserId: bingo.createdByUserId });
    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "stage.changed")).get()!;
    expect(JSON.parse(row.details)).toMatchObject({ from: "signup", to: "live" });
    expect(row.visibility).toBe("public");
  });

  it("deleteBingo records bingo.deleted with counts, before the cascade runs", () => {
    const bingo = seedBingo();
    const [player] = db.insert(schema.users).values({ discordId: "p2", discordUsername: "p2" }).returning().all();
    db.insert(schema.signups).values({ bingoId: bingo.id, userId: player.id, rsn: "p2" }).run();
    createTeam(db, { bingoId: bingo.id, captainUserId: player.id });

    deleteBingo(db, bingo.id);

    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "bingo.deleted")).get()!;
    expect(row.bingoId).toBe(bingo.id);
    expect(JSON.parse(row.details)).toMatchObject({ name: "Test", counts: { teams: 1 } });
  });

  it("addModerator records moderator.added once, and no-ops (no duplicate row) on a repeat add", () => {
    const bingo = seedBingo();
    const [user] = db.insert(schema.users).values({ discordId: "newmod", discordUsername: "newmod" }).returning().all();
    addModerator(db, { bingoId: bingo.id, userId: user.id });
    addModerator(db, { bingoId: bingo.id, userId: user.id });
    const rows = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "moderator.added")).all();
    expect(rows).toHaveLength(1);
  });

  it("removeModerator records moderator.removed, and no-ops for a non-mod", () => {
    const bingo = seedBingo();
    const [user] = db.insert(schema.users).values({ discordId: "rmmod", discordUsername: "rmmod" }).returning().all();
    addModerator(db, { bingoId: bingo.id, userId: user.id });
    removeModerator(db, { bingoId: bingo.id, userId: user.id });
    removeModerator(db, { bingoId: bingo.id, userId: user.id });
    const rows = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "moderator.removed")).all();
    expect(rows).toHaveLength(1);
  });

  it("updateBingoSettings records settings.updated with the WOM verification code redacted, and no-ops on an unchanged patch", () => {
    const bingo = seedBingo();
    updateBingoSettings(db, bingo.id, { name: "Renamed", womGroupVerificationCode: "top-secret" });
    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "settings.updated")).get()!;
    const details = JSON.parse(row.details);
    expect(details.changes.after.name).toBe("Renamed");
    expect(details.changes.after.womGroupVerificationCode).toBe("[redacted]");
    expect(JSON.stringify(details)).not.toContain("top-secret");

    updateBingoSettings(db, bingo.id, { name: "Renamed" });
    const rows = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "settings.updated")).all();
    expect(rows).toHaveLength(1);
  });
});

describe("updateBingoSettings signupMode", () => {
  it("switches mode on an empty bingo but not once anyone has signed up", () => {
    const bingo = seedBingo();
    expect(updateBingoSettings(db, bingo.id, { signupMode: "duo" }).signupMode).toBe("duo");
    const player = db.insert(schema.users).values({ discordId: "p", discordUsername: "p" }).returning().get();
    db.insert(schema.signups).values({ bingoId: bingo.id, userId: player.id, rsn: "p" }).run();
    expect(() => updateBingoSettings(db, bingo.id, { signupMode: "solo" })).toThrow(/can't change once players have signed up/);
    // Re-sending the current mode alongside other settings is fine.
    expect(updateBingoSettings(db, bingo.id, { signupMode: "duo", name: "Renamed" }).name).toBe("Renamed");
  });
});
