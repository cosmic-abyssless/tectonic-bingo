// "+ existing item": the leaves another Task can link to, and what linking one sends (existingLeaves.ts).
import { describe, expect, it } from "vitest";
import type { GraphNode } from "@bingo/shared";
import { existingLeavesExcluding, linkedLeafInput } from "./existingLeaves";

const node = (over: Partial<GraphNode>): GraphNode =>
  ({ id: "n", bingoId: "b", kind: "ITEM", label: null, description: null, notes: null, points: 0, minCount: null, quantity: null, itemName: null, countsAs: 1, pointsGateNodeId: null, submitGateNodeId: null, allowsPreLoad: false, valuedAs: null, requiresProof: false, proofNote: null, children: [], ...over }) as GraphNode;

// A DT2 Tile: the first Task's Gold ring is a ring roll, a third of the boss's vestige.
const ring = node({ id: "ring", itemName: "Gold ring", valuedAs: { itemName: "Magus vestige", divisor: 3, source: "Duke Sucellus" } });
const tasks = [
  node({ id: "a", kind: "ANY", label: "A ring roll", children: [ring, node({ id: "eye", itemName: "Eye of the Duke" })] }),
  node({ id: "b", kind: "SUM", quantity: 2, label: "Two more ring rolls", children: [node({ id: "pages", itemName: "Burnt page", countsAs: 25 })] }),
];

describe("+ existing item", () => {
  it("offers the other Tasks' items, each with its Counts as and Valued as", () => {
    expect(existingLeavesExcluding(tasks, 1)).toEqual([
      { id: "ring", itemName: "Gold ring", countsAs: 1, valuedAs: { itemName: "Magus vestige", divisor: 3, source: "Duke Sucellus" }, taskLabel: "A ring roll" },
      { id: "eye", itemName: "Eye of the Duke", countsAs: 1, valuedAs: null, taskLabel: "A ring roll" },
    ]);
    expect(existingLeavesExcluding(tasks, 0).map((l) => [l.itemName, l.countsAs])).toEqual([["Burnt page", 25]]);
  });

  it("links the same item with its own settings, so saving the Task doesn't clear its Valued as (#376)", () => {
    const [linked] = existingLeavesExcluding(tasks, 1);
    expect(linkedLeafInput(linked!)).toEqual({ id: "ring", kind: "ITEM", itemName: "Gold ring", countsAs: 1, valuedAs: { itemName: "Magus vestige", divisor: 3, source: "Duke Sucellus" } });
  });
});
