import { describe, expect, it } from "vitest";
import type { Claim, GraphNode, SubmissionDetails } from "@bingo/shared";
import { buildLeafClaimMaps } from "../core/board/taskClaims";
import { buildRequirementTree } from "./boardModel";

const node = (over: Partial<GraphNode> & Pick<GraphNode, "id" | "kind">): GraphNode =>
  ({ bingoId: "b", label: null, description: null, notes: null, points: 0, minCount: null, quantity: null, itemName: null, pointsGateNodeId: null, submitGateNodeId: null, allowsPreLoad: false, children: [], ...over }) as GraphNode;

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
