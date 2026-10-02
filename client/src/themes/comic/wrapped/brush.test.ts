import { describe, expect, it } from "vitest";
import { BRUSH_END, BRUSH_SIZE, BRUSH_START, brushBristles, brushMaskSvg, brushPosition } from "./brush";
import { clipPolygon, peelGeometry } from "../board/peel";

describe("the brush stroke", () => {
  it("sweeps from hiding everything to showing everything", () => {
    expect(brushPosition(0)).toBe(BRUSH_START);
    expect(brushPosition(1)).toBe(BRUSH_END);
    expect(brushPosition(0.5)).toBe(50);
    expect(brushPosition(-1)).toBe(BRUSH_START);
    expect(brushPosition(2)).toBe(BRUSH_END);
  });

  it("is drawn wider than the panel it paints, so the band can slide across it", () => {
    expect(BRUSH_SIZE).toBeGreaterThan(1);
  });

  it("is the same stroke every time, with a bristle on every row of its front", () => {
    expect(brushMaskSvg()).toBe(brushMaskSvg());
    const bristles = brushBristles();
    expect(bristles).toHaveLength(28);
    // They run to different lengths (a ragged front)...
    expect(new Set(bristles.map((b) => Math.round(b.end))).size).toBeGreaterThan(8);
    // ...none past where the image is bare, so slid fully off it shows nothing.
    const bare = 200 - 200 / BRUSH_SIZE;
    expect(Math.max(...bristles.map((b) => b.end))).toBeLessThanOrEqual(bare);
    // ...and the solid band covers the whole panel when the stroke has been slid all the way across.
    expect(brushMaskSvg()).toContain('<rect x="0" y="0" width="100.0');
  });

  it("is an SVG with the mask in its alpha", () => {
    const svg = brushMaskSvg();
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('preserveAspectRatio="none"');
  });
});

describe("the peel the page turn is made of", () => {
  const W = 420;
  const H = 630;

  it("leaves a flat page whole and takes the part past the fold off a peeled one", () => {
    const flat = peelGeometry(W, H, 0, 0);
    // Nothing is folded back: what there is of it lies along the page's edge, with no width.
    expect(Math.min(...flat.folded.map((p) => p.x))).toBeCloseTo(W);
    expect(flat.kept).toHaveLength(4);
    const half = peelGeometry(W, H, W, 0);
    // The fold is halfway across: the page's left half is kept and its right half folded back over it.
    const xs = half.kept.map((p) => p.x);
    expect(Math.max(...xs)).toBeCloseTo(W / 2);
    const folded = half.folded.map((p) => p.x);
    expect(Math.min(...folded)).toBeCloseTo(0);
    expect(Math.max(...folded)).toBeCloseTo(W / 2);
  });

  it("carries the page right over to the spine, nothing kept", () => {
    const over = peelGeometry(W, H, 2 * W, 0);
    expect(Math.max(...over.kept.map((p) => p.x))).toBeCloseTo(0);
    expect(Math.max(...over.folded.map((p) => p.x))).toBeLessThanOrEqual(1e-6);
  });

  it("clips a polygon to a half-plane", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const left = clipPolygon(square, (p) => p.x - 5);
    expect(Math.max(...left.map((p) => p.x))).toBe(5);
  });
});
