import { describe, expect, it } from "vitest";
import { GUTTER_SLANT, panelFrames, quadClipPath, quadCuts, quadWithin, type Quad } from "./frames";

const W = 420;
// A page: a splash across the top, two panels side by side under it, and one across the foot.
const splash = { x: 20, y: 20, w: 380, h: 200 };
const left = { x: 20, y: 248, w: 180, h: 160 };
const right = { x: 220, y: 248, w: 180, h: 160 };
const foot = { x: 20, y: 436, w: 380, h: 150 };

/** How far apart two parallel-ish edges are, measured straight down (or across) at both ends. */
const gapDown = (upper: Quad, lower: Quad, x: number) => {
  const yAt = (a: { x: number; y: number }, b: { x: number; y: number }) => a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
  return yAt(lower[0], lower[1]) - yAt(upper[3], upper[2]);
};

describe("panel frames", () => {
  const [s, l, r, f] = panelFrames([{ rect: splash }, { rect: left }, { rect: right }, { rect: foot }], W);

  it("keeps the edges on the page's margin straight", () => {
    expect(s![0]).toEqual({ x: 20, y: 20 });
    expect(s![1]).toEqual({ x: 400, y: 20 });
    expect(f![2].y).toBeCloseTo(586);
    expect(l![0].x).toBeCloseTo(20);
    expect(r![1].x).toBeCloseTo(400);
  });

  it("tips the gutters across the page, and the next one the other way", () => {
    // The splash's foot rises (or falls) across the page...
    expect(Math.abs(s![3].y - s![2].y)).toBeGreaterThan(GUTTER_SLANT);
    // ...and the gutter below the row of two tips the other way.
    expect(Math.sign(s![2].y - s![3].y)).toBe(-Math.sign(f![1].y - f![0].y));
  });

  it("keeps a gutter the same width all along it", () => {
    for (const x of [40, 200, 380]) {
      expect(gapDown(s!, x < 210 ? l! : r!, x)).toBeCloseTo(28, 0);
    }
  });

  it("tips the gutter between two panels side by side, and they share it", () => {
    expect(Math.abs(l![1].x - l![2].x)).toBeGreaterThan(GUTTER_SLANT);
    // The two edges are parallel, 20px apart.
    expect(r![0].x - l![1].x).toBeCloseTo(20, 0);
    expect(r![3].x - l![2].x).toBeCloseTo(20, 0);
  });

  it("leaves an inset, and the panel it sits on, alone", () => {
    const inset = { x: 140, y: 190, w: 260, h: 60 };
    const [host, own] = panelFrames([{ rect: splash }, { rect: inset, straight: true }], W);
    expect(own).toEqual([
      { x: 140, y: 190 },
      { x: 400, y: 190 },
      { x: 400, y: 250 },
      { x: 140, y: 250 },
    ]);
    expect(host![2].y).toBeCloseTo(220);
  });

  it("puts a quad into its own box's coordinates for its clip-path", () => {
    const own = quadWithin(s!, splash);
    expect(own[0]).toEqual({ x: 0, y: 0 });
    expect(quadClipPath(own)).toMatch(/^polygon\(0\.0px 0\.0px, 380\.0px 0\.0px, /);
  });

  it("measures how deep the slant cuts into each side of a panel, a straight side not at all", () => {
    const cuts = quadCuts(quadWithin(l!, left), left.w, left.h);
    // Its top and right sit on gutters, tipped in at one end; its left is the page's margin.
    expect(cuts.top).toBeGreaterThan(0);
    expect(cuts.top).toBeLessThanOrEqual(GUTTER_SLANT + 1);
    expect(cuts.right).toBeGreaterThan(0);
    expect(cuts.left).toBe(0);
    expect(quadCuts(quadWithin(s!, splash), splash.w, splash.h).top).toBe(0);
  });
});
