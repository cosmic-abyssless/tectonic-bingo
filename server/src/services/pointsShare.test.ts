import { describe, expect, it } from "vitest";
import type { EngineNode } from "./engine";
import { creditAwards, type CreditClaim } from "./pointsShare";

// A tiny graph builder: node(id, kind, extras) plus edges, so each case reads as its tile shape.
function graph(defs: (Partial<EngineNode> & { id: string; kind: EngineNode["kind"]; children?: string[] })[]) {
  const nodes: EngineNode[] = defs.map(({ children: _children, ...d }) => ({ minCount: null, quantity: null, itemName: null, points: 0, pointsGateNodeId: null, ...d }));
  const childrenOf = new Map(defs.filter((d) => d.children).map((d) => [d.id, d.children!]));
  return { nodes, childrenOf };
}

let seq = 0;
function claim(nodeId: string, userId: string, minute: number, quantity = 1): CreditClaim {
  seq += 1;
  return { claimId: `c${seq}`, submissionId: `s${seq}`, userId, nodeId, itemName: null, quantity, reviewedAt: new Date(2026, 0, 1, 0, minute) };
}

// Each player's total across every award.
function totals(credits: ReturnType<typeof creditAwards>) {
  const out: Record<string, number> = {};
  for (const award of credits) for (const s of award.shares) out[s.userId] = (out[s.userId] ?? 0) + s.points;
  return out;
}

describe("creditAwards", () => {
  it("splits an ALL part equally between its children", () => {
    const g = graph([
      { id: "part", kind: "ALL", points: 30, children: ["a", "b", "c"] },
      { id: "a", kind: "ITEM" },
      { id: "b", kind: "ITEM" },
      { id: "c", kind: "ITEM" },
    ]);
    const credits = creditAwards({ ...g, claims: [claim("a", "u1", 1), claim("b", "u1", 2), claim("c", "u2", 3)], awards: [{ nodeId: "part", points: 30 }], tileNodeIds: new Set(), lineNodeIds: new Set() });
    expect(totals(credits)).toEqual({ u1: 20, u2: 10 });
  });

  it("credits only the first complete set of an ANY (the Barrows case)", () => {
    const g = graph([
      { id: "any", kind: "ANY", points: 20, children: ["setA", "setB"] },
      { id: "setA", kind: "ALL", children: ["a1", "a2"] },
      { id: "setB", kind: "ALL", children: ["b1", "b2"] },
      { id: "a1", kind: "ITEM" },
      { id: "a2", kind: "ITEM" },
      { id: "b1", kind: "ITEM" },
      { id: "b2", kind: "ITEM" },
    ]);
    // u2 finishes set B first; u1's half of set A (and set A's later completion) earns nothing.
    const claims = [claim("a1", "u1", 1), claim("b1", "u2", 2), claim("b2", "u2", 3), claim("a2", "u3", 4)];
    const credits = creditAwards({ ...g, claims, awards: [{ nodeId: "any", points: 20 }], tileNodeIds: new Set(), lineNodeIds: new Set() });
    expect(totals(credits)).toEqual({ u2: 20 });
  });

  it("credits the first N children of a COUNT", () => {
    const g = graph([
      { id: "count", kind: "COUNT", minCount: 2, points: 10, children: ["a", "b", "c"] },
      { id: "a", kind: "ITEM" },
      { id: "b", kind: "ITEM" },
      { id: "c", kind: "ITEM" },
    ]);
    const credits = creditAwards({ ...g, claims: [claim("c", "u1", 1), claim("a", "u2", 2), claim("b", "u3", 3)], awards: [{ nodeId: "count", points: 10 }], tileNodeIds: new Set(), lineNodeIds: new Set() });
    expect(totals(credits)).toEqual({ u1: 5, u2: 5 });
  });

  it("weights a SUM by quantity and caps the claim that crossed the target", () => {
    const g = graph([
      { id: "sum", kind: "SUM", quantity: 500, points: 50, children: ["kc"] },
      { id: "kc", kind: "ITEM" },
    ]);
    // 480 from u1, then u2's 50 only needed 20 of it; u3's claim came after completion.
    const claims = [claim("kc", "u1", 1, 300), claim("kc", "u1", 2, 180), claim("kc", "u2", 3, 50), claim("kc", "u3", 4, 100)];
    const credits = creditAwards({ ...g, claims, awards: [{ nodeId: "sum", points: 50 }], tileNodeIds: new Set(), lineNodeIds: new Set() });
    expect(totals(credits)).toEqual({ u1: 48, u2: 2 });
    const u2 = credits[0]!.shares.find((s) => s.userId === "u2")!;
    expect(u2.claims[0]!.quantity).toBe(20);
  });

  it("gives nothing for a duplicate drop approved after the item was already done", () => {
    const g = graph([{ id: "item", kind: "ITEM", points: 5 }]);
    const credits = creditAwards({ ...g, claims: [claim("item", "u1", 1), claim("item", "u2", 2)], awards: [{ nodeId: "item", points: 5 }], tileNodeIds: new Set(), lineNodeIds: new Set() });
    expect(totals(credits)).toEqual({ u1: 5 });
  });

  it("credits each part of a shared item pool on its own", () => {
    const g = graph([
      { id: "pageA", kind: "COUNT", minCount: 1, points: 10, children: ["x", "y"] },
      { id: "pageB", kind: "COUNT", minCount: 2, points: 10, children: ["x", "y"] },
      { id: "x", kind: "ITEM" },
      { id: "y", kind: "ITEM" },
    ]);
    const credits = creditAwards({
      ...g,
      claims: [claim("x", "u1", 1), claim("y", "u2", 2)],
      awards: [{ nodeId: "pageA", points: 10 }, { nodeId: "pageB", points: 10 }],
      tileNodeIds: new Set(),
      lineNodeIds: new Set(),
    });
    expect(totals(credits)).toEqual({ u1: 15, u2: 5 });
  });

  it("splits a tile bonus by each player's share of the tile's points", () => {
    const g = graph([
      { id: "tile", kind: "ALL", points: 20, children: ["p1", "p2"] },
      { id: "p1", kind: "ITEM", points: 30 },
      { id: "p2", kind: "ITEM", points: 70 },
    ]);
    const credits = creditAwards({
      ...g,
      claims: [claim("p1", "u1", 1), claim("p2", "u2", 2)],
      awards: [{ nodeId: "p1", points: 30 }, { nodeId: "p2", points: 70 }, { nodeId: "tile", points: 20 }],
      tileNodeIds: new Set(["tile"]),
      lineNodeIds: new Set(),
    });
    const tileBonus = credits.find((c) => c.nodeId === "tile")!;
    expect(Object.fromEntries(tileBonus.shares.map((s) => [s.userId, s.points]))).toEqual({ u1: 6, u2: 14 });
  });

  it("gives each tile of a line an equal part of its bonus, split by tile share", () => {
    const g = graph([
      { id: "line", kind: "ALL", points: 15, children: ["t1", "t2", "t3"] },
      { id: "t1", kind: "ALL", children: ["t1a"] },
      { id: "t1a", kind: "ITEM", points: 100 },
      { id: "t2", kind: "ALL", children: ["t2a", "t2b"] },
      { id: "t2a", kind: "ITEM", points: 50 },
      { id: "t2b", kind: "ITEM", points: 50 },
      { id: "t3", kind: "ALL", children: ["t3a"] },
      { id: "t3a", kind: "ITEM", points: 100 },
    ]);
    const credits = creditAwards({
      ...g,
      claims: [claim("t1a", "u1", 1), claim("t2a", "u1", 2), claim("t2b", "u2", 3), claim("t3a", "u2", 4)],
      awards: [
        { nodeId: "t1a", points: 100 },
        { nodeId: "t2a", points: 50 },
        { nodeId: "t2b", points: 50 },
        { nodeId: "t3a", points: 100 },
        { nodeId: "line", points: 15 },
      ],
      tileNodeIds: new Set(["t1", "t2", "t3"]),
      lineNodeIds: new Set(["line"]),
    });
    const line = credits.find((c) => c.nodeId === "line")!;
    // 5 per tile: t1 all u1, t2 half each, t3 all u2.
    expect(Object.fromEntries(line.shares.map((s) => [s.userId, s.points]))).toEqual({ u1: 7.5, u2: 7.5 });
    expect(line.shares.find((s) => s.userId === "u1")!.viaTileNodeIds).toEqual(["t1", "t2"]);
  });
});
