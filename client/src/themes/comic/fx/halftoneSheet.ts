// A real halftone screen, as printed comics were shaded: dots on a 45° grid whose size follows the tone, so a shade
// is drawn with bigger dots rather than more of them. Drawn once onto a canvas and kept as an image, so the page only
// ever paints a picture of the dots, never the dots themselves.

/** How dark the screen is at a point of the sheet, from 0 (no dot) to 1 (a full dot, just touching its neighbours). */
export type HalftoneTone = (x: number, y: number) => number;

export interface HalftoneSheet {
  /** The sheet's size in CSS pixels. */
  width: number;
  height: number;
  /** The distance between neighbouring dots along the screen's grid. */
  step: number;
  tone: HalftoneTone;
  /** The dots' colour; black by default, for a mask. */
  color?: string;
  /** Device pixels per CSS pixel to draw at, so the dots stay round when the image is shown bigger (a 2× share card). */
  scale?: number;
}

const drawn = new Map<string, string>();

/**
 * The sheet as a PNG data URL, drawn the first time a `key` is asked for and kept after that: the key names the
 * sheet, so give different sheets different keys. Null where there's no canvas to draw on (tests).
 */
export function halftoneUrl(key: string, sheet: HalftoneSheet): string | null {
  const cached = drawn.get(key);
  if (cached) return cached;
  const url = drawHalftone(sheet);
  if (url) drawn.set(key, url);
  return url;
}

/** The sheet as a PNG data URL, drawn now and not kept; null where there's no canvas to draw on (tests). */
export function drawHalftone({ width, height, step, tone, color = "#000", scale = 1 }: HalftoneSheet): string | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const coverage = halftoneCoverage({ width, height, step, tone, scale });
  const image = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < coverage.length; i++) image.data[i * 4 + 3] = coverage[i]!;
  ctx.putImageData(image, 0, 0);
  // The dots are the alpha; fill them with the colour (which may be translucent itself).
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/**
 * The sheet's dots as one byte of coverage per device pixel, row by row. Each pixel is inked by how far it sits inside
 * its dot's edge, rather than by filling arcs: a canvas's antialiasing gives a small dot noticeably more or less ink
 * than its area (a whole ring of equal dots at once, so a smooth tone came out in bands, #332).
 */
export function halftoneCoverage({ width, height, step, tone, scale = 1 }: Omit<HalftoneSheet, "color">): Uint8ClampedArray {
  const cols = Math.ceil(width * scale);
  const rows = Math.ceil(height * scale);
  const out = new Uint8ClampedArray(cols * rows);
  // A full dot reaches a little past half the diagonal gap, so the darkest tone closes up the way print does.
  const maxRadius = step * 0.62;
  // Staggered rows half a step apart: a square grid turned 45°.
  for (let row = 0, y = 0; y <= height + step; row++, y += step / 2) {
    for (let x = row % 2 ? step / 2 : 0; x <= width + step; x += step) {
      const r = maxRadius * Math.min(1, Math.max(0, tone(x, y))) * scale;
      if (r <= 0) continue;
      // In device pixels from here on; a pixel's coverage is its centre's depth inside the edge, over one pixel.
      const cx = x * scale;
      const cy = y * scale;
      const x0 = Math.max(0, Math.floor(cx - r - 0.5));
      const x1 = Math.min(cols - 1, Math.ceil(cx + r - 0.5));
      const y0 = Math.max(0, Math.floor(cy - r - 0.5));
      const y1 = Math.min(rows - 1, Math.ceil(cy + r - 0.5));
      const depth = (px: number, py: number) => {
        const dx = px + 0.5 - cx;
        const dy = py + 0.5 - cy;
        return Math.min(1, Math.max(0, r - Math.sqrt(dx * dx + dy * dy) + 0.5));
      };
      // That overshoots a dot under a pixel or two across (up to half again its area), so the dot's ink is scaled
      // to its true area: the faintest tones are all small dots.
      let total = 0;
      for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) total += depth(px, py);
      if (total === 0) continue;
      const toArea = (Math.PI * r * r) / total;
      for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
          const ink = Math.min(1, depth(px, py) * toArea) * 255;
          const i = py * cols + px;
          // Neighbours overlap only once the tone closes up; the fuller of the two wins.
          if (ink > out[i]!) out[i] = ink;
        }
      }
    }
  }
  return out;
}

/**
 * The page's printed vignette, the size of the viewport: nothing in the middle, dots growing towards the corners. A
 * mask (black dots), for a layer of the halftone ink. The height is rounded up to 80px, so a phone's address bar
 * sliding in and out doesn't redraw it (the mask stretches the few pixels instead). Only the latest size is kept.
 */
let screen: { key: string; url: string | null } | null = null;
export function screenHalftone(): string | null {
  if (typeof window === "undefined") return null;
  const width = window.innerWidth;
  const height = Math.ceil(window.innerHeight / 80) * 80;
  const scale = window.devicePixelRatio || 1;
  const key = `${width}x${height}@${scale}`;
  if (screen?.key !== key) {
    // A corner is 1 away from the middle; the dots start 30% of the way out and reach a little over half tone there.
    const reach = Math.hypot(width, height) / 2;
    const tone: HalftoneTone = (x, y) => 0.55 * ((Math.hypot(x - width / 2, y - height / 2) / reach - 0.3) / 0.7);
    screen = { key, url: drawHalftone({ width, height, step: 6, tone, scale }) };
  }
  return screen.url;
}

/**
 * A printed shade for a box `width` wide: nothing up to `from` (a percentage of the width), then dots growing to the
 * right edge, never quite closing up. A mask one screen period tall, to repeat down the box.
 */
export function shadeHalftone(width: number, from: number): { url: string | null; height: number } {
  const step = 5;
  const scale = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const tone: HalftoneTone = (x) => 0.5 * ((x / width - from / 100) / (1 - from / 100));
  return { url: halftoneUrl(`shade:${width}:${from}@${scale}`, { width, height: step, step, tone, scale }), height: step };
}
