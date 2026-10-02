import { describe, expect, it } from "vitest";
import { describeScope, exclusivityConflicts, keepFirstScope, normalizeItemName, scopeKey, type ExclusivityRule, type PlacedLeaf } from "@bingo/shared";

// A boss tile (a Baron under one part), PETS (a Baron and a Nid, each under both of its pages: a shared node) and
// SLAYER BOSSES (its own Kraken tentacle node under each page).
const leaf = (nodeId: string, itemName: string, tileId: string, tileName: string, parts: [string, string][]): PlacedLeaf => ({
  nodeId, itemName, tileId, tileName, partIds: parts.map(([id]) => id), partLabels: parts.map(([, label]) => label),
});
const LEAVES = new Map<string, PlacedLeaf>(
  [
    leaf("dt2-baron", "Baron", "dt2", "DT2 ISSUE 1", [["dt2-p1", "Page 1"]]),
    leaf("dt2-baron-b", "baron", "dt2", "DT2 ISSUE 1", [["dt2-p2", "Page 2"]]),
    leaf("pets-baron", "Baron", "pets", "PETS", [["pets-p1", "Page 1"], ["pets-p2", "Page 2"]]),
    leaf("pets-nid", "Nid", "pets", "PETS", [["pets-p1", "Page 1"], ["pets-p2", "Page 2"]]),
    leaf("slayer-p1-kraken", "Kraken tentacle", "slayer", "SLAYER BOSSES", [["slayer-p1", "Page 1"]]),
    leaf("slayer-p2-kraken", "Kraken tentacle", "slayer", "SLAYER BOSSES", [["slayer-p2", "Page 2"]]),
    leaf("slayer-p1-nid", "Nid", "slayer", "SLAYER BOSSES", [["slayer-p1", "Page 1"]]),
    leaf("other", "Abyssal whip", "dt2", "DT2 ISSUE 1", [["dt2-p1", "Page 1"]]),
  ].map((l) => [l.nodeId, l]),
);
const PETS: ExclusivityRule = { id: "pets", label: "Pets", itemNames: ["Baron", "Nid", "Hellpuppy"], scope: "tile" };
const SLAYER: ExclusivityRule = { id: "slayer", label: "Slayer", itemNames: ["Kraken tentacle", "Nid"], scope: "part" };

describe("scopeKey and describeScope", () => {
  it("keys a tile by its id and a part by the tile plus its part(s), whatever order they are listed in", () => {
    const shared = LEAVES.get("pets-baron")!;
    expect(scopeKey(shared, "tile")).toBe("pets");
    expect(scopeKey(shared, "part")).toBe(scopeKey({ ...shared, partIds: [...shared.partIds].reverse() }, "part"));
    expect(scopeKey(LEAVES.get("slayer-p1-kraken")!, "part")).not.toBe(scopeKey(LEAVES.get("slayer-p2-kraken")!, "part"));
  });

  it("says where an item sits", () => {
    expect(describeScope(LEAVES.get("dt2-baron")!, "tile")).toBe("DT2 ISSUE 1");
    expect(describeScope(LEAVES.get("slayer-p1-kraken")!, "part")).toBe("SLAYER BOSSES · Page 1");
    expect(describeScope(LEAVES.get("pets-baron")!, "part")).toBe("PETS · Page 1 & Page 2");
  });

  it("matches names case-insensitively and trimmed", () => {
    expect(normalizeItemName("  Kraken Tentacle ")).toBe("kraken tentacle");
  });
});

describe("exclusivityConflicts", () => {
  it("allows several claims on one tile, and refuses the same item on another tile (tile scope)", () => {
    expect(exclusivityConflicts([PETS], LEAVES, ["dt2-baron", "dt2-baron-b"], ["dt2-baron"])).toEqual([]);
    const [c] = exclusivityConflicts([PETS], LEAVES, ["dt2-baron"], ["pets-baron"]);
    expect(c).toMatchObject({ nodeId: "pets-baron", itemName: "Baron", usedOn: "DT2 ISSUE 1" });
    expect(c!.rule.label).toBe("Pets");
  });

  it("leaves other items alone, and items no rule names", () => {
    expect(exclusivityConflicts([PETS], LEAVES, ["dt2-baron"], ["pets-nid"])).toEqual([]);
    expect(exclusivityConflicts([PETS], LEAVES, ["other"], ["other"])).toEqual([]);
  });

  it("scope part refuses the other part of the same tile, but not a second claim under the same part", () => {
    expect(exclusivityConflicts([SLAYER], LEAVES, ["slayer-p1-kraken"], ["slayer-p1-kraken"])).toEqual([]);
    const [c] = exclusivityConflicts([SLAYER], LEAVES, ["slayer-p1-kraken"], ["slayer-p2-kraken"]);
    expect(c).toMatchObject({ itemName: "Kraken tentacle", usedOn: "SLAYER BOSSES · Page 1" });
  });

  it("makes an item in two rules satisfy both", () => {
    // Nid: a pet (tile) and a slayer unique (part). On SLAYER Page 1 it is fine for slayer, but PETS then conflicts.
    expect(exclusivityConflicts([PETS, SLAYER], LEAVES, ["slayer-p1-nid"], ["pets-nid"]).map((c) => c.rule.id).sort()).toEqual(["pets", "slayer"]);
    expect(exclusivityConflicts([PETS, SLAYER], LEAVES, ["pets-nid"], ["slayer-p1-nid"]).map((c) => c.rule.id).sort()).toEqual(["pets", "slayer"]);
  });

  it("refuses one submission that puts a name in two places", () => {
    const conflicts = exclusivityConflicts([PETS], LEAVES, [], ["dt2-baron", "pets-baron"]);
    expect(conflicts.map((c) => c.nodeId)).toEqual(["pets-baron"]);
  });

  it("treats a shared node as one place, and matches names case-insensitively", () => {
    // pets-baron sits under two parts of ONE tile: two claims on it are one place.
    expect(exclusivityConflicts([SLAYER, PETS], LEAVES, ["pets-baron"], ["pets-baron"])).toEqual([]);
    expect(exclusivityConflicts([PETS], LEAVES, ["dt2-baron-b"], ["pets-baron"])).toHaveLength(1); // "baron" vs "Baron"
  });

  it("does nothing without rules", () => {
    expect(exclusivityConflicts([], LEAVES, ["dt2-baron"], ["pets-baron"])).toEqual([]);
  });
});

describe("keepFirstScope", () => {
  const at = (h: number) => new Date(Date.UTC(2026, 0, 1, h));
  const claim = (nodeId: string, h: number) => ({ nodeId, at: at(h) });

  it("keeps the earliest claim's tile and drops later claims under another tile", () => {
    const claims = [claim("pets-baron", 5), claim("dt2-baron", 1), claim("dt2-baron-b", 2)];
    expect(keepFirstScope([PETS], LEAVES, claims).map((c) => c.nodeId)).toEqual(["dt2-baron", "dt2-baron-b"]);
  });

  it("keeps later claims under the same scope, and claims no rule names", () => {
    const claims = [claim("dt2-baron", 1), claim("other", 2), claim("dt2-baron-b", 3)];
    expect(keepFirstScope([PETS], LEAVES, claims)).toEqual(claims);
  });

  it("does not let a dropped claim fix anything, and applies every rule that names the item", () => {
    // Nid: slayer Page 1 first (fixes slayer=Page 1 and pets=SLAYER), then PETS (loses to the pets rule).
    const kept = keepFirstScope([PETS, SLAYER], LEAVES, [claim("slayer-p1-nid", 1), claim("pets-nid", 2)]);
    expect(kept.map((c) => c.nodeId)).toEqual(["slayer-p1-nid"]);
  });

  it("returns claims in their original order", () => {
    const claims = [claim("dt2-baron-b", 9), claim("dt2-baron", 3)];
    expect(keepFirstScope([PETS], LEAVES, claims)).toEqual(claims);
  });

  it("is the identity without rules", () => {
    const claims = [claim("pets-baron", 5), claim("dt2-baron", 1)];
    expect(keepFirstScope([], LEAVES, claims)).toEqual(claims);
  });
});

// Groups (several item names sharing one lock): SLAYER BOSSES with its own Bludgeon pieces under each page, and
// another tile with a claw on it.
describe("exclusivity groups", () => {
  const GROUP_LEAVES = new Map<string, PlacedLeaf>(
    [
      leaf("p1-axon", "Bludgeon axon", "slayer", "SLAYER BOSSES", [["slayer-p1", "Page 1"]]),
      leaf("p1-claw", "Bludgeon claw", "slayer", "SLAYER BOSSES", [["slayer-p1", "Page 1"]]),
      leaf("p2-axon", "Bludgeon axon", "slayer", "SLAYER BOSSES", [["slayer-p2", "Page 2"]]),
      leaf("p2-claw", "bludgeon CLAW", "slayer", "SLAYER BOSSES", [["slayer-p2", "Page 2"]]),
      leaf("p2-spine", "Bludgeon spine", "slayer", "SLAYER BOSSES", [["slayer-p2", "Page 2"]]),
      leaf("p1-kraken", "Kraken tentacle", "slayer", "SLAYER BOSSES", [["slayer-p1", "Page 1"]]),
      leaf("p2-kraken", "Kraken tentacle", "slayer", "SLAYER BOSSES", [["slayer-p2", "Page 2"]]),
      leaf("sire-claw", "Bludgeon claw", "sire", "ABYSSAL SIRE", [["sire-p1", "Page 1"]]),
    ].map((l) => [l.nodeId, l]),
  );
  const BLUDGEON: ExclusivityRule = {
    id: "slayer",
    label: "Slayer",
    itemNames: ["Kraken tentacle", "Bludgeon axon", "Bludgeon claw", "Bludgeon spine"],
    scope: "part",
    groups: [{ label: "Bludgeon piece", itemNames: ["Bludgeon axon", "Bludgeon claw", "Bludgeon spine"] }],
  };
  const at = (h: number) => new Date(Date.UTC(2026, 0, 1, h));

  it("locks every member of the group in another place, naming the piece that holds the lock", () => {
    for (const nodeId of ["p2-axon", "p2-claw", "p2-spine", "sire-claw"]) {
      const conflicts = exclusivityConflicts([BLUDGEON], GROUP_LEAVES, ["p1-axon"], [nodeId]);
      expect(conflicts, nodeId).toMatchObject([{ nodeId, usedOn: "SLAYER BOSSES · Page 1 (Bludgeon axon)", group: "Bludgeon piece" }]);
    }
  });

  it("allows several pieces of the group in the same place", () => {
    expect(exclusivityConflicts([BLUDGEON], GROUP_LEAVES, ["p1-axon"], ["p1-claw", "p1-axon"])).toEqual([]);
  });

  it("frees the group once its claim is gone (a rejection)", () => {
    expect(exclusivityConflicts([BLUDGEON], GROUP_LEAVES, [], ["p2-claw"])).toEqual([]);
  });

  it("leaves the rule's ungrouped items on their own lock", () => {
    expect(exclusivityConflicts([BLUDGEON], GROUP_LEAVES, ["p1-axon"], ["p2-kraken"])).toEqual([]);
    const [c] = exclusivityConflicts([BLUDGEON], GROUP_LEAVES, ["p1-kraken"], ["p2-kraken"]);
    expect(c).toMatchObject({ usedOn: "SLAYER BOSSES · Page 1" });
    expect(c).not.toHaveProperty("group");
  });

  it("refuses one submission that puts two pieces in two places", () => {
    expect(exclusivityConflicts([BLUDGEON], GROUP_LEAVES, [], ["p1-axon", "p2-spine"]).map((c) => c.nodeId)).toEqual(["p2-spine"]);
  });

  it("matches a name in a group even when the rule's own list leaves it out", () => {
    const groupOnly: ExclusivityRule = { ...BLUDGEON, itemNames: ["Kraken tentacle"] };
    expect(exclusivityConflicts([groupOnly], GROUP_LEAVES, ["p1-axon"], ["p2-claw"])).toHaveLength(1);
  });

  it("keeps the earliest claim's place for the whole group when scoring", () => {
    const claims = [{ nodeId: "p2-claw", at: at(3) }, { nodeId: "p1-axon", at: at(1) }, { nodeId: "p1-claw", at: at(2) }, { nodeId: "sire-claw", at: at(4) }, { nodeId: "p2-kraken", at: at(5) }];
    expect(keepFirstScope([BLUDGEON], GROUP_LEAVES, claims).map((c) => c.nodeId)).toEqual(["p1-axon", "p1-claw", "p2-kraken"]);
    // An axon then a claw elsewhere: the group drops the claw; without the group each name keeps its own place.
    const axonThenClaw = [{ nodeId: "p1-axon", at: at(1) }, { nodeId: "p2-claw", at: at(2) }];
    expect(keepFirstScope([BLUDGEON], GROUP_LEAVES, axonThenClaw).map((c) => c.nodeId)).toEqual(["p1-axon"]);
    expect(keepFirstScope([{ ...BLUDGEON, groups: undefined }], GROUP_LEAVES, axonThenClaw).map((c) => c.nodeId)).toEqual(["p1-axon", "p2-claw"]);
  });

  it("leaves rules without groups as they were (an empty list included)", () => {
    const ungrouped: ExclusivityRule = { ...BLUDGEON, groups: [] };
    expect(exclusivityConflicts([ungrouped], GROUP_LEAVES, ["p1-axon"], ["p2-claw"])).toEqual([]);
    expect(exclusivityConflicts([ungrouped], GROUP_LEAVES, ["p1-axon"], ["p2-axon"])).toMatchObject([{ usedOn: "SLAYER BOSSES · Page 1" }]);
  });
});
