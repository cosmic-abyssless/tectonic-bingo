// Wrapped art (#262): one decorative cut-out per Wrapped section, uploaded by an Admin as a transparent PNG or as a
// screenshot on one solid colour (keyed out here), and drawn as a sticker on torn paper (stickerEffect.ts), once per
// upload. The upload is kept as it was, so it can be re-cut with other keying settings without a new screenshot.
// A new Bingo starts with the previous Bingo's art: copied rows pointing at the same files, which is why replacing or
// removing art never deletes a file (the same as tile images).
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { and, desc, eq, not, like, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  WRAPPED_ART_KEYING_DEFAULTS,
  WRAPPED_ART_SECTIONS,
  type ExportImage,
  type WrappedArtKeying,
  type WrappedArtSection,
  type WrappedArtSet,
  type WrappedArtSlot,
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

export function parseSection(value: unknown): WrappedArtSection {
  if (typeof value !== "string" || !(WRAPPED_ART_SECTIONS as readonly string[]).includes(value)) throw new ServiceError(404, "No such Wrapped section");
  return value as WrappedArtSection;
}

const hex = (c: { r: number; g: number; b: number }) => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

function toSlot(row: Row): WrappedArtSlot {
  return {
    section: row.section as WrappedArtSection,
    originalUrl: row.originalUrl,
    frames: [row.frame1Url, row.frame2Url],
    keying: row.keyTolerance !== null && row.keySoftness !== null ? { tolerance: row.keyTolerance, softness: row.keySoftness } : null,
    keyColor: row.keyColor,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rows(db: Queryable, bingoId: string): Row[] {
  const order = (s: string) => (WRAPPED_ART_SECTIONS as readonly string[]).indexOf(s);
  return db
    .select()
    .from(wrappedArt)
    .where(eq(wrappedArt.bingoId, bingoId))
    .all()
    .filter((r) => order(r.section) >= 0)
    .sort((a, b) => order(a.section) - order(b.section));
}

/** Every section's art, for the admin UI, in story order. */
export function listArt(db: Queryable, bingoId: string): WrappedArtSlot[] {
  return rows(db, bingoId).map(toSlot);
}

/** The frames the story shows, by section. */
export function artSet(db: Queryable, bingoId: string): WrappedArtSet {
  return Object.fromEntries(rows(db, bingoId).map((r) => [r.section, [r.frame1Url, r.frame2Url]]));
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

/** Sets (or replaces) a section's art to what renderArt made. */
export function putArt(db: Queryable, bingoId: string, section: WrappedArtSection, art: Omit<RenderedArt, "files">, at: Date = clockNow()): Row {
  const values = {
    originalUrl: art.originalUrl,
    frame1Url: art.frames[0],
    frame2Url: art.frames[1],
    keyColor: art.keyColor,
    keyTolerance: art.keying?.tolerance ?? null,
    keySoftness: art.keying?.softness ?? null,
    updatedAt: at,
  };
  return db
    .insert(wrappedArt)
    .values({ bingoId, section, ...values })
    .onConflictDoUpdate({ target: [wrappedArt.bingoId, wrappedArt.section], set: values })
    .returning()
    .get();
}

function existing(db: Queryable, bingoId: string, section: WrappedArtSection): Row | undefined {
  return db.select().from(wrappedArt).where(and(eq(wrappedArt.bingoId, bingoId), eq(wrappedArt.section, section))).get();
}

/** An Admin's upload for a section: stored as it was, cut out, rendered, and set as the section's art. */
export async function uploadArt(db: Db, uploadsDir: string, bingo: Bingo, section: WrappedArtSection, buffer: Buffer, keying?: WrappedArtKeying): Promise<WrappedArtSlot> {
  const ext = await checkImage(buffer);
  const rendered = await renderArt(uploadsDir, { buffer, ext }, keying);
  try {
    return db.transaction((tx) => {
      const replaced = existing(tx, bingo.id, section) !== undefined;
      const row = putArt(tx, bingo.id, section, rendered);
      audit(tx, {
        action: "wrapped.art_set",
        bingoId: bingo.id,
        entity: { type: "bingo", id: bingo.id, label: bingo.name },
        details: { section, keyed: rendered.keyColor !== null, replaced },
      });
      return toSlot(row);
    });
  } catch (err) {
    removeFiles(rendered.files);
    throw err;
  }
}

/** Renders a section's stored original again with other keying settings. Only for a solid-background screenshot. */
export async function recutArt(db: Db, uploadsDir: string, bingo: Bingo, section: WrappedArtSection, keying: WrappedArtKeying): Promise<WrappedArtSlot> {
  const row = existing(db, bingo.id, section);
  if (!row) throw new ServiceError(404, "This section has no art");
  if (row.keyColor === null) throw new ServiceError(400, "This art was uploaded already cut out: there's no background to key out again");
  const rendered = await renderArt(uploadsDir, { url: row.originalUrl }, keying);
  try {
    return db.transaction((tx) => {
      const updated = putArt(tx, bingo.id, section, rendered);
      audit(tx, {
        action: "wrapped.art_recut",
        bingoId: bingo.id,
        entity: { type: "bingo", id: bingo.id, label: bingo.name },
        details: { section, tolerance: keying.tolerance, softness: keying.softness },
      });
      return toSlot(updated);
    });
  } catch (err) {
    removeFiles(rendered.files);
    throw err;
  }
}

export function removeArt(db: Db, bingo: Bingo, section: WrappedArtSection): void {
  db.transaction((tx) => {
    if (!existing(tx, bingo.id, section)) throw new ServiceError(404, "This section has no art");
    tx.delete(wrappedArt).where(and(eq(wrappedArt.bingoId, bingo.id), eq(wrappedArt.section, section))).run();
    audit(tx, { action: "wrapped.art_removed", bingoId: bingo.id, entity: { type: "bingo", id: bingo.id, label: bingo.name }, details: { section } });
  });
}

/** Every row of a Bingo's art goes with the Bingo (the files stay: another Bingo may show them). */
export function deleteBingoArt(tx: Queryable, bingoId: string): void {
  tx.delete(wrappedArt).where(eq(wrappedArt.bingoId, bingoId)).run();
}

/**
 * A new Bingo starts with the previous Bingo's art: the newest other Bingo (never a generated test Bingo). Its rows
 * are copied, pointing at the same files. Returns how many sections were copied.
 */
export function copyFromPreviousBingo(tx: Queryable, bingoId: string): number {
  const previous = tx
    .select({ id: bingos.id })
    .from(bingos)
    .where(and(not(eq(bingos.id, bingoId)), not(like(bingos.slug, `${TESTDATA_PREFIX}%`))))
    .orderBy(desc(bingos.createdAt), desc(sql`rowid`))
    .limit(1)
    .get();
  if (!previous) return 0;
  const copied = rows(tx, previous.id);
  const at = clockNow();
  for (const { id: _id, bingoId: _from, updatedAt: _at, ...row } of copied) tx.insert(wrappedArt).values({ ...row, bingoId, updatedAt: at }).run();
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
