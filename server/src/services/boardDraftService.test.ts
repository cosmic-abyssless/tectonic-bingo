// The Draft board (CONTEXT.md "Draft board", "Publish", #437): edits made to the draft change nothing anyone else
// sees until a Publish, which applies exactly what was previewed, keeps the id of every row both boards have, and
// rescores every Team.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { STALE_PREVIEW_CODE } from "@bingo/shared";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createCategory, createTask, createTile, deleteTask, deleteTile, generateLines, getBoardForViewer, getBoardTiles, updateNode, updateTile, updateTileBonusPoints } from "./boardService";
import { discardDraft, editDraft, getDraftStatus, getEditorBoard, getPublishPreview, hasDraft, publishDraft, updateDraftRules } from "./boardDraftService";
import { DRAFT_BOARD } from "./boardTables";
import { createSubmission } from "./submissionService";
import { approveSubmission } from "./scoringService";
import { getTeamProgress } from "./teamService";
import { exportBingo, importBingo } from "./bingoExportService";
import { deleteBingo, toViewerBingo } from "./bingoService";
import { ServiceError } from "./errors";
import { addTextTag, getBoardTags, removeTag, tileSearchTags } from "./tagService";

vi.mock("../ws", () => ({ broadcast: vi.fn() }));

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

function seed() {
  const admin = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin", isAdmin: true }).returning().get();
  const member = db.insert(schema.users).values({ discordId: "member", discordUsername: "member" }).returning().get();
  const other = db.insert(schema.users).values({ discordId: "other", discordUsername: "other" }).returning().get();
  const bingo = db
    .insert(schema.bingos)
    .values({ slug: "live", name: "Live Bingo", boardRows: 2, boardCols: 2, stage: "live", startsAt: new Date("2026-01-01"), rulesMarkdown: "Old rules", createdByUserId: admin.id })
    .returning()
    .get();
  const teamA = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: member.id, name: "Team A", codeword: "alpha" }).returning().get();
  const teamB = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: other.id, name: "Team B", codeword: "bravo" }).returning().get();
  db.insert(schema.teamMembers).values([{ teamId: teamA.id, userId: member.id, isCaptain: true }, { teamId: teamB.id, userId: other.id, isCaptain: true }]).run();

  const vorkath = createTile(db, { bingoId: bingo.id, name: "Vorkath", boardRow: 0, boardCol: 0 });
  const head = createTask(db, vorkath.id, { kind: "ITEM", label: "Head", points: 40, itemName: "Vorkath's head" });
  const visage = createTask(db, vorkath.id, { kind: "ITEM", label: "Visage", points: 20, itemName: "Draconic visage" });
  const zulrah = createTile(db, { bingoId: bingo.id, name: "Zulrah", boardRow: 0, boardCol: 1 });
  const page = createTask(db, zulrah.id, { kind: "ANY", label: "Page 1", points: 30, children: [{ kind: "ITEM", itemName: "Tanzanite fang" }, { kind: "ITEM", itemName: "Magic fang" }] });
  return { bingo, admin, member, other, teamA, teamB, vorkath, head, visage, zulrah, page };
}

type Seeded = ReturnType<typeof seed>;

function claim(s: Seeded, nodeId: string, itemName: string, opts: { approve?: boolean; team?: "A" | "B" } = {}) {
  const team = opts.team === "B" ? s.teamB : s.teamA;
  const by = opts.team === "B" ? s.other : s.member;
  const submission = createSubmission(db, s.bingo, { teamId: team.id, submittedByUserId: by.id, screenshotUrl: "/x.png", now: new Date("2026-01-02"), claims: [{ nodeId, itemName }] });
  if (opts.approve !== false) approveSubmission(db, { submissionId: submission.id, reviewedByUserId: s.admin.id });
  return submission;
}

const points = (teamId: string) => getTeamProgress(db, teamId).totalPoints;
const publishedTile = (s: Seeded, name: string) => getBoardForViewer(db, s.bingo, false).tiles.find((t) => "node" in t && t.name === name) as ReturnType<typeof getBoardTiles>[number];
const draftTile = (s: Seeded, name: string) => getBoardTiles(db, s.bingo.id, DRAFT_BOARD).find((t) => t.name === name)!;
const asDraft = <T>(s: Seeded, edit: Parameters<typeof editDraft<T>>[3]) => editDraft(db, s.bingo.id, s.admin.id, edit);
const setHeadPoints = (s: Seeded, value: number) => asDraft(s, (t) => updateNode(db, s.head.id, { kind: "ITEM", label: "Head", points: value, itemName: "Vorkath's head" }, t));

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

describe("draft isolation", () => {
  it("an edit to a Tile's points during Live changes neither what Players see nor any Team's score until published", () => {
    const s = seed();
    claim(s, s.head.id, "Vorkath's head");
    expect(points(s.teamA.id)).toBe(40);

    setHeadPoints(s, 60);

    expect(publishedTile(s, "Vorkath").node.children[0]!.points).toBe(40);
    expect(points(s.teamA.id)).toBe(40);
    expect(draftTile(s, "Vorkath").node.children[0]!.points).toBe(60);
    expect(getEditorBoard(db, s.bingo.id).board.tiles.find((t) => t.name === "Vorkath")!.node.children[0]!.points).toBe(60);
  });

  it("writes no audit entry per draft edit, which Moderators would see", () => {
    const s = seed();
    const before = db.select().from(schema.auditLog).all().length;
    setHeadPoints(s, 60);
    asDraft(s, (t) => createTile(db, { bingoId: s.bingo.id, name: "Secret", boardRow: 1, boardCol: 1 }, t));
    expect(db.select().from(schema.auditLog).all()).toHaveLength(before);
  });

  it("records who changed it last, and has no draft once an edit brings it back level with the Published board", () => {
    const s = seed();
    expect(getDraftStatus(db, s.bingo.id)).toMatchObject({ hasChanges: false, updatedBy: null });
    setHeadPoints(s, 60);
    expect(getDraftStatus(db, s.bingo.id)).toMatchObject({ hasChanges: true, updatedBy: { id: s.admin.id, name: "admin" } });
    setHeadPoints(s, 40);
    expect(hasDraft(db, s.bingo.id)).toBe(false);
    expect(getDraftStatus(db, s.bingo.id).hasChanges).toBe(false);
  });

  it("rolls a refused edit back, draft and all", () => {
    const s = seed();
    expect(() => asDraft(s, (t) => createTile(db, { bingoId: s.bingo.id, name: "Clash", boardRow: 0, boardCol: 0 }, t))).toThrow(ServiceError);
    expect(hasDraft(db, s.bingo.id)).toBe(false);
  });

  it("keeps a new Tile picture to the draft: Players see the old one until it's published", () => {
    const s = seed();
    asDraft(s, (t) => updateTile(db, s.vorkath.id, { imageUrl: "/uploads/tiles/new.png" }, t));
    expect(publishedTile(s, "Vorkath").imageUrl).toBeNull();
    expect(JSON.stringify(getBoardForViewer(db, s.bingo, true))).not.toContain("new.png");
    expect(JSON.stringify(exportBingo(db, s.bingo.id))).not.toContain("new.png");
    expect(draftTile(s, "Vorkath").imageUrl).toBe("/uploads/tiles/new.png");
  });

  it("puts the Exclusive Item rules and the Rules text through the draft", () => {
    const s = seed();
    updateDraftRules(db, s.bingo.id, s.admin.id, { rulesMarkdown: "New rules", exclusivityRules: [{ id: "r1", label: "Fangs", itemNames: ["Tanzanite fang"], scope: "tile" }] });
    const bingo = db.select().from(schema.bingos).where(eq(schema.bingos.id, s.bingo.id)).get()!;
    expect(toViewerBingo(bingo, false)).toMatchObject({ rulesMarkdown: "Old rules", exclusivityRules: [] });
    expect(getEditorBoard(db, s.bingo.id)).toMatchObject({ rulesMarkdown: "New rules", exclusivityRules: [{ label: "Fangs" }] });
  });
});

describe("Publish", () => {
  it("previews the diff and each Team's points, then publishes exactly that: Players see the new points and scores match", () => {
    const s = seed();
    claim(s, s.head.id, "Vorkath's head");
    setHeadPoints(s, 60);

    const preview = getPublishPreview(db, s.bingo.id);
    const vorkath = preview.diff.tiles.find((t) => t.name === "Vorkath")!;
    expect(vorkath.change).toBe("changed");
    expect(vorkath.nodes).toEqual([expect.objectContaining({ nodeId: s.head.id, change: "changed", name: "Head", fields: [{ field: "Points", before: "40", after: "60" }] })]);
    expect(preview.summary).toEqual(["1 Tile changed"]);
    const teamA = preview.teams.find((t) => t.teamId === s.teamA.id)!;
    expect([teamA.before, teamA.after]).toEqual([40, 60]);
    expect(preview.teams.find((t) => t.teamId === s.teamB.id)).toMatchObject({ before: 0, after: 0 });

    publishDraft(db, s.bingo, preview.revision);

    expect(publishedTile(s, "Vorkath").node.children[0]!.points).toBe(60);
    expect(points(s.teamA.id)).toBe(teamA.after);
    expect(hasDraft(db, s.bingo.id)).toBe(false);
  });

  it("refuses a stale preview: an edit after it was made means the new diff has to be looked at first", () => {
    const s = seed();
    setHeadPoints(s, 60);
    const stale = getPublishPreview(db, s.bingo.id);
    asDraft(s, (t) => updateTileBonusPoints(db, s.vorkath.id, 25, t));

    let refused: ServiceError | undefined;
    try {
      publishDraft(db, s.bingo, stale.revision);
    } catch (e) {
      refused = e as ServiceError;
    }
    expect(refused).toMatchObject({ status: 409, code: STALE_PREVIEW_CODE });
    expect(publishedTile(s, "Vorkath").node.children[0]!.points).toBe(40);

    const fresh = getPublishPreview(db, s.bingo.id);
    expect(fresh.revision).not.toBe(stale.revision);
    expect(fresh.diff.tiles[0]!.fields).toContainEqual({ field: "Full-completion bonus", before: "0", after: "25" });
    publishDraft(db, s.bingo, fresh.revision);
    expect(publishedTile(s, "Vorkath").node.points).toBe(25);
  });

  it("keeps the id of every Tile, Part, Task and Item both boards have, so Claims and scores still point at them", () => {
    const s = seed();
    const sub = claim(s, s.page.children[0]!.id, "Tanzanite fang");
    const idsBefore = getBoardTiles(db, s.bingo.id).flatMap((t) => [t.id, t.nodeId, ...t.node.children.flatMap((c) => [c.id, ...c.children.map((g) => g.id)])]);

    asDraft(s, (t) => {
      updateNode(db, s.page.id, { id: s.page.id, kind: "ANY", label: "Page one", points: 35, children: [{ id: s.page.children[0]!.id, kind: "ITEM", itemName: "Tanzanite fang" }, { id: s.page.children[1]!.id, kind: "ITEM", itemName: "Magic fang" }, { kind: "ITEM", itemName: "Serpentine visage" }] }, t);
      updateTile(db, s.zulrah.id, { name: "Zulrah!" }, t);
    });
    const preview = getPublishPreview(db, s.bingo.id);
    expect(preview.diff.tiles[0]!.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ change: "added", path: ["Page one"], name: "Serpentine visage" }),
        expect.objectContaining({ change: "changed", name: "Page one", fields: [{ field: "Name", before: "Page 1", after: "Page one" }, { field: "Points", before: "30", after: "35" }] }),
      ]),
    );
    publishDraft(db, s.bingo, preview.revision);

    const idsAfter = getBoardTiles(db, s.bingo.id).flatMap((t) => [t.id, t.nodeId, ...t.node.children.flatMap((c) => [c.id, ...c.children.map((g) => g.id)])]);
    expect(idsAfter).toEqual(expect.arrayContaining(idsBefore));
    expect(idsAfter).toHaveLength(idsBefore.length + 1);
    expect(db.select().from(schema.claims).where(eq(schema.claims.submissionId, sub.id)).get()!.nodeId).toBe(s.page.children[0]!.id);
    expect(points(s.teamA.id)).toBe(35);
    const state = db.select().from(schema.teamNodeState).where(eq(schema.teamNodeState.teamId, s.teamA.id)).all().map((r) => r.nodeId);
    expect(state).toContain(s.page.id);
  });

  it("previews the Tiles and Parts a Team gains or loses as complete", () => {
    const s = seed();
    claim(s, s.head.id, "Vorkath's head");
    claim(s, s.visage.id, "Draconic visage");
    // Vorkath is complete; a third Part makes it incomplete again.
    asDraft(s, (t) => createTask(db, s.vorkath.id, { kind: "ITEM", label: "Jar", points: 5, itemName: "Jar of decay" }, undefined, t));
    const teamA = getPublishPreview(db, s.bingo.id).teams.find((t) => t.teamId === s.teamA.id)!;
    expect(teamA.lost).toEqual([{ kind: "tile", id: s.vorkath.id, name: "Vorkath", tileName: null }]);
    expect(teamA.gained).toEqual([]);
  });

  it("swaps two Tiles' places and regenerates the lines in one Publish", () => {
    const s = seed();
    generateLines(db, s.bingo, 15);
    asDraft(s, (t) => {
      updateTile(db, s.vorkath.id, { boardRow: 1, boardCol: 1 }, t);
      updateTile(db, s.zulrah.id, { boardRow: 0, boardCol: 0 }, t);
      updateTile(db, s.vorkath.id, { boardRow: 0, boardCol: 1 }, t);
      generateLines(db, { ...s.bingo }, 20, t);
    });
    const preview = getPublishPreview(db, s.bingo.id);
    expect(preview.diff.lines.every((l) => l.change === "changed")).toBe(true);
    expect(preview.diff.lines.find((l) => l.name === "Row 1")!.fields).toContainEqual({ field: "Bonus", before: "15", after: "20" });
    publishDraft(db, s.bingo, preview.revision);
    const tiles = getBoardTiles(db, s.bingo.id);
    expect(tiles.map((t) => [t.name, t.boardRow, t.boardCol]).sort()).toEqual([["Vorkath", 0, 1], ["Zulrah", 0, 0]]);
  });

  it("publishes the Exclusive Item rules and Rules text with the Board, and they score from then", () => {
    const s = seed();
    // Team A uses Vorkath's head on two Tiles: once the rule is published only the first counts.
    const zulrahHead = editDraft(db, s.bingo.id, s.admin.id, (t) => createTask(db, s.zulrah.id, { kind: "ITEM", label: "Head", points: 10, itemName: "Vorkath's head" }, undefined, t));
    publishDraft(db, s.bingo, getPublishPreview(db, s.bingo.id).revision);
    claim(s, s.head.id, "Vorkath's head");
    claim(s, zulrahHead.id, "Vorkath's head");
    expect(points(s.teamA.id)).toBe(50);

    updateDraftRules(db, s.bingo.id, s.admin.id, { rulesMarkdown: "New rules", exclusivityRules: [{ id: "r1", label: "Heads", itemNames: ["Vorkath's head"], scope: "tile" }] });
    expect(points(s.teamA.id)).toBe(50);
    const preview = getPublishPreview(db, s.bingo.id);
    expect(preview.summary).toEqual(["Exclusive Item rules changed", "Rules text changed"]);
    expect(preview.diff.rulesMarkdown).toEqual({ before: "Old rules", after: "New rules" });
    expect(preview.teams.find((t) => t.teamId === s.teamA.id)).toMatchObject({ before: 50, after: 40 });

    publishDraft(db, s.bingo, preview.revision);
    const bingo = db.select().from(schema.bingos).where(eq(schema.bingos.id, s.bingo.id)).get()!;
    expect(toViewerBingo(bingo, false)).toMatchObject({ rulesMarkdown: "New rules", exclusivityRules: [{ label: "Heads" }] });
    expect(points(s.teamA.id)).toBe(40);
  });

  it("writes one Board published entry, for Moderators and Admins, with the summary and every Team's points before and after", () => {
    const s = seed();
    claim(s, s.head.id, "Vorkath's head");
    setHeadPoints(s, 60);
    publishDraft(db, s.bingo, getPublishPreview(db, s.bingo.id).revision);
    const entries = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "board.published")).all();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.visibility).toBe("mods");
    expect(JSON.parse(entries[0]!.details)).toEqual({
      summary: ["1 Tile changed"],
      removedClaims: 0,
      teams: [
        { teamId: s.teamA.id, teamName: "Team A", before: 40, after: 60 },
        { teamId: s.teamB.id, teamName: "Team B", before: 0, after: 0 },
      ],
    });
    // ...followed by the rescore it caused.
    expect(db.select().from(schema.auditLog).where(and(eq(schema.auditLog.action, "points.rescored"), eq(schema.auditLog.teamId, s.teamA.id))).all()).toHaveLength(1);
  });

  it("lists Items whose Valued as changed and already have priced Submissions, to re-price once published", () => {
    const s = seed();
    const sub = claim(s, s.head.id, "Vorkath's head");
    db.update(schema.claims).set({ gpValue: 1000 }).where(eq(schema.claims.submissionId, sub.id)).run();
    asDraft(s, (t) => updateNode(db, s.head.id, { kind: "ITEM", label: "Head", points: 40, itemName: "Vorkath's head", valuedAs: { itemName: "Vorkath's head", divisor: 2 } }, t));
    const preview = getPublishPreview(db, s.bingo.id);
    expect(preview.repriceable).toEqual([{ nodeId: s.head.id, name: "Head", tileName: "Vorkath", submissions: 1 }]);
    expect(preview.diff.tiles[0]!.nodes[0]!.fields).toEqual([{ field: "Valued as", before: "None", after: "Vorkath's head ÷ 2" }]);
  });

  it("refuses with nothing to publish", () => {
    const s = seed();
    expect(() => getPublishPreview(db, s.bingo.id)).toThrow(ServiceError);
    expect(() => publishDraft(db, s.bingo, "whatever")).toThrow(/no unpublished/);
  });
});

describe("Claims on removed Items", () => {
  it("warns about them, stops counting them once published, and keeps their Submissions", () => {
    const s = seed();
    const approved = claim(s, s.head.id, "Vorkath's head");
    const pending = claim(s, s.head.id, "Vorkath's head", { approve: false, team: "B" });
    claim(s, s.visage.id, "Draconic visage");
    expect(points(s.teamA.id)).toBe(60);

    asDraft(s, (t) => deleteTask(db, s.head.id, t));
    const preview = getPublishPreview(db, s.bingo.id);
    expect(preview.removedClaims).toEqual({ claims: 2, pending: 1, items: ["Head"] });
    expect(preview.diff.tiles[0]!.nodes).toEqual([expect.objectContaining({ change: "removed", name: "Head", summary: "Vorkath's head · 40 pts" })]);
    expect(preview.teams.find((t) => t.teamId === s.teamA.id)).toMatchObject({ before: 60, after: 20 });

    publishDraft(db, s.bingo, preview.revision);
    expect(points(s.teamA.id)).toBe(20);
    expect(publishedTile(s, "Vorkath").node.children.map((c) => c.label)).toEqual(["Visage"]);
    for (const sub of [approved, pending]) {
      expect(db.select().from(schema.submissions).where(eq(schema.submissions.id, sub.id)).get()).toBeDefined();
      expect(db.select().from(schema.claims).where(eq(schema.claims.submissionId, sub.id)).all()).toHaveLength(1);
    }
    expect(db.select().from(schema.nodes).where(eq(schema.nodes.id, s.head.id)).get()!.removedAt).toBeInstanceOf(Date);
    // A later rescore (another review) still leaves them out.
    claim(s, s.page.children[0]!.id, "Tanzanite fang");
    expect(points(s.teamA.id)).toBe(50);
  });

  it("deletes a removed Item nobody claimed outright", () => {
    const s = seed();
    asDraft(s, (t) => deleteTile(db, s.zulrah.id, t));
    publishDraft(db, s.bingo, getPublishPreview(db, s.bingo.id).revision);
    expect(db.select().from(schema.nodes).where(eq(schema.nodes.id, s.page.id)).get()).toBeUndefined();
    expect(db.select().from(schema.tiles).where(eq(schema.tiles.id, s.zulrah.id)).get()).toBeUndefined();
  });

  it("takes the Tags of a removed Tile and a removed Part with them", () => {
    const s = seed();
    addTextTag(db, s.bingo.id, { tileId: s.zulrah.id }, "snake");
    addTextTag(db, s.bingo.id, { partId: s.page.id }, "fangs");
    addTextTag(db, s.bingo.id, { partId: s.visage.id }, "visage");
    addTextTag(db, s.bingo.id, { tileId: s.vorkath.id }, "dragon");
    asDraft(s, (t) => deleteTile(db, s.zulrah.id, t));
    asDraft(s, (t) => deleteTask(db, s.visage.id, t));
    publishDraft(db, s.bingo, getPublishPreview(db, s.bingo.id).revision);
    const left = getBoardTags(db, s.bingo.id);
    expect(Object.values(left.tiles).flat().map((t) => t.text)).toEqual(["dragon"]);
    expect(Object.values(left.parts).flat()).toEqual([]);
  });
});

describe("Tags", () => {
  const tagTexts = (tags: ReturnType<typeof getBoardTags>, tileId: string) => (tags.tiles[tileId] ?? []).map((t) => t.text);

  it("stage in the draft: the Players' search keeps the Published board's until a Publish applies them, ids and all", () => {
    const s = seed();
    asDraft(s, (t) => addTextTag(db, s.bingo.id, { tileId: s.vorkath.id }, "dragon", t));
    expect(getDraftStatus(db, s.bingo.id).hasChanges).toBe(true);
    expect(tileSearchTags(db, s.bingo.id)).toEqual({});
    expect(tagTexts(getBoardTags(db, s.bingo.id), s.vorkath.id)).toEqual([]);
    const staged = getBoardTags(db, s.bingo.id, DRAFT_BOARD).tiles[s.vorkath.id]!;
    expect(staged.map((t) => t.text)).toEqual(["dragon"]);

    publishDraft(db, s.bingo, getPublishPreview(db, s.bingo.id).revision);
    expect(tileSearchTags(db, s.bingo.id)).toEqual({ [s.vorkath.id]: ["dragon"] });
    expect(getBoardTags(db, s.bingo.id).tiles[s.vorkath.id]!.map((t) => t.id)).toEqual(staged.map((t) => t.id));
    expect(hasDraft(db, s.bingo.id)).toBe(false);
  });

  it("can tag a Tile and a Part that so far exist only in the draft, and publishes them with it", () => {
    const s = seed();
    const tile = asDraft(s, (t) => createTile(db, { bingoId: s.bingo.id, name: "Hydra", boardRow: 1, boardCol: 0 }, t));
    const part = asDraft(s, (t) => createTask(db, tile.id, { kind: "ITEM", label: "Claw", points: 10, itemName: "Hydra's claw" }, undefined, t));
    asDraft(s, (t) => addTextTag(db, s.bingo.id, { tileId: tile.id }, "alchemical", t));
    asDraft(s, (t) => addTextTag(db, s.bingo.id, { partId: part.id }, "claw", t));
    publishDraft(db, s.bingo, getPublishPreview(db, s.bingo.id).revision);
    expect(tileSearchTags(db, s.bingo.id)).toEqual({ [tile.id]: ["alchemical", "claw"] });
  });

  it("lists a Tile's tag changes in the Publish preview, and a removal publishes", () => {
    const s = seed();
    addTextTag(db, s.bingo.id, { tileId: s.zulrah.id }, "snake");
    const [snake] = getBoardTags(db, s.bingo.id).tiles[s.zulrah.id]!;
    asDraft(s, (t) => removeTag(db, s.bingo.id, snake!.id, t));
    asDraft(s, (t) => addTextTag(db, s.bingo.id, { tileId: s.zulrah.id }, "serpent", t));
    const preview = getPublishPreview(db, s.bingo.id);
    const zulrah = preview.diff.tiles.find((t) => t.tileId === s.zulrah.id)!;
    expect(zulrah.change).toBe("changed");
    expect(zulrah.fields).toContainEqual({ field: "Tags", before: "snake", after: "serpent" });
    publishDraft(db, s.bingo, preview.revision);
    expect(tileSearchTags(db, s.bingo.id)).toEqual({ [s.zulrah.id]: ["serpent"] });
  });

  it("leaves no draft once a tag is added and taken off again, and a Discard puts the tags back", () => {
    const s = seed();
    addTextTag(db, s.bingo.id, { tileId: s.zulrah.id }, "snake");
    const added = asDraft(s, (t) => addTextTag(db, s.bingo.id, { tileId: s.vorkath.id }, "dragon", t));
    asDraft(s, (t) => removeTag(db, s.bingo.id, added[0]!.id, t));
    expect(hasDraft(db, s.bingo.id)).toBe(false);

    const [snake] = getBoardTags(db, s.bingo.id).tiles[s.zulrah.id]!;
    asDraft(s, (t) => removeTag(db, s.bingo.id, snake!.id, t));
    discardDraft(db, s.bingo);
    expect(tagTexts(getBoardTags(db, s.bingo.id), s.zulrah.id)).toEqual(["snake"]);
    expect(hasDraft(db, s.bingo.id)).toBe(false);
  });

  it("writes no audit entry per tag edit on the draft", () => {
    const s = seed();
    const before = db.select().from(schema.auditLog).all().length;
    asDraft(s, (t) => addTextTag(db, s.bingo.id, { tileId: s.vorkath.id }, "dragon", t));
    expect(db.select().from(schema.auditLog).all().length).toBe(before);
  });
});

describe("Discard", () => {
  it("puts the draft back to the Published board, changes nothing Players see, and audits what it threw away", () => {
    const s = seed();
    claim(s, s.head.id, "Vorkath's head");
    const players = JSON.stringify(getBoardForViewer(db, s.bingo, false));
    setHeadPoints(s, 60);
    asDraft(s, (t) => createCategory(db, { bingoId: s.bingo.id, label: "PvM" }, t));

    discardDraft(db, s.bingo);

    expect(hasDraft(db, s.bingo.id)).toBe(false);
    expect(getEditorBoard(db, s.bingo.id).board.tiles.find((t) => t.name === "Vorkath")!.node.children[0]!.points).toBe(40);
    expect(JSON.stringify(getBoardForViewer(db, s.bingo, false))).toBe(players);
    expect(points(s.teamA.id)).toBe(40);
    const entry = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "board.discarded")).get()!;
    expect(JSON.parse(entry.details)).toEqual({ summary: ["1 Tile changed", "1 Category added"] });
    expect(entry.visibility).toBe("mods");
  });
});

describe("export and import", () => {
  it("exports the Published board even while a draft exists, and an imported Bingo has no draft", () => {
    const s = seed();
    setHeadPoints(s, 60);
    asDraft(s, (t) => createTile(db, { bingoId: s.bingo.id, name: "Draft only", boardRow: 1, boardCol: 0 }, t));
    updateDraftRules(db, s.bingo.id, s.admin.id, { rulesMarkdown: "Draft rules" });

    const doc = exportBingo(db, s.bingo.id);
    expect(doc.tiles.map((t) => t.name)).toEqual(["Vorkath", "Zulrah"]);
    expect(doc.tiles[0]!.tasks[0]!.points).toBe(40);
    expect(doc.bingo.rulesMarkdown).toBe("Old rules");

    const imported = importBingo(db, doc, { slug: "copy", createdByUserId: s.admin.id });
    expect(hasDraft(db, imported.id)).toBe(false);
    expect(getBoardTiles(db, imported.id).map((t) => t.name)).toEqual(["Vorkath", "Zulrah"]);
  });
});

describe("deleting the Bingo", () => {
  it("takes its draft with it", () => {
    const s = seed();
    setHeadPoints(s, 60);
    asDraft(s, (t) => updateTile(db, s.vorkath.id, { imageUrl: "/uploads/tiles/draft.png" }, t));
    asDraft(s, (t) => addTextTag(db, s.bingo.id, { tileId: s.vorkath.id }, "dragon", t));
    const { files } = deleteBingo(db, s.bingo.id);
    expect(files).toContain("/uploads/tiles/draft.png");
    for (const table of [schema.boardDrafts, schema.draftNodes, schema.draftNodeEdges, schema.draftTiles, schema.draftBingoLines, schema.draftTileCategories, schema.draftTags]) {
      expect(db.select().from(table).all()).toHaveLength(0);
    }
  });
});
