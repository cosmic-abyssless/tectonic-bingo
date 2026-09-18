import sharp from "sharp";
import path from "path";

// Display variants generated alongside every uploaded image (issue #61). The
// original file is always kept untouched — it's the OCR source and the "open
// full size" target — so clients load the right-size variant instead of a
// multi-MB original for a 48px thumbnail.

// Max width for the thumbnail variant (used for board cells, list rows, and
// review-queue rows). Screenshots and tile art read fine at this size.
export const THUMB_MAX_WIDTH = 256;
// Max width for the "full"/display variant (used for the review queue's
// enlarged view and detail modals). Kept well under the 4K original so it
// stays light to transfer while remaining legible for review.
export const FULL_MAX_WIDTH = 1600;
// JPEG re-encode quality. Screenshots are flat UI captures, so a moderate
// quality is visually lossless while shrinking the payload dramatically.
export const VARIANT_JPEG_QUALITY = 82;

export const THUMB_SUFFIX = "-thumb";
export const FULL_SUFFIX = "-full";
export const VARIANT_EXT = ".jpg";

// Derives the public URL for a variant from the original's URL. Both variants
// share the original's base name, so no DB schema change is needed.
export function variantUrl(originalUrl: string, suffix: string): string {
  const ext = path.extname(originalUrl);
  return `${originalUrl.slice(0, originalUrl.length - ext.length)}${suffix}${VARIANT_EXT}`;
}

export function thumbUrl(originalUrl: string): string {
  return variantUrl(originalUrl, THUMB_SUFFIX);
}

export function fullUrl(originalUrl: string): string {
  return variantUrl(originalUrl, FULL_SUFFIX);
}

export interface GeneratedVariants {
  thumbPath: string;
  fullPath: string;
}

/**
 * Writes `-thumb` and `-full` JPEG variants beside `originalPath`, resized to
 * their width caps and auto-rotated from EXIF. The original is never modified.
 * Best-effort: any processing failure logs a warning and resolves with `null`
 * so the upload still succeeds and callers fall back to the original URL.
 */
export async function generateVariants(originalPath: string): Promise<GeneratedVariants | null> {
  const ext = path.extname(originalPath);
  const base = originalPath.slice(0, originalPath.length - ext.length);

  try {
    const [thumb, full] = await Promise.all([
      writeVariant(originalPath, `${base}${THUMB_SUFFIX}${VARIANT_EXT}`, THUMB_MAX_WIDTH),
      writeVariant(originalPath, `${base}${FULL_SUFFIX}${VARIANT_EXT}`, FULL_MAX_WIDTH),
    ]);
    return { thumbPath: thumb, fullPath: full };
  } catch (err) {
    // Best-effort: never fail the upload over a display variant. The original
    // remains the fallback for every client.
    console.warn("[image] variant generation failed", err instanceof Error ? err.message : err);
    return null;
  }
}

async function writeVariant(originalPath: string, outPath: string, maxWidth: number): Promise<string> {
  await sharp(originalPath)
    .rotate()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .jpeg({ quality: VARIANT_JPEG_QUALITY, mozjpeg: true })
    .toFile(outPath);
  return outPath;
}
