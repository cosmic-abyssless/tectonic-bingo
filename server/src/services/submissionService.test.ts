import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { GraphNodeInput } from "@bingo/shared";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTile, createTask } from "./boardService";
import { getTeamNodeStatuses } from "./boardService";
import { getNodeTree } from "./graphService";
import { createSubmission, getAllSubmissionsForBingo, getTeamSubmissions, markScreenshotAnalysisFailed, recordScreenshotAnalysis } from "./submissionService";
import { ServiceError } from "./errors";
import { runWithAuditContext } from "../audit/context";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

const NOW = new Date("2026-03-01T12:00:00Z");
const STARTS_AT = new Date("2026-03-01T10:00:00Z");

function seed(bingoOverrides: Partial<typeof schema.bingos.$inferInsert> = {}) {
  const [admin] = db.insert(schema.users).values({ discordId: "mod", discordUsername: "mod" }).returning().all();
  const [member] = db.insert(schema.users).values({ discordId: "member", discordUsername: "member" }).returning().all();
  const [captain] = db.insert(schema.users).values({ discordId: "captain", discordUsername: "captain" }).returning().all();
  const [bingo] = db
    .insert(schema.bingos)
    .values({
      slug: "test", name: "Test Bingo", boardRows: 3, boardCols: 3, createdByUserId: admin.id,
      stage: "live", startsAt: STARTS_AT, ...bingoOverrides,
    })
    .returning()
    .all();
  const [team] = db
    .insert(schema.teams)
    .values({ bingoId: bingo.id, captainUserId: captain.id, name: "Team A", codeword: "test-word" })
    .returning()
    .all();
  return { bingo, teamId: team.id, memberUserId: member.id };
}

function addTile(bingoId: string, opts: Partial<Parameters<typeof createTile>[1]> = {}) {
  return createTile(db, { bingoId, name: "Tile", boardRow: 0, boardCol: 0, ...opts });
}

// Creates a task that's a bare leaf ("x" item, or MANUAL) so its own node id is the leaf id.
function addTask(tileId: string, opts: { sortOrder?: number; points: number; scoringMode?: "automatic" | "manual"; submitRequiresPrevious?: boolean; pointsRequirePrevious?: boolean }) {
  const base: GraphNodeInput = opts.scoringMode === "manual" ? { kind: "MANUAL" } : { kind: "ITEM", itemName: "x" };
  const task = createTask(db, tileId, { ...base, label: `Task ${opts.sortOrder ?? 0}`, description: "desc", points: opts.points }, opts.sortOrder);
  return { ...task, leafId: task.id };
}

const base = { screenshotUrl: "/x.png", now: NOW };

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});

afterEach(() => {
  sqlite.close();
});

describe("createSubmission", () => {
  it("stamps the submission with the request's clock (dev X-Dev-Now), not the real time", () => {
    const { bingo, teamId, memberUserId } = seed();
    const task = addTask(addTile(bingo.id).id, { sortOrder: 0, points: 20 });
    const at = new Date("2026-03-04T21:30:00Z"); // well after the bingo started

    const submission = runWithAuditContext({ requestId: "r", actorUserId: null, actorType: "system", actorRole: "system", recorded: 0, skip: null, now: at }, () =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId: task.leafId, itemName: "x" }], screenshotUrl: "/x.png" }),
    );

    expect(submission.submittedAt).toEqual(at);
    expect(submission.createdAt).toEqual(at);
    const screenshot = db.select().from(schema.submissionScreenshots).where(eq(schema.submissionScreenshots.submissionId, submission.id)).get()!;
    expect(screenshot.uploadedAt).toEqual(at);
    const audited = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "submission.created")).get()!;
    expect(audited.createdAt).toEqual(at);
  });

  it("succeeds on a plain task and marks it pending_approval", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });

    const submission = createSubmission(db, bingo, {
      teamId, submittedByUserId: memberUserId, claims: [{ nodeId: task.leafId, itemName: "x" }], ...base,
    });

    expect(submission.status).toBe("pending");
    const statuses = getTeamNodeStatuses(db, teamId, bingo.id);
    expect(statuses.get(task.id)).toBe("pending_approval");
  });

  it("requires at least one claim, and an itemName on ITEM claims but not MANUAL ones", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const manualTask = addTask(tile.id, { sortOrder: 0, points: 20, scoringMode: "manual" });
    const autoTask = addTask(tile.id, { sortOrder: 1, points: 20 });

    expect(() => createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [], ...base })).toThrow(/At least one claim/);
    expect(() =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId: manualTask.leafId }], ...base }),
    ).not.toThrow();
    expect(() =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId: autoTask.leafId }], ...base }),
    ).toThrow(/itemName is required/);
  });

  it("rejects an itemName that doesn't match the target leaf's own name", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const task = addTask(tile.id, { sortOrder: 0, points: 20 }); // leaf's itemName is "x"

    expect(() =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId: task.leafId, itemName: "not x" }], ...base }),
    ).toThrow(/does not match/);
    // Case-insensitive match still succeeds.
    expect(() =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId: task.leafId, itemName: "X" }], ...base }),
    ).not.toThrow();
  });

  it("rejects a submission that claims the same node twice", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });

    expect(() =>
      createSubmission(db, bingo, {
        teamId, submittedByUserId: memberUserId, ...base,
        claims: [{ nodeId: task.leafId, itemName: "x", quantity: 1 }, { nodeId: task.leafId, itemName: "x", quantity: 2 }],
      }),
    ).toThrow(/same requirement twice/);
  });

  it("rejects claims that do not target a requirement leaf", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const task = createTask(db, tile.id, { kind: "ALL", label: "T", description: "d", points: 20, children: [{ kind: "ITEM", itemName: "x" }] });

    expect(() =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId: task.id, itemName: "x" }], ...base }),
    ).toThrow(/requirement leaves/);
    expect(() =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId: "missing", itemName: "x" }], ...base }),
    ).toThrow(/requirement leaves/);
  });

  it("rejects claims spanning more than one tile, and marks every touched task pending", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const otherTile = addTile(bingo.id, { boardCol: 1 });
    const task1 = addTask(tile.id, { sortOrder: 0, points: 20 });
    const task2 = addTask(tile.id, { sortOrder: 1, points: 20 });
    const otherTask = addTask(otherTile.id, { sortOrder: 0, points: 20 });

    expect(() =>
      createSubmission(db, bingo, {
        teamId, submittedByUserId: memberUserId, ...base,
        claims: [{ nodeId: task1.leafId, itemName: "x" }, { nodeId: otherTask.leafId, itemName: "x" }],
      }),
    ).toThrow(/same tile/);

    createSubmission(db, bingo, {
      teamId, submittedByUserId: memberUserId, ...base,
      claims: [{ nodeId: task1.leafId, itemName: "x" }, { nodeId: task2.leafId, itemName: "x" }],
    });
    const statuses = getTeamNodeStatuses(db, teamId, bingo.id);
    expect(statuses.get(task1.id)).toBe("pending_approval");
    expect(statuses.get(task2.id)).toBe("pending_approval");
  });

  it("rejects when the bingo is not live", () => {
    const { bingo, teamId, memberUserId } = seed({ stage: "reveal" });
    const tile = addTile(bingo.id);
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });
    expect(() =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId: task.leafId, itemName: "x" }], ...base }),
    ).toThrow(ServiceError);
  });

  it("rejects before the bingo has started", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });
    const before = new Date(STARTS_AT.getTime() - 1000);
    expect(() =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId: task.leafId, itemName: "x" }], screenshotUrl: "/x.png", now: before }),
    ).toThrow(/has not started/);
  });

  it("rejects a frozen tile until the freeze window elapses, then accepts", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id, { hasFreezePeriod: true, freezeDurationMinutes: 120 });
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });
    const claims = [{ nodeId: task.leafId, itemName: "x" }];

    const stillFrozen = new Date(STARTS_AT.getTime() + 60 * 60_000); // +1h, freeze is 2h
    expect(() =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims, screenshotUrl: "/x.png", now: stillFrozen }),
    ).toThrow(/frozen/);

    const unfrozen = new Date(STARTS_AT.getTime() + 121 * 60_000); // +2h1m
    expect(() =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims, screenshotUrl: "/x.png", now: unfrozen }),
    ).not.toThrow();
  });

  describe("with no start date set, the freeze runs from when the bingo was last put live", () => {
    const wentLive = (bingo: { id: string; createdByUserId: string }, at: Date) =>
      db.insert(schema.stageTransitions).values({ bingoId: bingo.id, fromStage: "reveal", toStage: "live", changedByUserId: bingo.createdByUserId, createdAt: at }).run();
    const attempt = (bingo: Parameters<typeof createSubmission>[1], teamId: string, memberUserId: string, nodeId: string, now: Date) =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId, itemName: "x" }], screenshotUrl: "/x.png", now });

    it("counts from the moment it went live, and is frozen until the window is over", () => {
      const { bingo, teamId, memberUserId } = seed({ startsAt: null });
      const live = new Date("2026-03-01T10:00:00Z");
      wentLive(bingo, live);
      const task = addTask(addTile(bingo.id, { hasFreezePeriod: true, freezeDurationMinutes: 120 }).id, { sortOrder: 0, points: 20 });

      expect(() => attempt(bingo, teamId, memberUserId, task.leafId, new Date(live.getTime() + 60 * 60_000))).toThrow(/frozen/);
      expect(() => attempt(bingo, teamId, memberUserId, task.leafId, new Date(live.getTime() + 121 * 60_000))).not.toThrow();
    });

    it("restarts when it is put live again", () => {
      const { bingo, teamId, memberUserId } = seed({ startsAt: null });
      wentLive(bingo, new Date("2026-03-01T10:00:00Z"));
      const second = new Date("2026-03-05T10:00:00Z");
      wentLive(bingo, second);
      const task = addTask(addTile(bingo.id, { hasFreezePeriod: true, freezeDurationMinutes: 120 }).id, { sortOrder: 0, points: 20 });

      // Days after the first time it went live, but only an hour after the second.
      expect(() => attempt(bingo, teamId, memberUserId, task.leafId, new Date(second.getTime() + 60 * 60_000))).toThrow(/frozen/);
    });

    it("is not started at all if the bingo was never put live and has no date", () => {
      const { bingo, teamId, memberUserId } = seed({ startsAt: null });
      const task = addTask(addTile(bingo.id).id, { sortOrder: 0, points: 20 });
      expect(() => attempt(bingo, teamId, memberUserId, task.leafId, NOW)).toThrow(/has not started/);
    });

    it("prefers the date an admin set, even over a later time it went live", () => {
      const startsAt = new Date("2026-03-10T12:00:00Z");
      const { bingo, teamId, memberUserId } = seed({ startsAt });
      wentLive(bingo, new Date("2026-03-01T00:00:00Z")); // put live early, before the start date
      const task = addTask(addTile(bingo.id, { hasFreezePeriod: true, freezeDurationMinutes: 120 }).id, { sortOrder: 0, points: 20 });

      expect(() => attempt(bingo, teamId, memberUserId, task.leafId, new Date("2026-03-05T00:00:00Z"))).toThrow(/has not started/); // live, but before the date
      expect(() => attempt(bingo, teamId, memberUserId, task.leafId, new Date(startsAt.getTime() + 60 * 60_000))).toThrow(/frozen/); // 26h-style: frozen until date + freeze
      expect(() => attempt(bingo, teamId, memberUserId, task.leafId, new Date(startsAt.getTime() + 121 * 60_000))).not.toThrow();
    });
  });

  it("rejects submitGateNodeId until the gate is completed for the team, then accepts", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const task1 = addTask(tile.id, { sortOrder: 0, points: 20 });
    const task2 = createTask(db, tile.id, { kind: "ITEM", itemName: "x", label: "Task 1", description: "desc", points: 20, submitGateNodeId: task1.leafId }, 1);
    const claims = [{ nodeId: task2.id, itemName: "x" }];

    expect(() => createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims, ...base })).toThrow(/must be completed first/);

    db.insert(schema.teamNodeState).values({ teamId, nodeId: task1.leafId, completedAt: NOW, pointsAwarded: 20 }).run();

    expect(() => createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims, ...base })).not.toThrow();
  });

});

// PETS and SLAYER BOSSES: two pages that share their items, Page 2 submit-gated behind Page 1. An item counts
// toward both pages, so it must stay submittable while only the ungated page is unlocked; an item that sits only
// under a gated page still waits for its gate.
describe("submit gates on pages that share items", () => {
  function sharedPages() {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const page1 = createTask(db, tile.id, { kind: "COUNT", minCount: 1, label: "Page 1", description: "d", points: 40, children: [{ kind: "ITEM", itemName: "A" }, { kind: "ITEM", itemName: "B" }] }, 0);
    const page2 = createTask(db, tile.id, { kind: "COUNT", minCount: 2, label: "Page 2", description: "d", points: 60, submitGateNodeId: page1.id, children: [{ kind: "ITEM", itemName: "C" }] }, 1);
    const [a, b] = page1.children;
    // Page 2 reuses Page 1's two items (the same nodes), as the real import does.
    [a!, b!].forEach((leaf, i) => db.insert(schema.nodeEdges).values({ parentId: page2.id, childId: leaf.id, sortOrder: i + 1 }).run());
    const c = getNodeTree(db, page2.id)!.children.find((n) => n.itemName === "C")!;
    const submit = (nodeId: string, itemName: string) => () =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId, itemName }], ...base });
    return { bingo, teamId, memberUserId, page1, a: a!, b: b!, c, submit };
  }

  it("accepts a shared item while the gated page is still locked, because it counts toward the ungated one", () => {
    const { a, submit } = sharedPages();
    expect(submit(a.id, "A")).not.toThrow();
  });

  it("still refuses an item that sits only under the gated page, until the gate is complete", () => {
    const { teamId, page1, c, submit } = sharedPages();
    expect(submit(c.id, "C")).toThrow(/Page 2: the previous requirement must be completed first/);
    db.insert(schema.teamNodeState).values({ teamId, nodeId: page1.id, completedAt: NOW, pointsAwarded: 40 }).run();
    expect(submit(c.id, "C")).not.toThrow();
  });

  it("refuses a submission that mixes a shared item with one that is still locked", () => {
    const { bingo, teamId, memberUserId, a, c } = sharedPages();
    expect(() =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId: a.id, itemName: "A" }, { nodeId: c.id, itemName: "C" }], ...base }),
    ).toThrow(/must be completed first/);
  });

  it("refuses an item shared by two pages when every page it counts toward is gated", () => {
    const { bingo, teamId, memberUserId, page1 } = sharedPages();
    const tile = db.select().from(schema.tiles).all()[0]!;
    const page3 = createTask(db, tile.id, { kind: "COUNT", minCount: 1, label: "Page 3", description: "d", points: 10, submitGateNodeId: page1.id, children: [{ kind: "ITEM", itemName: "D" }] }, 2);
    const page4 = createTask(db, tile.id, { kind: "COUNT", minCount: 1, label: "Page 4", description: "d", points: 10, submitGateNodeId: page1.id, children: [] }, 3);
    db.insert(schema.nodeEdges).values({ parentId: page4.id, childId: page3.children[0]!.id, sortOrder: 0 }).run();

    expect(() =>
      createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId: page3.children[0]!.id, itemName: "D" }], ...base }),
    ).toThrow(/must be completed first/);
  });
});

describe("audit trail", () => {
  it("createSubmission records submission.created scoped to the team, with the claims and screenshot", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });

    const submission = createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId: task.leafId, itemName: "x" }], ...base });

    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "submission.created")).get()!;
    expect(row.teamId).toBe(teamId);
    expect(row.visibility).toBe("team");
    const details = JSON.parse(row.details);
    expect(details.tileName).toBe("Tile");
    expect(details.taskLabels).toEqual(["Task 0"]);
    expect(details.claims).toEqual([{ nodeId: task.leafId, itemName: "x", quantity: 1 }]);
    expect(details.screenshotUrl).toBe("/x.png");
    expect(row.requestId).toBeNull();
    expect(submission.status).toBe("pending");
  });

  it("recordScreenshotAnalysis / markScreenshotAnalysisFailed record system-actor entries scoped to the submission's team", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });
    const submission = createSubmission(db, bingo, { teamId, submittedByUserId: memberUserId, claims: [{ nodeId: task.leafId, itemName: "x" }], ...base });

    recordScreenshotAnalysis(db, submission.id, { extractedText: ["codeword"], codewordFound: true, detectedItemName: "x" });
    const analyzed = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "submission.screenshot_analyzed")).get()!;
    expect(analyzed.actorType).toBe("system");
    expect(analyzed.teamId).toBe(teamId);
    expect(JSON.parse(analyzed.details)).toMatchObject({ codewordVerified: true, detectedItemName: "x" });

    markScreenshotAnalysisFailed(db, submission.id);
    const failed = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "submission.screenshot_analysis_failed")).get()!;
    expect(failed.actorType).toBe("system");
    expect(failed.teamId).toBe(teamId);
  });
});

describe("getTeamSubmissions / getAllSubmissionsForBingo", () => {
  it("attaches screenshots, claims, and the submitter's user row", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id);
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });
    createSubmission(db, bingo, {
      teamId, submittedByUserId: memberUserId, claims: [{ nodeId: task.leafId, itemName: "x", quantity: 2 }], screenshotUrl: "/uploads/x.png", now: NOW,
    });

    const [detail] = getTeamSubmissions(db, teamId);
    expect(detail!.screenshots).toHaveLength(1);
    expect(detail!.screenshots[0]!.storageUrl).toBe("/uploads/x.png");
    expect(detail!.claims).toEqual([expect.objectContaining({ nodeId: task.leafId, itemName: "x", quantity: 2 })]);
    expect(detail!.submittedByUser?.discordUsername).toBe("member");
  });

  it("includes touched leaves, tile, and team info scoped to the bingo", () => {
    const { bingo, teamId, memberUserId } = seed();
    const tile = addTile(bingo.id, { name: "Wintertodt" });
    const task = addTask(tile.id, { sortOrder: 0, points: 20 });
    createSubmission(db, bingo, {
      teamId, submittedByUserId: memberUserId, claims: [{ nodeId: task.leafId, itemName: "x" }], screenshotUrl: "/uploads/x.png", now: NOW,
    });

    const [row] = getAllSubmissionsForBingo(db, bingo.id);
    expect(row!.tile.name).toBe("Wintertodt");
    expect(row!.leaves.map((l) => l.id)).toEqual([task.leafId]);
    expect(row!.team).toEqual(expect.objectContaining({ id: teamId, name: "Team A" }));
    expect(row!.screenshots).toHaveLength(1);
  });
});
