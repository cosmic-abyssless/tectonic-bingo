import { describe, expect, it } from "vitest";
import type { Claim, ExclusivityConflict, GraphNode, SubmissionDetails } from "@bingo/shared";
import { buildLeafClaimMaps, sumTotal } from "../core/board/taskClaims";
import { countsAsLabel, sumQuantityHint } from "../core/board/labels";
import { previewGraphNode, toGraphNodeInput } from "../core/board/requirementTree";
import { buildRequirementTree } from "./boardModel";

const node = (over: Partial<GraphNode> & Pick<GraphNode, "id" | "kind">): GraphNode =>
  ({ bingoId: "b", label: null, description: null, notes: null, points: 0, minCount: null, quantity: null, itemName: null, countsAs: 1, pointsGateNodeId: null, submitGateNodeId: null, allowsPreLoad: false, valuedAs: null, requiresProof: false, proofNote: null, children: [], ...over }) as GraphNode;

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

describe("buildRequirementTree: Counts as", () => {
  // Wintertodt's "200 burnt pages": a page counts as 1, a Pyromancer garb as 25.
  const pages = node({
    id: "pages",
    kind: "SUM",
    quantity: 200,
    children: [node({ id: "page", kind: "ITEM", itemName: "Burnt page" }), node({ id: "garb", kind: "ITEM", itemName: "Pyromancer garb", countsAs: 25 })],
  });

  it("counts each item times what it counts as toward the total, and lists the real number received", () => {
    const maps = buildLeafClaimMaps([sub("s1", "approved", [{ nodeId: "page", quantity: 30 }, { nodeId: "garb", quantity: 2 }]), sub("s2", "pending", [{ nodeId: "garb", quantity: 1 }])]);
    const tree = buildRequirementTree(pages, maps, new Map())!;
    expect(tree.progress).toEqual({ current: 80, target: 200 });
    expect(tree.complete).toBe(false);
    expect(tree.items.map((i) => [i.name, i.count, i.countsAs])).toEqual([
      ["Burnt page", 30, 1],
      ["Pyromancer garb", 2, 25],
    ]);
  });

  it("completes on 8 items that each count as 25", () => {
    const maps = buildLeafClaimMaps([sub("s1", "approved", [{ nodeId: "garb", quantity: 8 }])]);
    const tree = buildRequirementTree(pages, maps, new Map())!;
    expect(tree.progress).toEqual({ current: 200, target: 200 });
    expect(tree.complete).toBe(true);
  });

  it("keeps it on a single-item SUM's row", () => {
    const kits = node({ id: "kits", kind: "SUM", quantity: 4, children: [node({ id: "dust", kind: "ITEM", itemName: "Metamorphic dust", countsAs: 2 })] });
    const tree = buildRequirementTree(kits, buildLeafClaimMaps([sub("s1", "approved", [{ nodeId: "dust", quantity: 1 }])]), new Map())!;
    expect(tree.isLeaf).toBe(true);
    expect(tree.items[0]!.countsAs).toBe(2);
    expect(tree.progress).toEqual({ current: 2, target: 4 });
  });

  it("totals what's approved plus what's staged the same way in the Submit flow", () => {
    const pending: Record<string, number> = { page: 190, garb: 1 };
    expect(sumTotal(pages, (id) => pending[id] ?? 0)).toBe(215);
  });

  it("goes back to the server with the rest of the Task when the board editor saves it, and shows in its preview", () => {
    const input = toGraphNodeInput(pages);
    expect(input.children!.map((c) => c.countsAs)).toEqual([1, 25]);
    const preview = previewGraphNode("b", { ...input, children: [input.children![0]!, { ...input.children![1]!, countsAs: 10 }, { kind: "ITEM", itemName: "Bruma torch" }] });
    expect(preview.children.map((c) => c.countsAs)).toEqual([1, 10, 1]);
  });

  it("is shown only when it isn't 1", () => {
    expect(countsAsLabel(25)).toBe("counts as 25");
    expect(countsAsLabel(1)).toBeNull();
    expect(countsAsLabel(undefined)).toBeNull();
    expect(sumQuantityHint({ needed: 200, countsAs: 25 })).toBe("Each counts as 25 · 200 needed in total");
    expect(sumQuantityHint({ needed: 5, countsAs: 1 })).toBe("5 needed in total");
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

  it("says a COUNT over Items only takes one of each, and keeps the plain wording once it holds a condition", () => {
    const overItems = node({ id: "count", kind: "COUNT", minCount: 3, children: [item("a"), item("b"), item("c"), item("d")] });
    expect(buildRequirementTree(overItems, buildLeafClaimMaps([]), new Map())!.label).toBe("3 of any (no dupes)");
    const mixed = node({ id: "count", kind: "COUNT", minCount: 3, children: [item("a"), item("b"), node({ id: "all", kind: "ALL", children: [item("c")] })] });
    expect(buildRequirementTree(mixed, buildLeafClaimMaps([]), new Map())!.label).toBe("Complete at least 3 of");
  });

  it("still says no dupes with an \"any one of\" group of Items among a COUNT's options, keeps the group's name, and crosses out all its pieces once one is in", () => {
    const pieces = node({ id: "bludgeon", kind: "ANY", label: "Bludgeon pieces", children: [item("axon", "Bludgeon axon"), item("claw", "Bludgeon claw")] });
    const count = node({ id: "count", kind: "COUNT", minCount: 3, children: [item("whip", "Abyssal whip"), pieces, item("dagger", "Abyssal dagger")] });
    const tree = buildRequirementTree(count, approved("axon"), new Map([["bludgeon", "completed"]]))!;
    expect(tree.label).toBe("3 of any (no dupes)");
    expect(tree.progress).toEqual({ current: 1, target: 3 });
    const group = tree.children[1]!;
    expect(group.label).toBe("Bludgeon pieces (any one of)");
    // One option with its own box, ticked, and no "OR" between its pieces (the heading says it).
    expect(group).toMatchObject({ itemGroup: true, complete: true, dim: true, divider: null });
    expect(tree.children[0]!.itemGroup).toBe(false);
    expect(group.children.map((c) => [c.label, c.dim])).toEqual([
      ["Bludgeon axon", true],
      ["Bludgeon claw", true],
    ]);
    // An unnamed group keeps the plain heading.
    const unnamed = node({ ...count, children: [item("whip"), node({ ...pieces, label: null })] });
    expect(buildRequirementTree(unnamed, buildLeafClaimMaps([]), new Map())!.children[1]!.label).toBe("Complete any one of");
  });

  it("makes a SUM over several items a group headed with its rule and progress", () => {
    const sum = node({ id: "sum", kind: "SUM", quantity: 5, children: [item("a", "Dragon claws"), item("b", "Dinh's bulwark")] });
    const tree = buildRequirementTree(sum, approved("b"), new Map())!;
    expect(tree).toMatchObject({ isLeaf: false, showHeading: true, label: "5 of any (dupes count)", progress: { current: 1, target: 5 }, quantity: null, divider: null, children: [] });
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
