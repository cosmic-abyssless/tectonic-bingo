// The comic Wrapped's panel frames: the sections lay their panels out in rows (a Scene's flow, a grid of two), and the
// page draws each panel's frame as a quadrilateral rather than its box, so the gutters between panels run on a slant, as
// a comic's do. A gutter is one line across the page (or down its row), tipped a little, and the panels on either side of
// it take their edges from it, so the gutter stays the same width all along. A panel's edge with no neighbour across it
// (the page's margin) stays straight, and so does a panel set in as an inset. Pure, so the shapes are tested without a
// browser.

import type { Point, Rect } from "./camera";

/** The four corners: top left, top right, bottom right, bottom left. */
export type Quad = [Point, Point, Point, Point];

export interface FramePanel {
  rect: Rect;
  /** Drawn as its box: an inset, which sits over the panels around it rather than between them. */
  straight?: boolean;
}

/** How far a gutter tips (px) at the ends of what it crosses, either way of its middle. */
export const GUTTER_SLANT = 11;
/** The widest gap between two panels (px) that is a gutter, rather than room the page left between them. */
const MAX_GUTTER = 48;

/** A line across: y = a + b·x. */
interface Across {
  a: number;
  b: number;
}
/** A line down: x = c + d·y. */
interface Down {
  c: number;
  d: number;
}

const meet = (h: Across, v: Down): Point => {
  const x = (v.c + v.d * h.a) / (1 - v.d * h.b);
  return { x, y: h.a + h.b * x };
};

const overlap = (a1: number, a2: number, b1: number, b2: number) => Math.min(a2, b2) - Math.max(a1, b1);

/** Each panel's frame, in the page's coordinates. `pageWidth` is what a gutter across the page tips over. */
export function panelFrames(panels: readonly FramePanel[], pageWidth: number, slant = GUTTER_SLANT): Quad[] {
  const edges = panels.map(({ rect: r }) => ({
    top: { a: r.y, b: 0 } as Across,
    bottom: { a: r.y + r.h, b: 0 } as Across,
    left: { c: r.x, d: 0 } as Down,
    right: { c: r.x + r.w, d: 0 } as Down,
  }));
  const framed = panels.map((p, i) => ({ i, r: p.rect })).filter((_, i) => !panels[i]!.straight);

  // Gutters across: between a panel and one below it. One line per gutter (panels on the same gutter share it), tipped
  // one way and the next the other, through the gutter's middle and about the page's.
  const across = new Map<number, { mid: number; pairs: [number, number, number][] }>();
  for (const a of framed)
    for (const b of framed) {
      const gap = b.r.y - (a.r.y + a.r.h);
      if (gap < 0 || gap > MAX_GUTTER || overlap(a.r.x, a.r.x + a.r.w, b.r.x, b.r.x + b.r.w) < 20) continue;
      const mid = a.r.y + a.r.h + gap / 2;
      const key = Math.round(mid / 6);
      const gutter = across.get(key) ?? { mid, pairs: [] };
      gutter.pairs.push([a.i, b.i, gap]);
      across.set(key, gutter);
    }
  [...across.values()]
    .sort((p, q) => p.mid - q.mid)
    .forEach((gutter, n) => {
      const b = ((n % 2 ? -1 : 1) * slant) / (pageWidth / 2);
      const line = (offset: number): Across => ({ a: gutter.mid + offset - b * (pageWidth / 2), b });
      for (const [above, below, gap] of gutter.pairs) {
        edges[above]!.bottom = line(-gap / 2);
        edges[below]!.top = line(gap / 2);
      }
    });

  // Gutters down: between two panels side by side. Tipped about the middle of the row they share, each the other way
  // to the gutter across above it.
  let n = 0;
  for (const a of framed)
    for (const b of framed) {
      const gap = b.r.x - (a.r.x + a.r.w);
      const shared = overlap(a.r.y, a.r.y + a.r.h, b.r.y, b.r.y + b.r.h);
      if (gap < 0 || gap > MAX_GUTTER || shared < 0.5 * Math.min(a.r.h, b.r.h)) continue;
      const top = Math.min(a.r.y, b.r.y);
      const height = Math.max(a.r.y + a.r.h, b.r.y + b.r.h) - top;
      const mid = a.r.x + a.r.w + gap / 2;
      const d = ((n++ % 2 ? 1 : -1) * slant) / (height / 2);
      const line = (offset: number): Down => ({ c: mid + offset - d * (top + height / 2), d });
      edges[a.i]!.right = line(-gap / 2);
      edges[b.i]!.left = line(gap / 2);
    }

  return edges.map((e) => [meet(e.top, e.left), meet(e.top, e.right), meet(e.bottom, e.right), meet(e.bottom, e.left)]);
}

/** A quad moved into a box's own coordinates (the box's top left at 0, 0). */
export const quadWithin = (quad: Quad, box: Rect): Quad => quad.map((p) => ({ x: p.x - box.x, y: p.y - box.y })) as Quad;

/** How far a quad (in its box's own coordinates) cuts into a box of `w` × `h` on each side, at its deepest: the room a
 *  panel's content keeps clear so the slant of a gutter doesn't run through it. A side the quad reaches past cuts 0. */
export function quadCuts(quad: Quad, w: number, h: number): { top: number; right: number; bottom: number; left: number } {
  const [tl, tr, br, bl] = quad;
  return {
    top: Math.max(0, tl.y, tr.y),
    right: Math.max(0, w - tr.x, w - br.x),
    bottom: Math.max(0, h - br.y, h - bl.y),
    left: Math.max(0, tl.x, bl.x),
  };
}

/** A quad as a CSS clip-path. */
export const quadClipPath = (quad: Quad) => `polygon(${quad.map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(", ")})`;

/** A quad as an SVG polygon's points. */
export const quadPoints = (quad: Quad) => quad.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

/** A rect as a quad, grown by `by` px all round. */
export const rectQuad = (r: Rect, by = 0): Quad => [
  { x: r.x - by, y: r.y - by },
  { x: r.x + r.w + by, y: r.y - by },
  { x: r.x + r.w + by, y: r.y + r.h + by },
  { x: r.x - by, y: r.y + r.h + by },
];

/** A seeded random number in [0, 1) (mulberry32): the same seed always tears the same way. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How far a tear wanders from its border's width, as a share of it: a slow wobble, and small sharp jaggies. */
const TEAR_WOBBLE = 0.35;
const TEAR_JAGGIES = 0.22;
/** The distance between a tear's points (px). */
const TEAR_STEP = 5;

/**
 * A sheet of paper torn round a `w` × `h` box, about `by` px wide all round, as polygon points in the box's coordinates
 * (as the stickers' paper is torn round their art, server/src/services/stickerEffect.ts). The edge wobbles slowly and
 * jags a little at every point, from `seed`, so the same box always tears the same way.
 */
export function tornOutline(w: number, h: number, by: number, seed: number): Point[] {
  const random = seeded(seed);
  const perimeter = 2 * (w + h);
  const n = Math.max(8, Math.round(perimeter / TEAR_STEP));
  // The wobble: a few random knots round the perimeter, eased between, so it wanders smoothly and meets itself.
  const knots = Array.from({ length: Math.max(4, Math.round(perimeter / 60)) }, () => random() * 2 - 1);
  const wobble = (t: number) => {
    const at = t * knots.length;
    const i = Math.floor(at) % knots.length;
    const f = at - Math.floor(at);
    const s = f * f * (3 - 2 * f);
    return knots[i]! + (knots[(i + 1) % knots.length]! - knots[i]!) * s;
  };
  const points: Point[] = [];
  for (let k = 0; k < n; k++) {
    const t = k / n;
    // Round the box clockwise from its top left: where on its edge, and which way is out.
    let d = t * perimeter;
    let p: Point;
    let out: Point;
    if (d < w) (p = { x: d, y: 0 }), (out = { x: 0, y: -1 });
    else if ((d -= w) < h) (p = { x: w, y: d }), (out = { x: 1, y: 0 });
    else if ((d -= h) < w) (p = { x: w - d, y: h }), (out = { x: 0, y: 1 });
    else (d -= w), (p = { x: 0, y: h - d }), (out = { x: -1, y: 0 });
    const reach = by * (1 + TEAR_WOBBLE * wobble(t) + TEAR_JAGGIES * (random() * 2 - 1));
    points.push({ x: p.x + out.x * reach, y: p.y + out.y * reach });
  }
  return points;
}
