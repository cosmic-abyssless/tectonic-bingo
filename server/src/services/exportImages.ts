// Tile images inside an export document (see ExportImage): read from the uploads folder on
// export, and, since a document is untrusted input, checked hard before anything is written
// on import.
import fs from "fs";
import path from "path";
import sharp from "sharp";
import type { ExportImage } from "@bingo/shared";
import { ServiceError } from "./errors";
import { generateVariants } from "./imageService";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "../middleware/upload";
import { log } from "../log";

const TILES_DIR = "tiles";

// What an import will accept, by the format the bytes actually decode as. Never SVG (it can carry
// script, and uploads are served from this origin) and never whatever the file claims to be.
const ACCEPTED: Record<string, { ext: string }> = { png: { ext: ".png" }, jpeg: { ext: ".jpg" }, webp: { ext: ".webp" }, gif: { ext: ".gif" } };
const CONTENT_TYPE_BY_EXT: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };

// A decompression-bomb guard: sharp refuses anything with more pixels than this.
const MAX_PIXELS = 50_000_000;

// A tile image the admin UI uploaded: exactly this shape, no directories in it.
const UPLOADED_TILE_URL = /^\/uploads\/tiles\/([A-Za-z0-9._-]+)$/;

/**
 * The original file behind a tile's `imageUrl`, as a document's `image` — or null when there
 * isn't one to give: not an uploaded tile image (an external link, say), not a type we
 * accept, or missing from disk. Only ever reads `<uploadsDir>/tiles/<plain file name>`.
 */
export function readTileImage(uploadsDir: string, imageUrl: string): ExportImage | null {
  const name = UPLOADED_TILE_URL.exec(imageUrl)?.[1];
  const contentType = name ? CONTENT_TYPE_BY_EXT[path.extname(name).toLowerCase()] : undefined;
  if (!name || !contentType) {
    log.warn("bingo export skipped image", { imageUrl, reason: "not an uploaded tile image" });
    return null;
  }
  try {
    return { contentType, data: fs.readFileSync(path.join(uploadsDir, TILES_DIR, name)).toString("base64") };
  } catch {
    log.warn("bingo export skipped image", { imageUrl, reason: "file unreadable" });
    return null;
  }
}

export interface DecodedImage {
  buffer: Buffer;
  ext: string;
}

/** Checks one document image and returns its bytes, or throws a 400 saying what's wrong with it. */
export async function decodeExportImage(image: unknown, tileName: string): Promise<DecodedImage> {
  const fail = (why: string) => new ServiceError(400, `Malformed import file: the image for tile "${tileName}" ${why}`);
  const data = (image as { data?: unknown } | null)?.data;
  if (typeof data !== "string") throw fail("isn't an image object");
  // Reject on the encoded length first: don't decode something that can't be under the limit.
  if (data.length > Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 8) throw fail(`is over ${MAX_UPLOAD_MB} MB`);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw fail("isn't base64");
  const buffer = Buffer.from(data, "base64");
  if (buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) throw fail(`is empty or over ${MAX_UPLOAD_MB} MB`);

  let format: string | undefined;
  try {
    const decoder = sharp(buffer, { limitInputPixels: MAX_PIXELS });
    format = (await decoder.metadata()).format;
    await sharp(buffer, { limitInputPixels: MAX_PIXELS }).resize({ width: 16 }).toBuffer(); // a full decode, so a truncated file fails here
  } catch {
    throw fail("can't be read as an image");
  }
  const accepted = format ? ACCEPTED[format] : undefined;
  if (!accepted) throw fail(`is a ${format ?? "unknown"} file; only PNG, JPEG, WebP and GIF are accepted`);
  return { buffer, ext: accepted.ext };
}

/** Writes an image into the tiles folder under a fresh name (the same scheme as an upload) with its display variants. */
export async function storeTileImage(uploadsDir: string, image: DecodedImage): Promise<{ url: string; files: string[] }> {
  const dir = path.join(uploadsDir, TILES_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}${image.ext}`;
  const file = path.join(dir, name);
  fs.writeFileSync(file, image.buffer, { flag: "wx" });
  const variants = await generateVariants(file);
  return { url: `/uploads/${TILES_DIR}/${name}`, files: [file, ...(variants ? [variants.thumbPath, variants.fullPath] : [])] };
}

export function removeFiles(files: string[]): void {
  for (const file of files) {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // Best-effort cleanup of an import that failed.
    }
  }
}
