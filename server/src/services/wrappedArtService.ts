// Wrapped art (#262): decorative cut-outs in groups (a section's Category images, or the side pool), uploaded by an
// Admin one at a time as a transparent PNG or as a screenshot on one solid colour (keyed out here), and drawn as a
// sticker on torn paper (stickerEffect.ts), once per upload. The upload is kept as it was, so it can be re-cut with
// other keying settings without a new screenshot.
// A new Bingo starts with the previous Bingo's art: copied rows pointing at the same files, which is why replacing or
// removing art never deletes a file (the same as tile images).
// Credits (CONTEXT.md, #281) live here too: each Category image can credit someone (captioned on it), and each category
// can hold additional credits with no image (bingos.wrapped_art_credits_json). Side images carry no credits.
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { and, asc, desc, eq, inArray, not, like, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  MAX_WRAPPED_CREDITS,
  MAX_WRAPPED_CREDIT_LENGTH,
  WRAPPED_ART_GROUPS,
  WRAPPED_ART_KEYING_DEFAULTS,
  WRAPPED_ART_SECTIONS,
  isWrappedArtGroup,
  isWrappedArtSection,
  maxWrappedArt,
  type ExportImage,
  type WrappedArtGroup,
  type WrappedArtImage,
  type WrappedArtKeying,
  type WrappedArtCredits,
  type WrappedArtSection,
  type WrappedArtSet,
  type WrappedCredit,
} from "@bingo/shared";
import * as schema from "../db/schema";
import { bingos, wrappedArt } from "../db/schema";
import { audit } from "../audit/record";
import { now as clockNow } from "../clock";
import { ServiceError } from "./errors";
import { CutOutError, cutOut, renderSticker } from "./stickerEffect";
import { newUploadName, MAX_UPLOAD_MB } from "../middleware/upload";
import { removeFiles } from "./exportImages";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;
type Bingo = typeof bingos.$inferSelect;
type Row = typeof wrappedArt.$inferSelect;

export const WRAPPED_ART_DIR = "wrapped-art";
/** Longest side of a frame, px: room for a phone's high-density screen at the size the story shows it. */
const FRAME_SIZE = 720;
/** A decompression-bomb guard, as for imported tile images. */
const MAX_PIXELS = 50_000_000;
const ACCEPTED_FORMATS: Record<string, string> = { png: ".png", jpeg: ".jpg", webp: ".webp", gif: ".gif" };
const CONTENT_TYPE_BY_EXT: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
/** An original this service stored: exactly this shape, no directories in it. */
const STORED_URL = /^\/uploads\/wrapped-art\/([A-Za-z0-9._-]+)$/;
/** Generated test Bingos (devTestDataService) are never the "previous Bingo" a real one copies its art from. */
const TESTDATA_PREFIX = "testdata-";

const KEYING_LIMITS = { tolerance: [0, 200], softness: [1, 300] } as const;

/** Keying settings from a request, checked; missing ones are the defaults. */
export function parseKeying(input: { tolerance?: unknown; softness?: unknown }): WrappedArtKeying {
  const read = (key: keyof WrappedArtKeying) => {
    const raw = input[key];
    if (raw === undefined || raw === null || raw === "") return WRAPPED_ART_KEYING_DEFAULTS[key];
    const n = Number(raw);
    const [min, max] = KEYING_LIMITS[key];
    if (!Number.isInteger(n) || n < min || n > max) throw new ServiceError(400, `${key} must be a whole number from ${min} to ${max}`);
    return n;
  };
  return { tolerance: read("tolerance"), softness: read("softness") };
}

export function parseGroup(value: unknown): WrappedArtGroup {
  if (!isWrappedArtGroup(value)) throw new ServiceError(404, "No such Wrapped art group");
  return value;
}

/** A section (never "side"): what credits belong to. */
export function parseSection(value: unknown): WrappedArtSection {
  if (!isWrappedArtSection(value)) throw new ServiceError(404, "No such Wrapped art category");
  return value;
}

/**
 * One credit from a client or an import, checked and trimmed: an empty role reads as none. Null (or a blank name and
 * role) is no credit.
 */
export function normalizeCredit(input: unknown): WrappedCredit | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== "object" || Array.isArray(input)) throw new ServiceError(400, "A credit must be a name and a role");
  const entry = input as Partial<Record<keyof WrappedCredit, unknown>>;
  const name = typeof entry.name === "string" ? entry.name.trim() : "";
  const role = typeof entry.role === "string" ? entry.role.trim() : "";
  if (!name && !role) return null;
  if (!name) throw new ServiceError(400, `The credit "${role}" needs a name`);
  if (name.length > MAX_WRAPPED_CREDIT_LENGTH || role.length > MAX_WRAPPED_CREDIT_LENGTH) throw new ServiceError(400, `Credit names and roles are at most ${MAX_WRAPPED_CREDIT_LENGTH} characters`);
  return { name, role: role || null };
}

/** A category's additional credits from a client or an import: each checked as normalizeCredit, blank rows dropped, order kept. */
export function normalizeCredits(input: unknown): WrappedCredit[] {
  if (!Array.isArray(input)) throw new ServiceError(400, "credits must be an array");
  const credits = input.map(normalizeCredit).filter((c): c is WrappedCredit => c !== null);
  if (credits.length > MAX_WRAPPED_CREDITS) throw new ServiceError(400, `At most ${MAX_WRAPPED_CREDITS} credits per category`);
  return credits;
}

/** The additional credits a bingo row holds. Tolerant: a bad column, or a bad category in it, reads as none. */
export function parseAdditionalCredits(json: string | null | undefined): WrappedArtCredits {
  const credits: WrappedArtCredits = {};
  let value: unknown;
  try {
    value = JSON.parse(json ?? "{}");
  } catch {
    return credits;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return credits;
  for (const section of WRAPPED_ART_SECTIONS) {
    const list = (value as Record<string, unknown>)[section];
    if (!Array.isArray(list)) continue;
    const valid = list.filter((c): c is WrappedCredit => !!c && typeof c === "object" && typeof (c as WrappedCredit).name === "string" && (c as WrappedCredit).name !== "");
    if (valid.length > 0) credits[section] = valid.map((c) => ({ name: c.name, role: typeof c.role === "string" && c.role ? c.role : null }));
  }
  return credits;
}

const hex = (c: { r: number; g: number; b: number }) => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

function toImage(row: Row): WrappedArtImage {
  return {
    id: row.id,
    group: row.section as WrappedArtGroup,
    originalUrl: row.originalUrl,
    frames: [row.frame1Url, row.frame2Url],
    keying: row.keyTolerance !== null && row.keySoftness !== null ? { tolerance: row.keyTolerance, softness: row.keySoftness } : null,
    keyColor: row.keyColor,
    credit: creditOf(row),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function creditOf(row: Row): WrappedCredit | null {
  return row.creditName && row.section !== "side" ? { name: row.creditName, role: row.creditRole || null } : null;
}

/** A Bingo's images (optionally one group's), in story order: group by group, each in its own order. */
function rows(db: Queryable, bingoId: string, group?: WrappedArtGroup): Row[] {
  const order = (s: string) => (WRAPPED_ART_GROUPS as readonly string[]).indexOf(s);
  return db
    .select()
    .from(wrappedArt)
    .where(group ? and(eq(wrappedArt.bingoId, bingoId), eq(wrappedArt.section, group)) : eq(wrappedArt.bingoId, bingoId))
    .orderBy(asc(wrappedArt.sortOrder), asc(sql`rowid`))
    .all()
    .filter((r) => order(r.section) >= 0)
    .sort((a, b) => order(a.section) - order(b.section));
}

/** Every image, for the admin UI, in story order. */
export function listArt(db: Queryable, bingoId: string): WrappedArtImage[] {
  return rows(db, bingoId).map(toImage);
}

/** A Bingo's additional credits, by category. */
export function additionalCredits(db: Queryable, bingoId: string): WrappedArtCredits {
  const row = db.select({ json: bingos.wrappedArtCreditsJson }).from(bingos).where(eq(bingos.id, bingoId)).get();
  return parseAdditionalCredits(row?.json);
}

/** What the story shows: each section's Category images with their credits, each category's additional credits, and the side pool. */
export function artSet(db: Queryable, bingoId: string): WrappedArtSet {
  const set: WrappedArtSet = { sections: {}, additionalCredits: additionalCredits(db, bingoId), side: [] };
  for (const r of rows(db, bingoId)) {
    const frames: [string, string] = [r.frame1Url, r.frame2Url];
    if (r.section === "side") set.side.push(frames);
    else if (isWrappedArtSection(r.section)) (set.sections[r.section] ??= []).push({ frames, credit: creditOf(r) });
  }
  return set;
}

/** An upload's bytes, checked: an image of a format we accept (never SVG), not a decompression bomb. Returns its extension. */
export async function checkImage(buffer: Buffer): Promise<string> {
  let format: string | undefined;
  try {
    format = (await sharp(buffer, { limitInputPixels: MAX_PIXELS }).metadata()).format;
    await sharp(buffer, { limitInputPixels: MAX_PIXELS }).resize({ width: 16 }).toBuffer(); // a full decode: a truncated file fails here
  } catch {
    throw new ServiceError(400, "That file can't be read as an image");
  }
  const ext = format ? ACCEPTED_FORMATS[format] : undefined;
  if (!ext) throw new ServiceError(400, `That's a ${format ?? "unknown"} file; upload a PNG, JPEG, WebP or GIF (at most ${MAX_UPLOAD_MB} MB)`);
  return ext;
}

/** What renderArt made: the row's values, and every file it wrote (to clean up if what follows fails). */
export interface RenderedArt {
  originalUrl: string;
  frames: [string, string];
  keyColor: string | null;
  keying: WrappedArtKeying | null;
  files: string[];
}

/**
 * Cuts out an original (keying a solid background), renders its two sticker frames and writes them to the uploads
 * folder. `original` is new bytes to store too, or the URL of one already stored (a re-cut). Throws a 400 when the
 * image can't be made into a cut-out.
 */
export async function renderArt(uploadsDir: string, original: { buffer: Buffer; ext: string } | { url: string }, keying: WrappedArtKeying = WRAPPED_ART_KEYING_DEFAULTS): Promise<RenderedArt> {
  const dir = path.join(uploadsDir, WRAPPED_ART_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const buffer = "buffer" in original ? original.buffer : readStored(uploadsDir, original.url);

  let frames: Buffer[];
  let key: { r: number; g: number; b: number } | null;
  try {
    const cut = await cutOut(buffer, keying);
    key = cut.key;
    frames = await renderSticker(cut.image, { size: FRAME_SIZE });
  } catch (err) {
    if (err instanceof CutOutError) throw new ServiceError(400, err.message);
    throw err;
  }

  const files: string[] = [];
  const write = (name: string, bytes: Buffer) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, bytes, { flag: "wx" });
    files.push(file);
    return `/uploads/${WRAPPED_ART_DIR}/${name}`;
  };
  try {
    const originalUrl = "buffer" in original ? write(newUploadName(original.ext), original.buffer) : original.url;
    // WebP keeps the paper's grain far smaller than PNG; its alpha stays lossless, so the torn edge is exact.
    const webp = await Promise.all(frames.map((f) => sharp(f).webp({ quality: 90, alphaQuality: 100 }).toBuffer()));
    const frameUrls = webp.map((f) => write(newUploadName(".webp"), f)) as [string, string];
    return { originalUrl, frames: frameUrls, keyColor: key ? hex(key) : null, keying: key ? keying : null, files };
  } catch (err) {
    removeFiles(files);
    throw err;
  }
}

function readStored(uploadsDir: string, url: string): Buffer {
  const name = STORED_URL.exec(url)?.[1];
  if (!name) throw new ServiceError(400, "This art's original isn't stored here; upload it again");
  try {
    return fs.readFileSync(path.join(uploadsDir, WRAPPED_ART_DIR, name));
  } catch {
    throw new ServiceError(400, "This art's original file is missing; upload it again");
  }
}

type RenderedValues = Omit<RenderedArt, "files">;

function values(art: RenderedValues, at: Date) {
  return {
    originalUrl: art.originalUrl,
    frame1Url: art.frames[0],
    frame2Url: art.frames[1],
    keyColor: art.keyColor,
    keyTolerance: art.keying?.tolerance ?? null,
    keySoftness: art.keying?.softness ?? null,
    updatedAt: at,
  };
}

/** Adds what renderArt made to the end of a group. */
export function appendArt(db: Queryable, bingoId: string, group: WrappedArtGroup, art: RenderedValues, at: Date = clockNow()): Row {
  const last = db
    .select({ n: sql<number>`coalesce(max(${wrappedArt.sortOrder}), -1)` })
    .from(wrappedArt)
    .where(and(eq(wrappedArt.bingoId, bingoId), eq(wrappedArt.section, group)))
    .get();
  return db.insert(wrappedArt).values({ bingoId, section: group, sortOrder: (last?.n ?? -1) + 1, ...values(art, at) }).returning().get();
}

function image(db: Queryable, bingoId: string, id: string): Row {
  const row = db.select().from(wrappedArt).where(and(eq(wrappedArt.bingoId, bingoId), eq(wrappedArt.id, id))).get();
  if (!row) throw new ServiceError(404, "No such Wrapped art image");
  return row;
}

const entity = (bingo: Bingo) => ({ type: "bingo" as const, id: bingo.id, label: bingo.name });

/** An Admin's upload, added to the end of a group: stored as it was, cut out and rendered. */
export async function addArt(db: Db, uploadsDir: string, bingo: Bingo, group: WrappedArtGroup, buffer: Buffer, keying?: WrappedArtKeying): Promise<WrappedArtImage> {
  const max = maxWrappedArt(group);
  if (rows(db, bingo.id, group).length >= max) throw new ServiceError(400, `That's the most this group holds (${max}); remove one first`);
  const ext = await checkImage(buffer);
  const rendered = await renderArt(uploadsDir, { buffer, ext }, keying);
  try {
    return db.transaction((tx) => {
      if (rows(tx, bingo.id, group).length >= max) throw new ServiceError(400, `That's the most this group holds (${max}); remove one first`);
      const row = appendArt(tx, bingo.id, group, rendered);
      audit(tx, { action: "wrapped.art_set", bingoId: bingo.id, entity: entity(bingo), details: { section: group, keyed: rendered.keyColor !== null, replaced: false } });
      return toImage(row);
    });
  } catch (err) {
    removeFiles(rendered.files);
    throw err;
  }
}

/** An Admin's upload in place of one image, keeping its place in its group. */
export async function replaceArt(db: Db, uploadsDir: string, bingo: Bingo, id: string, buffer: Buffer, keying?: WrappedArtKeying): Promise<WrappedArtImage> {
  image(db, bingo.id, id);
  const ext = await checkImage(buffer);
  const rendered = await renderArt(uploadsDir, { buffer, ext }, keying);
  return update(db, bingo, id, rendered, (row) => ({ action: "wrapped.art_set", details: { section: row.section, keyed: rendered.keyColor !== null, replaced: true } }));
}

/** Renders an image's stored original again with other keying settings. Only for a solid-background screenshot. */
export async function recutArt(db: Db, uploadsDir: string, bingo: Bingo, id: string, keying: WrappedArtKeying): Promise<WrappedArtImage> {
  const row = image(db, bingo.id, id);
  if (row.keyColor === null) throw new ServiceError(400, "This image was uploaded already cut out: there's no background to key out again");
  const rendered = await renderArt(uploadsDir, { url: row.originalUrl }, keying);
  return update(db, bingo, id, rendered, (r) => ({ action: "wrapped.art_recut", details: { section: r.section, tolerance: keying.tolerance, softness: keying.softness } }));
}

type UpdateAudit =
  | { action: "wrapped.art_set"; details: { section: string; keyed: boolean; replaced: boolean } }
  | { action: "wrapped.art_recut"; details: { section: string; tolerance: number; softness: number } };

function update(db: Db, bingo: Bingo, id: string, rendered: RenderedArt, auditOf: (row: Row) => UpdateAudit): WrappedArtImage {
  try {
    return db.transaction((tx) => {
      const row = image(tx, bingo.id, id);
      const updated = tx.update(wrappedArt).set(values(rendered, clockNow())).where(eq(wrappedArt.id, row.id)).returning().get();
      const { action, details } = auditOf(row);
      if (action === "wrapped.art_set") audit(tx, { action, bingoId: bingo.id, entity: entity(bingo), details });
      else audit(tx, { action, bingoId: bingo.id, entity: entity(bingo), details });
      return toImage(updated);
    });
  } catch (err) {
    removeFiles(rendered.files);
    throw err;
  }
}

export function removeArt(db: Db, bingo: Bingo, id: string): void {
  db.transaction((tx) => {
    const row = image(tx, bingo.id, id);
    tx.delete(wrappedArt).where(eq(wrappedArt.id, row.id)).run();
    audit(tx, { action: "wrapped.art_removed", bingoId: bingo.id, entity: entity(bingo), details: { section: row.section } });
  });
}

/** Puts a group's images in the given order: `ids` must be exactly the group's images. */
export function reorderArt(db: Db, bingo: Bingo, group: WrappedArtGroup, ids: unknown): WrappedArtImage[] {
  return db.transaction((tx) => {
    const current = rows(tx, bingo.id, group);
    const wanted = Array.isArray(ids) ? ids : [];
    const same = wanted.length === current.length && new Set(wanted).size === wanted.length && current.every((r) => wanted.includes(r.id));
    if (!same) throw new ServiceError(400, "ids must be every image of the group, once each");
    wanted.forEach((id, sortOrder) => tx.update(wrappedArt).set({ sortOrder }).where(eq(wrappedArt.id, id as string)).run());
    audit(tx, { action: "wrapped.art_reordered", bingoId: bingo.id, entity: entity(bingo), details: { section: group } });
    return rows(tx, bingo.id, group).map(toImage);
  });
}

/** Sets or clears one Category image's credit (never a side image's). */
export function setArtCredit(db: Db, bingo: Bingo, id: string, input: unknown): WrappedArtImage {
  const credit = normalizeCredit(input);
  return db.transaction((tx) => {
    const row = image(tx, bingo.id, id);
    if (row.section === "side" && credit) throw new ServiceError(400, "Side images don't carry credits");
    const updated = tx.update(wrappedArt).set({ creditName: credit?.name ?? null, creditRole: credit?.role ?? null }).where(eq(wrappedArt.id, row.id)).returning().get();
    audit(tx, { action: "wrapped.art_credit_set", bingoId: bingo.id, entity: entity(bingo), details: { section: row.section, name: credit?.name ?? null } });
    return toImage(updated);
  });
}

/** Replaces a category's additional credits (ones with no image), in the order given. */
export function setAdditionalCredits(db: Db, bingo: Bingo, section: WrappedArtSection, input: unknown): WrappedArtCredits {
  const credits = normalizeCredits(input);
  return db.transaction((tx) => {
    const all = additionalCredits(tx, bingo.id);
    if (credits.length > 0) all[section] = credits;
    else delete all[section];
    tx.update(bingos).set({ wrappedArtCreditsJson: JSON.stringify(all) }).where(eq(bingos.id, bingo.id)).run();
    audit(tx, { action: "wrapped.credits_set", bingoId: bingo.id, entity: entity(bingo), details: { section, count: credits.length } });
    return all;
  });
}

/** An imported image: what renderArt made, and its credit. */
export type ImportedArt = RenderedValues & { credit?: WrappedCredit | null };

/** An import's art: each group given replaces that group's images (those a new Bingo copied from the previous one). */
export function replaceGroups(tx: Queryable, bingoId: string, groups: ReadonlyMap<WrappedArtGroup, ImportedArt[]>): void {
  if (groups.size === 0) return;
  tx.delete(wrappedArt).where(and(eq(wrappedArt.bingoId, bingoId), inArray(wrappedArt.section, [...groups.keys()]))).run();
  const at = clockNow();
  for (const [group, images] of groups) {
    images.forEach((art, sortOrder) => {
      const credit = group === "side" ? null : (art.credit ?? null);
      tx.insert(wrappedArt).values({ bingoId, section: group, sortOrder, ...values(art, at), creditName: credit?.name ?? null, creditRole: credit?.role ?? null }).run();
    });
  }
}

/** An import's additional credits: each category given replaces that category's (those a new Bingo copied). */
export function replaceAdditionalCredits(tx: Queryable, bingoId: string, credits: WrappedArtCredits): void {
  const all = { ...additionalCredits(tx, bingoId), ...credits };
  for (const section of WRAPPED_ART_SECTIONS) if (all[section]?.length === 0) delete all[section];
  tx.update(bingos).set({ wrappedArtCreditsJson: JSON.stringify(all) }).where(eq(bingos.id, bingoId)).run();
}

/** Every row of a Bingo's art goes with the Bingo (the files stay: another Bingo may show them). */
export function deleteBingoArt(tx: Queryable, bingoId: string): void {
  tx.delete(wrappedArt).where(eq(wrappedArt.bingoId, bingoId)).run();
}

/**
 * A new Bingo starts with the previous Bingo's art: the newest other Bingo (never a generated test Bingo). Its rows
 * are copied, pointing at the same files, credits and additional credits included. Returns how many images were copied.
 */
export function copyFromPreviousBingo(tx: Queryable, bingoId: string): number {
  const previous = tx
    .select({ id: bingos.id, credits: bingos.wrappedArtCreditsJson })
    .from(bingos)
    .where(and(not(eq(bingos.id, bingoId)), not(like(bingos.slug, `${TESTDATA_PREFIX}%`))))
    .orderBy(desc(bingos.createdAt), desc(sql`rowid`))
    .limit(1)
    .get();
  if (!previous) return 0;
  const copied = rows(tx, previous.id);
  const at = clockNow();
  for (const { id: _id, bingoId: _from, updatedAt: _at, ...row } of copied) tx.insert(wrappedArt).values({ ...row, bingoId, updatedAt: at }).run();
  tx.update(bingos).set({ wrappedArtCreditsJson: JSON.stringify(parseAdditionalCredits(previous.credits)) }).where(eq(bingos.id, bingoId)).run();
  return copied.length;
}

/** A section's stored original, for an export document; null (and left out) when it can't be read. */
export function readArtOriginal(uploadsDir: string, url: string): ExportImage | null {
  const name = STORED_URL.exec(url)?.[1];
  const contentType = name ? CONTENT_TYPE_BY_EXT[path.extname(name).toLowerCase()] : undefined;
  if (!name || !contentType) return null;
  try {
    return { contentType, data: fs.readFileSync(path.join(uploadsDir, WRAPPED_ART_DIR, name)).toString("base64") };
  } catch {
    return null;
  }
}
