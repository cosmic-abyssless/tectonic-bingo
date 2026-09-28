// The pure half of useDominantColor: which part of a tile's artwork to sample,
// and how to pick a colour out of the sampled pixels. Kept free of the DOM so
// it can be unit tested without a browser.

/** The artwork is shrunk to a SAMPLE_SIZE x SAMPLE_SIZE canvas before sampling. */
export const SAMPLE_SIZE = 24;

// Tile art uses a comic-cover template: the art on top, and a white caption
// panel with black text across the bottom ~20–28%. Left in, that panel often
// out-votes the art and the cover comes out white or grey, so the bottom 30%
// is never sampled (art without a panel is still well represented by its top).
export const CAPTION_PANEL_FRACTION = 0.3;

/** The source rectangle (in image pixels) to draw onto the sample canvas: everything above the caption panel. */
export function artSourceRect(width: number, height: number): { sx: number; sy: number; sw: number; sh: number } {
  return { sx: 0, sy: 0, sw: width, sh: height * (1 - CAPTION_PANEL_FRACTION) };
}

// Coarser buckets than the raw 0-255 channel range group "basically the
// same color" pixels together (anti-aliased edges, slightly different
// shades of the same red, etc.) so the most common CLUSTER wins, rather
// than the single most common exact RGB triple.
const BUCKET_SHIFT = 5; // >>5 ~= /32, i.e. 32-wide bins

/** The most common cluster of (non-transparent) colours in RGBA pixel data, as `rgb(r, g, b)`; null if every pixel is transparent. */
export function extractDominantColor(data: ArrayLike<number>): string | null {
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]!;
    if (a < 200) continue; // skip transparent/near-transparent background pixels
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const key = `${r >> BUCKET_SHIFT}-${g >> BUCKET_SHIFT}-${b >> BUCKET_SHIFT}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.count++;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
  }

  let best: { r: number; g: number; b: number; count: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket;
  }
  if (!best) return null;
  return `rgb(${Math.round(best.r / best.count)}, ${Math.round(best.g / best.count)}, ${Math.round(best.b / best.count)})`;
}
