import { describe, expect, it } from "vitest";
import type { ExclusivityRule } from "@bingo/shared";
import { addGroup, addToGroup, groupLabelOf, groupProblems, removeFromGroup, removeGroup, removeItem, renameGroup, ungroupedNames } from "./exclusiveGroups";

const SLAYER: ExclusivityRule = { id: "s", label: "Slayer", itemNames: ["Kraken tentacle", "Bludgeon axon", "Bludgeon claw"], scope: "part" };

describe("exclusive item groups in the editor", () => {
  it("makes a group from some of the rule's items and a new name, which joins the rule's items too", () => {
    let rule = addGroup(SLAYER, " Bludgeon piece ");
    rule = addToGroup(rule, 0, "Bludgeon axon") as ExclusivityRule;
    rule = addToGroup(rule, 0, "bludgeon CLAW") as ExclusivityRule; // already in the group's rule, any case
    rule = addToGroup(rule, 0, "Bludgeon spine") as ExclusivityRule;
    expect(rule.groups).toEqual([{ label: "Bludgeon piece", itemNames: ["Bludgeon axon", "bludgeon CLAW", "Bludgeon spine"] }]);
    expect(rule.itemNames).toEqual(["Kraken tentacle", "Bludgeon axon", "Bludgeon claw", "Bludgeon spine"]);
    expect(groupLabelOf(rule, "bludgeon claw")).toBe("Bludgeon piece");
    expect(ungroupedNames(rule)).toEqual(["Kraken tentacle"]);
    expect(groupProblems(rule)).toEqual([]);
  });

  it("refuses an item that another group already has", () => {
    const rule = addToGroup(addGroup(addGroup(SLAYER, "A"), "B"), 0, "Bludgeon axon") as ExclusivityRule;
    expect(addToGroup(rule, 1, "bludgeon axon")).toBe(`bludgeon axon is already in "A": an item can be in only one group`);
  });

  it("renames, empties and removes groups, keeping their items in the rule, and drops the field with the last group", () => {
    let rule = addToGroup(addGroup(SLAYER, "A"), 0, "Bludgeon axon") as ExclusivityRule;
    rule = renameGroup(rule, 0, "Bludgeon piece");
    expect(rule.groups![0]!.label).toBe("Bludgeon piece");
    expect(removeFromGroup(rule, 0, "Bludgeon axon").groups).toEqual([{ label: "Bludgeon piece", itemNames: [] }]);
    const removed = removeGroup(rule, 0);
    expect(removed).not.toHaveProperty("groups");
    expect(removed.itemNames).toEqual(SLAYER.itemNames);
  });

  it("takes a removed item out of its group as well", () => {
    const rule = removeItem(addToGroup(addGroup(SLAYER, "A"), 0, "Bludgeon axon") as ExclusivityRule, "Bludgeon axon");
    expect(rule.itemNames).toEqual(["Kraken tentacle", "Bludgeon claw"]);
    expect(rule.groups).toEqual([{ label: "A", itemNames: [] }]);
  });

  it("names what the server would refuse: an empty or unnamed group, two groups with one name, an item in two groups", () => {
    expect(groupProblems({ ...SLAYER, groups: [{ label: "A", itemNames: [] }] })).toEqual([`"A" has no items yet`]);
    expect(groupProblems({ ...SLAYER, groups: [{ label: " ", itemNames: ["Bludgeon axon"] }] })).toEqual(["Group 1 needs a name"]);
    expect(groupProblems({ ...SLAYER, groups: [{ label: "A", itemNames: ["Bludgeon axon"] }, { label: "a", itemNames: ["Bludgeon claw"] }] })).toEqual([`Two groups are called "a"`]);
    expect(groupProblems({ ...SLAYER, groups: [{ label: "A", itemNames: ["Bludgeon axon"] }, { label: "B", itemNames: ["bludgeon axon"] }] })).toEqual([
      `bludgeon axon is in two groups ("A" and "B"); an item can be in only one`,
    ]);
    expect(groupProblems(SLAYER)).toEqual([]);
  });
});
