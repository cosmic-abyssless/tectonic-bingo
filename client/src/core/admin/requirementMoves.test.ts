import { describe, expect, it } from "vitest";
import type { GraphNodeInput } from "@bingo/shared";
import { canMove, moveNode } from "./requirementMoves";

const item = (itemName: string, id?: string): GraphNodeInput => ({ kind: "ITEM", itemName, ...(id && { id }) });

// ALL
//   a
//   b
//   ANY (c, d)
//   e
const tree = (): GraphNodeInput => ({
  kind: "ALL",
  children: [item("a"), item("b"), { kind: "ANY", id: "any", children: [item("c"), item("d", "d")] }, item("e")],
});

// The tree as nested item names, for comparing shapes.
function names(node: GraphNodeInput): unknown {
  return node.kind === "ITEM" ? node.itemName : (node.children ?? []).map(names);
}

describe("moveNode", () => {
  it("moves a row down among its siblings", () => {
    expect(names(moveNode(tree(), [0], [], 2))).toEqual(["b", "a", ["c", "d"], "e"]);
  });

  it("moves a row up among its siblings", () => {
    expect(names(moveNode(tree(), [3], [], 0))).toEqual(["e", "a", "b", ["c", "d"]]);
  });

  it("moves a row to the end", () => {
    expect(names(moveNode(tree(), [0], [], 4))).toEqual(["b", ["c", "d"], "e", "a"]);
  });

  it("moves a row into a condition that comes after it", () => {
    expect(names(moveNode(tree(), [0], [2], 1))).toEqual(["b", ["c", "a", "d"], "e"]);
  });

  it("moves a row out of a condition", () => {
    expect(names(moveNode(tree(), [2, 0], [], 0))).toEqual(["c", "a", "b", ["d"], "e"]);
  });

  it("moves a whole condition, children and all, keeping its id", () => {
    const moved = moveNode(tree(), [2], [], 0);
    expect(names(moved)).toEqual([["c", "d"], "a", "b", "e"]);
    expect(moved.children![0]!.id).toBe("any");
  });

  it("keeps the moved node's id", () => {
    expect(moveNode(tree(), [2, 1], [], 0).children![0]).toEqual(item("d", "d"));
  });
});

describe("canMove", () => {
  it("refuses a drop right where the row already is", () => {
    expect(canMove(tree(), [1], [], 1)).toBe(false);
    expect(canMove(tree(), [1], [], 2)).toBe(false);
    expect(canMove(tree(), [1], [], 0)).toBe(true);
    expect(canMove(tree(), [1], [], 3)).toBe(true);
  });

  it("refuses a condition into itself or anything inside it", () => {
    expect(canMove(tree(), [2], [2], 0)).toBe(false);
    const nested: GraphNodeInput = { kind: "ALL", children: [{ kind: "ANY", children: [{ kind: "ALL", children: [] }] }] };
    expect(canMove(nested, [0], [0, 0], 0)).toBe(false);
  });

  it("refuses to give a condition the same node twice", () => {
    const shared: GraphNodeInput = { kind: "ALL", children: [item("d", "d"), { kind: "ANY", children: [item("d", "d")] }] };
    expect(canMove(shared, [0], [1], 0)).toBe(false);
    expect(canMove(tree(), [0], [2], 0)).toBe(true);
  });

  it("never moves the task's root, and never drops into an item", () => {
    expect(canMove(tree(), [], [], 0)).toBe(false);
    expect(canMove(tree(), [1], [0], 0)).toBe(false);
  });
});
