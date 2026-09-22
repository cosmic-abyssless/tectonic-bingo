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

  describe("rows the current build can't read", () => {
    it("shows a settings.updated row that has no `changes` (older data) instead of failing the whole log", () => {
      // The label for this action reads details.changes.after, which such a row doesn't have.
      row({ action: "settings.updated" as AuditAction, details: "{}" });
      row({ action: "team.created" as AuditAction, details: JSON.stringify({ name: "Blue", captainUserId: "u", captainName: "Cap", coCaptainUserId: null, coCaptainName: null, color: null }) });
      const result = queryAuditLog(db, { bingoId: "b1" }, {}, {});
      expect(result.entries).toHaveLength(2);
      const broken = result.entries.find((e) => e.action === "settings.updated")!;
      expect(broken.label).toBe("Settings updated");
      expect(broken.category).toBe("settings");
      // The healthy row next to it still renders its full label.
      expect(result.entries.find((e) => e.action === "team.created")!.label).toContain("Blue");
    });

    it("keeps the same protection on the condensed and team-activity paths", () => {
      row({ action: "settings.updated" as AuditAction, details: "{}" });
      expect(queryAuditLog(db, { bingoId: "b1" }, {}, { condensed: true }).entries).toHaveLength(1);
      row({ action: "team.updated" as AuditAction, teamId: "t1", visibility: "team" as AuditVisibility, details: "{}" });
      expect(queryTeamActivity(db, "b1", "t1", { isMod: true }).entries).toHaveLength(1);
    });

    it("shows a row whose action this build doesn't know as a plain entry", () => {
      row({ action: "feature.long_gone" as AuditAction });
      const [entry] = queryAuditLog(db, { bingoId: "b1" }, {}, {}).entries;
      expect(entry).toMatchObject({ action: "feature.long_gone", label: "feature.long_gone", category: "system", tone: "neutral" });
    });

    it("shows a row whose details aren't valid JSON, with empty details", () => {
      row({ details: "{not json" });
      const [entry] = queryAuditLog(db, { bingoId: "b1" }, {}, {}).entries;
      expect(entry!.details).toEqual({});
    });
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

  it("filters by a since/until window, including both ends", () => {
    for (const day of ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"]) row({ createdAt: new Date(`${day}T12:00:00Z`) });
    const window = queryAuditLog(db, { bingoId: "b1" }, { since: "2026-02-01T12:00:00Z", until: "2026-03-01T12:00:00Z" }, {});
    expect(window.entries.map((e) => e.at)).toEqual(["2026-03-01T12:00:00.000Z", "2026-02-01T12:00:00.000Z"]);
    const untilOnly = queryAuditLog(db, { bingoId: "b1" }, { until: "2026-01-31T00:00:00Z" }, {});
    expect(untilOnly.entries).toHaveLength(1);
  });

  it("returns nothing for a window whose start is after its end", () => {
    row({ createdAt: new Date("2026-02-01T12:00:00Z") });
    expect(queryAuditLog(db, { bingoId: "b1" }, { since: "2026-03-01T00:00:00Z", until: "2026-01-01T00:00:00Z" }, {}).entries).toHaveLength(0);
  });

  it("combines the time window with the other filters and pagination", () => {
    for (let i = 0; i < 4; i++) row({ createdAt: new Date(`2026-05-0${i + 1}T12:00:00Z`), teamId: "t1" });
    row({ createdAt: new Date("2026-05-02T13:00:00Z"), teamId: "t2" });
    const page1 = queryAuditLog(db, { bingoId: "b1" }, { since: "2026-05-02T00:00:00Z", teamId: ["t1"] }, { limit: 2 });
    expect(page1.entries).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = queryAuditLog(db, { bingoId: "b1" }, { since: "2026-05-02T00:00:00Z", teamId: ["t1"] }, { limit: 2, cursor: page1.nextCursor! });
    expect(page2.entries).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
  });

  it("rejects a malformed since or until with a 400", () => {
    for (const filters of [{ since: "yesterday-ish" }, { until: "not a date" }]) {
      let error: unknown;
      try {
        queryAuditLog(db, { bingoId: "b1" }, filters, {});
      } catch (e) {
        error = e;
      }
      expect(error).toMatchObject({ status: 400, message: expect.stringMatching(/valid date/) });
    }
  });

  it("filters by q, matching entityLabel or action", () => {
    row({ entityLabel: "Bruma Warband" });
    row({ entityLabel: "Something else" });
    const result = queryAuditLog(db, { bingoId: "b1" }, { q: "Bruma" }, {});
    expect(result.entries).toHaveLength(1);
  });

  // signups.bingoId is a real FK (unlike audit_log's, which is a plain string so cross-bingo rows can share a
  // fixture without a real bingos row) — an RSN-search test needs an actual bingo for the signup to belong to.
  function seedRealBingo(id: string) {
    const [admin] = db.insert(schema.users).values({ discordId: `admin-${id}`, discordUsername: `admin-${id}` }).returning().all();
    return db.insert(schema.bingos).values({ id, slug: id, name: id, boardRows: 3, boardCols: 3, createdByUserId: admin.id }).returning().get();
  }

  it("filters by q, also matching the actor's Discord name or (bingo-scoped) RSN — not just entityLabel/action", () => {
    seedRealBingo("b1");
    const [withRsn] = db.insert(schema.users).values({ discordId: "u1", discordUsername: "comfy_hug_dc1" }).returning().all();
    const [noRsn] = db.insert(schema.users).values({ discordId: "u2", discordUsername: "dev_admin" }).returning().all();
    db.insert(schema.signups).values({ bingoId: "b1", userId: withRsn.id, rsn: "comfy hug" }).run();
    row({ actorUserId: withRsn.id });
    row({ actorUserId: noRsn.id });

    expect(queryAuditLog(db, { bingoId: "b1" }, { q: "comfy hug" }, {}).entries.map((e) => e.actor?.id)).toEqual([withRsn.id]);
    expect(queryAuditLog(db, { bingoId: "b1" }, { q: "dev_admin" }, {}).entries.map((e) => e.actor?.id)).toEqual([noRsn.id]);
  });

  it("q's RSN match on the actor stays scoped to the row's own bingo", () => {
    seedRealBingo("b1");
    seedRealBingo("b2");
    const [user] = db.insert(schema.users).values({ discordId: "u1", discordUsername: "u1" }).returning().all();
    db.insert(schema.signups).values({ bingoId: "b2", userId: user.id, rsn: "comfy hug" }).run();
    row({ bingoId: "b1", actorUserId: user.id });

    expect(queryAuditLog(db, { bingoId: "b1" }, { q: "comfy hug" }, {}).entries).toHaveLength(0);
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
