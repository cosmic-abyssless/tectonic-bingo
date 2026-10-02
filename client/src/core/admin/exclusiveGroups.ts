// Editing an exclusive item rule's groups (several item names sharing one lock, e.g. "Bludgeon piece": axon, claw
// and spine). A group's names are also the rule's own items, so adding a new name to a group adds it to the rule,
// and removing an item from the rule takes it out of its group. The server validates the same things on save
// (bingoService.normalizeExclusivityRules); this keeps the editor from building a rule it would refuse.
import { normalizeItemName, type ExclusivityGroup, type ExclusivityRule } from "@bingo/shared";

/** Adds names to a list, keeping the first spelling of each and skipping ones already there. */
export function mergeNames(existing: readonly string[], added: readonly string[]): string[] {
  const seen = new Set(existing.map(normalizeItemName));
  const merged = [...existing];
  for (const raw of added) {
    const name = raw.trim();
    if (name && !seen.has(normalizeItemName(name))) {
      seen.add(normalizeItemName(name));
      merged.push(name);
    }
  }
  return merged;
}

const sameName = (a: string, b: string) => normalizeItemName(a) === normalizeItemName(b);

/** The rule with these groups: none leaves the field off, so a rule without groups saves as it always has. */
function withGroups(rule: ExclusivityRule, groups: ExclusivityGroup[]): ExclusivityRule {
  const { groups: _groups, ...rest } = rule;
  return groups.length > 0 ? { ...rest, groups } : rest;
}

export const groupsOf = (rule: ExclusivityRule): ExclusivityGroup[] => rule.groups ?? [];

/** The label of the group a name is in, if any. */
export function groupLabelOf(rule: ExclusivityRule, name: string): string | null {
  return groupsOf(rule).find((g) => g.itemNames.some((n) => sameName(n, name)))?.label ?? null;
}

/** The rule's items in no group yet: what can be added to one. */
export const ungroupedNames = (rule: ExclusivityRule): string[] => rule.itemNames.filter((n) => groupLabelOf(rule, n) === null);

export function addGroup(rule: ExclusivityRule, label: string): ExclusivityRule {
  return withGroups(rule, [...groupsOf(rule), { label: label.trim(), itemNames: [] }]);
}

export function renameGroup(rule: ExclusivityRule, index: number, label: string): ExclusivityRule {
  return withGroups(rule, groupsOf(rule).map((g, i) => (i === index ? { ...g, label } : g)));
}

/** Removes a group; its items stay in the rule, each on its own lock again. */
export function removeGroup(rule: ExclusivityRule, index: number): ExclusivityRule {
  return withGroups(rule, groupsOf(rule).filter((_, i) => i !== index));
}

/**
 * Adds a name to a group, and to the rule's items when it is new to the rule. Returns why not instead when another
 * group of the rule already has it (an item can be in only one).
 */
export function addToGroup(rule: ExclusivityRule, index: number, name: string): ExclusivityRule | string {
  const trimmed = name.trim();
  if (!trimmed) return rule;
  const other = groupLabelOf(rule, trimmed);
  const group = groupsOf(rule)[index];
  if (!group) return rule;
  if (other !== null && other !== group.label) return `${trimmed} is already in "${other}": an item can be in only one group`;
  const groups = groupsOf(rule).map((g, i) => (i === index ? { ...g, itemNames: mergeNames(g.itemNames, [trimmed]) } : g));
  return withGroups({ ...rule, itemNames: mergeNames(rule.itemNames, [trimmed]) }, groups);
}

/** Takes a name out of a group; it stays in the rule. */
export function removeFromGroup(rule: ExclusivityRule, index: number, name: string): ExclusivityRule {
  return withGroups(rule, groupsOf(rule).map((g, i) => (i === index ? { ...g, itemNames: g.itemNames.filter((n) => !sameName(n, name)) } : g)));
}

/** Removes an item from the rule, and from its group. */
export function removeItem(rule: ExclusivityRule, name: string): ExclusivityRule {
  const groups = groupsOf(rule).map((g) => ({ ...g, itemNames: g.itemNames.filter((n) => !sameName(n, name)) }));
  return withGroups({ ...rule, itemNames: rule.itemNames.filter((n) => n !== name) }, groups);
}

/** What the server would refuse about a rule's groups, in its words: an unnamed or empty group, two with one name, an item in two. */
export function groupProblems(rule: ExclusivityRule): string[] {
  const problems: string[] = [];
  const labels = new Set<string>();
  const inGroup = new Map<string, string>();
  groupsOf(rule).forEach((g, i) => {
    const label = g.label.trim();
    if (!label) problems.push(`Group ${i + 1} needs a name`);
    else if (labels.has(label.toLowerCase())) problems.push(`Two groups are called "${label}"`);
    labels.add(label.toLowerCase());
    if (g.itemNames.length === 0) problems.push(`"${label || `Group ${i + 1}`}" has no items yet`);
    for (const name of g.itemNames) {
      const other = inGroup.get(normalizeItemName(name));
      if (other !== undefined) problems.push(`${name} is in two groups ("${other}" and "${label}"); an item can be in only one`);
      inGroup.set(normalizeItemName(name), label);
    }
  });
  return problems;
}
