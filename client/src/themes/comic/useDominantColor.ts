import { useEffect, useState } from "react";
import { SAMPLE_SIZE, artSourceRect, extractDominantColor } from "./dominantColor";
import { persistColors, readPersistedColors } from "./dominantColorStore";

// Per-URL cache — the same tile image is drawn by every board that shows
// it, and its color never changes, so there's no reason to ever redo this
// twice for the same URL. Seeded from localStorage (dominantColorStore.ts), so a
// page load doesn't re-decode images it has already seen and the cover paints in
// its final colour on the first frame.
const cache = new Map<string, string | null>(readPersistedColors());

let persistTimer: ReturnType<typeof setTimeout> | undefined;
function remember(url: string, color: string | null) {
  cache.delete(url); // re-insert so the newest results sort last (that's what gets kept)
  cache.set(url, color);
  if (color === null || persistTimer !== undefined) return;
  // Batched: a board resolves a couple of dozen covers in a burst.
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    persistColors(cache);
  }, 500);
}

// Picks black or white — whichever reads better — against a color this
// hook returned (`rgb(r, g, b)`) or a 6-digit hex fallback; anything else
// (a `var(--…)`, null) defaults to black.
export function getContrastTextColor(color: string | null): string {
  const rgb = color ? /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(color) : null;
  const hex = color ? /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color) : null;
  const m = rgb ?? hex;
  if (!m) return "#000000";
  const [r, g, b] = rgb ? [Number(m[1]), Number(m[2]), Number(m[3])] : [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
  // Perceived (not WCAG-relative) luminance — plenty accurate for a plain
  // light/dark text-color decision.
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 150 ? "#000000" : "#ffffff";
}

// Extracts a representative color from an image — the most common cluster
// of (non-transparent) pixel colors in the art above the caption panel
// (dominantColor.ts), sampled at a small size since we only
// need a rough swatch, not per-pixel accuracy. Tile images are same-origin
// (server/src/routes/admin.ts serves them from /uploads/tiles/), so this
// never hits a tainted-canvas CORS error; if it ever did, or the image
// fails to load, this just resolves to null and the caller falls back to
// its own default color.
export function useDominantColor(imageUrl: string | null | undefined): string | null {
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
          const { sx, sy, sw, sh } = artSourceRect(img.naturalWidth, img.naturalHeight);
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
          result = extractDominantColor(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data);
        }
      } catch {
        result = null;
      }
      remember(imageUrl, result);
      if (!cancelled) setColor(result);
    };
    img.onerror = () => {
      remember(imageUrl, null);
      if (!cancelled) setColor(null);
    };
    img.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return color;
}
