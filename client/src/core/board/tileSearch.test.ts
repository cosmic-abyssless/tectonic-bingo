import { describe, expect, it } from "vitest";
import type { GraphNode, Tile, TileCategory } from "@bingo/shared";
import { tileSearchMatcher } from "./tileSearch";

// The board's Tile search, matched in the browser: by name, Parts, Items and Tags (CONTEXT.md "Tag"), or by name and
// Category while the Tiles are sealed (CONTEXT.md "Sealed Tiles").

const node = (over: Partial<GraphNode> & Pick<GraphNode, "id" | "kind">): GraphNode =>
  ({ bingoId: "b", label: null, description: null, notes: null, points: 0, minCount: null, quantity: null, itemName: null, countsAs: 1, pointsGateNodeId: null, submitGateNodeId: null, allowsPreLoad: false, valuedAs: null, requiresProof: false, proofNote: null, children: [], ...over }) as GraphNode;

const categories: TileCategory[] = [{ id: "cat", bingoId: "b", label: "Raids", colorHex: "#123456", sortOrder: 0 }];

const tile = {
  id: "t",
  name: "Zulrah",
  categoryId: "cat",
  boardRow: 0,
  boardCol: 0,
  node: node({ id: "n", kind: "ALL", children: [node({ id: "p", kind: "ITEM", description: "Kill the snake", itemName: "Tanzanite fang" })] }),
} as unknown as Tile;

describe("tileSearchMatcher", () => {
  it("finds a Tile by its name, its Parts' descriptions and its Items, case-insensitively", () => {
    const matches = tileSearchMatcher(false, categories, {});
    expect(matches(tile, "ZUL")).toBe(true);
    expect(matches(tile, "tanzanite")).toBe(true);
    expect(matches(tile, "snake")).toBe(true);
    expect(matches(tile, "vork")).toBe(false);
    expect(matches(tile, "  ")).toBe(false);
  });

  it("finds a Tile by its Tags, its Parts' included (BoardResponse.tileTags)", () => {
    const matches = tileSearchMatcher(false, categories, { t: ["snek", "Zulrah snakeling"] });
    expect(matches(tile, "snek")).toBe(true);
    expect(matches(tile, "SNAKELING")).toBe(true);
    expect(tileSearchMatcher(false, categories, { other: ["snek"] })(tile, "snek")).toBe(false);
  });

  it("while sealed, finds a Tile by its name or Category only, never by an Item, Part or Tag", () => {
    const matches = tileSearchMatcher(true, categories, { t: ["snek"] });
    expect(matches(tile, "zul")).toBe(true);
    expect(matches(tile, "raid")).toBe(true);
    expect(matches(tile, "tanzanite")).toBe(false);
    expect(matches(tile, "snake")).toBe(false);
    expect(matches(tile, "snek")).toBe(false);
  });
});
