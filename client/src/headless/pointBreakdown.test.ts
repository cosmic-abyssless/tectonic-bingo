import { describe, expect, it } from "vitest";
import { buildPointBreakdown, lineLabel } from "./pointBreakdown";
import type { LineModel, PointAdjustmentModel, TileModel } from "./types";

function task(id: string, label: string | null, points: number, pointsAwarded: number, complete = pointsAwarded > 0) {
  return { id, label, points, pointsAwarded, complete };
}
function tile(id: string, name: string, tasks: ReturnType<typeof task>[], bonusAwarded = 0): TileModel {
  return { id, name, tasks, progress: { bonusAwarded } } as unknown as TileModel;
}
function line(id: string, lineType: LineModel["lineType"], lineIndex: number, pointsAwarded: number, tileIds: string[] = []): LineModel {
  return { id, lineType, lineIndex, tileIds, points: 15, complete: pointsAwarded > 0, pointsAwarded };
}
const adjustment = (id: string, amount: number, reason = "why"): PointAdjustmentModel => ({ id, amount, reason, timeAgo: "1m ago" });

describe("buildPointBreakdown", () => {
  it("puts each tile's bonus with its own parts, lines apart, and adds up to the total", () => {
    const breakdown = buildPointBreakdown({
      tiles: [
        tile("t1", "Vorkath", [task("a", "Part A", 25, 25), task("b", "Part B", 35, 35)], 20),
        tile("t2", "Zulrah", [task("c", "Part A", 25, 25), task("d", "Part B", 50, 0, false)]),
      ],
      lines: [line("l1", "column", 1, 15, ["t2", "t1"]), line("l2", "row", 0, 15, ["t1", "t2"]), line("l3", "row", 2, 0)],
      adjustments: [adjustment("x", 10), adjustment("y", -5)],
      totalPoints: 25 + 35 + 25 + 20 + 15 + 15 + 5,
    });

    expect(breakdown.tiles.points).toBe(105); // the parts and the bonus
    expect(breakdown.tiles.items.map((t) => [t.name, t.points, t.bonus])).toEqual([["Vorkath", 80, 20], ["Zulrah", 25, 0]]); // biggest first
    expect(breakdown.tiles.items[0]!.parts.map((p) => [p.label, p.points])).toEqual([["Part A", 25], ["Part B", 35]]);
    expect(breakdown.lines.items.map((l) => [l.label, l.points])).toEqual([["Row 1", 15], ["Column 2", 15]]); // rows first; the unfinished line is left out
    expect(breakdown.lines.items[0]!.tileNames).toEqual(["Vorkath", "Zulrah"]);
    expect(breakdown.lines.items[1]!.tileNames).toEqual(["Zulrah", "Vorkath"]); // in the line's own order
    expect(breakdown.adjustments.points).toBe(5);
    expect(breakdown.total).toBe(140);
    expect(breakdown.unattributed).toBe(0);
  });

  it("keeps a tile that has only a bonus, and leaves out tiles that earned nothing", () => {
    const breakdown = buildPointBreakdown({
      tiles: [tile("t1", "Vorkath", [task("a", "Part A", 25, 0, false)], 20), tile("t2", "Zulrah", [task("b", "Part A", 25, 0, false)])],
      lines: [],
      adjustments: [],
      totalPoints: 20,
    });
    expect(breakdown.tiles.items.map((t) => t.name)).toEqual(["Vorkath"]);
    expect(breakdown.unattributed).toBe(0);
  });

  it("lists completed parts whose points are held back, without counting them", () => {
    const breakdown = buildPointBreakdown({
      tiles: [tile("t1", "Vorkath", [task("a", "Part A", 25, 0, false), task("b", "Part B", 35, 0, true)])],
      lines: [],
      adjustments: [],
      totalPoints: 0,
    });
    expect(breakdown.withheld).toEqual([{ tileId: "t1", tileName: "Vorkath", label: "Part B", points: 35 }]);
    expect(breakdown.tiles.items).toEqual([]);
    expect(breakdown.unattributed).toBe(0);
  });

  it("reports whatever the total holds that nothing above accounts for", () => {
    const breakdown = buildPointBreakdown({ tiles: [tile("t1", "Vorkath", [task("a", "Part A", 25, 25)])], lines: [], adjustments: [], totalPoints: 40 });
    expect(breakdown.unattributed).toBe(15);
  });

  it("takes the total from the parts when the server total has not loaded", () => {
    const breakdown = buildPointBreakdown({ tiles: [tile("t1", "Vorkath", [task("a", "Part A", 25, 25)])], lines: [], adjustments: [adjustment("x", -5)], totalPoints: null });
    expect(breakdown.total).toBe(20);
    expect(breakdown.unattributed).toBe(0);
  });

  it("names an unlabelled part 'Part' and an empty board comes out empty", () => {
    expect(buildPointBreakdown({ tiles: [tile("t1", "Vorkath", [task("a", null, 10, 10)])], lines: [], adjustments: [], totalPoints: 10 }).tiles.items[0]!.parts[0]!.label).toBe("Part");
    const empty = buildPointBreakdown({ tiles: [], lines: [], adjustments: [], totalPoints: 0 });
    expect(empty).toMatchObject({ total: 0, unattributed: 0, withheld: [] });
  });
});

describe("lineLabel", () => {
  it("numbers lines from 1", () => {
    expect(lineLabel({ lineType: "row", lineIndex: 2 })).toBe("Row 3");
    expect(lineLabel({ lineType: "column", lineIndex: 0 })).toBe("Column 1");
    expect(lineLabel({ lineType: "diagonal", lineIndex: 1 })).toBe("Diagonal 2");
    expect(lineLabel({ lineType: "custom", lineIndex: 4 })).toBe("Custom line");
  });
});
