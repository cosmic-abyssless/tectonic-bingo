import { describe, expect, it } from "vitest";
import type { Claim, ExclusivityConflict, GraphNode, SubmissionDetails } from "@bingo/shared";
import { buildLeafClaimMaps } from "../core/board/taskClaims";
import { buildRequirementTree } from "./boardModel";

const node = (over: Partial<GraphNode> & Pick<GraphNode, "id" | "kind">): GraphNode =>
  ({ bingoId: "b", label: null, description: null, notes: null, points: 0, minCount: null, quantity: null, itemName: null, pointsGateNodeId: null, submitGateNodeId: null, allowsPreLoad: false, valuedAs: null, requiresProof: false, proofNote: null, children: [], ...over }) as GraphNode;

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

describe("buildRequirementTree: nested condition layout", () => {
  const item = (id: string, itemName = id) => node({ id, kind: "ITEM", itemName });
  const approved = (...nodeIds: string[]) => buildLeafClaimMaps([sub("s1", "approved", nodeIds.map((nodeId) => ({ nodeId, quantity: 1 })))]);

  it("gives an ANY an OR divider, and nothing to its nested ALLs", () => {
    const any = node({ id: "any", kind: "ANY", children: [node({ id: "all1", kind: "ALL", children: [item("a"), item("b")] }), node({ id: "all2", kind: "ALL", children: [item("c")] }), item("d")] });
    const tree = buildRequirementTree(any, buildLeafClaimMaps([]), new Map())!;
    expect(tree.divider).toEqual({ label: "OR", dim: false });
    expect(tree.progress).toBeNull();
    expect(tree.children.map((c) => c.divider)).toEqual([null, null, null]);
  });

  it("dims an ANY's dividers once it's satisfied, or an enclosing condition is", () => {
    const any = node({ id: "any", kind: "ANY", children: [item("a"), item("b")] });
    expect(buildRequirementTree(any, approved("a"), new Map([["any", "completed"]]))!.divider).toEqual({ label: "OR", dim: true });
    expect(buildRequirementTree(any, buildLeafClaimMaps([]), new Map(), true)!.divider!.dim).toBe(true);
  });

  it("shows a COUNT's progress as options complete, with no divider", () => {
    const count = node({ id: "count", kind: "COUNT", minCount: 3, children: [item("a"), item("b"), item("c"), node({ id: "all", kind: "ALL", children: [item("d")] })] });
    const tree = buildRequirementTree(count, approved("a", "d"), new Map([["all", "completed"]]))!;
    expect(tree.label).toBe("Complete at least 3 of");
    expect(tree.progress).toEqual({ current: 2, target: 3 });
    expect(tree.divider).toBeNull();
  });

  it("makes a SUM over several items a group headed with its rule and progress", () => {
    const sum = node({ id: "sum", kind: "SUM", quantity: 5, children: [item("a", "Dragon claws"), item("b", "Dinh's bulwark")] });
    const tree = buildRequirementTree(sum, approved("b"), new Map())!;
    expect(tree).toMatchObject({ isLeaf: false, showHeading: true, label: "5 in total from", progress: { current: 1, target: 5 }, quantity: null, divider: null, children: [] });
    expect(tree.items.map((i) => [i.name, i.count])).toEqual([["Dragon claws", 0], ["Dinh's bulwark", 1]]);
  });

  it("keeps a SUM over one item a single row with its quantity", () => {
    const sum = node({ id: "sum", kind: "SUM", quantity: 2, children: [item("a", "Twisted ancestral colour kit")] });
    const tree = buildRequirementTree(sum, buildLeafClaimMaps([]), new Map())!;
    expect(tree).toMatchObject({ isLeaf: true, showHeading: false, label: "Twisted ancestral colour kit", quantity: 2, progress: { current: 0, target: 2 } });
    const one = buildRequirementTree(node({ ...sum, quantity: 1 }), buildLeafClaimMaps([]), new Map())!;
    expect(one.quantity).toBeNull();
  });
});
