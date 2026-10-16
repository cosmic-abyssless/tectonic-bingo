// Effort bosses (CONTEXT.md "Effort"): the Wise Old Man bosses a Part's Effort is counted at. A Part's bosses are
// derived from its Items, as the bosses Luck's drop-rate table knows drop them, and an Admin can add a boss or remove
// one, on the Part or on its whole Tile. Only those changes are stored (effort_bosses); the derived bosses are worked
// out from the board each time, so they follow the Items. On the Draft board like Tags: the editing functions take the
// table set they work on (boardTables.ts), and a Publish applies them. Never shown to Players.
import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { effectiveEffortBosses, isWomBossMetric, WOM_BOSS_NAMES, type BoardEffortBossesResponse, type EffortBoss, type ExportEffortBoss } from "@bingo/shared";
import * as schema from "../db/schema";
import { audit, markAuditedNoop } from "../audit/record";
import { ServiceError } from "./errors";
import { PUBLISHED_BOARD, type BoardTables } from "./boardTables";
import { getFullGraph, leafDescendants } from "./graphService";
import { resolveOwner, type ResolvedOwner } from "./tagService";
import { BOSS_METRICS, type BossMetric } from "./luck/bossSources";
import { getDropRates, type DropRateTable } from "./luck/dropRates";

type Db = BetterSQLite3Database<typeof schema>;
type Row = BoardTables["effortBosses"]["$inferSelect"];

/** What an Effort boss change is on: a Tile (all its Parts), or one of its Parts by its node id. */
export type EffortBossOwner = { tileId: string } | { partId: string };

const KNOWN = new Set<string>(BOSS_METRICS);

function toEffortBoss(row: Row): EffortBoss {
  return { id: row.id, tileId: row.nodeId ? null : row.tileId, partId: row.nodeId, metric: row.metric, mode: row.mode };
}

/** The bosses that drop any of these Items, as Luck knows them (bossArtService.boardBosses reads the same table). */
export function derivedBosses(itemNames: readonly string[], rates: DropRateTable = getDropRates()): BossMetric[] {
  const metrics = new Set<BossMetric>();
  for (const item of new Set(itemNames)) for (const { metric } of rates.sourcesOf(item)) metrics.add(metric);
  return [...metrics].sort();
}

/** Every Part on the board (a Tile node's direct child), with its Tile and the Item names anywhere under it. */
function boardParts(db: Db, bingoId: string, t: BoardTables): { partId: string; tileId: string; items: string[] }[] {
  const { childrenOf, nodesById } = getFullGraph(db, bingoId, t);
  const tiles = db.select({ id: t.tiles.id, nodeId: t.tiles.nodeId }).from(t.tiles).where(eq(t.tiles.bingoId, bingoId)).all();
  const parts = new Map<string, { partId: string; tileId: string; items: string[] }>();
  for (const tile of tiles) {
    for (const partId of childrenOf.get(tile.nodeId) ?? []) {
      if (parts.has(partId)) continue;
      const items = leafDescendants(partId, childrenOf, nodesById).flatMap((id) => {
        const node = nodesById.get(id);
        return node?.kind === "ITEM" && node.itemName ? [node.itemName] : [];
      });
      parts.set(partId, { partId, tileId: tile.id, items });
    }
  }
  return [...parts.values()];
}

function rowsOf(db: Db, bingoId: string, t: BoardTables): Row[] {
  return db.select().from(t.effortBosses).where(eq(t.effortBosses.bingoId, bingoId)).all();
}

/**
 * Each Part's effective bosses: derived(its Items) ∪ added(Tile) ∪ added(Part) − removed(Tile) − removed(Part)
 * (effectiveEffortBosses). Every Part on the board is in the map, with no bosses when it has none.
 */
export function effectiveBosses(db: Db, bingoId: string, t: BoardTables = PUBLISHED_BOARD): Map<string, BossMetric[]> {
  const rows = rowsOf(db, bingoId, t).map(toEffortBoss);
  const result = new Map<string, BossMetric[]>();
  for (const part of boardParts(db, bingoId, t)) {
    const tileRows = rows.filter((r) => r.tileId === part.tileId);
    const partRows = rows.filter((r) => r.partId === part.partId);
    // Rows are checked against the known bosses when written, and a file's when imported.
    result.set(part.partId, effectiveEffortBosses(derivedBosses(part.items), tileRows, partRows).filter((m) => KNOWN.has(m)) as BossMetric[]);
  }
  return result;
}

/** What the board editor shows: every add and remove, and each Part's bosses derived from its Items. */
export function getBoardEffortBosses(db: Db, bingoId: string, t: BoardTables = PUBLISHED_BOARD): BoardEffortBossesResponse {
  return {
    bosses: rowsOf(db, bingoId, t).map(toEffortBoss),
    derived: boardParts(db, bingoId, t).map((p) => ({ partId: p.partId, metrics: derivedBosses(p.items) })),
  };
}

/** A boss metric Wise Old Man measures and Luck knows, or a 400. */
export function validateMetric(raw: unknown): BossMetric {
  if (!isWomBossMetric(raw) || !KNOWN.has(raw)) throw new ServiceError(400, "Pick a boss Wise Old Man measures");
  return raw as BossMetric;
}

function ownerFilter(owner: ResolvedOwner, t: BoardTables) {
  return owner.part ? eq(t.effortBosses.nodeId, owner.part.id) : eq(t.effortBosses.tileId, owner.tile.id);
}

function ownerRow(db: Db, owner: ResolvedOwner, metric: string, t: BoardTables): Row | undefined {
  return db
    .select()
    .from(t.effortBosses)
    .where(and(ownerFilter(owner, t), eq(t.effortBosses.metric, metric)))
    .get();
}

// A Draft board edit is seen by Admins only, so it isn't audited on its own: its Publish is (boardDraftService).
function auditChange(db: Db, t: BoardTables, bingoId: string, owner: ResolvedOwner, metric: BossMetric, change: "added" | "removed" | "reset"): void {
  if (t.draft) {
    markAuditedNoop();
    return;
  }
  audit(db, {
    action: "board.effort_boss_changed",
    bingoId,
    entity: { type: "tile", id: owner.tile.id, label: owner.tile.name },
    details: { tileName: owner.tile.name, partLabel: owner.part?.label ?? null, boss: WOM_BOSS_NAMES[metric], change },
  });
}

/** Sets this owner's row for the boss to `mode`, writing nothing when it already is. */
function setRow(db: Db, bingoId: string, owner: ResolvedOwner, metric: BossMetric, mode: Row["mode"], t: BoardTables): boolean {
  const existing = ownerRow(db, owner, metric, t);
  if (existing?.mode === mode) return false;
  if (existing) db.update(t.effortBosses).set({ mode }).where(eq(t.effortBosses.id, existing.id)).run();
  else
    db.insert(t.effortBosses)
      .values({ bingoId, tileId: owner.part ? null : owner.tile.id, nodeId: owner.part?.id ?? null, metric, mode })
      .run();
  return true;
}

/** Adds a boss to a Tile's or Part's bosses. Returns the board's Effort bosses. */
export function addEffortBoss(
  db: Db,
  bingoId: string,
  owner: EffortBossOwner,
  rawMetric: unknown,
  t: BoardTables = PUBLISHED_BOARD,
): BoardEffortBossesResponse {
  const metric = validateMetric(rawMetric);
  return db.transaction((tx) => {
    const resolved = resolveOwner(tx, bingoId, owner, t);
    if (setRow(tx, bingoId, resolved, metric, "add", t)) auditChange(tx, t, bingoId, resolved, metric, "added");
    else markAuditedNoop();
    return getBoardEffortBosses(tx, bingoId, t);
  });
}

/** Takes a boss off a Tile's or Part's bosses: an added one's row goes, any other gets a "remove" row. */
export function removeEffortBoss(
  db: Db,
  bingoId: string,
  owner: EffortBossOwner,
  rawMetric: unknown,
  t: BoardTables = PUBLISHED_BOARD,
): BoardEffortBossesResponse {
  const metric = validateMetric(rawMetric);
  return db.transaction((tx) => {
    const resolved = resolveOwner(tx, bingoId, owner, t);
    const existing = ownerRow(tx, resolved, metric, t);
    if (existing?.mode === "add") {
      tx.delete(t.effortBosses).where(eq(t.effortBosses.id, existing.id)).run();
      auditChange(tx, t, bingoId, resolved, metric, "removed");
    } else if (setRow(tx, bingoId, resolved, metric, "remove", t)) auditChange(tx, t, bingoId, resolved, metric, "removed");
    else markAuditedNoop();
    return getBoardEffortBosses(tx, bingoId, t);
  });
}

/** Drops one add or remove row: that boss is back to what the Items (and the Tile) say. */
export function resetEffortBoss(db: Db, bingoId: string, id: string, t: BoardTables = PUBLISHED_BOARD): BoardEffortBossesResponse {
  return db.transaction((tx) => {
    const row = tx
      .select()
      .from(t.effortBosses)
      .where(and(eq(t.effortBosses.id, id), eq(t.effortBosses.bingoId, bingoId)))
      .get();
    if (!row) throw new ServiceError(404, "Effort boss not found");
    const resolved = resolveOwner(tx, bingoId, row.nodeId ? { partId: row.nodeId } : { tileId: row.tileId! }, t);
    tx.delete(t.effortBosses).where(eq(t.effortBosses.id, row.id)).run();
    auditChange(tx, t, bingoId, resolved, row.metric as BossMetric, "reset");
    return getBoardEffortBosses(tx, bingoId, t);
  });
}

/**
 * The change the board editor asks for ({ metric, mode }): "add" adds the boss, "remove" takes it off. The route's
 * one entry point, so both modes are checked the same way.
 */
export function changeEffortBoss(
  db: Db,
  bingoId: string,
  owner: EffortBossOwner,
  body: { metric?: unknown; mode?: unknown },
  t: BoardTables = PUBLISHED_BOARD,
): BoardEffortBossesResponse {
  if (body.mode === "add") return addEffortBoss(db, bingoId, owner, body.metric, t);
  if (body.mode === "remove") return removeEffortBoss(db, bingoId, owner, body.metric, t);
  throw new ServiceError(400, 'mode must be "add" or "remove"');
}

// ---------------------------------------------------------------------------
// Export / import: each Tile's and Part's rows as they stand.
// ---------------------------------------------------------------------------

/** A bingo's Effort bosses as the export carries them, by Tile id and by Part (node) id. */
export function exportEffortBosses(db: Db, bingoId: string): { tiles: Map<string, ExportEffortBoss[]>; parts: Map<string, ExportEffortBoss[]> } {
  const tiles = new Map<string, ExportEffortBoss[]>();
  const parts = new Map<string, ExportEffortBoss[]>();
  for (const row of rowsOf(db, bingoId, PUBLISHED_BOARD).sort((a, b) => a.metric.localeCompare(b.metric))) {
    const [map, key] = row.nodeId ? [parts, row.nodeId] : [tiles, row.tileId!];
    map.set(key, [...(map.get(key) ?? []), { metric: row.metric, mode: row.mode }]);
  }
  return { tiles, parts };
}

/** Checks a file's Effort bosses before anything is imported. Absent is fine (an older file): none. */
export function assertValidExportEffortBosses(input: unknown, where: string): void {
  if (input === undefined) return;
  if (!Array.isArray(input)) throw new ServiceError(400, `Malformed import file: ${where}'s Effort bosses must be an array`);
  const seen = new Set<string>();
  for (const entry of input as unknown[]) {
    const e = entry as Partial<{ metric: unknown; mode: unknown }> | null;
    if (!e || (e.mode !== "add" && e.mode !== "remove") || !isWomBossMetric(e.metric) || !KNOWN.has(e.metric)) {
      throw new ServiceError(400, `Malformed import file: ${where} has an Effort boss that isn't one`);
    }
    if (seen.has(e.metric)) throw new ServiceError(400, `Malformed import file: ${where} has the Effort boss "${e.metric}" twice`);
    seen.add(e.metric);
  }
}

/** Restores an exported Tile's or Part's Effort bosses. */
export function importEffortBosses(db: Db, bingoId: string, owner: EffortBossOwner, list: ExportEffortBoss[] | undefined): void {
  if (!list?.length) return;
  const resolved = resolveOwner(db, bingoId, owner, PUBLISHED_BOARD);
  db.insert(schema.effortBosses)
    .values(list.map((e) => ({ bingoId, tileId: resolved.part ? null : resolved.tile.id, nodeId: resolved.part?.id ?? null, metric: e.metric, mode: e.mode })))
    .run();
}
