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

function drawHalftone({ width, height, step, tone, color = "#000", scale = 1 }: HalftoneSheet): string | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  // A full dot reaches a little past half the diagonal gap, so the darkest tone closes up the way print does.
  const maxRadius = step * 0.62;
  ctx.beginPath();
  // Staggered rows half a step apart: a square grid turned 45°.
  for (let row = 0, y = 0; y <= height + step; row++, y += step / 2) {
    for (let x = row % 2 ? step / 2 : 0; x <= width + step; x += step) {
      const r = maxRadius * Math.min(1, Math.max(0, tone(x, y)));
      if (r < 0.3) continue;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, 2 * Math.PI);
    }
  }
  ctx.fill();
  return canvas.toDataURL("image/png");
}
