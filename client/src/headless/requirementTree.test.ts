import { describe, expect, it } from "vitest";
import type { Claim, ExclusivityConflict, GraphNode, SubmissionDetails } from "@bingo/shared";
import { buildLeafClaimMaps } from "../core/board/taskClaims";
import { buildRequirementTree } from "./boardModel";

const node = (over: Partial<GraphNode> & Pick<GraphNode, "id" | "kind">): GraphNode =>
  ({ bingoId: "b", label: null, description: null, notes: null, points: 0, minCount: null, quantity: null, itemName: null, pointsGateNodeId: null, submitGateNodeId: null, allowsPreLoad: false, valuedAs: null, children: [], ...over }) as GraphNode;

const sub = (id: string, status: "approved" | "pending" | "rejected", claims: Pick<Claim, "nodeId" | "quantity">[]): SubmissionDetails =>
  ({
    submission: { id, status },
    screenshots: [],
    submittedByUser: null,
    claims: claims.map((c, i) => ({ id: `${id}-${i}`, submissionId: id, itemName: null, ...c })),
  }) as unknown as SubmissionDetails;

describe("buildRequirementTree: SUM items", () => {
  const sum = node({
    id: "sum",
    kind: "SUM",
    quantity: 5,
    children: [node({ id: "a", kind: "ITEM", itemName: "Youngllef" }), node({ id: "b", kind: "ITEM", itemName: "Crystal armour seed" }), node({ id: "c", kind: "ITEM", itemName: "Crystal weapon seed" })],
  });

  it("counts approved quantity per item, duplicates included", () => {
    const maps = buildLeafClaimMaps([sub("s1", "approved", [{ nodeId: "a", quantity: 2 }, { nodeId: "c", quantity: 1 }]), sub("s2", "approved", [{ nodeId: "a", quantity: 1 }])]);
    const tree = buildRequirementTree(sum, maps, new Map())!;
    expect(tree.items.map((i) => [i.name, i.count])).toEqual([
      ["Youngllef", 3],
      ["Crystal armour seed", 0],
      ["Crystal weapon seed", 1],
    ]);
    expect(tree.progress).toEqual({ current: 4, target: 5 });
  });

  it("doesn't count pending or rejected claims as received", () => {
    const maps = buildLeafClaimMaps([sub("s1", "pending", [{ nodeId: "a", quantity: 2 }]), sub("s2", "rejected", [{ nodeId: "b", quantity: 1 }])]);
    const tree = buildRequirementTree(sum, maps, new Map())!;
    expect(tree.items.map((i) => i.count)).toEqual([0, 0, 0]);
    expect(tree.submitted).toBe(true);
  });
});

describe("buildRequirementTree: exclusive items", () => {
  const lock = (nodeId: string): [string, ExclusivityConflict] => [nodeId, { nodeId, itemName: "Baron", usedOn: "DT2 ISSUE 1", rule: { id: "r", label: "Pets", itemNames: ["Baron"], scope: "tile" } }];

  it("tags an item the team used elsewhere, without marking it done", () => {
    const leaf = node({ id: "baron", kind: "ITEM", itemName: "Baron" });
    const tree = buildRequirementTree(leaf, buildLeafClaimMaps([]), new Map(), false, new Map([lock("baron")]))!;
    expect(tree.lockedBy).toBe("Used on DT2 ISSUE 1");
    expect(tree.dim).toBe(false); // dim means done (drawn struck through); a locked item isn't done
    expect(tree.complete).toBe(false);
  });

  it("tags the right items of a SUM, and items inside an ANY", () => {
    const sum = node({ id: "sum", kind: "SUM", quantity: 2, children: [node({ id: "a", kind: "ITEM", itemName: "Baron" }), node({ id: "b", kind: "ITEM", itemName: "Nid" })] });
    const tree = buildRequirementTree(sum, buildLeafClaimMaps([]), new Map(), false, new Map([lock("a")]))!;
    expect(tree.items.map((i) => [i.name, i.lockedBy])).toEqual([["Baron", "Used on DT2 ISSUE 1"], ["Nid", null]]);

    const any = node({ id: "any", kind: "ANY", children: [node({ id: "a", kind: "ITEM", itemName: "Baron" }), node({ id: "b", kind: "ITEM", itemName: "Nid" })] });
    const anyTree = buildRequirementTree(any, buildLeafClaimMaps([]), new Map(), false, new Map([lock("b")]))!;
    expect(anyTree.children.map((c) => c.lockedBy)).toEqual([null, "Used on DT2 ISSUE 1"]);
    expect(anyTree.lockedBy).toBeNull();
  });

  it("locks nothing when no locks are given", () => {
    const tree = buildRequirementTree(node({ id: "a", kind: "ITEM", itemName: "Baron" }), buildLeafClaimMaps([]), new Map())!;
    expect(tree.lockedBy).toBeNull();
  });
});
