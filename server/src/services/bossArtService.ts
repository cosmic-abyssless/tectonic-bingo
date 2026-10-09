// Side images from the Board's bosses: the bosses that drop the Board's Items (the luck tables' sources, luck/), each
// as its OSRS Wiki page's own image (a transparent render of the monster), cut and drawn as a sticker like any upload
// and added to the end of the side pool. The bosses most of the Board's Items come from go first, as far as the pool
// has room; a boss already in the pool is left out, so the button can be pressed again after the Board grows.
//
// Each boss's image is downloaded once per server and kept as a stored original (wrapped-art/boss-<page>.png), the same
// file for every Bingo: a second Bingo with the same boss doesn't ask the wiki again, and the file's name is how a boss
// already in the pool is recognised (copied art keeps it).
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { maxWrappedArt, type WrappedBossArtResult } from "@bingo/shared";
import * as schema from "../db/schema";
import { bingos, nodes, wrappedArt } from "../db/schema";
import { USER_AGENT } from "../config";
import { audit } from "../audit/record";
import { skipsIntegrations } from "../audit/context";
import { log } from "../log";
import { BOSS_NAMES, BOSS_SOURCES, type BossMetric } from "./luck/bossSources";
import { getDropRates, type DropRateTable } from "./luck/dropRates";
import { ServiceError } from "./errors";
import { appendArt, checkImage, listArt, renderArt, WRAPPED_ART_DIR } from "./wrappedArtService";
import { removeFiles } from "./exportImages";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof bingos.$inferSelect;

const WIKI_API_URL = "https://oldschool.runescape.wiki/api.php";
const FETCH_TIMEOUT_MS = 15_000;
/** A wiki render is a few hundred KB; anything far past that isn't one. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** The longest side a boss's original is kept at (px): twice the sticker's, room enough to cut it again. */
const KEEP_SIZE = 1440;

/**
 * The wiki page whose image stands for a boss, where its drops' page doesn't show the boss: a raid's final boss for the
 * raid, a brother's armour for the Barrows chest, the Hunllef for the Gauntlet's reward chest, Sol Heredit for the Colosseum's.
 */
const IMAGE_PAGES: Partial<Record<BossMetric, string>> = {
  chambers_of_xeric: "Great Olm",
  chambers_of_xeric_challenge_mode: "Great Olm",
  theatre_of_blood: "Verzik Vitur",
  theatre_of_blood_hard_mode: "Verzik Vitur",
  tombs_of_amascut: "Tumeken's Warden",
  tombs_of_amascut_expert: "Tumeken's Warden",
  // The brothers themselves are drawn as pink ghosts; their armour, worn, reads as Barrows.
  barrows_chests: "Dharok the Wretched's equipment",
  the_gauntlet: "Crystalline Hunllef",
  the_corrupted_gauntlet: "Corrupted Hunllef",
  sol_heredit: "Sol Heredit",
};

/** The wiki page whose image stands for a boss. */
export function imagePageOf(metric: BossMetric): string {
  return IMAGE_PAGES[metric] ?? BOSS_SOURCES[metric][0]!.page;
}

/** A boss on the Board: its image's wiki page, what it's called, and how many of the Board's Items it drops. */
export interface BoardBoss {
  page: string;
  name: string;
  items: number;
}

/**
 * The bosses that drop the Board's Items, one per image (a raid's normal and hard mode share theirs), the bosses most
 * Items come from first, then by name.
 */
export function boardBosses(itemNames: readonly string[], rates: DropRateTable = getDropRates()): BoardBoss[] {
  const byPage = new Map<string, { name: string; items: Set<string> }>();
  for (const item of new Set(itemNames)) {
    for (const { metric } of rates.sourcesOf(item)) {
      const page = imagePageOf(metric);
      const boss = byPage.get(page) ?? { name: BOSS_NAMES[metric], items: new Set<string>() };
      boss.items.add(item.trim().toLowerCase());
      byPage.set(page, boss);
    }
  }
  return [...byPage]
    .map(([page, b]) => ({ page, name: b.name, items: b.items.size }))
    .sort((a, b) => b.items - a.items || a.name.localeCompare(b.name));
}

/** The stored original a boss's image is kept as: one per wiki page, the same for every Bingo. */
export function bossOriginalName(page: string): string {
  return `boss-${page.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.png`;
}

export const bossOriginalUrl = (page: string) => `/uploads/${WRAPPED_ART_DIR}/${bossOriginalName(page)}`;

type FetchLike = typeof fetch;

/** The URL of a wiki page's own image, at full size; null when it has none. */
async function pageImageUrl(page: string, fetchImpl: FetchLike): Promise<string | null> {
  const params = new URLSearchParams({ action: "query", prop: "pageimages", piprop: "original", redirects: "1", format: "json", titles: page });
  const res = await fetchImpl(`${WIKI_API_URL}?${params}`, { headers: { "User-Agent": `${USER_AGENT} boss art` }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`the wiki answered ${res.status}`);
  const body = (await res.json()) as { query?: { pages?: Record<string, { original?: { source?: string } }> } };
  return Object.values(body.query?.pages ?? {})[0]?.original?.source ?? null;
}

/**
 * A boss's image as a stored original, downloaded from the wiki the first time it's asked for. Null (with why) when
 * there's none to be had: the page has no image, or the wiki can't be asked from here.
 */
async function storedBossImage(uploadsDir: string, page: string, fetchImpl: FetchLike): Promise<{ url: string; written: string | null } | { reason: string }> {
  const file = path.join(uploadsDir, WRAPPED_ART_DIR, bossOriginalName(page));
  if (fs.existsSync(file)) return { url: bossOriginalUrl(page), written: null };
  if (process.env.OSRS_ITEM_SEARCH_DISABLED === "true" || skipsIntegrations()) return { reason: "the OSRS Wiki can't be reached from this server" };
  const source = await pageImageUrl(page, fetchImpl);
  if (!source) return { reason: "its wiki page has no image" };
  const res = await fetchImpl(source, { headers: { "User-Agent": `${USER_AGENT} boss art` }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`the wiki answered ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) return { reason: "its wiki image is too big" };
  await checkImage(bytes);
  const png = await sharp(bytes).resize({ width: KEEP_SIZE, height: KEEP_SIZE, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Written whole then moved in, so a second request racing this one never reads half a file.
  const partial = `${file}.${process.pid}.${Date.now()}.part`;
  fs.writeFileSync(partial, png);
  fs.renameSync(partial, file);
  return { url: bossOriginalUrl(page), written: file };
}

/** The Board's Items: what its ITEM nodes accept. */
function boardItems(db: Db, bingoId: string): string[] {
  return db
    .selectDistinct({ name: nodes.itemName })
    .from(nodes)
    .where(and(eq(nodes.bingoId, bingoId), eq(nodes.kind, "ITEM")))
    .all()
    .flatMap((r) => (r.name ? [r.name] : []));
}

/**
 * Adds the Board's bosses to the end of the side pool, the bosses most of its Items come from first, as many as the
 * pool has room for, leaving out the ones already in it. One audit entry for the lot.
 */
export async function addBoardBosses(db: Db, uploadsDir: string, bingo: Bingo, fetchImpl: FetchLike = fetch): Promise<WrappedBossArtResult> {
  const bosses = boardBosses(boardItems(db, bingo.id));
  if (bosses.length === 0) throw new ServiceError(400, "None of the Board's Items come from a boss we know the drops of");
  const max = maxWrappedArt("side");
  const pool = () => db.select({ originalUrl: wrappedArt.originalUrl }).from(wrappedArt).where(and(eq(wrappedArt.bingoId, bingo.id), eq(wrappedArt.section, "side"))).all();
  const inPool = new Set(pool().map((r) => r.originalUrl));
  const wanted = bosses.filter((b) => !inPool.has(bossOriginalUrl(b.page)));
  if (wanted.length === 0) throw new ServiceError(400, "Every boss on the Board is already a side image");
  if (inPool.size >= max) throw new ServiceError(400, `The side images are full (${max}); remove some first`);

  const added: string[] = [];
  const skipped: WrappedBossArtResult["skipped"] = [];
  for (const boss of wanted) {
    if (pool().length >= max) {
      skipped.push({ name: boss.name, reason: `the side images are full (${max})` });
      continue;
    }
    let stored: Awaited<ReturnType<typeof storedBossImage>>;
    try {
      stored = await storedBossImage(uploadsDir, boss.page, fetchImpl);
    } catch (err) {
      log.warn("boss art: fetching failed", { page: boss.page, err: err instanceof Error ? err.message : String(err) });
      skipped.push({ name: boss.name, reason: "the OSRS Wiki didn't send its image" });
      continue;
    }
    if ("reason" in stored) {
      skipped.push({ name: boss.name, reason: stored.reason });
      continue;
    }
    let rendered: Awaited<ReturnType<typeof renderArt>>;
    try {
      rendered = await renderArt(uploadsDir, { url: stored.url });
    } catch (err) {
      // An image that can't be cut out is no use to the next Bingo either.
      if (stored.written) removeFiles([stored.written]);
      skipped.push({ name: boss.name, reason: err instanceof ServiceError ? err.message : "its image couldn't be cut out" });
      continue;
    }
    try {
      db.transaction((tx) => {
        appendArt(tx, bingo.id, "side", rendered);
      });
      added.push(boss.name);
    } catch (err) {
      removeFiles(rendered.files);
      throw err;
    }
  }
  if (added.length > 0) audit(db, { action: "wrapped.art_bosses_added", bingoId: bingo.id, entity: { type: "bingo", id: bingo.id, label: bingo.name }, details: { bosses: added } });
  return { art: listArt(db, bingo.id), added, skipped };
}
