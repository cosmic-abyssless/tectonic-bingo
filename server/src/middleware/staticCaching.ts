import path from "path";
import type express from "express";

type StaticOptions = NonNullable<Parameters<typeof express.static>[1]>;

// Uploaded files never change under a given URL: names are
// `${Date.now()}-${random}${ext}` (see upload.ts), a replaced tile image is a
// NEW file with a new URL, and the display variants are derived from the
// original by suffix and written once (imageVariants.ts). So they can be cached
// for a year without revalidating — the validators would only cost a round trip.
export const uploadsStaticOptions: StaticOptions = {
  maxAge: "365d",
  immutable: true,
  etag: false,
  lastModified: false,
};

export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

// index.html names the current hashed bundles, so it must always revalidate.
export const INDEX_HTML_CACHE_CONTROL = "no-cache";

/**
 * Static options for the built client. Vite content-hashes everything under
 * `/assets/`, so those are immutable; `index.html` revalidates; anything else
 * (favicon, etc.) keeps express.static's default.
 */
export function clientDistStaticOptions(distDir: string): StaticOptions {
  const assetsDir = path.join(distDir, "assets") + path.sep;
  return {
    setHeaders(res, filePath) {
      if (filePath.startsWith(assetsDir)) res.setHeader("Cache-Control", IMMUTABLE_CACHE_CONTROL);
      else if (path.basename(filePath) === "index.html") res.setHeader("Cache-Control", INDEX_HTML_CACHE_CONTROL);
    },
  };
}
