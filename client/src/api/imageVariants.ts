// Builds display-variant URLs for uploaded images (issue #61). The server
// writes a `-thumb` and a `-full` JPEG variant beside every uploaded original
// (see server/src/services/imageService.ts) using the original's base name, so
// the variant URL is derived by suffix — no schema change. Variants share the
// `/uploads/` prefix; anything else (external URLs, data URIs) is returned
// unchanged so callers always get a loadable `src`.

const UPLOADS_PREFIX = "/uploads/";
const THUMB_SUFFIX = "-thumb.jpg";
const FULL_SUFFIX = "-full.jpg";

function isVariantable(url: string): boolean {
  return url.startsWith(UPLOADS_PREFIX);
}

/** URL of the small thumbnail variant, for board cells and list thumbnails. */
export function thumbUrl(url: string | null | undefined): string | undefined {
  if (!url || !isVariantable(url)) return url ?? undefined;
  const extIdx = url.lastIndexOf(".");
  return `${url.slice(0, extIdx)}${THUMB_SUFFIX}`;
}

/** URL of the display-size variant, for review views and detail modals. */
export function fullUrl(url: string | null | undefined): string | undefined {
  if (!url || !isVariantable(url)) return url ?? undefined;
  const extIdx = url.lastIndexOf(".");
  return `${url.slice(0, extIdx)}${FULL_SUFFIX}`;
}
