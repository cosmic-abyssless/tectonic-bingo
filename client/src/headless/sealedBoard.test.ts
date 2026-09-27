import { describe, expect, it } from "vitest";
import type { GraphNode, SealedBoardResponse, Tile, TileCategory } from "@bingo/shared";
import { buildBoard, sealedBoardAsTiles } from "./boardModel";
import { tileSearchMatcher } from "./useTileSearch";

// CONTEXT.md "Sealed Tiles": the board a Player gets while the Tiles are sealed, and how it's searched.

const node = (over: Partial<GraphNode> & Pick<GraphNode, "id" | "kind">): GraphNode =>
  ({ bingoId: "b", label: null, description: null, notes: null, points: 0, minCount: null, quantity: null, itemName: null, pointsGateNodeId: null, submitGateNodeId: null, allowsPreLoad: false, valuedAs: null, children: [], ...over }) as GraphNode;

const categories: TileCategory[] = [{ id: "cat", bingoId: "b", label: "Raids", colorHex: "#123456", sortOrder: 0 }];

const sealedBoard: SealedBoardResponse = {
  sealed: true,
  tiles: [
    { id: "t1", name: "Zulrah", imageUrl: "/uploads/tiles/z.png", categoryId: null, boardRow: 0, boardCol: 0, hasFreezePeriod: true, freezeDurationMinutes: 30 },
    { id: "t2", name: "Chambers", imageUrl: null, categoryId: "cat", boardRow: 0, boardCol: 1, hasFreezePeriod: false, freezeDurationMinutes: 0 },
  ],
  lines: [{ id: "row0", lineType: "row", lineIndex: 0, tileIds: ["t1", "t2"] }],
};

function build(board: SealedBoardResponse) {
  const { tiles, lines } = sealedBoardAsTiles(board, "b");
  return buildBoard({
    tiles,
    categories,
    lines,
    nodeStates: [],
    teamSubmissions: [],
    bingoStartsAt: null,
    bingoRows: 1,
    bingoCols: 2,
    now: 0,
    matchIds: null,
    canSubmit: false,
    canToggleInterest: false,
    interests: [],
    viewerUserId: "u",
    totalPoints: null,
    adjustments: [],
    sealed: true,
    prev: new Map(),
  });
}

describe("a sealed board", () => {
  it("lays out each Tile from its position, art, name, Category and freeze, with nothing to show about its Parts or points", () => {
    const board = build(sealedBoard);
    expect(board.sealed).toBe(true);
    expect(board.grid[0]!.map((t) => t?.id)).toEqual(["t1", "t2"]);
    const [zulrah, chambers] = board.tiles;
    expect(zulrah).toMatchObject({ sealed: true, name: "Zulrah", imageUrl: "/uploads/tiles/z.png", category: null, tasks: [], taskStatuses: [] });
    expect(zulrah!.freeze).toMatchObject({ hasFreezePeriod: true, durationMinutes: 30 });
    expect(zulrah!.progress).toEqual({ completedTasks: 0, totalTasks: 0, pointsAwarded: 0, totalPoints: 0, bonusAwarded: 0, allComplete: false });
    expect(chambers!.category?.label).toBe("Raids");
  });

  it("keeps each line's Tiles, without its bonus", () => {
    expect(build(sealedBoard).lines).toEqual([{ id: "row0", lineType: "row", lineIndex: 0, tileIds: ["t1", "t2"], points: 0, complete: false, pointsAwarded: 0 }]);
  });
});

describe("tileSearchMatcher", () => {
  const tile: Tile = {
    id: "t",
    bingoId: "b",
    nodeId: "n",
    name: "Zulrah",
    imageUrl: null,
    categoryId: "cat",
    boardRow: 0,
    boardCol: 0,
    hasFreezePeriod: false,
    freezeDurationMinutes: 0,
    notes: null,
    createdAt: "",
    node: node({ id: "n", kind: "ALL", children: [node({ id: "p", kind: "ITEM", description: "Kill the snake", itemName: "Tanzanite fang" })] }),
  };

  it("while sealed, finds a Tile by its name or Category, never by an Item or Part", () => {
    const matches = tileSearchMatcher(true, categories);
    expect(matches(tile, "zul")).toBe(true);
    expect(matches(tile, "raid")).toBe(true);
    expect(matches(tile, "tanzanite")).toBe(false);
    expect(matches(tile, "snake")).toBe(false);
  });

  it("otherwise finds a Tile by its Items and Parts too, as before", () => {
    const matches = tileSearchMatcher(false, categories);
    expect(matches(tile, "tanzanite")).toBe(true);
    expect(matches(tile, "snake")).toBe(true);
  });
});
