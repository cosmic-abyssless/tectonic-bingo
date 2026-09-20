// Exclusive items: an item a team may use in one place only. See docs/exclusive-items-plan.md.
//
// Not the same thing as a *shared node* (one item node under two parts, which counts toward each): here every
// place keeps its own item node, and a rule stops a team using one item name under more than one scope. The
// rules live on the bingo and match by item name; this module is the pure logic, used by the server (refusing a
// claim, and scoring) and the client (showing what is already used).

import type { Tile } from "./index.ts";

export type ExclusivityScope = "part" | "tile";

export interface ExclusivityRule {
  id: string;
  /** e.g. "Pets". */
  label: string;
  /** A snapshot of the item group the rule was made from; matched case-insensitively. */
  itemNames: string[];
  scope: ExclusivityScope;
}

/** Where an item node sits, as the rules see it. */
export interface PlacedLeaf {
  nodeId: string;
  itemName: string | null;
  tileId: string;
  tileName: string;
  /** The parts (direct children of the tile's root node) above the node: more than one when the node is shared. */
  partIds: string[];
  partLabels: string[];
}

export interface ExclusivityConflict {
  nodeId: string;
  itemName: string;
  rule: ExclusivityRule;
  /** Where the item is already used, e.g. "DT2 ISSUE 1" or "SLAYER BOSSES · Page 1". */
  usedOn: string;
}

export const normalizeItemName = (name: string): string => name.trim().toLowerCase();

/**
 * Where every item node of a board sits, from the tile trees (a part is a direct child of a tile's root node; a
 * node reached under two parts collects both; an item that is itself a part is its own part). The server builds
 * the same placement from the database (exclusivityService.placeLeaves).
 */
export function placeLeaves(tiles: readonly Tile[]): Map<string, PlacedLeaf> {
  const placed = new Map<string, PlacedLeaf>();
  for (const tile of tiles) {
    for (const part of tile.node.children) {
      const label = part.label ?? "Part";
      const stack = [part];
      const visited = new Set<string>();
      while (stack.length > 0) {
        const node = stack.pop()!;
        if (visited.has(node.id)) continue;
        visited.add(node.id);
        if (node.kind === "ITEM") {
          const existing = placed.get(node.id);
          if (!existing) placed.set(node.id, { nodeId: node.id, itemName: node.itemName, tileId: tile.id, tileName: tile.name, partIds: [part.id], partLabels: [label] });
          else if (existing.tileId === tile.id && !existing.partIds.includes(part.id)) {
            existing.partIds.push(part.id);
            existing.partLabels.push(label);
          }
        }
        stack.push(...node.children);
      }
    }
  }
  return placed;
}

/** The key claims on one item name must agree on: the tile, or the tile plus the part(s). */
export function scopeKey(leaf: PlacedLeaf, scope: ExclusivityScope): string {
  return scope === "tile" ? leaf.tileId : `${leaf.tileId}|${[...leaf.partIds].sort().join(",")}`;
}

/** Human wording for where an item sits under a scope. */
export function describeScope(leaf: PlacedLeaf, scope: ExclusivityScope): string {
  return scope === "tile" || leaf.partLabels.length === 0 ? leaf.tileName : `${leaf.tileName} · ${leaf.partLabels.join(" & ")}`;
}

/** The rules that name an item, each with the normalized name set they were built from. */
function rulesFor(rules: readonly ExclusivityRule[], itemName: string | null): ExclusivityRule[] {
  if (!itemName) return [];
  const name = normalizeItemName(itemName);
  return rules.filter((r) => r.itemNames.some((n) => normalizeItemName(n) === name));
}

/**
 * Which of `candidates` a team may not claim. `existing` is every node the team already has a live (pending or
 * approved) claim on. A candidate conflicts when a rule names its item and there is a claim on a node with the
 * same item name under a different scope key, whether already existing or another candidate earlier in the list.
 * Several claims for one name under the SAME key are fine (three Barons on one tile).
 */
export function exclusivityConflicts(
  rules: readonly ExclusivityRule[],
  leaves: ReadonlyMap<string, PlacedLeaf>,
  existing: Iterable<string>,
  candidates: readonly string[],
): ExclusivityConflict[] {
  if (rules.length === 0) return [];
  const taken: PlacedLeaf[] = [];
  for (const nodeId of existing) {
    const leaf = leaves.get(nodeId);
    if (leaf?.itemName) taken.push(leaf);
  }

  const conflicts: ExclusivityConflict[] = [];
  const seen = new Set<string>();
  candidates.forEach((nodeId, index) => {
    const leaf = leaves.get(nodeId);
    if (!leaf?.itemName) return;
    const name = normalizeItemName(leaf.itemName);
    for (const rule of rulesFor(rules, leaf.itemName)) {
      const key = scopeKey(leaf, rule.scope);
      const others = [...taken, ...candidates.slice(0, index).flatMap((id) => leaves.get(id) ?? [])];
      const clash = others.find((o) => o.itemName && normalizeItemName(o.itemName) === name && scopeKey(o, rule.scope) !== key);
      if (clash && !seen.has(`${nodeId}|${rule.id}`)) {
        seen.add(`${nodeId}|${rule.id}`);
        conflicts.push({ nodeId, itemName: leaf.itemName, rule, usedOn: describeScope(clash, rule.scope) });
      }
    }
  });
  return conflicts;
}

/**
 * For scoring: drops the claims that lose to an earlier one. Walking the claims oldest first, the first claim on
 * an item name fixes the scope key for each rule naming it, and a later claim under a different key is ignored.
 * A dropped claim fixes nothing. (Refusing at submission keeps this from mattering day to day; it makes a rule
 * added after claims exist, or a mod's approval of two pending claims, score consistently instead of double.)
 */
export function keepFirstScope<T extends { nodeId: string; at: Date }>(
  rules: readonly ExclusivityRule[],
  leaves: ReadonlyMap<string, PlacedLeaf>,
  claims: readonly T[],
): T[] {
  if (rules.length === 0) return [...claims];
  const fixed = new Map<string, string>(); // `${rule.id}|${name}` -> scope key
  const kept: T[] = [];
  const ordered = claims.map((c, i) => ({ c, i })).sort((a, b) => a.c.at.getTime() - b.c.at.getTime() || a.i - b.i);
  for (const { c } of ordered) {
    const leaf = leaves.get(c.nodeId);
    const applicable = leaf?.itemName ? rulesFor(rules, leaf.itemName) : [];
    if (!leaf || !leaf.itemName || applicable.length === 0) {
      kept.push(c);
      continue;
    }
    const name = normalizeItemName(leaf.itemName);
    const checks = applicable.map((rule) => ({ id: `${rule.id}|${name}`, key: scopeKey(leaf, rule.scope) }));
    if (checks.some(({ id, key }) => fixed.has(id) && fixed.get(id) !== key)) continue;
    for (const { id, key } of checks) if (!fixed.has(id)) fixed.set(id, key);
    kept.push(c);
  }
  // Keep the input's own order for the claims that survived.
  const survivors = new Set(kept);
  return claims.filter((c) => survivors.has(c));
}
