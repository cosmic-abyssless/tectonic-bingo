// The brush stroke that paints a panel in. A mask image for the panel's content: a wide band of ink, solid on its left
// and trailing off on its right into the dry, streaky bristles of a loaded brush. It is drawn three times as wide as
// the panel and slid across (mask-position 100% → 0%), so the stroke's ragged front sweeps over the content from left to
// right and leaves it all drawn. Pure, so the shape is tested without a browser.

/** The image is this many times the panel's width (mask-size), and the band is slid from BRUSH_START to BRUSH_END (mask-position, %). */
export const BRUSH_SIZE = 3;
export const BRUSH_START = 100;
export const BRUSH_END = 0;

const VIEW_W = 200;
const VIEW_H = 100;
/** Where the solid band ends: a third of the image is the panel's width, so the band covers it from the left. */
const SOLID_TO = VIEW_W / BRUSH_SIZE + 33.4;
/** Where the stroke's bristles may reach, at the most: past it the image is bare, so a stroke slid fully off shows nothing. */
const BRISTLE_MAX = VIEW_W - VIEW_W / BRUSH_SIZE;

/** A small deterministic pseudo-random run (mulberry32), so the brush is the same stroke every time. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The bristles of the stroke: one streak per row, each ending somewhere along the ragged front. */
export function brushBristles(rows = 28, seed = 419): { y: number; height: number; end: number }[] {
  const random = rng(seed);
  const rowHeight = VIEW_H / rows;
  const out: { y: number; height: number; end: number }[] = [];
  const reach = BRISTLE_MAX - SOLID_TO;
  for (let i = 0; i < rows; i++) {
    // The whole front leans a little (a stroke made at an angle), and each bristle runs its own length.
    const lean = (i / (rows - 1) - 0.5) * 0.22;
    const length = Math.min(1, Math.max(0.12, 0.62 + lean + (random() - 0.5) * 0.7));
    out.push({ y: i * rowHeight + rowHeight * 0.06, height: rowHeight * (0.74 + random() * 0.22), end: SOLID_TO + reach * length });
  }
  return out;
}

/** The mask as an SVG document (alpha is all that counts). */
export function brushMaskSvg(): string {
  const bristles = brushBristles();
  const rects = bristles
    .map((b) => `<rect x="${SOLID_TO - 4}" y="${b.y.toFixed(2)}" width="${(b.end - SOLID_TO + 4).toFixed(2)}" height="${b.height.toFixed(2)}" rx="${(b.height * 0.45).toFixed(2)}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="none"><g fill="#000"><rect x="0" y="0" width="${SOLID_TO}" height="${VIEW_H}"/>${rects}</g></svg>`;
}

let url: string | null = null;

/** The mask as a CSS `url()` (a data URI, made once). */
export function brushMaskUrl(): string {
  url ??= `url("data:image/svg+xml;utf8,${encodeURIComponent(brushMaskSvg())}")`;
  return url;
}

/** The mask-position (a percentage, 100 hiding the content entirely, 0 showing all of it) at `t`, 0 to 1 through the stroke. */
export const brushPosition = (t: number) => BRUSH_START + (BRUSH_END - BRUSH_START) * Math.min(1, Math.max(0, t));
