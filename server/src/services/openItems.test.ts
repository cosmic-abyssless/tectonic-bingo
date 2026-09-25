import { describe, expect, it } from "vitest";
import type { ApprovedClaim, EngineNode } from "./engine";
import { openItems } from "./openItems";

function graph(defs: (Partial<EngineNode> & { id: string; kind: EngineNode["kind"]; children?: string[] })[]) {
  const nodes: EngineNode[] = defs.map(({ children: _children, ...d }) => ({ minCount: null, quantity: null, itemName: null, points: 0, pointsGateNodeId: null, ...d }));
  const childrenOf = new Map(defs.filter((d) => d.children).map((d) => [d.id, d.children!]));
  return { nodes, childrenOf };
}

const item = (id: string, itemName = id) => ({ id, kind: "ITEM" as const, itemName });
const at = (minute: number) => new Date(2026, 0, 1, 0, minute);
const claim = (nodeId: string, minute: number, quantity = 1): ApprovedClaim => ({ nodeId, itemName: nodeId, quantity, reviewedAt: at(minute) });
const names = (set: Set<string> | undefined) => [...(set ?? [])].sort();

describe("openItems", () => {
  const bandos = graph([{ id: "set", kind: "ALL", children: ["chest", "tassets", "boots"] }, item("chest"), item("tassets"), item("boots")]);

  it("keeps an ALL's missing Items open, and shrinks as they come", () => {
    const claims = [claim("chest", 1), claim("tassets", 2)];
    expect(names(openItems(bandos.nodes, bandos.childrenOf, claims, at(0)).get("set"))).toEqual(["boots", "chest", "tassets"]);
    expect(names(openItems(bandos.nodes, bandos.childrenOf, claims, at(1)).get("set"))).toEqual(["boots", "tassets"]);
    expect(names(openItems(bandos.nodes, bandos.childrenOf, claims, at(2)).get("set"))).toEqual(["boots"]);
  });

  it("closes a node once it's complete", () => {
    const claims = [claim("chest", 1), claim("tassets", 2), claim("boots", 3)];
    const open = openItems(bandos.nodes, bandos.childrenOf, claims, at(3));
    expect(names(open.get("set"))).toEqual([]);
    expect(names(open.get("chest"))).toEqual([]);
  });

  it("keeps every Item of an ANY open until one comes", () => {
    const g = graph([{ id: "any", kind: "ANY", children: ["a", "b"] }, item("a"), item("b")]);
    expect(names(openItems(g.nodes, g.childrenOf, [], at(0)).get("any"))).toEqual(["a", "b"]);
    expect(names(openItems(g.nodes, g.childrenOf, [claim("a", 1)], at(1)).get("any"))).toEqual([]);
  });

  it("keeps a COUNT's uncounted Items open", () => {
    const g = graph([{ id: "count", kind: "COUNT", minCount: 2, children: ["a", "b", "c"] }, item("a"), item("b"), item("c")]);
    expect(names(openItems(g.nodes, g.childrenOf, [claim("a", 1)], at(1)).get("count"))).toEqual(["b", "c"]);
    expect(names(openItems(g.nodes, g.childrenOf, [claim("a", 1), claim("c", 2)], at(2)).get("count"))).toEqual([]);
  });

  it("keeps all of a SUM's Items open while it's short, even ones already claimed", () => {
    const g = graph([{ id: "sum", kind: "SUM", quantity: 3, children: ["a", "b"] }, item("a"), item("b")]);
    expect(names(openItems(g.nodes, g.childrenOf, [claim("a", 1, 2)], at(1)).get("sum"))).toEqual(["a", "b"]);
    expect(names(openItems(g.nodes, g.childrenOf, [claim("a", 1, 2), claim("b", 2)], at(2)).get("sum"))).toEqual([]);
  });

  it("rolls open Items up through nested conditions to the Tile", () => {
    const g = graph([
      { id: "tile", kind: "ALL", children: ["part1", "part2"] },
      { id: "part1", kind: "ANY", children: ["a", "b"] },
      { id: "part2", kind: "ALL", children: ["c", "manual"] },
      item("a"),
      item("b"),
      item("c"),
      { id: "manual", kind: "MANUAL" },
    ]);
    const open = openItems(g.nodes, g.childrenOf, [claim("a", 1)], at(1));
    expect(names(open.get("tile"))).toEqual(["c"]);
    expect(names(open.get("part2"))).toEqual(["c"]);
    expect(names(open.get("manual"))).toEqual([]);
  });

  it("uses the Item name, so a shared name counts once", () => {
    const g = graph([{ id: "any", kind: "ANY", children: ["a1", "a2"] }, item("a1", "Pet snakeling"), item("a2", "Pet snakeling")]);
    expect(names(openItems(g.nodes, g.childrenOf, [], at(0)).get("any"))).toEqual(["Pet snakeling"]);
  });
});
