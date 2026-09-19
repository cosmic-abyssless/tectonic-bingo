import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { auditLog } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { queryAuditLog, queryTeamActivity } from "./query";
import type { AuditAction, AuditVisibility } from "@bingo/shared";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

let seq = 0;
function row(overrides: Partial<typeof auditLog.$inferInsert> = {}) {
  seq++;
  return db
    .insert(auditLog)
    .values({
      bingoId: "b1",
      // wom.roster_synced's label ignores `details` entirely, so the
      // default row here never needs a shape matching some other action's
      // renderer — only tests that care about a specific action/label
      // override it.
      action: "wom.roster_synced" as AuditAction,
      visibility: "mods" as AuditVisibility,
      actorType: "system",
      actorRole: "system",
      entityType: "bingo",
      entityId: "b1",
      details: "{}",
      createdAt: new Date(2026, 0, 1, 0, 0, seq),
      ...overrides,
    })
    .returning()
    .get();
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
  seq = 0;
});
afterEach(() => {
  sqlite.close();
});

describe("queryAuditLog", () => {
  it("filters by scope.bingoId", () => {
    row({ bingoId: "b1" });
    row({ bingoId: "b2" });
    row({ bingoId: null });

    expect(queryAuditLog(db, { bingoId: "b1" }, {}, {}).entries).toHaveLength(1);
    expect(queryAuditLog(db, { bingoId: null }, {}, {}).entries).toHaveLength(1);
    expect(queryAuditLog(db, { bingoId: "all" }, {}, {}).entries).toHaveLength(3);
  });

  it("filters by action", () => {
    row({ action: "team.created" as AuditAction });
    row({ action: "team.deleted" as AuditAction });
    const result = queryAuditLog(db, { bingoId: "b1" }, { action: ["team.created" as AuditAction] }, {});
    expect(result.entries.map((e) => e.action)).toEqual(["team.created"]);
  });

  it("filters by category (single or multiple), deriving the action set from the registry", () => {
    row({ action: "team.created" as AuditAction }); // category: team
    row({ action: "bingo.created" as AuditAction }); // category: bingo
    row({ action: "signup.created" as AuditAction }); // category: signup
    const result = queryAuditLog(db, { bingoId: "b1" }, { category: ["team"] }, {});
    expect(result.entries.map((e) => e.action)).toEqual(["team.created"]);
    expect(result.entries[0]!.category).toBe("team");

    const multi = queryAuditLog(db, { bingoId: "b1" }, { category: ["team", "bingo"] }, {});
    expect(multi.entries.map((e) => e.action).sort()).toEqual(["bingo.created", "team.created"]);
  });

  it("filters by actorUserId (single or multiple), teamId (single or multiple), entityType/entityId, and visibility", () => {
    const [u1] = db.insert(schema.users).values({ discordId: "u1", discordUsername: "u1" }).returning().all();
    const [u2] = db.insert(schema.users).values({ discordId: "u2", discordUsername: "u2" }).returning().all();
    row({ actorUserId: u1.id, teamId: "t1", entityType: "team", entityId: "t1", visibility: "team" as AuditVisibility });
    row({ actorUserId: u2.id, teamId: "t2", entityType: "submission", entityId: "s1", visibility: "public" as AuditVisibility });

    expect(queryAuditLog(db, { bingoId: "b1" }, { actorUserId: [u1.id] }, {}).entries).toHaveLength(1);
    expect(queryAuditLog(db, { bingoId: "b1" }, { actorUserId: [u1.id, u2.id] }, {}).entries).toHaveLength(2);
    expect(queryAuditLog(db, { bingoId: "b1" }, { teamId: ["t2"] }, {}).entries).toHaveLength(1);
    expect(queryAuditLog(db, { bingoId: "b1" }, { teamId: ["t1", "t2"] }, {}).entries).toHaveLength(2);
    expect(queryAuditLog(db, { bingoId: "b1" }, { entityType: "submission" }, {}).entries).toHaveLength(1);
    expect(queryAuditLog(db, { bingoId: "b1" }, { entityId: "t1" }, {}).entries).toHaveLength(1);
    expect(queryAuditLog(db, { bingoId: "b1" }, { visibility: "public" as AuditVisibility }, {}).entries).toHaveLength(1);
  });

  it("filters by since/until against createdAt", () => {
    row({ createdAt: new Date("2026-01-01T00:00:00Z") });
    row({ createdAt: new Date("2026-06-01T00:00:00Z") });
    const result = queryAuditLog(db, { bingoId: "b1" }, { since: "2026-03-01T00:00:00Z" }, {});
    expect(result.entries).toHaveLength(1);
  });

  it("filters by q, matching entityLabel or action", () => {
    row({ entityLabel: "Bruma Warband" });
    row({ entityLabel: "Something else" });
    const result = queryAuditLog(db, { bingoId: "b1" }, { q: "Bruma" }, {});
    expect(result.entries).toHaveLength(1);
  });

  it("paginates with a keyset cursor, newest first", () => {
    const rows = [row(), row(), row(), row(), row()];
    const page1 = queryAuditLog(db, { bingoId: "b1" }, {}, { limit: 2 });
    expect(page1.entries.map((e) => e.id)).toEqual([rows[4]!.id, rows[3]!.id]);
    expect(page1.nextCursor).toBe(rows[3]!.id);

    const page2 = queryAuditLog(db, { bingoId: "b1" }, {}, { limit: 2, cursor: page1.nextCursor! });
    expect(page2.entries.map((e) => e.id)).toEqual([rows[2]!.id, rows[1]!.id]);
    expect(page2.nextCursor).toBe(rows[1]!.id);

    const page3 = queryAuditLog(db, { bingoId: "b1" }, {}, { limit: 2, cursor: page2.nextCursor! });
    expect(page3.entries.map((e) => e.id)).toEqual([rows[0]!.id]);
    expect(page3.nextCursor).toBeNull();
  });

  it("resolves actor/onBehalfOf/team and renders a label", () => {
    const [actor] = db.insert(schema.users).values({ discordId: "a1", discordUsername: "alice" }).returning().all();
    const [admin] = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().all();
    const bingo = db.insert(schema.bingos).values({ slug: "b1", name: "B1", boardRows: 3, boardCols: 3, createdByUserId: admin.id }).returning().get();
    const team = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: actor.id, name: "Team Alpha", codeword: "cw" }).returning().get();
    row({
      bingoId: bingo.id,
      action: "team.updated" as AuditAction,
      actorUserId: actor.id,
      onBehalfOfUserId: admin.id,
      teamId: team.id,
      entityLabel: "Old Name",
      details: JSON.stringify({ changes: { before: { name: "Old Name" }, after: { name: "New Name" } } }),
    });

    const [entry] = queryAuditLog(db, { bingoId: bingo.id }, {}, {}).entries;
    expect(entry!.actor?.discordUsername).toBe("alice");
    expect(entry!.onBehalfOf?.discordUsername).toBe("admin");
    expect(entry!.team).toEqual({ id: team.id, name: "Team Alpha", color: null });
    expect(entry!.label).toContain("New Name");
  });
});

describe("queryTeamActivity", () => {
  it("a player sees their own team's team/public rows and site-wide public rows, but not mods-only or another team's rows", () => {
    row({ teamId: "teamX", visibility: "team" as AuditVisibility, action: "team.updated" as AuditAction, details: JSON.stringify({ changes: { before: {}, after: {} } }) });
    row({ teamId: "teamX", visibility: "mods" as AuditVisibility, action: "team.deleted" as AuditAction });
    row({ teamId: "teamY", visibility: "public" as AuditVisibility, action: "points.adjusted" as AuditAction });
    row({ teamId: null, visibility: "public" as AuditVisibility, action: "points.adjusted" as AuditAction });
    row({ teamId: null, visibility: "mods" as AuditVisibility, action: "team.deleted" as AuditAction });

    const result = queryTeamActivity(db, "b1", "teamX", { isMod: false });
    expect(result.entries.map((e) => e.action)).toEqual(["points.adjusted", "team.updated"]);
  });

  it("a mod sees every row scoped to the team regardless of visibility (within the allowed categories)", () => {
    row({ teamId: "teamX", visibility: "team" as AuditVisibility, action: "team.updated" as AuditAction, details: JSON.stringify({ changes: { before: {}, after: {} } }) });
    row({ teamId: "teamX", visibility: "mods" as AuditVisibility, action: "team.deleted" as AuditAction });
    row({ teamId: "teamY", visibility: "public" as AuditVisibility, action: "points.adjusted" as AuditAction });

    const result = queryTeamActivity(db, "b1", "teamX", { isMod: true });
    expect(result.entries.map((e) => e.action).sort()).toEqual(["team.deleted", "team.updated"]);
  });

  it("excludes categories irrelevant to a team's own feed (bingo/draft/etc), even for a public row a team could otherwise see", () => {
    row({ teamId: "teamX", visibility: "team" as AuditVisibility, action: "team.updated" as AuditAction, details: JSON.stringify({ changes: { before: {}, after: {} } }) }); // team — kept
    row({ teamId: "teamX", visibility: "team" as AuditVisibility, action: "draft.pick" as AuditAction }); // draft — dropped
    row({ teamId: null, visibility: "public" as AuditVisibility, action: "stage.changed" as AuditAction }); // bingo — dropped
    row({ teamId: null, visibility: "public" as AuditVisibility, action: "draft.started" as AuditAction }); // draft — dropped

    const player = queryTeamActivity(db, "b1", "teamX", { isMod: false });
    expect(player.entries.map((e) => e.action)).toEqual(["team.updated"]);

    // Category filtering applies to the mod view of this feed too — it's a
    // "what happened to this team" highlight reel either way, not the full log.
    const mod = queryTeamActivity(db, "b1", "teamX", { isMod: true });
    expect(mod.entries.map((e) => e.action)).toEqual(["team.updated"]);
  });

  it("condenses runs when asked, keeps points rows, and leaves the cursor counting raw rows", () => {
    const approval = (tileName: string) =>
      row({ teamId: "teamX", visibility: "team" as AuditVisibility, actorType: "user", action: "submission.approved" as AuditAction, details: JSON.stringify({ tileName, taskLabels: [], nodeIds: [], newlyCompletedNodeIds: [], pointsDelta: 20, reviewerNotes: null, submittedByUserId: "u" }) });
    const points = () =>
      row({ teamId: "teamX", visibility: "team" as AuditVisibility, actorType: "user", action: "points.earned" as AuditAction, details: JSON.stringify({ source: "task", nodeId: "n", nodeLabel: "Part A", tileName: "Vorkath", points: 20, submissionId: "s" }) });
    for (const tile of ["A", "B", "C"]) {
      approval(tile);
      points();
    }

    const raw = queryTeamActivity(db, "b1", "teamX", { isMod: true, limit: 4 });
    const condensed = queryTeamActivity(db, "b1", "teamX", { isMod: true, limit: 4, condensed: true });

    expect(raw.entries).toHaveLength(4);
    expect(condensed.nextCursor).toBe(raw.nextCursor);
    // Four raw rows: C's points, approval C, B's points, approval B, become two points lines above one approval line.
    expect(condensed.entries.map((e) => e.action)).toEqual(["points.earned", "points.earned", "submission.approved"]);
    expect(condensed.entries[2]!.condensed?.count).toBe(2);
    expect(condensed.entries[2]!.label).toBe('Someone approved 2 submissions for "C" and "B"');

    const everything = queryTeamActivity(db, "b1", "teamX", { isMod: true, condensed: true });
    expect(everything.entries.map((e) => e.action)).toEqual(["points.earned", "points.earned", "points.earned", "submission.approved"]);
    expect(everything.entries[3]!.condensed?.count).toBe(3);
  });

  it("leaves out automatic screenshot analysis results, for mods too (they stay in the mod panel's audit log)", () => {
    row({ teamId: "teamX", visibility: "mods" as AuditVisibility, action: "submission.screenshot_analysis_failed" as AuditAction });
    row({ teamId: "teamX", visibility: "mods" as AuditVisibility, action: "submission.screenshot_analyzed" as AuditAction });
    row({ teamId: "teamX", visibility: "team" as AuditVisibility, action: "team.updated" as AuditAction, details: JSON.stringify({ changes: { before: {}, after: {} } }) });

    const mod = queryTeamActivity(db, "b1", "teamX", { isMod: true });
    expect(mod.entries.map((e) => e.action)).toEqual(["team.updated"]);

    const full = queryAuditLog(db, { bingoId: "b1" }, {}, {});
    expect(full.entries.map((e) => e.action)).toContain("submission.screenshot_analysis_failed");
  });
});
