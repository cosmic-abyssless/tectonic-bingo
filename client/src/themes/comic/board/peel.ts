// The peel's geometry, pure: where a page is folded, and which parts of it are kept, folded back and reflected. The
// Tile book (TileModal) turns its pages with it, and so does Wrapped's comic book (wrapped/PageTurn).

export type Point = { x: number; y: number };

/** Sutherland–Hodgman against one half-plane: the part of `poly` where `signedDistance` ≤ 0. */
export function clipPolygon(poly: Point[], signedDistance: (p: Point) => number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const da = signedDistance(a);
    const db = signedDistance(b);
    if (da <= 0) out.push(a);
    if ((da <= 0) !== (db <= 0)) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

export const toClipPolygon = (poly: Point[]) => `polygon(${poly.map((p) => `${p.x.toFixed(2)}px ${p.y.toFixed(2)}px`).join(", ")})`;

/**
 * Where a page is folded, and how. Worked out on one canonical page: width
 * W, height H, spine at x = 0, outer edge at x = W. `depth` is how far in
 * from the outer edge the page's edge has been brought (0 = flat; W×2 has
 * the fold at the spine, the page fully turned over); `v` is where along
 * the edge it's held, from -1 (top corner) through 0 (middle) to 1 (bottom
 * corner).
 *
 * The fold line passes midway between the edge and where the edge has been
 * brought to, at height `v`, so under a pointer the page's edge lands
 * right on it. Its angle runs from vertical at the middle of the edge (a
 * rectangular strip peels back) to 45° at a corner (a corner triangle),
 * tilting toward whichever corner's nearer.
 *
 * `kept` is the part of the page left in place, for the face's clip-path. Its
 * outer sides run `bleed` past the page's own edges: a clip-path clips the
 * element's box-shadow too, so a clip at the page's edge would cut off a
 * left-hand page's lifted shadow the moment a peel began (and it would come
 * back when the peel ended). Only the fold side and the spine cut.
 */
export function peelGeometry(W: number, H: number, depth: number, v: number, bleed = 0) {
  const y = (H / 2) * (1 + Math.max(-1, Math.min(1, v)));
  const toward = v >= 0 ? 1 : -1;
  const theta = Math.min(1, Math.abs(v)) * (Math.PI / 4);
  // Unit normal pointing out toward the peeled part.
  const n = { x: Math.cos(theta), y: toward * Math.sin(theta) };
  const fold = { x: W - depth / 2, y };
  const dist = (p: Point) => (p.x - fold.x) * n.x + (p.y - fold.y) * n.y;
  const page: Point[] = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: H },
    { x: 0, y: H },
  ];
  // Not past the spine (x = 0), though: a left-hand page's shadow reaching
  // over the facing page would come and go as the stacks' depths shuffle.
  const withBleed: Point[] = [
    { x: 0, y: -bleed },
    { x: W + bleed, y: -bleed },
    { x: W + bleed, y: H + bleed },
    { x: 0, y: H + bleed },
  ];
  const kept = clipPolygon(withBleed, dist);
  const peeled = clipPolygon(page, (p) => -dist(p));
  const reflect = (p: Point) => {
    const d = dist(p);
    return { x: p.x - 2 * d * n.x, y: p.y - 2 * d * n.y };
  };
  return { kept, folded: peeled.map(reflect), fold, n, reflect };
}

// How far past a peeling face's edges its clip-path reaches, as a fraction of the page's width: enough to keep the
// whole of a lifted page's shadow (ClosedBook's LIFTED_PAGE_SHADOW: offset + blur, 0.06 of a page).
export const PEEL_CLIP_BLEED = 0.1;
