// Builds display-variant URLs for uploaded images (issue #61). The server
// writes a `-thumb` and a `-full` WebP variant beside every uploaded original
// (see server/src/services/imageService.ts) using the original's base name, so
// the variant URL is derived by suffix — no schema change. The server also
// generates a missing variant on first request (and falls back to the original
// if it can't), so these URLs are safe for images uploaded before variants
// existed. Anything that isn't a `/uploads/` file (external URLs, data URIs)
// is returned unchanged so callers always get a loadable `src`.

const UPLOADS_PREFIX = "/uploads/";
const THUMB_SUFFIX = "-thumb.webp";
const FULL_SUFFIX = "-full.webp";

function variant(url: string | null | undefined, suffix: string): string | undefined {
  if (!url) return undefined;
  const extIdx = url.lastIndexOf(".");
  if (!url.startsWith(UPLOADS_PREFIX) || extIdx <= url.lastIndexOf("/")) return url;
  return `${url.slice(0, extIdx)}${suffix}`;
}

/** URL of the small thumbnail variant, for board cells and list thumbnails. */
export function thumbUrl(url: string | null | undefined): string | undefined {
  return variant(url, THUMB_SUFFIX);
}

/** URL of the display-size variant, for review views and detail modals. */
export function fullUrl(url: string | null | undefined): string | undefined {
  return variant(url, FULL_SUFFIX);
}
