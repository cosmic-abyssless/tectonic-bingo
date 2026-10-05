// Tags (CONTEXT.md "Tag"): words the board's search finds a Tile by, on a Tile or on one of its Parts, never shown to
// Players. The board editor reads and edits them (Admins only), on the Draft board like the rest of the Board: the
// editing functions take the table set they work on (boardTables.ts), the Published board unless told otherwise. The
// full board carries the Published board's tag texts (tileSearchTags) for the search, which matches in the browser. A
// Boss tag's aliases are fetched from the OSRS Wiki once, when it's added, and stored as Text tags marked with it:
// nothing here calls the wiki at search time.
import { and, asc, eq, inArray, max } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { TAG_MAX_LENGTH, normalizeTagText, tagKey, type BoardTagsResponse, type ExportTag, type Tag } from "@bingo/shared";
import * as schema from "../db/schema";
import { nodeEdges, tags, tiles } from "../db/schema";
import { audit, markAuditedNoop } from "../audit/record";
import { ServiceError } from "./errors";
import { bossAliases, WikiUnavailableError, type OsrsWikiClient } from "./osrsWikiService";
import { PUBLISHED_BOARD, type BoardTables } from "./boardTables";

type Db = BetterSQLite3Database<typeof schema>;
type TagRow = BoardTables["tags"]["$inferSelect"];
type BossPage = NonNullable<Awaited<ReturnType<OsrsWikiClient["bossPage"]>>>;

// A Draft board edit is seen by Admins only, so it isn't audited on its own: its Publish is (boardDraftService).
function auditTag(db: Db, t: BoardTables, input: Parameters<typeof audit<"tag.added" | "tag.removed">>[1]): void {
  if (t.draft) markAuditedNoop();
  else audit(db, input);
}

/** What a tag is on: a Tile, or one of its Parts (a tile node's direct child) by its node id. */
export type TagOwner = { tileId: string } | { partId: string };

interface ResolvedOwner {
  tile: { id: string; name: string };
  part: { id: string; label: string | null } | null;
}

function toTag(row: TagRow): Tag {
  return { id: row.id, kind: row.kind, text: row.text, bossTagId: row.bossTagId };
}

// The Tile or Part, checked to be on this bingo's board. A Part is a direct child of a Tile's node.
function resolveOwner(db: Db, bingoId: string, owner: TagOwner, t: BoardTables): ResolvedOwner {
  const { tiles, nodes, nodeEdges } = t;
  if ("tileId" in owner) {
    const tile = db.select({ id: tiles.id, name: tiles.name }).from(tiles).where(and(eq(tiles.id, owner.tileId), eq(tiles.bingoId, bingoId))).get();
    if (!tile) throw new ServiceError(404, "Tile not found");
    return { tile, part: null };
  }
  const part = db.select({ id: nodes.id, label: nodes.label }).from(nodes).where(and(eq(nodes.id, owner.partId), eq(nodes.bingoId, bingoId))).get();
  const tile = part
    ? db
        .select({ id: tiles.id, name: tiles.name })
        .from(nodeEdges)
        .innerJoin(tiles, eq(tiles.nodeId, nodeEdges.parentId))
        .where(eq(nodeEdges.childId, part.id))
        .get()
    : undefined;
  if (!part || !tile) throw new ServiceError(404, "Part not found");
  return { tile, part };
}

function ownerFilter(owner: ResolvedOwner, t: BoardTables) {
  return owner.part ? eq(t.tags.nodeId, owner.part.id) : eq(t.tags.tileId, owner.tile.id);
}

function ownerRows(db: Db, owner: ResolvedOwner, t: BoardTables): TagRow[] {
  return db.select().from(t.tags).where(ownerFilter(owner, t)).orderBy(asc(t.tags.sortOrder)).all();
}

function nextSortOrder(db: Db, owner: ResolvedOwner, t: BoardTables): number {
  const row = db.select({ last: max(t.tags.sortOrder) }).from(t.tags).where(ownerFilter(owner, t)).get();
  return (row?.last ?? -1) + 1;
}

/** A Text tag as stored: trimmed, and refused when empty or over the limit. */
export function validateTagText(raw: unknown): string {
  const text = typeof raw === "string" ? normalizeTagText(raw) : "";
  if (!text) throw new ServiceError(400, "A tag can't be empty");
  if (text.length > TAG_MAX_LENGTH) throw new ServiceError(400, `A tag can be at most ${TAG_MAX_LENGTH} characters`);
  return text;
}

/** Every tag on the board, by Tile and by Part, in the order they were added: what the board editor shows. */
export function getBoardTags(db: Db, bingoId: string, t: BoardTables = PUBLISHED_BOARD): BoardTagsResponse {
  const result: BoardTagsResponse = { tiles: {}, parts: {} };
  for (const row of db.select().from(t.tags).where(eq(t.tags.bingoId, bingoId)).orderBy(asc(t.tags.sortOrder)).all()) {
    const bucket = row.nodeId ? (result.parts[row.nodeId] ??= []) : (result.tiles[row.tileId!] ??= []);
    bucket.push(toTag(row));
  }
  return result;
}

function insertTags(db: Db, bingoId: string, owner: ResolvedOwner, values: { kind: Tag["kind"]; text: string; bossTagId?: string | null }[], t: BoardTables): TagRow[] {
  if (values.length === 0) return [];
  const first = nextSortOrder(db, owner, t);
  return db
    .insert(t.tags)
    .values(values.map((v, i) => ({ bingoId, tileId: owner.part ? null : owner.tile.id, nodeId: owner.part?.id ?? null, kind: v.kind, text: v.text, bossTagId: v.bossTagId ?? null, sortOrder: first + i })))
    .returning()
    .all();
}

/**
 * Adds a Text tag to a Tile or Part and returns its tags. One it already has, whatever the capitals, is ignored.
 */
export function addTextTag(db: Db, bingoId: string, owner: TagOwner, rawText: unknown, t: BoardTables = PUBLISHED_BOARD): Tag[] {
  const text = validateTagText(rawText);
  return db.transaction((tx) => {
    const resolved = resolveOwner(tx, bingoId, owner, t);
    const existing = ownerRows(tx, resolved, t);
    if (existing.some((r) => tagKey(r.text) === tagKey(text))) {
      markAuditedNoop();
      return existing.map(toTag);
    }
    insertTags(tx, bingoId, resolved, [{ kind: "text", text }], t);
    auditTag(tx, t, {
      action: "tag.added",
      bingoId,
      entity: { type: "tile", id: resolved.tile.id, label: resolved.tile.name },
      details: { tileName: resolved.tile.name, partLabel: resolved.part?.label ?? null, kind: "text", text },
    });
    return ownerRows(tx, resolved, t).map(toTag);
  });
}

const hasBoss = (rows: TagRow[], title: string) => rows.some((r) => r.kind === "boss" && tagKey(r.text) === tagKey(title));

/**
 * The first half of adding a Boss tag, by its OSRS Wiki page title: asks the wiki for the boss (once, here; an
 * unreachable wiki fails the add with a readable message). Writes nothing, so the asking happens outside any
 * transaction. A boss the Tile or Part already has needs no lookup: its tags come back as they are.
 */
export async function lookUpBoss(db: Db, bingoId: string, owner: TagOwner, rawTitle: unknown, wiki: OsrsWikiClient, t: BoardTables = PUBLISHED_BOARD): Promise<{ boss: BossPage } | { tags: Tag[] }> {
  const asked = typeof rawTitle === "string" ? rawTitle.trim() : "";
  if (!asked) throw new ServiceError(400, "Pick a boss");
  const before = resolveOwner(db, bingoId, owner, t);
  if (hasBoss(ownerRows(db, before, t), asked)) return { tags: ownerRows(db, before, t).map(toTag) };
  let page;
  try {
    page = await wiki.bossPage(asked);
  } catch (err) {
    if (err instanceof WikiUnavailableError) throw new ServiceError(502, `Couldn't reach the OSRS Wiki to look up "${asked}". Try again in a moment.`);
    throw err;
  }
  if (!page) throw new ServiceError(400, `"${asked}" isn't a boss on the OSRS Wiki`);
  return { boss: page };
}

/**
 * The second half: adds the Boss tag the wiki answered with, and the wiki's other names for the boss as Text tags
 * marked with it (bossAliases, without any the Tile or Part already has). A boss it already has is ignored.
 */
export function addBossTagFromPage(db: Db, bingoId: string, owner: TagOwner, boss: BossPage, t: BoardTables = PUBLISHED_BOARD): Tag[] {
  return db.transaction((tx) => {
    // Looked up again: the board may have changed while the wiki answered.
    const resolved = resolveOwner(tx, bingoId, owner, t);
    const existing = ownerRows(tx, resolved, t);
    if (hasBoss(existing, boss.title)) {
      markAuditedNoop();
      return existing.map(toTag);
    }
    const taken = new Set(existing.map((r) => tagKey(r.text)));
    const aliases = bossAliases(boss.title, boss.redirects).filter((alias) => !taken.has(tagKey(alias)));
    const [bossTag] = insertTags(tx, bingoId, resolved, [{ kind: "boss", text: boss.title }], t);
    insertTags(tx, bingoId, resolved, aliases.map((text) => ({ kind: "text" as const, text, bossTagId: bossTag!.id })), t);
    auditTag(tx, t, {
      action: "tag.added",
      bingoId,
      entity: { type: "tile", id: resolved.tile.id, label: resolved.tile.name },
      details: { tileName: resolved.tile.name, partLabel: resolved.part?.label ?? null, kind: "boss", text: boss.title, aliases: aliases.length },
    });
    return ownerRows(tx, resolved, t).map(toTag);
  });
}

/** Both halves at once (lookUpBoss, then addBossTagFromPage): a Boss tag added straight to the given board. */
export async function addBossTag(db: Db, bingoId: string, owner: TagOwner, rawTitle: unknown, wiki: OsrsWikiClient, t: BoardTables = PUBLISHED_BOARD): Promise<Tag[]> {
  const found = await lookUpBoss(db, bingoId, owner, rawTitle, wiki, t);
  if ("tags" in found) {
    markAuditedNoop();
    return found.tags;
  }
  return addBossTagFromPage(db, bingoId, owner, found.boss, t);
}

/** Removes a tag; removing a Boss tag also removes the Text tags it added. Returns the Tile's or Part's tags left. */
export function removeTag(db: Db, bingoId: string, tagId: string, t: BoardTables = PUBLISHED_BOARD): Tag[] {
  const { tags } = t;
  return db.transaction((tx) => {
    const row = tx.select().from(tags).where(and(eq(tags.id, tagId), eq(tags.bingoId, bingoId))).get();
    if (!row) throw new ServiceError(404, "Tag not found");
    const resolved = resolveOwner(tx, bingoId, row.nodeId ? { partId: row.nodeId } : { tileId: row.tileId! }, t);
    const aliases = row.kind === "boss" ? tx.select({ id: tags.id }).from(tags).where(eq(tags.bossTagId, row.id)).all().length : 0;
    if (row.kind === "boss") tx.delete(tags).where(eq(tags.bossTagId, row.id)).run();
    tx.delete(tags).where(eq(tags.id, row.id)).run();
    auditTag(tx, t, {
      action: "tag.removed",
      bingoId,
      entity: { type: "tile", id: resolved.tile.id, label: resolved.tile.name },
      details: { tileName: resolved.tile.name, partLabel: resolved.part?.label ?? null, kind: row.kind, text: row.text, ...(row.kind === "boss" ? { aliases } : {}) },
    });
    return ownerRows(tx, resolved, t).map(toTag);
  });
}

/**
 * Each Tile's tag texts, its Parts' included, by Tile id: what the board's search matches in the browser (the full
 * board carries them, never the sealed one). Tiles without tags are left out.
 */
export function tileSearchTags(db: Db, bingoId: string): Record<string, string[]> {
  const rows = db.select({ tileId: tags.tileId, nodeId: tags.nodeId, text: tags.text }).from(tags).where(eq(tags.bingoId, bingoId)).orderBy(asc(tags.sortOrder)).all();
  const partIds = [...new Set(rows.flatMap((r) => (r.nodeId ? [r.nodeId] : [])))];
  // A Part's Tile: the Tile whose node is the Part's parent.
  const tileOfPart = new Map(
    partIds.length > 0
      ? db.select({ partId: nodeEdges.childId, tileId: tiles.id }).from(nodeEdges).innerJoin(tiles, eq(tiles.nodeId, nodeEdges.parentId)).where(inArray(nodeEdges.childId, partIds)).all().map((r) => [r.partId, r.tileId])
      : [],
  );
  const out: Record<string, string[]> = {};
  for (const row of rows) {
    const tileId = row.tileId ?? (row.nodeId ? tileOfPart.get(row.nodeId) : undefined);
    if (tileId) (out[tileId] ??= []).push(row.text);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Export / import: every tag, a Boss tag with the aliases it added, as they stand. No wiki involved.
// ---------------------------------------------------------------------------

function toExportTags(rows: TagRow[]): ExportTag[] {
  const aliasesOf = new Map<string, string[]>();
  for (const row of rows) if (row.bossTagId) aliasesOf.set(row.bossTagId, [...(aliasesOf.get(row.bossTagId) ?? []), row.text]);
  return rows.flatMap((row): ExportTag[] => {
    if (row.kind === "boss") return [{ kind: "boss", text: row.text, aliases: aliasesOf.get(row.id) ?? [] }];
    // An alias travels with its Boss tag.
    if (row.bossTagId && rows.some((r) => r.id === row.bossTagId)) return [];
    return [{ kind: "text", text: row.text }];
  });
}

/** A bingo's tags as the export carries them, by Tile id and by Part (node) id. */
export function exportTags(db: Db, bingoId: string): { tiles: Map<string, ExportTag[]>; parts: Map<string, ExportTag[]> } {
  const rows = db.select().from(tags).where(eq(tags.bingoId, bingoId)).orderBy(asc(tags.sortOrder)).all();
  const group = (key: (r: TagRow) => string | null) => {
    const byOwner = new Map<string, TagRow[]>();
    for (const row of rows) {
      const k = key(row);
      if (k) byOwner.set(k, [...(byOwner.get(k) ?? []), row]);
    }
    return new Map([...byOwner].map(([k, list]) => [k, toExportTags(list)]));
  };
  return { tiles: group((r) => (r.nodeId ? null : r.tileId)), parts: group((r) => r.nodeId) };
}

/** Checks a file's tags before anything is imported. Absent is fine (an older file): no tags. */
export function assertValidExportTags(input: unknown, where: string): void {
  if (input === undefined) return;
  if (!Array.isArray(input)) throw new ServiceError(400, `Malformed import file: ${where}'s tags must be an array`);
  for (const tag of input as unknown[]) {
    const t = tag as Partial<{ kind: unknown; text: unknown; aliases: unknown }> | null;
    if (!t || (t.kind !== "text" && t.kind !== "boss") || typeof t.text !== "string" || !t.text.trim()) {
      throw new ServiceError(400, `Malformed import file: ${where} has a tag that isn't one`);
    }
    if (t.kind === "boss" && (!Array.isArray(t.aliases) || t.aliases.some((a) => typeof a !== "string"))) {
      throw new ServiceError(400, `Malformed import file: ${where}'s boss tag "${t.text}" has no list of aliases`);
    }
  }
}

/** Restores an exported Tile's or Part's tags exactly as they were exported (trimmed), in their order. */
export function importTags(db: Db, bingoId: string, owner: TagOwner, list: ExportTag[] | undefined): void {
  if (!list?.length) return;
  const resolved = resolveOwner(db, bingoId, owner, PUBLISHED_BOARD);
  for (const tag of list) {
    const [row] = insertTags(db, bingoId, resolved, [{ kind: tag.kind, text: normalizeTagText(tag.text) }], PUBLISHED_BOARD);
    if (tag.kind === "boss") {
      insertTags(db, bingoId, resolved, tag.aliases.map((alias) => ({ kind: "text" as const, text: normalizeTagText(alias), bossTagId: row!.id })).filter((a) => a.text), PUBLISHED_BOARD);
    }
  }
}

