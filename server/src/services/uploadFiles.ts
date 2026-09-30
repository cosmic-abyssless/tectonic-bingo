// The files on disk behind /uploads/... URLs (the site's own stored uploads: Tile pictures, Submission and Proof
// screenshots, Wrapped art), for removing the ones a deleted Bingo leaves nothing pointing at.
import fs from "node:fs";
import path from "node:path";
import { removeFiles } from "./exportImages";
import { FULL_SUFFIX, THUMB_SUFFIX, VARIANT_EXT } from "./imageService";

/** The files on disk behind /uploads/... URLs: each original plus its thumb/full variants. Anything outside uploadsDir is ignored. */
export function uploadFilePaths(uploadsDir: string, urls: string[]): string[] {
  const root = path.resolve(uploadsDir);
  const files: string[] = [];
  for (const url of urls) {
    if (!url.startsWith("/uploads/")) continue;
    const original = path.resolve(root, `.${path.posix.normalize(url.slice("/uploads".length))}`);
    if (!original.startsWith(root + path.sep)) continue;
    const ext = path.extname(original);
    const base = original.slice(0, original.length - ext.length);
    files.push(original, `${base}${THUMB_SUFFIX}${VARIANT_EXT}`, `${base}${FULL_SUFFIX}${VARIANT_EXT}`);
  }
  return files;
}

/** Removes the files behind the given upload URLs; missing files are fine. Returns how many were actually present. */
export function removeUploads(uploadsDir: string, urls: string[]): number {
  const files = uploadFilePaths(uploadsDir, urls);
  const present = files.filter((f) => fs.existsSync(f)).length;
  removeFiles(files);
  return present;
}
