import { describe, expect, it } from "vitest";
import type { GraphNode, SubmissionDetails, Tile, TeamNodeState } from "@bingo/shared";
import { summarizeTileProgress } from "./tileProgress";

const node = (over: Partial<GraphNode> & Pick<GraphNode, "id" | "kind">): GraphNode =>
  ({ bingoId: "b", label: null, description: null, notes: null, points: 0, minCount: null, quantity: null, itemName: null, pointsGateNodeId: null, submitGateNodeId: null, allowsPreLoad: false, children: [], ...over }) as GraphNode;

const item = (id: string) => node({ id, kind: "ITEM", itemName: id });
const sum = node({ id: "sum", kind: "SUM", quantity: 3, children: [item("a"), item("b"), item("c")] });
const tile = { id: "t", node: node({ id: "root", kind: "ALL", children: [sum] }) } as unknown as Tile;

const sub = (status: "approved" | "pending" | "rejected", nodeIds: string[]): SubmissionDetails =>
  ({ submission: { id: status + nodeIds.join(), status }, screenshots: [], submittedByUser: null, claims: nodeIds.map((nodeId, i) => ({ id: String(i), submissionId: "s", nodeId, itemName: null, quantity: 1 })) }) as unknown as SubmissionDetails;

const state = (nodeId: string): TeamNodeState => ({ nodeId, pointsAwarded: 0 }) as unknown as TeamNodeState;

const statusOf = (nodeStates: TeamNodeState[], subs: SubmissionDetails[]) => summarizeTileProgress(tile, nodeStates, subs).statusByNodeId.get("sum");

describe("part status", () => {
  it("is not started with no claims", () => expect(statusOf([], [])).toBe("not_started"));

  it("is in progress once an item is approved, even though that item is itself complete", () => {
    expect(statusOf([state("a")], [sub("approved", ["a"])])).toBe("in_progress");
  });

  it("is awaiting judges while any item has a pending claim, even one whose first copy was approved", () => {
    expect(statusOf([state("a")], [sub("approved", ["a"]), sub("pending", ["a"])])).toBe("pending_approval");
    expect(statusOf([], [sub("pending", ["b"])])).toBe("pending_approval");
  });

  it("ignores rejected claims", () => expect(statusOf([], [sub("rejected", ["a"])])).toBe("not_started"));

  it("is completed once the part itself is", () => {
    expect(statusOf([state("a"), state("sum")], [sub("approved", ["a"])])).toBe("completed");
  });
});
