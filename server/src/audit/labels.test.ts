import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS, type AuditAction, type AuditDetailsMap } from "@bingo/shared";

function label<A extends AuditAction>(action: A, details: AuditDetailsMap[A], teamName: string | null = "Comfy") {
  const def = AUDIT_ACTIONS[action] as { label(input: unknown): string };
  return def.label({ details, entityLabel: null, actorName: "Mod", teamName, onBehalfOfName: null });
}

describe("point audit labels", () => {
  const base = { nodeId: "n", submissionId: "s", points: 20 };

  it("names the kind of points, and what they were for", () => {
    expect(label("points.earned", { ...base, source: "task", nodeLabel: "Part A", tileName: "Vorkath" })).toBe('Comfy earned +20 pts: task points for "Part A" on "Vorkath"');
    expect(label("points.earned", { ...base, source: "tile_bonus", nodeLabel: "Vorkath", tileName: "Vorkath", points: 50 })).toBe('Comfy earned +50 pts: the tile bonus for completing all of "Vorkath"');
    expect(label("points.earned", { ...base, source: "line", nodeLabel: "Row 3", tileName: null, points: 15 })).toBe("Comfy earned +15 pts: the line bonus for Row 3");
    expect(label("points.lost", { ...base, source: "line", nodeLabel: "Row 3", tileName: null, points: 15 })).toBe("Comfy lost 15 pts: the line bonus for Row 3 (no longer complete)");
  });

  it("falls back when the team or tile is unknown", () => {
    expect(label("points.earned", { ...base, source: "task", nodeLabel: "Part A", tileName: null }, null)).toBe('The team earned +20 pts: task points for "Part A" on "a tile"');
  });

  it("signs a re-score", () => {
    expect(label("points.rescored", { delta: 35 })).toBe("Comfy's points changed by +35 after a board change");
    expect(label("points.rescored", { delta: -20 })).toBe("Comfy's points changed by -20 after a board change");
  });

  it("no longer puts points in the approval label", () => {
    const target = { tileName: "Vorkath", taskLabels: [], nodeIds: [], reviewerNotes: null, submittedByUserId: "u" };
    expect(label("submission.approved", { ...target, newlyCompletedNodeIds: [], pointsDelta: 70 })).toBe('Mod approved a submission for "Vorkath"');
  });
});
