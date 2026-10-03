import { describe, expect, it } from "vitest";
import type { SealedBoardResponse, TileCategory } from "@bingo/shared";
import { buildBoard, sealedBoardAsTiles } from "./boardModel";

// CONTEXT.md "Sealed Tiles": the board a Player gets while the Tiles are sealed (how it's searched: core/board/tileSearch.ts).

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
