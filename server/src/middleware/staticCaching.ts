import path from "path";
import express, { type RequestHandler } from "express";
import { requireGuildMemberLogin } from "./requireGuildMember";
import { serveImageVariants } from "./imageVariants";

type StaticOptions = NonNullable<Parameters<typeof express.static>[1]>;

// Uploaded files never change under a given URL: names are random (see
// newUploadName in upload.ts), a replaced tile image is a NEW file with a new
// URL, and the display variants are derived from the original by suffix and
// written once (imageVariants.ts). So they can be cached for a year without
// revalidating — the validators would only cost a round trip. Private, though:
// they need a clan login (serveUploads), so only the browser may keep a copy,
// never a shared cache.
export const UPLOADS_CACHE_CONTROL = "private, max-age=31536000, immutable";

export const uploadsStaticOptions: StaticOptions = {
  // Set by setHeaders instead, which only runs for a file that is served (so a 404 is never marked immutable).
  cacheControl: false,
  etag: false,
  lastModified: false,
  setHeaders(res) {
    res.setHeader("Cache-Control", UPLOADS_CACHE_CONTROL);
  },
};

/**
 * The /uploads route: Submission screenshots and Tile images, for logged-in clan members only (any of them may load
 * any file; there's no per-bingo check). Display variants are made on demand in front of the static files.
 */
export function serveUploads(dir: string): RequestHandler[] {
  return [requireGuildMemberLogin, serveImageVariants(dir), express.static(dir, uploadsStaticOptions)];
}

export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

// index.html names the current hashed bundles, so it must always revalidate (mountClientApp sets this on the page).
export const INDEX_HTML_CACHE_CONTROL = "no-cache";

/**
 * Static options for the built client. Vite content-hashes everything under
 * `/assets/`, so those are immutable; anything else (favicon, etc.) keeps
 * express.static's default. The page itself (`index.html`, which names the current
 * hashed bundles and so must always revalidate) is served by mountClientApp.
 */
export function clientDistStaticOptions(distDir: string): StaticOptions {
  const assetsDir = path.join(distDir, "assets") + path.sep;
  return {
    // The page itself is served by mountClientApp (with the runtime config injected), never straight off disk.
    index: false,
    setHeaders(res, filePath) {
      if (filePath.startsWith(assetsDir)) res.setHeader("Cache-Control", IMMUTABLE_CACHE_CONTROL);
    },
  };
}
