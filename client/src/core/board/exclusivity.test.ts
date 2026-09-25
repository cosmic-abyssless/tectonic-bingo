import { describe, expect, it } from "vitest";
import type { ExclusivityRule, GraphNode, SubmissionDetails, Tile } from "@bingo/shared";
import { NO_LOCKS, boardItemSources, lockReason, lockTag, lockedLeaves, placeLeaves } from "./exclusivity";

const node = (over: Partial<GraphNode> & Pick<GraphNode, "id" | "kind">): GraphNode =>
  ({ bingoId: "b", label: null, description: null, notes: null, points: 0, minCount: null, quantity: null, itemName: null, pointsGateNodeId: null, submitGateNodeId: null, allowsPreLoad: false, valuedAs: null, children: [], ...over }) as GraphNode;
const item = (id: string, itemName: string) => node({ id, kind: "ITEM", itemName });
const part = (id: string, label: string, kind: GraphNode["kind"], children: GraphNode[]) => node({ id, kind, label, children });
const tile = (id: string, name: string, parts: GraphNode[]) => ({ id, name, node: node({ id: `${id}-root`, kind: "ALL", children: parts }) }) as unknown as Tile;
const sub = (id: string, status: "approved" | "pending" | "rejected", nodeIds: string[]): SubmissionDetails =>
  ({ submission: { id, status }, screenshots: [], submittedByUser: null, claims: nodeIds.map((nodeId, i) => ({ id: `${id}-${i}`, submissionId: id, nodeId, itemName: null, quantity: 1 })) }) as unknown as SubmissionDetails;

// DT2 (a Baron under one part), PETS (Baron and Nid shared by both pages) and SLAYER (a bare-item part).
const sharedBaron = item("pets-baron", "Baron");
const sharedNid = item("pets-nid", "Nid");
const TILES = [
  tile("dt2", "DT2 ISSUE 1", [part("dt2-p1", "Page 1", "SUM", [item("dt2-baron", "Baron")])]),
  tile("pets", "PETS", [part("pets-p1", "Page 1", "COUNT", [sharedBaron, sharedNid]), part("pets-p2", "Page 2", "COUNT", [sharedBaron, sharedNid])]),
  tile("slayer", "SLAYER BOSSES", [item("slayer-tentacle", "Kraken tentacle")]),
];
const PETS: ExclusivityRule = { id: "pets", label: "Pets", itemNames: ["Baron", "Nid"], scope: "tile" };

describe("placeLeaves", () => {
  const placed = placeLeaves(TILES);

  it("puts an item under its tile and part", () => {
    expect(placed.get("dt2-baron")).toMatchObject({ tileId: "dt2", tileName: "DT2 ISSUE 1", partIds: ["dt2-p1"], partLabels: ["Page 1"], itemName: "Baron" });
  });

  it("gives a shared item every part above it", () => {
    expect(placed.get("pets-baron")!.partIds).toEqual(["pets-p1", "pets-p2"]);
    expect(placed.get("pets-baron")!.partLabels).toEqual(["Page 1", "Page 2"]);
  });

  it("treats a bare item task as its own part", () => {
    expect(placed.get("slayer-tentacle")).toMatchObject({ tileId: "slayer", partIds: ["slayer-tentacle"] });
  });
});

describe("lockedLeaves", () => {
  it("locks the same pet on another tile, not on the tile it was used on or other pets", () => {
    const locks = lockedLeaves([PETS], TILES, [sub("s1", "pending", ["dt2-baron"])]);
    expect([...locks.keys()]).toEqual(["pets-baron"]);
    expect(lockTag(locks.get("pets-baron")!)).toBe("Used on DT2 ISSUE 1");
    expect(lockReason(locks.get("pets-baron")!)).toBe("used on DT2 ISSUE 1 (Pets can only be used on one tile)");
  });

  it("locks both ways, and counts approved claims", () => {
    const locks = lockedLeaves([PETS], TILES, [sub("s1", "approved", ["pets-baron"])]);
    expect([...locks.keys()]).toEqual(["dt2-baron"]);
    expect(lockTag(locks.get("dt2-baron")!)).toBe("Used on PETS");
  });

  it("frees an item when the claim was rejected", () => {
    expect(lockedLeaves([PETS], TILES, [sub("s1", "rejected", ["dt2-baron"])]).size).toBe(0);
  });

  it("does nothing without rules or without claims", () => {
    expect(lockedLeaves([], TILES, [sub("s1", "approved", ["dt2-baron"])])).toBe(NO_LOCKS);
    expect(lockedLeaves([PETS], TILES, [])).toBe(NO_LOCKS);
  });

  it("locks the other part under part scope", () => {
    const slayerTiles = [tile("slayer", "SLAYER BOSSES", [part("s-p1", "Page 1", "SUM", [item("t1", "Kraken tentacle")]), part("s-p2", "Page 2", "SUM", [item("t2", "Kraken tentacle")])])];
    const rule: ExclusivityRule = { id: "slayer", label: "Slayer", itemNames: ["Kraken tentacle"], scope: "part" };
    const locks = lockedLeaves([rule], slayerTiles, [sub("s1", "pending", ["t1"])]);
    expect([...locks.keys()]).toEqual(["t2"]);
    expect(lockTag(locks.get("t2")!)).toBe("Used on SLAYER BOSSES · Page 1");
  });
});

describe("boardItemSources", () => {
  const sources = boardItemSources(TILES);
  const byLabel = (label: string) => sources.find((s) => s.label === label);

  it("lists a tile once when it has a single part", () => {
    expect(byLabel("DT2 ISSUE 1")?.itemNames).toEqual(["Baron"]);
    expect(sources.some((s) => s.label.startsWith("DT2 ISSUE 1 ·"))).toBe(false);
  });

  it("lists a tile's parts and the tile as a whole, without repeating a shared item", () => {
    expect(byLabel("PETS (all parts)")?.itemNames).toEqual(["Baron", "Nid"]);
    expect(byLabel("PETS · Page 1")?.itemNames).toEqual(["Baron", "Nid"]);
    expect(byLabel("PETS · Page 2")?.itemNames).toEqual(["Baron", "Nid"]);
  });

  it("takes a bare item task as a source of its own item", () => {
    expect(byLabel("SLAYER BOSSES")?.itemNames).toEqual(["Kraken tentacle"]);
  });
});
