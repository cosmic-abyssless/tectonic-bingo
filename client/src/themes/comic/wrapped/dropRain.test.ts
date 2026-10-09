import { describe, expect, it } from "vitest";
import { FALL_MS, pieceAt, rainPile } from "./dropRain";

const items = [
  { itemName: "Zulrah's scales", drops: 300 },
  { itemName: "Tanzanite fang", drops: 30 },
  { itemName: "Pet snakeling", drops: 1 },
];

describe("the rain of drops", () => {
  it("rains every drop of a small Bingo, one icon each, all landing inside the pane", () => {
    const pile = rainPile([{ itemName: "A", drops: 5 }, { itemName: "B", drops: 3 }], 380, 400);
    expect(pile.pieces).toHaveLength(8);
    for (const p of pile.pieces) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(380);
      expect(p.y).toBeLessThan(400);
    }
  });

  it("rains a big Bingo's drops in proportion when they don't all fit, the pile staying in the pane", () => {
    const huge = [{ itemName: "Coins", drops: 9000 }, { itemName: "Pet", drops: 1000 }];
    const pile = rainPile(huge, 380, 400);
    expect(pile.pieces.length).toBeLessThan(10000);
    const coins = pile.pieces.filter((p) => p.itemName === "Coins").length / pile.pieces.length;
    expect(coins).toBeGreaterThan(0.8);
    expect(coins).toBeLessThan(0.97);
    expect(Math.min(...pile.pieces.map((p) => p.y - pile.size / 2))).toBeGreaterThan(0);
  });

  it("piles up from the floor: an icon resting on another lands after it", () => {
    const pile = rainPile(items, 380, 400);
    const step = pile.size * 0.78;
    for (const upper of pile.pieces)
      for (const lower of pile.pieces) {
        // The same column (its jitter is under a third of a step either way) and at least a level down.
        const sameColumn = Math.abs(upper.x - lower.x) < step * 0.35;
        if (sameColumn && lower.y - upper.y > step * 0.75) expect(lower.delay).toBeLessThan(upper.delay);
      }
  });

  it("is the same pile every time for the same Bingo", () => {
    expect(rainPile(items, 380, 400, 7)).toEqual(rainPile(items, 380, 400, 7));
  });

  it("falls from above to its place, hops as it lands, then rests", () => {
    const [p] = rainPile([{ itemName: "A", drops: 1 }], 380, 400).pieces;
    expect(pieceAt(p!, p!.delay - 1)).toBeNull();
    expect(pieceAt(p!, p!.delay)!.y).toBeLessThan(0);
    expect(pieceAt(p!, p!.delay + FALL_MS + 80)!.y).toBeLessThan(p!.y);
    expect(pieceAt(p!, p!.delay + 5000)).toEqual({ y: p!.y, angle: p!.angle });
  });

  it("starts every drop above the panel's top, when the pane sits under a heading", () => {
    const { pieces } = rainPile(items, 380, 400, 1, 120);
    for (const p of pieces) expect(pieceAt(p, p.delay)!.y).toBeLessThan(-120);
  });

  it("rains nothing into a pane not yet measured", () => {
    expect(rainPile(items, 0, 0).pieces).toEqual([]);
  });
});
