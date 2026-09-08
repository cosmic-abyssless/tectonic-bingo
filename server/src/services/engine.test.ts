import { describe, expect, it } from "vitest";
import { awardedPoints, evaluateGraph, type ApprovedClaim, type EngineNode } from "./engine";

function claim(nodeId: string, overrides: Partial<ApprovedClaim> = {}): ApprovedClaim {
  return { nodeId, itemName: "Item", quantity: 1, reviewedAt: new Date("2026-01-01T00:00:00Z"), ...overrides };
}

function item(id: string, overrides: Partial<EngineNode> = {}): EngineNode {
  return { id, kind: "ITEM", minCount: null, quantity: null, itemName: "Item", points: 0, pointsGateNodeId: null, ...overrides };
}

function composite(id: string, kind: "ALL" | "ANY" | "COUNT" | "SUM", overrides: Partial<EngineNode> = {}): EngineNode {
  return { id, kind, minCount: null, quantity: null, itemName: null, points: 0, pointsGateNodeId: null, ...overrides };
}

function manual(id: string, overrides: Partial<EngineNode> = {}): EngineNode {
  return { id, kind: "MANUAL", minCount: null, quantity: null, itemName: null, points: 0, pointsGateNodeId: null, ...overrides };
}

describe("evaluateGraph — ITEM", () => {
  it("is not complete with no approved claims", () => {
    expect(evaluateGraph([item("a")], new Map(), []).get("a")).toEqual({ complete: false, completedAt: null, value: 0 });
  });

  it("is complete once any approved claim targets it, regardless of quantity", () => {
    const result = evaluateGraph([item("a")], new Map(), [claim("a", { quantity: 3 })]).get("a")!;
    expect(result.complete).toBe(true);
    expect(result.value).toBe(3);
  });

  it("sums claim quantity into value across multiple claims", () => {
    const claims = [claim("a", { quantity: 2 }), claim("a", { quantity: 5 })];
    expect(evaluateGraph([item("a")], new Map(), claims).get("a")!.value).toBe(7);
  });

  it("sets completedAt to the earliest approved claim, ignoring later ones", () => {
    const claims = [
      claim("a", { reviewedAt: new Date("2026-01-02") }),
      claim("a", { reviewedAt: new Date("2026-01-01") }), // earlier, out of insertion order
    ];
    expect(evaluateGraph([item("a")], new Map(), claims).get("a")!.completedAt).toEqual(new Date("2026-01-01"));
  });
});

describe("evaluateGraph — SUM", () => {
  it("sums claim quantities across its ITEM children against its own quantity target", () => {
    const nodes = [composite("root", "SUM", { quantity: 5 }), item("a"), item("b")];
    const childrenOf = new Map([["root", ["a", "b"]]]);
    const claims = [claim("a", { quantity: 2 }), claim("b", { quantity: 2 })];
    expect(evaluateGraph(nodes, childrenOf, claims).get("root")!.complete).toBe(false);
    claims.push(claim("a", { quantity: 1 }));
    const result = evaluateGraph(nodes, childrenOf, claims).get("root")!;
    expect(result.complete).toBe(true);
    expect(result.value).toBe(5);
  });

  it("sets completedAt to the reviewedAt of the claim (on any child) that tipped the total over, ignoring later claims", () => {
    const nodes = [composite("root", "SUM", { quantity: 3 }), item("a"), item("b")];
    const childrenOf = new Map([["root", ["a", "b"]]]);
    const claims = [
      claim("a", { quantity: 1, reviewedAt: new Date("2026-01-01") }),
      claim("b", { quantity: 2, reviewedAt: new Date("2026-01-02") }), // tips it over — on a different child than the first claim
      claim("a", { quantity: 5, reviewedAt: new Date("2026-01-03") }), // arrives after completion, ignored for the timestamp
    ];
    expect(evaluateGraph(nodes, childrenOf, claims).get("root")!.completedAt).toEqual(new Date("2026-01-02"));
  });

  it("defaults quantity to 1", () => {
    const nodes = [composite("root", "SUM", { quantity: null }), item("a")];
    const childrenOf = new Map([["root", ["a"]]]);
    expect(evaluateGraph(nodes, childrenOf, [claim("a", { quantity: 1 })]).get("root")!.complete).toBe(true);
  });

  it("empty SUM is not complete — a childless node is unconfigured, not vacuously satisfied", () => {
    expect(evaluateGraph([composite("root", "SUM", { quantity: 1 })], new Map(), []).get("root")!.complete).toBe(false);
  });
});

describe("evaluateGraph — COUNT replaces distinctItems", () => {
  it("'N distinct uniques' is COUNT(N) over one single-name leaf per unique — a second claim on an already-complete leaf doesn't add a second distinct count", () => {
    const nodes = [composite("root", "COUNT", { minCount: 2 }), item("a", { itemName: "A" }), item("b", { itemName: "B" }), item("c", { itemName: "C" })];
    const childrenOf = new Map([["root", ["a", "b", "c"]]]);
    const claims = [claim("a", { itemName: "A", quantity: 5 }), claim("a", { itemName: "A", quantity: 3 })]; // both on leaf "a" — still only 1 leaf complete
    expect(evaluateGraph(nodes, childrenOf, claims).get("root")!.complete).toBe(false);
    claims.push(claim("b", { itemName: "B", quantity: 1 }));
    expect(evaluateGraph(nodes, childrenOf, claims).get("root")!.complete).toBe(true);
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
    expect(evaluateGraph(nodes, childrenOf, claims).get("root")!.complete).toBe(true);
    expect(evaluateGraph(nodes, childrenOf, claims).get("root")!.completedAt).toEqual(new Date("2026-01-02"));
  });

  it("empty ALL is not complete — a childless node is unconfigured, not vacuously satisfied", () => {
    expect(evaluateGraph([composite("root", "ALL")], new Map(), []).get("root")!.complete).toBe(false);
  });

  it("ANY requires one child; completedAt is the earliest complete child", () => {
    const nodes = [composite("root", "ANY"), item("a"), item("b")];
    const childrenOf = new Map([["root", ["a", "b"]]]);
    const claims = [claim("b", { reviewedAt: new Date("2026-01-01") })];
    expect(evaluateGraph(nodes, childrenOf, claims).get("root")!.complete).toBe(true);
    expect(evaluateGraph(nodes, childrenOf, claims).get("root")!.completedAt).toEqual(new Date("2026-01-01"));
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
    expect(evaluateGraph(nodes, childrenOf, claims).get("root")!.complete).toBe(true);
    expect(evaluateGraph(nodes, childrenOf, claims).get("root")!.completedAt).toEqual(new Date("2026-01-02"));
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

  it("evaluates a leaf shared between a SUM and a COUNT (the Barrows shape): one claim feeds both views", () => {
    const nodes = [composite("total", "SUM", { quantity: 2 }), composite("distinct", "COUNT", { minCount: 2 }), item("a"), item("b")];
    const childrenOf = new Map([
      ["total", ["a", "b"]],
      ["distinct", ["a", "b"]],
    ]);
    const claims = [claim("a", { quantity: 1 }), claim("b", { quantity: 1 })];
    const results = evaluateGraph(nodes, childrenOf, claims);
    expect(results.get("total")!.complete).toBe(true); // 1 + 1 >= 2
    expect(results.get("distinct")!.complete).toBe(true); // both leaves individually complete
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
    const nodes = [composite("root", "SUM", { points: 25, quantity: 5 }), item("a")];
    const childrenOf = new Map([["root", ["a"]]]);
    const results = evaluateGraph(nodes, childrenOf, [claim("a", { quantity: 1 })]);
    expect(awardedPoints("root", results, new Map(nodes.map((n) => [n.id, n])))).toBe(0);
  });
});
