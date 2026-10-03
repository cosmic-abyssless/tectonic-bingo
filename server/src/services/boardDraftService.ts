// The Draft board (CONTEXT.md "Draft board", "Published board", "Publish", #437): the Admins' working copy of a
// Bingo's Board, applied to the Board everyone plays on only by a Publish.
//
// Storage: a full copy of the board's rows in the draft_* tables (db/schema.ts "DRAFT BOARD"), same shape and same ids
// as the Published board's, plus a board_drafts row for the Exclusive Item rules, the Rules text and who changed it
// last. Every admin board edit goes through editDraft, which copies the Published board into the draft first if there
// is no draft, makes the edit on the copy (boardService with the DRAFT_BOARD table set), and drops the copy again if
// the edit left it level with the Published board, so a draft exists exactly while there's something to publish.
// Publish applies the copy row by row: a row in both boards is updated in place and keeps its id, so the Claims,
// team scores and Task interest pointing at it stay valid; only added and removed rows gain or lose ids.
import crypto from "node:crypto";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  describeValuedAs,
  STALE_PREVIEW_CODE,
  type BoardCategoryChange,
  type BoardDiff,
  type BoardDraftStatus,
  type BoardFieldChange,
  type BoardLineChange,
  type BoardNodeChange,
  type BoardTileChange,
  type CompletionChange,
  type DraftBoardResponse,
  type PublishPreview,
  type RemovedClaimsWarning,
  type RepriceableItem,
  type TeamScorePreview,
} from "@bingo/shared";
import * as schema from "../db/schema";
import { bingos, boardDrafts, claims, submissions, teamNodeState, teamPointAdjustments, teams, tileInterests } from "../db/schema";
import { now as clockNow } from "../clock";
import { audit } from "../audit/record";
import { userLabelById } from "../audit/describe";
import { ServiceError } from "./errors";
import { DRAFT_BOARD, PUBLISHED_BOARD, type BoardTables } from "./boardTables";
import { getBoardLines, getBoardTiles, getCategories } from "./boardService";
import { normalizeExclusivityRules, parseExclusivityRules, unreferencedUploads } from "./bingoService";
import { assertNoProofsFor } from "./graphService";
import { rescoreBingoTx, scoreTeam } from "./scoringService";
import { countPricedSubmissions } from "./gpRepriceService";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

type NodeRow = BoardTables["nodes"]["$inferSelect"];
type EdgeRow = BoardTables["nodeEdges"]["$inferSelect"];
type TileRow = BoardTables["tiles"]["$inferSelect"];
type LineRow = BoardTables["bingoLines"]["$inferSelect"];
type CategoryRow = BoardTables["tileCategories"]["$inferSelect"];

/** One copy of a Bingo's Board, as rows. */
interface BoardRows {
  categories: CategoryRow[];
  tiles: TileRow[];
  lines: LineRow[];
  nodes: NodeRow[];
  edges: EdgeRow[];
  exclusivityRulesJson: string;
  rulesMarkdown: string | null;
}

// ---------------------------------------------------------------------------
// Reading either copy
// ---------------------------------------------------------------------------

function draftRow(q: Queryable, bingoId: string) {
  return q.select().from(boardDrafts).where(eq(boardDrafts.bingoId, bingoId)).get();
}

/** The node's own columns, without the Published board's removedAt (a draft node never has one). */
function nodeOnly(row: NodeRow & { removedAt?: unknown }): NodeRow {
  const { removedAt: _removedAt, ...node } = row;
  return node;
}

function loadRows(q: Queryable, bingoId: string, t: BoardTables): BoardRows {
  const nodeIds = q.select({ id: t.nodes.id }).from(t.nodes).where(eq(t.nodes.bingoId, bingoId));
  const nodes = t.draft
    ? q.select().from(t.nodes).where(eq(t.nodes.bingoId, bingoId)).all()
    : q.select().from(t.nodes).where(and(eq(t.nodes.bingoId, bingoId), isNull(schema.nodes.removedAt))).all().map(nodeOnly);
  const settings = t.draft
    ? draftRow(q, bingoId)
    : q.select({ exclusivityRulesJson: bingos.exclusivityRulesJson, rulesMarkdown: bingos.rulesMarkdown }).from(bingos).where(eq(bingos.id, bingoId)).get();
  return {
    categories: q.select().from(t.tileCategories).where(eq(t.tileCategories.bingoId, bingoId)).all(),
    tiles: q.select().from(t.tiles).where(eq(t.tiles.bingoId, bingoId)).all(),
    lines: q.select().from(t.bingoLines).where(eq(t.bingoLines.bingoId, bingoId)).all(),
    nodes,
    edges: q.select().from(t.nodeEdges).where(inArray(t.nodeEdges.parentId, nodeIds)).all(),
    exclusivityRulesJson: settings?.exclusivityRulesJson ?? "[]",
    rulesMarkdown: settings?.rulesMarkdown ?? null,
  };
}

export function hasDraft(q: Queryable, bingoId: string): boolean {
  return !!draftRow(q, bingoId);
}

export function getDraftStatus(q: Queryable, bingoId: string): BoardDraftStatus {
  const row = draftRow(q, bingoId);
  if (!row) return { hasChanges: false, revision: null, updatedAt: null, updatedBy: null };
  const name = row.updatedByUserId ? userLabelById(q, row.updatedByUserId, bingoId) : null;
  return {
    hasChanges: true,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedByUserId ? { id: row.updatedByUserId, name: name ?? "An Admin" } : null,
  };
}

/** The board the Admins' editor shows: the Draft board while there is one, else the Published board. */
export function getEditorBoard(db: Db, bingoId: string): DraftBoardResponse {
  const draft = draftRow(db, bingoId);
  const t = draft ? DRAFT_BOARD : PUBLISHED_BOARD;
  const bingo = draft ? null : db.select({ exclusivityRulesJson: bingos.exclusivityRulesJson, rulesMarkdown: bingos.rulesMarkdown }).from(bingos).where(eq(bingos.id, bingoId)).get();
  const settings = draft ?? bingo;
  return {
    board: { sealed: false, tiles: getBoardTiles(db, bingoId, t), lines: getBoardLines(db, bingoId, t) } as unknown as DraftBoardResponse["board"],
    categories: getCategories(db, bingoId, t),
    rulesMarkdown: settings?.rulesMarkdown ?? null,
    exclusivityRules: parseExclusivityRules(settings?.exclusivityRulesJson),
    status: getDraftStatus(db, bingoId),
  };
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

// Rows per INSERT: well under SQLite's bound-parameter limit at the widest table (nodes).
const CHUNK = 200;
function inChunks<T>(rows: T[], insert: (chunk: T[]) => void): void {
  for (let i = 0; i < rows.length; i += CHUNK) insert(rows.slice(i, i + CHUNK));
}

/** Copies the Published board into a new draft, unless the Bingo already has one. */
function ensureDraft(q: Queryable, bingoId: string, userId: string | null): void {
  if (draftRow(q, bingoId)) return;
  const p = loadRows(q, bingoId, PUBLISHED_BOARD);
  const d = DRAFT_BOARD;
  inChunks(p.categories, (c) => q.insert(d.tileCategories).values(c).run());
  inChunks(p.nodes, (c) => q.insert(d.nodes).values(c).run());
  inChunks(p.edges, (c) => q.insert(d.nodeEdges).values(c).run());
  inChunks(p.tiles, (c) => q.insert(d.tiles).values(c).run());
  inChunks(p.lines, (c) => q.insert(d.bingoLines).values(c).run());
  const now = clockNow();
  q.insert(boardDrafts)
    .values({ bingoId, revision: crypto.randomUUID(), exclusivityRulesJson: p.exclusivityRulesJson, rulesMarkdown: p.rulesMarkdown, updatedByUserId: userId, updatedAt: now, createdAt: now })
    .run();
}

function dropDraft(q: Queryable, bingoId: string): void {
  const d = DRAFT_BOARD;
  q.delete(d.bingoLines).where(eq(d.bingoLines.bingoId, bingoId)).run();
  q.delete(d.tiles).where(eq(d.tiles.bingoId, bingoId)).run();
  q.delete(d.nodeEdges).where(inArray(d.nodeEdges.parentId, q.select({ id: d.nodes.id }).from(d.nodes).where(eq(d.nodes.bingoId, bingoId)))).run();
  q.delete(d.nodes).where(eq(d.nodes.bingoId, bingoId)).run();
  q.delete(d.tileCategories).where(eq(d.tileCategories.bingoId, bingoId)).run();
  q.delete(boardDrafts).where(eq(boardDrafts.bingoId, bingoId)).run();
}

/** After an edit: a new revision and who made it, or no draft at all when the edit left it level with the Published board. */
function settleDraft(q: Queryable, bingoId: string, userId: string | null): void {
  if (sameBoard(loadRows(q, bingoId, PUBLISHED_BOARD), loadRows(q, bingoId, DRAFT_BOARD))) {
    dropDraft(q, bingoId);
    return;
  }
  q.update(boardDrafts).set({ revision: crypto.randomUUID(), updatedByUserId: userId, updatedAt: clockNow() }).where(eq(boardDrafts.bingoId, bingoId)).run();
}

/**
 * Runs one admin board edit against the Draft board: `edit` gets the DRAFT_BOARD table set to hand boardService. All of
 * it is one transaction, so a refused edit leaves the draft (and whether there is one) as it was.
 */
export function editDraft<T>(db: Db, bingoId: string, userId: string | null, edit: (t: BoardTables) => T): T {
  return db.transaction(() => {
    ensureDraft(db, bingoId, userId);
    const result = edit(DRAFT_BOARD);
    settleDraft(db, bingoId, userId);
    return result;
  });
}

/** The Exclusive Item rules and Rules text, which go through the draft with the Board (CONTEXT.md "Draft board"). */
export function updateDraftRules(db: Db, bingoId: string, userId: string | null, params: { rulesMarkdown?: string | null; exclusivityRules?: unknown }): void {
  editDraft(db, bingoId, userId, () => {
    const set: Partial<typeof boardDrafts.$inferInsert> = {};
    if (params.rulesMarkdown !== undefined) {
      if (params.rulesMarkdown !== null && typeof params.rulesMarkdown !== "string") throw new ServiceError(400, "rulesMarkdown must be a string");
      set.rulesMarkdown = params.rulesMarkdown || null;
    }
    if (params.exclusivityRules !== undefined) set.exclusivityRulesJson = JSON.stringify(normalizeExclusivityRules(params.exclusivityRules));
    if (Object.keys(set).length) db.update(boardDrafts).set(set).where(eq(boardDrafts.bingoId, bingoId)).run();
  });
}

// ---------------------------------------------------------------------------
// Comparing the two
// ---------------------------------------------------------------------------

const NODE_FIELDS = [
  "kind", "label", "description", "notes", "points", "minCount", "quantity", "itemName", "countsAs", "pointsGateNodeId", "submitGateNodeId",
  "allowsPreLoad", "valuedAsItemName", "valuedAsDivisor", "valuedAsSource", "requiresProof", "proofNote",
] as const satisfies readonly (keyof NodeRow)[];
const TILE_FIELDS = [
  "nodeId", "name", "imageUrl", "categoryId", "boardRow", "boardCol", "hasFreezePeriod", "freezeDurationMinutes", "notes", "requiresProof", "proofNote", "rulesText",
] as const satisfies readonly (keyof TileRow)[];
const LINE_FIELDS = ["nodeId", "lineType", "lineIndex"] as const satisfies readonly (keyof LineRow)[];
const CATEGORY_FIELDS = ["label", "colorHex", "sortOrder"] as const satisfies readonly (keyof CategoryRow)[];

function sameFields<T>(a: T, b: T, fields: readonly (keyof T)[]): boolean {
  return fields.every((f) => (a[f] ?? null) === (b[f] ?? null));
}

function rowsDiffer<T extends { id: string }>(before: T[], after: T[], fields: readonly (keyof T)[]): boolean {
  if (before.length !== after.length) return true;
  const byId = new Map(before.map((r) => [r.id, r]));
  return after.some((r) => {
    const old = byId.get(r.id);
    return !old || !sameFields(old, r, fields);
  });
}

const edgeKey = (e: EdgeRow) => `${e.parentId}>${e.childId}@${e.sortOrder}`;
const rulesKey = (json: string) => JSON.stringify(parseExclusivityRules(json));

function sameBoard(p: BoardRows, d: BoardRows): boolean {
  if (rowsDiffer(p.categories, d.categories, CATEGORY_FIELDS)) return false;
  if (rowsDiffer(p.tiles, d.tiles, TILE_FIELDS)) return false;
  if (rowsDiffer(p.lines, d.lines, LINE_FIELDS)) return false;
  if (rowsDiffer(p.nodes, d.nodes, NODE_FIELDS)) return false;
  const edges = new Set(p.edges.map(edgeKey));
  if (edges.size !== d.edges.length || d.edges.some((e) => !edges.has(edgeKey(e)))) return false;
  return rulesKey(p.exclusivityRulesJson) === rulesKey(d.exclusivityRulesJson) && (p.rulesMarkdown ?? "") === (d.rulesMarkdown ?? "");
}

/** One copy of the board, indexed for the diff. */
interface BoardModel {
  rows: BoardRows;
  node: Map<string, NodeRow>;
  children: Map<string, string[]>;
  tile: Map<string, TileRow>;
  category: Map<string, CategoryRow>;
}

function modelOf(rows: BoardRows): BoardModel {
  const children = new Map<string, string[]>();
  for (const e of [...rows.edges].sort((a, b) => a.sortOrder - b.sortOrder)) children.set(e.parentId, [...(children.get(e.parentId) ?? []), e.childId]);
  return {
    rows,
    node: new Map(rows.nodes.map((n) => [n.id, n])),
    children,
    tile: new Map(rows.tiles.map((t) => [t.id, t])),
    category: new Map(rows.categories.map((c) => [c.id, c])),
  };
}

// The glossary's readings of the Requirement Tree's conditions (CONTEXT.md "Requirement Tree").
function kindPhrase(n: NodeRow): string {
  switch (n.kind) {
    case "ALL": return "Complete all of";
    case "ANY": return "Complete any one of";
    case "COUNT": return `Complete at least ${n.minCount ?? "?"} of`;
    case "SUM": return `${n.quantity ?? "?"} of any (dupes count)`;
    case "ITEM": return "Item";
    case "MANUAL": return "Checked by a Moderator";
  }
}

function nodeName(n: NodeRow): string {
  if (n.label?.trim()) return n.label.trim();
  if (n.kind === "ITEM") return n.itemName ?? "Item";
  return kindPhrase(n);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Complete any one of · 3 Items · 10 pts": what an added or removed Part or Task holds. */
function nodeSummary(m: BoardModel, id: string): string {
  const n = m.node.get(id)!;
  const items = new Set<string>();
  const stack = [...(m.children.get(id) ?? [])];
  while (stack.length) {
    const c = stack.pop()!;
    if (items.has(c)) continue;
    const child = m.node.get(c);
    if (child?.kind === "ITEM") items.add(c);
    stack.push(...(m.children.get(c) ?? []));
  }
  const parts = [
    n.kind === "ITEM" ? (n.label?.trim() ? n.itemName : null) : n.label?.trim() ? kindPhrase(n) : null,
    n.kind === "ITEM" && n.countsAs !== 1 ? `counts as ${n.countsAs}` : null,
    items.size ? plural(items.size, "Item") : null,
    n.points ? `${n.points} pts` : null,
  ].filter((p): p is string => !!p);
  return parts.join(" · ");
}

const text = (v: string | null | undefined) => v?.trim() ?? "";
const yesNo = (v: boolean) => (v ? "Yes" : "No");

function pushField(fields: BoardFieldChange[], field: string, before: string, after: string): void {
  if (before !== after) fields.push({ field, before, after });
}

function nodeFieldChanges(before: NodeRow, after: NodeRow, p: BoardModel, d: BoardModel, pointsLabel = "Points"): BoardFieldChange[] {
  const fields: BoardFieldChange[] = [];
  const gate = (m: BoardModel, id: string | null) => (id ? (m.node.get(id) ? nodeName(m.node.get(id)!) : "A removed requirement") : "None");
  const valuedAs = (n: NodeRow) => (n.valuedAsItemName && n.valuedAsDivisor ? `${describeValuedAs({ itemName: n.valuedAsItemName, divisor: n.valuedAsDivisor })}${n.valuedAsSource ? ` (${n.valuedAsSource})` : ""}` : "None");
  pushField(fields, "Name", text(before.label), text(after.label));
  pushField(fields, "Kind", before.kind === after.kind ? "" : kindPhrase(before), before.kind === after.kind ? "" : kindPhrase(after));
  pushField(fields, pointsLabel, String(before.points), String(after.points));
  pushField(fields, "How many", before.minCount === null ? "" : String(before.minCount), after.minCount === null ? "" : String(after.minCount));
  pushField(fields, "Total", before.quantity === null ? "" : String(before.quantity), after.quantity === null ? "" : String(after.quantity));
  pushField(fields, "Item", text(before.itemName), text(after.itemName));
  pushField(fields, "Counts as", String(before.countsAs), String(after.countsAs));
  pushField(fields, "Description", text(before.description), text(after.description));
  pushField(fields, "Notes", text(before.notes), text(after.notes));
  pushField(fields, "Points gate", gate(p, before.pointsGateNodeId), gate(d, after.pointsGateNodeId));
  pushField(fields, "Submit gate", gate(p, before.submitGateNodeId), gate(d, after.submitGateNodeId));
  pushField(fields, "Pre-load", yesNo(before.allowsPreLoad), yesNo(after.allowsPreLoad));
  pushField(fields, "Valued as", valuedAs(before), valuedAs(after));
  pushField(fields, "Proof screenshot", before.requiresProof ? "Required" : "Not required", after.requiresProof ? "Required" : "Not required");
  pushField(fields, "Proof note", text(before.proofNote), text(after.proofNote));
  return fields;
}

/**
 * The changes inside one Tile present on both boards: a walk down from its root node through the nodes both boards
 * have. A child only one board has is listed once, as added or removed, and not walked into. `seen` keeps a node
 * shared between Tiles from being listed twice.
 */
function tileNodeChanges(rootId: string, p: BoardModel, d: BoardModel, seen: Set<string>): { rootFields: BoardFieldChange[]; nodes: BoardNodeChange[] } {
  const nodes: BoardNodeChange[] = [];
  let rootFields: BoardFieldChange[] = [];
  const visit = (id: string, path: string[]) => {
    if (seen.has(id)) return;
    seen.add(id);
    const before = p.node.get(id)!;
    const after = d.node.get(id)!;
    const isRoot = id === rootId;
    const fields = nodeFieldChanges(before, after, p, d, isRoot ? "Full-completion bonus" : "Points");
    const beforeKids = p.children.get(id) ?? [];
    const afterKids = d.children.get(id) ?? [];
    const childPath = isRoot ? path : [...path, nodeName(after)];
    for (const c of afterKids) {
      if (beforeKids.includes(c)) continue;
      if (p.node.has(c)) pushField(fields, "Now includes", "", nodeName(d.node.get(c)!));
      else nodes.push({ nodeId: c, change: "added", path: childPath, name: nodeName(d.node.get(c)!), summary: nodeSummary(d, c) || null, fields: [] });
    }
    for (const c of beforeKids) {
      if (afterKids.includes(c)) continue;
      if (d.node.has(c)) pushField(fields, "No longer includes", nodeName(p.node.get(c)!), "");
      else nodes.push({ nodeId: c, change: "removed", path: childPath, name: nodeName(p.node.get(c)!), summary: nodeSummary(p, c) || null, fields: [] });
    }
    const kept = (kids: string[], other: string[]) => kids.filter((c) => other.includes(c));
    const order = (kids: string[], m: BoardModel) => kids.map((c) => nodeName(m.node.get(c)!)).join(", ");
    const keptBefore = kept(beforeKids, afterKids);
    const keptAfter = kept(afterKids, beforeKids);
    if (keptBefore.join() !== keptAfter.join()) pushField(fields, isRoot ? "Order of Parts" : "Order", order(keptBefore, p), order(keptAfter, d));

    if (isRoot) rootFields = fields;
    else if (fields.length) nodes.push({ nodeId: id, change: "changed", path, name: nodeName(after), summary: null, fields });
    for (const c of keptAfter) visit(c, childPath);
  };
  visit(rootId, []);
  return { rootFields, nodes };
}

function tileFieldChanges(before: TileRow, after: TileRow, p: BoardModel, d: BoardModel): BoardFieldChange[] {
  const fields: BoardFieldChange[] = [];
  const category = (m: BoardModel, id: string | null) => (id ? (m.category.get(id)?.label ?? "None") : "None");
  const position = (t: TileRow) => `Row ${t.boardRow + 1}, Column ${t.boardCol + 1}`;
  const freeze = (t: TileRow) => (t.hasFreezePeriod ? `${t.freezeDurationMinutes} min` : "None");
  pushField(fields, "Name", before.name, after.name);
  pushField(fields, "Category", category(p, before.categoryId), category(d, after.categoryId));
  pushField(fields, "Position", position(before), position(after));
  if ((before.imageUrl ?? null) !== (after.imageUrl ?? null)) fields.push({ field: "Picture", before: before.imageUrl ? "The old picture" : "None", after: after.imageUrl ? "A new picture" : "None" });
  pushField(fields, "Freeze period", freeze(before), freeze(after));
  pushField(fields, "Notes", text(before.notes), text(after.notes));
  pushField(fields, "Proof screenshot (whole Tile)", before.requiresProof ? "Required" : "Not required", after.requiresProof ? "Required" : "Not required");
  pushField(fields, "Proof note", text(before.proofNote), text(after.proofNote));
  return fields;
}

function newTileFields(t: TileRow, m: BoardModel): BoardFieldChange[] {
  const fields: BoardFieldChange[] = [{ field: "Position", before: "", after: `Row ${t.boardRow + 1}, Column ${t.boardCol + 1}` }];
  if (t.categoryId) fields.push({ field: "Category", before: "", after: m.category.get(t.categoryId)?.label ?? "" });
  const bonus = m.node.get(t.nodeId)?.points ?? 0;
  if (bonus) fields.push({ field: "Full-completion bonus", before: "", after: String(bonus) });
  return fields;
}

/** A removed or added Tile's Parts, each listed as removed or added with it. */
function partsAs(change: "added" | "removed", t: TileRow, m: BoardModel): BoardNodeChange[] {
  return (m.children.get(t.nodeId) ?? []).map((c) => ({ nodeId: c, change, path: [], name: nodeName(m.node.get(c)!), summary: nodeSummary(m, c) || null, fields: [] }));
}

function lineName(l: LineRow): string {
  if (l.lineType === "row") return `Row ${l.lineIndex + 1}`;
  if (l.lineType === "column") return `Column ${l.lineIndex + 1}`;
  if (l.lineType === "diagonal") return `Diagonal ${l.lineIndex + 1}`;
  return "A custom line";
}

function lineChanges(p: BoardModel, d: BoardModel): BoardLineChange[] {
  const tilesOf = (m: BoardModel, l: LineRow) => {
    const byRoot = new Map(m.rows.tiles.map((t) => [t.nodeId, t.name]));
    return (m.children.get(l.nodeId) ?? []).map((id) => byRoot.get(id) ?? "?").join(", ");
  };
  const points = (m: BoardModel, l: LineRow) => String(m.node.get(l.nodeId)?.points ?? 0);
  const compare = (before: LineRow, after: LineRow): BoardLineChange | null => {
    const fields: BoardFieldChange[] = [];
    pushField(fields, "Bonus", points(p, before), points(d, after));
    pushField(fields, "Tiles", tilesOf(p, before), tilesOf(d, after));
    return fields.length ? { lineId: after.id, change: "changed", name: lineName(after), fields } : null;
  };
  // Regenerating the lines gives every line new ids, so a removed and an added line in the same place are one line changed.
  const place = (l: LineRow) => (l.lineType === "custom" ? null : `${l.lineType}:${l.lineIndex}`);
  const afterById = new Map(d.rows.lines.map((l) => [l.id, l]));
  const unmatchedAfter = new Map(d.rows.lines.filter((l) => !p.rows.lines.some((o) => o.id === l.id)).map((l) => [l.id, l]));
  const changes: BoardLineChange[] = [];
  for (const before of p.rows.lines) {
    const same = afterById.get(before.id);
    const moved = same ? undefined : [...unmatchedAfter.values()].find((l) => place(l) !== null && place(l) === place(before));
    const after = same ?? moved;
    if (moved) unmatchedAfter.delete(moved.id);
    if (!after) {
      changes.push({ lineId: before.id, change: "removed", name: lineName(before), fields: [{ field: "Bonus", before: points(p, before), after: "" }] });
      continue;
    }
    const change = compare(before, after);
    if (change) changes.push(change);
  }
  for (const after of unmatchedAfter.values()) changes.push({ lineId: after.id, change: "added", name: lineName(after), fields: [{ field: "Bonus", before: "", after: points(d, after) }] });
  return changes;
}

function categoryChanges(p: BoardModel, d: BoardModel): BoardCategoryChange[] {
  const changes: BoardCategoryChange[] = [];
  for (const before of p.rows.categories) {
    const after = d.category.get(before.id);
    if (!after) {
      changes.push({ categoryId: before.id, change: "removed", name: before.label, fields: [] });
      continue;
    }
    const fields: BoardFieldChange[] = [];
    pushField(fields, "Name", before.label, after.label);
    pushField(fields, "Colour", before.colorHex ?? "None", after.colorHex ?? "None");
    pushField(fields, "Order", String(before.sortOrder + 1), String(after.sortOrder + 1));
    if (fields.length) changes.push({ categoryId: before.id, change: "changed", name: after.label, fields });
  }
  for (const after of d.rows.categories) if (!p.category.has(after.id)) changes.push({ categoryId: after.id, change: "added", name: after.label, fields: [] });
  return changes;
}

function diffBoards(p: BoardModel, d: BoardModel): BoardDiff {
  const seen = new Set<string>();
  const tiles: BoardTileChange[] = [];
  const position = (t: TileRow) => t.boardRow * 1000 + t.boardCol;
  for (const after of [...d.rows.tiles].sort((a, b) => position(a) - position(b))) {
    const before = p.tile.get(after.id);
    if (!before) {
      tiles.push({ tileId: after.id, change: "added", name: after.name, fields: newTileFields(after, d), nodes: partsAs("added", after, d) });
      continue;
    }
    const { rootFields, nodes } = tileNodeChanges(after.nodeId, p, d, seen);
    const fields = [...tileFieldChanges(before, after, p, d), ...rootFields];
    if (fields.length || nodes.length) tiles.push({ tileId: after.id, change: "changed", name: after.name, fields, nodes });
  }
  for (const before of p.rows.tiles) {
    if (!d.tile.has(before.id)) tiles.push({ tileId: before.id, change: "removed", name: before.name, fields: [], nodes: partsAs("removed", before, p) });
  }
  return {
    tiles,
    lines: lineChanges(p, d),
    categories: categoryChanges(p, d),
    exclusivityRules: rulesKey(p.rows.exclusivityRulesJson) === rulesKey(d.rows.exclusivityRulesJson) ? null : { before: parseExclusivityRules(p.rows.exclusivityRulesJson), after: parseExclusivityRules(d.rows.exclusivityRulesJson) },
    rulesMarkdown: (p.rows.rulesMarkdown ?? "") === (d.rows.rulesMarkdown ?? "") ? null : { before: p.rows.rulesMarkdown, after: d.rows.rulesMarkdown },
  };
}

/** "1 Tile added", "2 Tiles changed", "Rules text changed": one line per kind of change. */
export function summarizeDiff(diff: BoardDiff): string[] {
  const counted = (items: { change: string }[], noun: string) =>
    (["added", "changed", "removed"] as const).flatMap((change) => {
      const n = items.filter((i) => i.change === change).length;
      return n ? [`${plural(n, noun)} ${change}`] : [];
    });
  const lines = [
    ...counted(diff.tiles, "Tile"),
    ...counted(diff.lines, "Line"),
    ...counted(diff.categories, "Category").map((s) => s.replace("Categorys", "Categories")),
    ...(diff.exclusivityRules ? ["Exclusive Item rules changed"] : []),
    ...(diff.rulesMarkdown ? ["Rules text changed"] : []),
  ];
  return lines.length ? lines : ["No changes"];
}

function removedClaims(q: Queryable, p: BoardModel, d: BoardModel): RemovedClaimsWarning {
  const removed = p.rows.nodes.filter((n) => !d.node.has(n.id)).map((n) => n.id);
  if (removed.length === 0) return { claims: 0, pending: 0, items: [] };
  const rows = q
    .select({ nodeId: claims.nodeId, status: submissions.status })
    .from(claims)
    .innerJoin(submissions, eq(claims.submissionId, submissions.id))
    .where(and(inArray(claims.nodeId, removed), inArray(submissions.status, ["pending", "approved"])))
    .all();
  const items = [...new Set(rows.map((r) => nodeName(p.node.get(r.nodeId)!)))].sort();
  return { claims: rows.length, pending: rows.filter((r) => r.status === "pending").length, items };
}

/** The Tiles and Parts on one board, by node id: a Tile's root node and its root's children. */
function completables(m: BoardModel): Map<string, CompletionChange> {
  const result = new Map<string, CompletionChange>();
  for (const t of m.rows.tiles) {
    result.set(t.nodeId, { kind: "tile", id: t.id, name: t.name, tileName: null });
    for (const c of m.children.get(t.nodeId) ?? []) if (!result.has(c)) result.set(c, { kind: "part", id: c, name: nodeName(m.node.get(c)!), tileName: t.name });
  }
  return result;
}

function previewScores(tx: Tx, bingoId: string, p: BoardModel, d: BoardModel): TeamScorePreview[] {
  const before = completables(p);
  const after = completables(d);
  const teamRows = tx.select({ id: teams.id, name: teams.name, color: teams.color }).from(teams).where(eq(teams.bingoId, bingoId)).orderBy(teams.name).all();
  return teamRows.map((team) => {
    const stored = tx.select({ nodeId: teamNodeState.nodeId, points: teamNodeState.pointsAwarded }).from(teamNodeState).where(eq(teamNodeState.teamId, team.id)).all();
    const adjustment = tx.select({ amount: teamPointAdjustments.amount }).from(teamPointAdjustments).where(eq(teamPointAdjustments.teamId, team.id)).all().reduce((s, a) => s + a.amount, 0);
    const scored = scoreTeam(tx, team.id, { t: DRAFT_BOARD, exclusivityRulesJson: d.rows.exclusivityRulesJson });
    const doneBefore = new Set(stored.map((s) => s.nodeId));
    const gained = [...after].filter(([id]) => scored.has(id) && !doneBefore.has(id)).map(([, c]) => c);
    const lost = [...before].filter(([id]) => doneBefore.has(id) && !scored.has(id)).map(([, c]) => c);
    return {
      teamId: team.id,
      teamName: team.name,
      color: team.color,
      before: stored.reduce((s, r) => s + r.points, 0) + adjustment,
      after: [...scored.values()].reduce((s, r) => s + r.pointsAwarded, 0) + adjustment,
      gained,
      lost,
    };
  });
}

/** Items whose Valued as the draft changes and that already have priced Submissions (re-priced only on request). */
function repriceable(tx: Tx, bingoId: string, p: BoardModel, d: BoardModel): RepriceableItem[] {
  const tileOf = (id: string) => {
    for (const t of d.rows.tiles) {
      const stack = [t.nodeId];
      const seen = new Set<string>();
      while (stack.length) {
        const n = stack.pop()!;
        if (n === id) return t.name;
        if (seen.has(n)) continue;
        seen.add(n);
        stack.push(...(d.children.get(n) ?? []));
      }
    }
    return null;
  };
  return d.rows.nodes
    .filter((n) => {
      const old = p.node.get(n.id);
      return n.kind === "ITEM" && old && !sameFields(old, n, ["valuedAsItemName", "valuedAsDivisor"]);
    })
    .map((n) => ({ nodeId: n.id, name: nodeName(n), tileName: tileOf(n.id), submissions: countPricedSubmissions(tx as unknown as Db, bingoId, n.id) }))
    .filter((i) => i.submissions > 0);
}

function buildPreview(tx: Tx, bingoId: string, revision: string): PublishPreview {
  const p = modelOf(loadRows(tx, bingoId, PUBLISHED_BOARD));
  const d = modelOf(loadRows(tx, bingoId, DRAFT_BOARD));
  const diff = diffBoards(p, d);
  return { revision, diff, summary: summarizeDiff(diff), removedClaims: removedClaims(tx, p, d), teams: previewScores(tx, bingoId, p, d), repriceable: repriceable(tx, bingoId, p, d) };
}

function requireDraft(q: Queryable, bingoId: string) {
  const row = draftRow(q, bingoId);
  if (!row) throw new ServiceError(409, "There are no unpublished board changes", "no_draft");
  return row;
}

/** What Publish would change: the diff, the Claims it stops counting, and every Team's points before and after. Writes nothing. */
export function getPublishPreview(db: Db, bingoId: string): PublishPreview {
  return db.transaction((tx) => buildPreview(tx, bingoId, requireDraft(tx, bingoId).revision));
}

// ---------------------------------------------------------------------------
// Publish and Discard
// ---------------------------------------------------------------------------

/** What can't be published: removing what a Proof screenshot names, or changing what a claimed Item asks for. */
function assertPublishable(tx: Tx, p: BoardModel, d: BoardModel): void {
  for (const tile of p.rows.tiles) {
    if (d.tile.has(tile.id)) continue;
    const proofs = tx.select({ id: submissions.id }).from(submissions).where(eq(submissions.proofTileId, tile.id)).all().length;
    if (proofs > 0) throw new ServiceError(409, `Can't publish: the draft removes "${tile.name}", but ${plural(proofs, "Proof screenshot")} were posted for it`);
  }
  for (const node of p.rows.nodes) {
    if (!d.node.has(node.id)) assertNoProofsFor(tx, node.id, nodeName(node));
  }
  for (const node of d.rows.nodes) {
    const old = p.node.get(node.id);
    if (!old || (old.kind === node.kind && old.itemName === node.itemName)) continue;
    const claimed = tx.select({ id: claims.id }).from(claims).where(eq(claims.nodeId, node.id)).all().length;
    if (claimed > 0) throw new ServiceError(409, `Can't publish: the draft changes "${nodeName(old)}" into something else, but ${plural(claimed, "submission claim")} refer to it`);
  }
}

const pick = <T, K extends keyof T>(row: T, fields: readonly K[]): Pick<T, K> => Object.fromEntries(fields.map((f) => [f, row[f]])) as Pick<T, K>;

/** Makes the Published board's rows match the draft's, keeping the id of every row both have. */
function applyDraft(tx: Tx, bingoId: string, p: BoardModel, d: BoardModel): void {
  const P = PUBLISHED_BOARD;

  // Categories first (Tiles point at them), nodes next (Tiles, Lines and edges point at them).
  for (const c of d.rows.categories) {
    const old = p.category.get(c.id);
    if (!old) tx.insert(P.tileCategories).values(c).run();
    else if (!sameFields(old, c, CATEGORY_FIELDS)) tx.update(P.tileCategories).set(pick(c, CATEGORY_FIELDS)).where(eq(P.tileCategories.id, c.id)).run();
  }
  // A node a Publish once removed (removedAt) is back when the draft names its id again.
  const removedBefore = new Set(tx.select({ id: schema.nodes.id }).from(schema.nodes).where(and(eq(schema.nodes.bingoId, bingoId), isNotNull(schema.nodes.removedAt))).all().map((n) => n.id));
  const fresh: NodeRow[] = [];
  for (const n of d.rows.nodes) {
    const old = p.node.get(n.id);
    if (old) {
      if (!sameFields(old, n, NODE_FIELDS)) tx.update(P.nodes).set(pick(n, NODE_FIELDS)).where(eq(P.nodes.id, n.id)).run();
    } else if (removedBefore.has(n.id)) {
      tx.update(schema.nodes).set({ ...pick(n, NODE_FIELDS), removedAt: null }).where(eq(schema.nodes.id, n.id)).run();
    } else {
      fresh.push(n);
    }
  }
  inChunks(fresh, (c) => tx.insert(P.nodes).values(c).run());

  // Edges have no identity of their own (nothing points at one): the draft's replace them.
  const nodeIds = tx.select({ id: schema.nodes.id }).from(schema.nodes).where(eq(schema.nodes.bingoId, bingoId));
  tx.delete(P.nodeEdges).where(inArray(P.nodeEdges.parentId, nodeIds)).run();
  inChunks(d.rows.edges, (c) => tx.insert(P.nodeEdges).values(c).run());

  // Tiles: removed ones go (with the Task interest on them); moved ones are parked off the grid first, so two Tiles
  // swapping places never meet on one cell.
  for (const t of p.rows.tiles) {
    if (d.tile.has(t.id)) continue;
    tx.delete(tileInterests).where(eq(tileInterests.tileId, t.id)).run();
    tx.delete(P.tiles).where(eq(P.tiles.id, t.id)).run();
  }
  const changed = d.rows.tiles.filter((t) => p.tile.has(t.id) && !sameFields(p.tile.get(t.id)!, t, TILE_FIELDS));
  changed.forEach((t, i) => tx.update(P.tiles).set({ boardRow: -1 - i, boardCol: -1 - i }).where(eq(P.tiles.id, t.id)).run());
  for (const t of changed) tx.update(P.tiles).set(pick(t, TILE_FIELDS)).where(eq(P.tiles.id, t.id)).run();
  inChunks(d.rows.tiles.filter((t) => !p.tile.has(t.id)), (c) => tx.insert(P.tiles).values(c).run());

  const linesBefore = new Map(p.rows.lines.map((l) => [l.id, l]));
  for (const l of p.rows.lines) if (!d.rows.lines.some((n) => n.id === l.id)) tx.delete(P.bingoLines).where(eq(P.bingoLines.id, l.id)).run();
  for (const l of d.rows.lines) {
    const old = linesBefore.get(l.id);
    if (!old) tx.insert(P.bingoLines).values(l).run();
    else if (!sameFields(old, l, LINE_FIELDS)) tx.update(P.bingoLines).set(pick(l, LINE_FIELDS)).where(eq(P.bingoLines.id, l.id)).run();
  }

  // Nodes the draft removed. A team's completions on them are rebuilt by the rescore; a raised hand on a removed Task
  // means nothing. One that Claims point at stays, off the board and no longer scoring (nodes.removedAt), so its
  // Claims and Submissions keep their history.
  const removed = p.rows.nodes.filter((n) => !d.node.has(n.id)).map((n) => n.id);
  if (removed.length) {
    tx.delete(teamNodeState).where(inArray(teamNodeState.nodeId, removed)).run();
    tx.delete(tileInterests).where(inArray(tileInterests.taskId, removed)).run();
    const claimed = new Set(tx.selectDistinct({ nodeId: claims.nodeId }).from(claims).where(inArray(claims.nodeId, removed)).all().map((c) => c.nodeId));
    const kept = removed.filter((id) => claimed.has(id));
    const gone = removed.filter((id) => !claimed.has(id));
    if (kept.length) tx.update(schema.nodes).set({ removedAt: clockNow() }).where(inArray(schema.nodes.id, kept)).run();
    if (gone.length) tx.delete(P.nodes).where(inArray(P.nodes.id, gone)).run();
  }

  for (const c of p.rows.categories) if (!d.category.has(c.id)) tx.delete(P.tileCategories).where(eq(P.tileCategories.id, c.id)).run();

  tx.update(bingos).set({ exclusivityRulesJson: d.rows.exclusivityRulesJson, rulesMarkdown: d.rows.rulesMarkdown }).where(eq(bingos.id, bingoId)).run();
}

/** Tile pictures only the draft points at: once it's gone, any no row uses any more can be deleted from disk. */
function draftOnlyImages(tx: Tx, bingoId: string): Set<string> {
  const urls = tx.select({ url: DRAFT_BOARD.tiles.imageUrl }).from(DRAFT_BOARD.tiles).where(eq(DRAFT_BOARD.tiles.bingoId, bingoId)).all().map((t) => t.url);
  const published = new Set(tx.select({ url: PUBLISHED_BOARD.tiles.imageUrl }).from(PUBLISHED_BOARD.tiles).where(eq(PUBLISHED_BOARD.tiles.bingoId, bingoId)).all().map((t) => t.url));
  return new Set(urls.filter((u): u is string => !!u?.startsWith("/uploads/") && !published.has(u)));
}

export interface PublishResult {
  preview: PublishPreview;
  /** /uploads/ files nothing points at any more (pictures the Publish replaced), for the caller to remove. */
  files: string[];
}

/**
 * Applies the Draft board to the Published board and rescores every Team, in one transaction. `revision` is the one
 * the Admin's preview showed: a draft changed since is refused (STALE_PREVIEW_CODE), so what's published is exactly
 * what was previewed.
 */
export function publishDraft(db: Db, bingo: { id: string; name: string }, revision: unknown, actorUserId?: string | null): PublishResult {
  if (typeof revision !== "string" || !revision) throw new ServiceError(400, "revision is required");
  return db.transaction((tx) => {
    const row = requireDraft(tx, bingo.id);
    if (row.revision !== revision) throw new ServiceError(409, "The draft board changed since this preview was made. Look over the changes again before publishing.", STALE_PREVIEW_CODE);
    const preview = buildPreview(tx, bingo.id, revision);
    const p = modelOf(loadRows(tx, bingo.id, PUBLISHED_BOARD));
    const d = modelOf(loadRows(tx, bingo.id, DRAFT_BOARD));
    assertPublishable(tx, p, d);
    const replacedImages = new Set(p.rows.tiles.map((t) => t.imageUrl).filter((u): u is string => !!u?.startsWith("/uploads/")));
    for (const u of draftOnlyImages(tx, bingo.id)) replacedImages.add(u);

    applyDraft(tx, bingo.id, p, d);
    dropDraft(tx, bingo.id);
    audit(tx, {
      action: "board.published",
      bingoId: bingo.id,
      entity: { type: "bingo", id: bingo.id, label: bingo.name },
      details: {
        summary: preview.summary,
        removedClaims: preview.removedClaims.claims,
        teams: preview.teams.map((t) => ({ teamId: t.teamId, teamName: t.teamName, before: t.before, after: t.after })),
      },
      ...(actorUserId ? { actor: { userId: actorUserId } } : {}),
    });
    rescoreBingoTx(tx, bingo.id);
    return { preview, files: unreferencedUploads(tx, replacedImages) };
  });
}

/** Throws the draft away: the Admins' editor shows the Published board again. Returns pictures only the draft used, to remove. */
export function discardDraft(db: Db, bingo: { id: string; name: string }, actorUserId?: string | null): { files: string[] } {
  return db.transaction((tx) => {
    requireDraft(tx, bingo.id);
    const summary = summarizeDiff(diffBoards(modelOf(loadRows(tx, bingo.id, PUBLISHED_BOARD)), modelOf(loadRows(tx, bingo.id, DRAFT_BOARD))));
    const images = draftOnlyImages(tx, bingo.id);
    dropDraft(tx, bingo.id);
    audit(tx, { action: "board.discarded", bingoId: bingo.id, entity: { type: "bingo", id: bingo.id, label: bingo.name }, details: { summary }, ...(actorUserId ? { actor: { userId: actorUserId } } : {}) });
    return { files: unreferencedUploads(tx, images) };
  });
}


/** 404 unless `id` is one of this Bingo's rows in that copy of the board: an edit can't reach another Bingo's board. */
// `allowMissing`: a delete of what isn't there is a no-op, as it always was; only another Bingo's row is refused.
export function assertOnBoard(q: Queryable, t: BoardTables, bingoId: string, kind: "tile" | "node" | "line" | "category", id: string, opts: { allowMissing?: boolean } = {}): void {
  const table = kind === "tile" ? t.tiles : kind === "node" ? t.nodes : kind === "line" ? t.bingoLines : t.tileCategories;
  const row = q.select({ bingoId: table.bingoId }).from(table).where(eq(table.id, id)).get();
  if (!row && opts.allowMissing) return;
  if (!row || row.bingoId !== bingoId) throw new ServiceError(404, `${kind === "node" ? "Task" : kind[0]!.toUpperCase() + kind.slice(1)} not found`);
}

export type BoardTablesArg = BoardTables;

/** The table set the editor reads: the Draft board's while there is one. */
export function editorTables(q: Queryable, bingoId: string): BoardTables {
  return hasDraft(q, bingoId) ? DRAFT_BOARD : PUBLISHED_BOARD;
}
