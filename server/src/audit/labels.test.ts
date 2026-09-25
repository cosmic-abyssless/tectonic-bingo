import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS, describeClaims, describeValuedAs, type AuditAction, type AuditDetailsMap } from "@bingo/shared";

function label<A extends AuditAction>(action: A, details: AuditDetailsMap[A], teamName: string | null = "Comfy") {
  const def = AUDIT_ACTIONS[action] as { label(input: unknown): string };
  return def.label({ details, entityLabel: null, actorName: "Mod", teamName, onBehalfOfName: null });
}

describe("settings audit label", () => {
  it("names the exclusive items setting plainly", () => {
    expect(label("settings.updated", { changes: { before: {}, after: { name: "New", exclusivityRulesJson: "[]" } } })).toBe("Mod updated bingo settings (name, exclusive items)");
  });
});

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

describe("describeClaims", () => {
  const item = (itemName: string, quantity = 1) => ({ itemName, quantity });

  it("names one item with its quantity", () => {
    expect(describeClaims({ claims: [item("Armadyl crossbow")] })).toBe("1 Armadyl crossbow");
    expect(describeClaims({ claims: [item("Bandos hilt", 3)] })).toBe("3× Bandos hilt");
  });

  it("merges repeats of one item and lists several with commas and 'and'", () => {
    expect(describeClaims({ claims: [item("Bandos hilt"), item("Armadyl crossbow"), item("Bandos hilt", 2)] })).toBe("3× Bandos hilt and 1 Armadyl crossbow");
    expect(describeClaims({ claims: [item("A"), item("B"), item("C")] })).toBe("1 A, 1 B and 1 C");
  });

  it("describes a manual claim by its task", () => {
    expect(describeClaims({ claims: [{ itemName: null, quantity: 1 }], taskLabels: ["Part B"] })).toBe("proof of Part B");
    expect(describeClaims({ claims: [item("Vorki"), { itemName: null, quantity: 1 }], taskLabels: ["Part B"] })).toBe("1 Vorki and proof of Part B");
    expect(describeClaims({ claims: [{ itemName: null, quantity: 1 }] })).toBe("proof");
  });

  it("falls back to 'a screenshot' when nothing is known", () => {
    expect(describeClaims({})).toBe("a screenshot");
    expect(describeClaims({ claims: [] })).toBe("a screenshot");
  });

  it("is what the submission label says", () => {
    const details = { tileId: "t", tileName: "GWD ISSUE 2", taskLabels: [], claims: [{ nodeId: "n", ...item("Armadyl crossbow") }], screenshotUrl: "/x.png" };
    expect(label("submission.created", details)).toBe('Mod submitted 1 Armadyl crossbow for "GWD ISSUE 2"');
  });
});

describe("GP formulas", () => {
  it("leave out ÷ 1, and the brackets that would only group for it", () => {
    const piece = (divisor: number, otherPieces: string[], wholeQuantity = 1) =>
      label("piece_value.created", { pieceItemName: "Piece", wholeItemName: "Whole", wholeQuantity, divisor, otherPieces });
    expect(piece(1, ["Berserker ring", "3× Chromium ingot"])).toBe("Mod valued Piece as Whole − Berserker ring − 3× Chromium ingot");
    expect(piece(3, [])).toBe("Mod valued Piece as Whole ÷ 3");
    expect(piece(2, ["Other"])).toBe("Mod valued Piece as (Whole − Other) ÷ 2");
    expect(piece(1, [], 4000)).toBe("Mod valued Piece as 4000× Whole");

    expect(describeValuedAs({ itemName: "Ultor vestige", divisor: 1 })).toBe("Ultor vestige");
    expect(describeValuedAs({ itemName: "Ultor vestige", divisor: 3 })).toBe("Ultor vestige ÷ 3");
  });
});
