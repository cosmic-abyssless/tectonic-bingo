// Effort bosses (CONTEXT.md "Effort"): a Part's bosses are derived from its Items, plus an Admin's adds, less their
// removes, on the Part or its whole Tile; they go through the Draft board, Publish, export and import like Tags.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTask, createTile, deleteTask, deleteTile } from "./boardService";
import { deleteBingo } from "./bingoService";
import { discardDraft, editDraft, getPublishPreview, hasDraft, publishDraft } from "./boardDraftService";
import { DRAFT_BOARD } from "./boardTables";
import { exportBingo, importBingo } from "./bingoExportService";
import { addEffortBoss, changeEffortBoss, derivedBosses, effectiveBosses, getBoardEffortBosses, removeEffortBoss, resetEffortBoss } from "./effortBossService";

vi.mock("../ws", () => ({ broadcast: vi.fn() }));

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

function seed() {
  const admin = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin", isAdmin: true }).returning().get();
  const bingo = db
    .insert(schema.bingos)
    .values({ slug: "b", name: "B", boardRows: 2, boardCols: 2, stage: "live", createdByUserId: admin.id })
    .returning()
    .get();
  const vorkath = createTile(db, { bingoId: bingo.id, name: "Vorkath", boardRow: 0, boardCol: 0 });
  // Vorkath's head: Vorkath. Draconic visage: Vorkath and the King Black Dragon.
  const head = createTask(db, vorkath.id, { kind: "ITEM", label: "Head", points: 40, itemName: "Vorkath's head" });
  const page = createTask(db, vorkath.id, {
    kind: "ANY",
    label: "Page 2",
    points: 20,
    children: [
      { kind: "ITEM", itemName: "Draconic visage" },
      { kind: "ITEM", itemName: "Abyssal whip" },
    ],
  });
  const cox = createTile(db, { bingoId: bingo.id, name: "CoX", boardRow: 0, boardCol: 1 });
  const tbow = createTask(db, cox.id, { kind: "ITEM", label: "Tbow", points: 100, itemName: "Twisted bow" });
  return { admin, bingo, vorkath, head, page, cox, tbow };
}

describe("derivedBosses", () => {
  it("gives every boss that drops an Item, once", () => {
    expect(derivedBosses(["Draconic visage"])).toEqual(["king_black_dragon", "vorkath"]);
    expect(derivedBosses(["Draconic visage", "Vorkath's head"])).toEqual(["king_black_dragon", "vorkath"]);
  });

  it("gives none for an Item no boss Luck knows drops", () => {
    expect(derivedBosses(["Abyssal whip"])).toEqual([]);
  });

  it("gives a raid's normal and challenge modes for a raid's Item", () => {
    expect(derivedBosses(["Twisted bow"])).toEqual(["chambers_of_xeric", "chambers_of_xeric_challenge_mode"]);
  });
});

describe("effectiveBosses", () => {
  it("is each Part's derived bosses to start with, from every Item under it", () => {
    const s = seed();
    const bosses = effectiveBosses(db, s.bingo.id);
    expect(bosses.get(s.head.id)).toEqual(["vorkath"]);
    expect(bosses.get(s.page.id)).toEqual(["king_black_dragon", "vorkath"]);
    expect(bosses.get(s.tbow.id)).toEqual(["chambers_of_xeric", "chambers_of_xeric_challenge_mode"]);
  });

  it("adds a Tile's and a Part's added bosses, less a Tile's or a Part's removed ones", () => {
    const s = seed();
    // On the Tile: Zulrah on every Part; the King Black Dragon off every Part.
    addEffortBoss(db, s.bingo.id, { tileId: s.vorkath.id }, "zulrah");
    removeEffortBoss(db, s.bingo.id, { tileId: s.vorkath.id }, "king_black_dragon");
    // On one Part: Vorkath off it, Cerberus on it.
    removeEffortBoss(db, s.bingo.id, { partId: s.head.id }, "vorkath");
    addEffortBoss(db, s.bingo.id, { partId: s.head.id }, "cerberus");
    const bosses = effectiveBosses(db, s.bingo.id);
    expect(bosses.get(s.head.id)).toEqual(["cerberus", "zulrah"]);
    expect(bosses.get(s.page.id)).toEqual(["vorkath", "zulrah"]);
    expect(bosses.get(s.tbow.id)).toEqual(["chambers_of_xeric", "chambers_of_xeric_challenge_mode"]);
  });

  it("a removed boss stays removed although the other level adds it", () => {
    const s = seed();
    removeEffortBoss(db, s.bingo.id, { tileId: s.cox.id }, "chambers_of_xeric_challenge_mode");
    addEffortBoss(db, s.bingo.id, { partId: s.tbow.id }, "chambers_of_xeric_challenge_mode");
    expect(effectiveBosses(db, s.bingo.id).get(s.tbow.id)).toEqual(["chambers_of_xeric"]);
  });
});

describe("editing", () => {
  it("removing an added boss drops its row; removing a derived one writes a remove; reset drops either", () => {
    const s = seed();
    addEffortBoss(db, s.bingo.id, { partId: s.head.id }, "zulrah");
    let board = removeEffortBoss(db, s.bingo.id, { partId: s.head.id }, "zulrah");
    expect(board.bosses).toEqual([]);

    board = removeEffortBoss(db, s.bingo.id, { partId: s.head.id }, "vorkath");
    expect(board.bosses).toEqual([{ id: expect.any(String), tileId: null, partId: s.head.id, metric: "vorkath", mode: "remove" }]);
    // Asking again changes nothing.
    expect(removeEffortBoss(db, s.bingo.id, { partId: s.head.id }, "vorkath").bosses).toHaveLength(1);
    expect(effectiveBosses(db, s.bingo.id).get(s.head.id)).toEqual([]);

    board = resetEffortBoss(db, s.bingo.id, board.bosses[0]!.id);
    expect(board.bosses).toEqual([]);
    expect(effectiveBosses(db, s.bingo.id).get(s.head.id)).toEqual(["vorkath"]);
  });

  it("refuses a boss Wise Old Man doesn't measure, a mode that isn't one, and a Task below a Part", () => {
    const s = seed();
    expect(() => addEffortBoss(db, s.bingo.id, { partId: s.head.id }, "wintertodt")).toThrow(/Wise Old Man measures/);
    expect(() => changeEffortBoss(db, s.bingo.id, { partId: s.head.id }, { metric: "zulrah", mode: "maybe" })).toThrow(/mode/);
    const visage = s.page.children[0]!;
    expect(() => addEffortBoss(db, s.bingo.id, { partId: visage.id }, "zulrah")).toThrow(/Part not found/);
  });

  it("lists every row and each Part's derived bosses for the editor", () => {
    const s = seed();
    addEffortBoss(db, s.bingo.id, { tileId: s.cox.id }, "nex");
    const board = getBoardEffortBosses(db, s.bingo.id);
    expect(board.bosses).toEqual([{ id: expect.any(String), tileId: s.cox.id, partId: null, metric: "nex", mode: "add" }]);
    expect(board.derived).toEqual(
      expect.arrayContaining([
        { partId: s.head.id, metrics: ["vorkath"] },
        { partId: s.page.id, metrics: ["king_black_dragon", "vorkath"] },
        { partId: s.tbow.id, metrics: ["chambers_of_xeric", "chambers_of_xeric_challenge_mode"] },
      ]),
    );
  });

  it("go with the Part, the Tile, and the Bingo they're on", () => {
    const s = seed();
    addEffortBoss(db, s.bingo.id, { partId: s.head.id }, "zulrah");
    addEffortBoss(db, s.bingo.id, { tileId: s.cox.id }, "nex");
    addEffortBoss(db, s.bingo.id, { partId: s.tbow.id }, "zulrah");
    db.transaction((tx) => deleteTask(tx, s.head.id));
    expect(
      getBoardEffortBosses(db, s.bingo.id)
        .bosses.map((b) => b.metric)
        .sort(),
    ).toEqual(["nex", "zulrah"]);
    deleteTile(db, s.cox.id);
    expect(getBoardEffortBosses(db, s.bingo.id).bosses).toEqual([]);
    addEffortBoss(db, s.bingo.id, { tileId: s.vorkath.id }, "nex");
    deleteBingo(db, s.bingo.id);
    expect(db.select().from(schema.effortBosses).all()).toEqual([]);
  });
});

describe("the Draft board", () => {
  const asDraft = <T>(s: ReturnType<typeof seed>, edit: Parameters<typeof editDraft<T>>[3]) => editDraft(db, s.bingo.id, s.admin.id, edit);

  it("stages a change in the draft, lists it in the Publish preview, and a Publish applies it, ids and all", () => {
    const s = seed();
    const staged = asDraft(s, (t) => removeEffortBoss(db, s.bingo.id, { partId: s.page.id }, "king_black_dragon", t));
    asDraft(s, (t) => addEffortBoss(db, s.bingo.id, { tileId: s.vorkath.id }, "zulrah", t));
    expect(effectiveBosses(db, s.bingo.id).get(s.page.id)).toEqual(["king_black_dragon", "vorkath"]);
    expect(effectiveBosses(db, s.bingo.id, DRAFT_BOARD).get(s.page.id)).toEqual(["vorkath", "zulrah"]);

    const preview = getPublishPreview(db, s.bingo.id);
    const tile = preview.diff.tiles.find((t) => t.tileId === s.vorkath.id)!;
    expect(tile.fields).toContainEqual({ field: "Effort bosses", before: "", after: "Zulrah (added)" });
    expect(tile.nodes).toContainEqual(
      expect.objectContaining({ nodeId: s.page.id, change: "changed", fields: [{ field: "Effort bosses", before: "", after: "King Black Dragon (removed)" }] }),
    );

    publishDraft(db, s.bingo, preview.revision);
    expect(hasDraft(db, s.bingo.id)).toBe(false);
    expect(effectiveBosses(db, s.bingo.id).get(s.page.id)).toEqual(["vorkath", "zulrah"]);
    expect(getBoardEffortBosses(db, s.bingo.id).bosses.map((b) => b.id)).toEqual(expect.arrayContaining(staged.bosses.map((b) => b.id)));
  });

  it("publishes a change of mode, and a reset, made on the draft", () => {
    const s = seed();
    addEffortBoss(db, s.bingo.id, { partId: s.head.id }, "zulrah");
    const removed = removeEffortBoss(db, s.bingo.id, { partId: s.tbow.id }, "chambers_of_xeric_challenge_mode").bosses.find((b) => b.partId === s.tbow.id)!;
    asDraft(s, (t) => addEffortBoss(db, s.bingo.id, { partId: s.tbow.id }, "chambers_of_xeric_challenge_mode", t));
    asDraft(s, (t) => removeEffortBoss(db, s.bingo.id, { partId: s.head.id }, "zulrah", t));
    publishDraft(db, s.bingo, getPublishPreview(db, s.bingo.id).revision);
    expect(getBoardEffortBosses(db, s.bingo.id).bosses).toEqual([
      { id: removed.id, tileId: null, partId: s.tbow.id, metric: "chambers_of_xeric_challenge_mode", mode: "add" },
    ]);
  });

  it("leaves no draft once a change is undone, and a Discard puts them back", () => {
    const s = seed();
    const added = asDraft(s, (t) => addEffortBoss(db, s.bingo.id, { tileId: s.cox.id }, "nex", t));
    asDraft(s, (t) => resetEffortBoss(db, s.bingo.id, added.bosses[0]!.id, t));
    expect(hasDraft(db, s.bingo.id)).toBe(false);

    asDraft(s, (t) => addEffortBoss(db, s.bingo.id, { tileId: s.cox.id }, "nex", t));
    discardDraft(db, s.bingo);
    expect(getBoardEffortBosses(db, s.bingo.id, DRAFT_BOARD).bosses).toEqual([]);
    expect(getBoardEffortBosses(db, s.bingo.id).bosses).toEqual([]);
  });
});

describe("export and import", () => {
  it("carry each Tile's and Part's adds and removes to the new Bingo", () => {
    const s = seed();
    addEffortBoss(db, s.bingo.id, { tileId: s.vorkath.id }, "zulrah");
    removeEffortBoss(db, s.bingo.id, { partId: s.page.id }, "king_black_dragon");
    const doc = exportBingo(db, s.bingo.id);
    expect(doc.tiles.find((t) => t.name === "Vorkath")!.effortBosses).toEqual([{ metric: "zulrah", mode: "add" }]);
    expect(doc.tiles.find((t) => t.name === "CoX")!.effortBosses).toBeUndefined();

    const copy = importBingo(db, doc, { slug: "copy", createdByUserId: s.admin.id });
    const copied = exportBingo(db, copy.id);
    expect(copied.tiles.map((t) => [t.effortBosses, t.tasks.map((task) => task.effortBosses)])).toEqual(
      doc.tiles.map((t) => [t.effortBosses, t.tasks.map((task) => task.effortBosses)]),
    );
    const parts = [...effectiveBosses(db, copy.id).values()];
    expect(parts).toEqual(
      expect.arrayContaining([
        ["vorkath", "zulrah"],
        ["chambers_of_xeric", "chambers_of_xeric_challenge_mode"],
      ]),
    );
  });

  it("refuses a file with an Effort boss that isn't one, and reads an older file without them", () => {
    const s = seed();
    const doc = exportBingo(db, s.bingo.id);
    const bad = { ...doc, tiles: doc.tiles.map((t, i) => (i === 0 ? { ...t, effortBosses: [{ metric: "wintertodt", mode: "add" as const }] } : t)) };
    expect(() => importBingo(db, bad, { slug: "bad", createdByUserId: s.admin.id })).toThrow(/Effort boss/);
    const older = { ...doc, tiles: doc.tiles.map(({ effortBosses: _e, ...t }) => t) };
    expect(() => importBingo(db, older, { slug: "older", createdByUserId: s.admin.id })).not.toThrow();
  });
});
