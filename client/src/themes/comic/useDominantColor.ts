import { useEffect, useState } from "react";

// Per-URL cache — the same tile image is drawn by every board that shows
// it, and its color never changes, so there's no reason to ever redo this
// twice for the same URL.
const cache = new Map<string, string | null>();

const SAMPLE_SIZE = 24;
// Coarser buckets than the raw 0-255 channel range group "basically the
// same color" pixels together (anti-aliased edges, slightly different
// shades of the same red, etc.) so the most common CLUSTER wins, rather
// than the single most common exact RGB triple.
const BUCKET = 32;

function extractDominantColor(ctx: CanvasRenderingContext2D): string | null {
  const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 200) continue; // skip transparent/near-transparent background pixels
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`; // >>5 ~= /32, i.e. BUCKET-wide bins
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

// Extracts a representative color from an image — the most common cluster
// of (non-transparent) pixel colors, sampled at a small size since we only
// need a rough swatch, not per-pixel accuracy. Tile images are same-origin
// (server/src/routes/admin.ts serves them from /uploads/tiles/), so this
// never hits a tainted-canvas CORS error; if it ever did, or the image
// fails to load, this just resolves to null and the caller falls back to
// its own default color.
export function useDominantColor(imageUrl: string | null): string | null {
  const [color, setColor] = useState<string | null>(() => (imageUrl ? cache.get(imageUrl) ?? null : null));

  useEffect(() => {
    if (!imageUrl) {
      setColor(null);
      return;
    }
    const cached = cache.get(imageUrl);
    if (cached !== undefined) {
      setColor(cached);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      let result: string | null = null;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
          result = extractDominantColor(ctx);
        }
      } catch {
        result = null;
      }
      cache.set(imageUrl, result);
      if (!cancelled) setColor(result);
    };
    img.onerror = () => {
      cache.set(imageUrl, null);
      if (!cancelled) setColor(null);
    };
    img.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return color;
}
