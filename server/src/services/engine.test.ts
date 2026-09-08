import { describe, expect, it } from "vitest";
import { awardedPoints, evaluateGraph, type ApprovedClaim, type EngineNode } from "./engine";

function claim(nodeId: string, overrides: Partial<ApprovedClaim> = {}): ApprovedClaim {
  return { nodeId, itemName: "Item", quantity: 1, wildcardId: null, reviewedAt: new Date("2026-01-01T00:00:00Z"), ...overrides };
}

function item(id: string, overrides: Partial<EngineNode> = {}): EngineNode {
  return { id, kind: "ITEM", minCount: null, quantity: 1, distinctItems: false, acceptedItemNames: ["Item"], points: 0, pointsGateNodeId: null, ...overrides };
}

function composite(id: string, kind: "ALL" | "ANY" | "COUNT", overrides: Partial<EngineNode> = {}): EngineNode {
  return { id, kind, minCount: null, quantity: null, distinctItems: false, acceptedItemNames: [], points: 0, pointsGateNodeId: null, ...overrides };
}

function manual(id: string, overrides: Partial<EngineNode> = {}): EngineNode {
  return { id, kind: "MANUAL", minCount: null, quantity: null, distinctItems: false, acceptedItemNames: [], points: 0, pointsGateNodeId: null, ...overrides };
}

describe("evaluateGraph — ITEM", () => {
  it("sums claim quantity against the target", () => {
    const nodes = [item("a", { quantity: 5 })];
    const claims = [claim("a", { quantity: 2 }), claim("a", { quantity: 2 })];
    expect(evaluateGraph(nodes, new Map(), claims).get("a")).toEqual({ complete: false, completedAt: null });
    claims.push(claim("a", { quantity: 1 }));
    const result = evaluateGraph(nodes, new Map(), claims).get("a")!;
    expect(result.complete).toBe(true);
  });

  it("counts distinct item names, not quantity, when distinctItems is set", () => {
    const nodes = [item("a", { quantity: 2, distinctItems: true, acceptedItemNames: ["A", "B", "C"] })];
    const claims = [claim("a", { itemName: "A", quantity: 5 })];
    expect(evaluateGraph(nodes, new Map(), claims).get("a")!.complete).toBe(false);
    claims.push(claim("a", { itemName: "A", quantity: 3 })); // same name again — still only 1 distinct
    expect(evaluateGraph(nodes, new Map(), claims).get("a")!.complete).toBe(false);
    claims.push(claim("a", { itemName: "B", quantity: 1 }));
    expect(evaluateGraph(nodes, new Map(), claims).get("a")!.complete).toBe(true);
  });

  it("ignores claims whose itemName isn't accepted, unless they carry a wildcardId", () => {
    const nodes = [item("a", { acceptedItemNames: ["Vorki"] })];
    expect(evaluateGraph(nodes, new Map(), [claim("a", { itemName: "Not Vorki" })]).get("a")!.complete).toBe(false);
    expect(evaluateGraph(nodes, new Map(), [claim("a", { itemName: "Not Vorki", wildcardId: "w1" })]).get("a")!.complete).toBe(true);
  });

  it("is case-insensitive on item names", () => {
    const nodes = [item("a", { acceptedItemNames: ["Vorki"] })];
    expect(evaluateGraph(nodes, new Map(), [claim("a", { itemName: "vorki" })]).get("a")!.complete).toBe(true);
  });

  it("defaults quantity to 1", () => {
    const nodes = [item("a", { quantity: null })];
    expect(evaluateGraph(nodes, new Map(), [claim("a", { quantity: 1 })]).get("a")!.complete).toBe(true);
  });

  it("sets completedAt to the reviewedAt of the claim that first reached the target, ignoring later claims", () => {
    const nodes = [item("a", { quantity: 3 })];
    const claims = [
      claim("a", { quantity: 1, reviewedAt: new Date("2026-01-01") }),
      claim("a", { quantity: 2, reviewedAt: new Date("2026-01-02") }), // tips it over — this is the completedAt
      claim("a", { quantity: 5, reviewedAt: new Date("2026-01-03") }), // arrives after completion, ignored for the timestamp
    ];
    expect(evaluateGraph(nodes, new Map(), claims).get("a")!.completedAt).toEqual(new Date("2026-01-02"));
  });
});

describe("evaluateGraph — MANUAL", () => {
  it("completes on the first approved claim, regardless of itemName", () => {
    const nodes = [manual("a")];
    const result = evaluateGraph(nodes, new Map(), [claim("a", { itemName: null, reviewedAt: new Date("2026-01-05") })]).get("a")!;
    expect(result).toEqual({ complete: true, completedAt: new Date("2026-01-05") });
  });

  it("is not complete with no approved claims", () => {
    expect(evaluateGraph([manual("a")], new Map(), []).get("a")).toEqual({ complete: false, completedAt: null });
  });
});

describe("evaluateGraph — composites", () => {
  it("ALL requires every child; completedAt is the latest child", () => {
    const nodes = [composite("root", "ALL"), item("a"), item("b")];
    const childrenOf = new Map([["root", ["a", "b"]]]);
    const claims = [claim("a", { reviewedAt: new Date("2026-01-01") })];
    expect(evaluateGraph(nodes, childrenOf, claims).get("root")!.complete).toBe(false);
    claims.push(claim("b", { reviewedAt: new Date("2026-01-02") }));
    expect(evaluateGraph(nodes, childrenOf, claims).get("root")).toEqual({ complete: true, completedAt: new Date("2026-01-02") });
  });

  it("empty ALL is complete", () => {
    expect(evaluateGraph([composite("root", "ALL")], new Map(), []).get("root")!.complete).toBe(true);
  });

  it("ANY requires one child; completedAt is the earliest complete child", () => {
    const nodes = [composite("root", "ANY"), item("a"), item("b")];
    const childrenOf = new Map([["root", ["a", "b"]]]);
    const claims = [claim("b", { reviewedAt: new Date("2026-01-01") })];
    expect(evaluateGraph(nodes, childrenOf, claims).get("root")).toEqual({ complete: true, completedAt: new Date("2026-01-01") });
  });

  it("empty ANY is not complete", () => {
    expect(evaluateGraph([composite("root", "ANY")], new Map(), []).get("root")!.complete).toBe(false);
  });

  it("COUNT requires minCount children; completedAt is the minCount-th earliest", () => {
    const nodes = [composite("root", "COUNT", { minCount: 2 }), item("a"), item("b"), item("c")];
    const childrenOf = new Map([["root", ["a", "b", "c"]]]);
    const claims = [
      claim("a", { reviewedAt: new Date("2026-01-03") }),
      claim("b", { reviewedAt: new Date("2026-01-01") }),
      claim("c", { reviewedAt: new Date("2026-01-02") }),
    ];
    // a, b, c complete at 01-03, 01-01, 01-02 respectively — the 2nd earliest is 01-02.
    expect(evaluateGraph(nodes, childrenOf, claims).get("root")).toEqual({ complete: true, completedAt: new Date("2026-01-02") });
  });

  it("empty COUNT is not complete", () => {
    expect(evaluateGraph([composite("root", "COUNT", { minCount: 1 })], new Map(), []).get("root")!.complete).toBe(false);
  });

  it("evaluates a leaf shared by two parents once and counts it for both (DAG)", () => {
    const nodes = [composite("taskA", "ALL"), composite("taskB", "ALL"), item("shared")];
    const childrenOf = new Map([
      ["taskA", ["shared"]],
      ["taskB", ["shared"]],
    ]);
    const results = evaluateGraph(nodes, childrenOf, [claim("shared")]);
    expect(results.get("taskA")!.complete).toBe(true);
    expect(results.get("taskB")!.complete).toBe(true);
  });
});

describe("awardedPoints", () => {
  it("awards points once the node completes", () => {
    const nodes = [item("a", { points: 25 })];
    const results = evaluateGraph(nodes, new Map(), [claim("a")]);
    expect(awardedPoints("a", results, new Map(nodes.map((n) => [n.id, n])))).toBe(25);
  });

  it("withholds points while the gate node isn't complete, releases once it is", () => {
    const nodes = [item("a", { points: 25 }), item("b", { points: 35, pointsGateNodeId: "a" })];
    const nodesById = new Map(nodes.map((n) => [n.id, n]));

    // B's claims are approved before A's — B is complete but its points are withheld.
    let results = evaluateGraph(nodes, new Map(), [claim("b")]);
    expect(results.get("b")!.complete).toBe(true);
    expect(awardedPoints("b", results, nodesById)).toBe(0);
    expect(awardedPoints("a", results, nodesById)).toBe(0); // a isn't complete yet either

    // A completes — both award now, no release code needed.
    results = evaluateGraph(nodes, new Map(), [claim("a"), claim("b")]);
    expect(awardedPoints("a", results, nodesById)).toBe(25);
    expect(awardedPoints("b", results, nodesById)).toBe(35);
  });

  it("awards nothing for an incomplete node", () => {
    const nodes = [item("a", { points: 25, quantity: 5 })];
    const results = evaluateGraph(nodes, new Map(), [claim("a", { quantity: 1 })]);
    expect(awardedPoints("a", results, new Map(nodes.map((n) => [n.id, n])))).toBe(0);
  });
});
