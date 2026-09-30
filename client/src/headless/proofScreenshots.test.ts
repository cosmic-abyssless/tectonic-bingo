import { describe, expect, it } from "vitest";
import type { GraphNode, SubmissionDetails, SubmissionStatus, Tile } from "@bingo/shared";
import { buildTileModelsStatic } from "./boardModel";

// CONTEXT.md "Proof screenshot": where a Tile or Task needs one, the viewer's own status on it, and proof Submissions
// in the Tile's list.

const node = (over: Partial<GraphNode> & Pick<GraphNode, "id" | "kind">): GraphNode =>
  ({ bingoId: "b", label: null, description: null, notes: null, points: 0, minCount: null, quantity: null, itemName: null, pointsGateNodeId: null, submitGateNodeId: null, allowsPreLoad: false, valuedAs: null, requiresProof: false, proofNote: null, children: [], ...over }) as GraphNode;

const tile = (id: string, over: Partial<Tile>, tasks: GraphNode[]): Tile => ({
  id, bingoId: "b", nodeId: `${id}-node`, name: id.toUpperCase(), imageUrl: null, categoryId: null, boardRow: 0, boardCol: 0,
  hasFreezePeriod: false, freezeDurationMinutes: 0, notes: null, requiresProof: false, proofNote: null, rulesText: null, createdAt: "",
  node: node({ id: `${id}-node`, kind: "ALL", children: tasks }), ...over,
});

const wintertodt = tile("wt", { requiresProof: true, proofNote: "an empty supply cart" }, [node({ id: "tome", kind: "ITEM", itemName: "Tome of fire", label: "Tome" })]);
const minigames = tile("mg", { boardCol: 1 }, [
  node({ id: "fish", kind: "ITEM", itemName: "Fish barrel", label: "Tempoross", requiresProof: true, proofNote: "an empty pool" }),
  node({ id: "lantern", kind: "ITEM", itemName: "Abyssal lantern", label: "Guardians" }),
]);

function proof(id: string, userId: string, tileId: string, taskId: string | null, status: SubmissionStatus): SubmissionDetails {
  return {
    submission: { id, teamId: "team", submittedByUserId: userId, postedByUserId: null, kind: "proof", proofTileId: tileId, proofTaskId: taskId, status, submittedAt: "2026-03-01T10:00:00Z", reviewedAt: null, reviewedByUserId: null, reviewerNotes: null, createdAt: "", updatedAt: "" },
    screenshots: [],
    claims: [],
    submittedByUser: null,
    postedByUser: null,
  };
}

function build(teamSubmissions: SubmissionDetails[], viewerOnTeam = true) {
  return buildTileModelsStatic({ tiles: [wintertodt, minigames], categories: [], nodeStates: [], teamSubmissions, bingoStartsAt: null, interests: [], viewerUserId: "me", viewerOnTeam });
}

describe("Proof screenshot requirements on the board", () => {
  it("puts a Tile-wide one on the Tile and a per-Task one on its Task, with the viewer's status", () => {
    const [wt, mg] = build([]);
    expect(wt!.proof).toEqual({ note: "an empty supply cart", status: "none" });
    expect(wt!.tasks[0]!.proof).toBeNull();
    expect(mg!.proof).toBeNull();
    expect(mg!.tasks.map((t) => t.proof)).toEqual([{ note: "an empty pool", status: "none" }, null]);
  });

  it("goes from none to pending to approved on the viewer's own proofs only, and any approved one counts", () => {
    expect(build([proof("p0", "teammate", "wt", null, "approved")])[0]!.proof!.status).toBe("none");
    expect(build([proof("p1", "me", "wt", null, "pending")])[0]!.proof!.status).toBe("pending");
    expect(build([proof("p1", "me", "wt", null, "rejected")])[0]!.proof!.status).toBe("rejected");
    expect(build([proof("p1", "me", "wt", null, "rejected"), proof("p2", "me", "wt", null, "approved")])[0]!.proof!.status).toBe("approved");
    expect(build([proof("p3", "me", "mg", "fish", "approved")])[1]!.tasks[0]!.proof!.status).toBe("approved");
  });

  it("shows no status to a viewer who isn't on the team", () => {
    expect(build([], false)[0]!.proof).toEqual({ note: "an empty supply cart", status: null });
  });

  it("lists a proof Submission on its own Tile, labelled, with its Task", () => {
    const [wt, mg] = build([proof("p1", "me", "wt", null, "pending"), proof("p2", "me", "mg", "fish", "approved")]);
    expect(wt!.submissions.map((s) => [s.id, s.summary, s.isProof, s.tileName, s.taskLabels])).toEqual([["p1", "Proof screenshot", true, "WT", []]]);
    expect(mg!.submissions.map((s) => [s.id, s.taskLabels])).toEqual([["p2", ["Tempoross"]]]);
  });
});
