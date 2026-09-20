// Exclusive items on the client (docs/exclusive-items-plan.md): which item nodes a team can't claim because it
// already used the item elsewhere. The server enforces the rule (server/src/services/exclusivityService.ts);
// this only tells players before they try, using the same shared logic.
import { exclusivityConflicts, placeLeaves, type ExclusivityConflict, type ExclusivityRule, type SubmissionDetails, type Tile } from "@bingo/shared";

export { placeLeaves };

/** The item nodes the team can't claim, and why. */
export type ExclusiveLocks = ReadonlyMap<string, ExclusivityConflict>;
export const NO_LOCKS: ExclusiveLocks = new Map();

/**
 * The item nodes a team can't claim given what it already has (pending or approved claims; a rejected one frees
 * the item). Each node is checked on its own against the existing claims, so two open items are never compared
 * with each other.
 */
export function lockedLeaves(rules: readonly ExclusivityRule[], tiles: Tile[], teamSubmissions: SubmissionDetails[]): ExclusiveLocks {
  if (rules.length === 0) return NO_LOCKS;
  const leaves = placeLeaves(tiles);
  const existing = teamSubmissions.filter((d) => d.submission.status === "pending" || d.submission.status === "approved").flatMap((d) => d.claims.map((c) => c.nodeId));
  if (existing.length === 0) return NO_LOCKS;
  const locks = new Map<string, ExclusivityConflict>();
  for (const nodeId of leaves.keys()) {
    const [conflict] = exclusivityConflicts(rules, leaves, existing, [nodeId]);
    if (conflict) locks.set(nodeId, conflict);
  }
  return locks;
}

/** Short tag for a locked item: "Used on DT2 ISSUE 1". */
export const lockTag = (c: ExclusivityConflict): string => `Used on ${c.usedOn}`;

/** The full sentence, for the submission picker. */
export const lockReason = (c: ExclusivityConflict): string => `used on ${c.usedOn} (${c.rule.label} can only be used on one ${c.rule.scope})`;

/** A board tile, or one of its parts, as a source of item names for a rule. */
export interface ItemSource {
  key: string;
  label: string;
  itemNames: string[];
}

function itemNamesUnder(root: Tile["node"]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  const visited = new Set<string>();
  const walk = (node: Tile["node"]) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    const name = node.kind === "ITEM" ? node.itemName?.trim() : null;
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      names.push(name);
    }
    node.children.forEach(walk);
  };
  walk(root);
  return names;
}

/**
 * What a rule can be started from on the board: each tile with items ("SLAYER BOSSES", every part) and each of its
 * parts ("SLAYER BOSSES · Page 1"). A tile with a single part is listed once.
 */
export function boardItemSources(tiles: readonly Tile[]): ItemSource[] {
  const sources: ItemSource[] = [];
  for (const tile of tiles) {
    const parts = tile.node.children.map((part) => ({ part, itemNames: itemNamesUnder(part) })).filter((p) => p.itemNames.length > 0);
    if (parts.length === 0) continue;
    const all = itemNamesUnder(tile.node);
    sources.push({ key: tile.id, label: parts.length > 1 ? `${tile.name} (all parts)` : tile.name, itemNames: all });
    if (parts.length > 1) for (const { part, itemNames } of parts) sources.push({ key: part.id, label: `${tile.name} · ${part.label ?? "Part"}`, itemNames });
  }
  return sources;
}
