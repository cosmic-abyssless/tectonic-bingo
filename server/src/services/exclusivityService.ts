// Enforcing exclusive items (docs/exclusive-items-plan.md): where each item node sits, which claims a team
// already has, and applying the shared rule logic (shared/src/exclusivity.ts) to a submission and to scoring.
import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { exclusivityConflicts, keepFirstScope, type ExclusivityConflict, type PlacedLeaf } from "@bingo/shared";
import * as schema from "../db/schema";
import { claims, nodes, submissions, tiles } from "../db/schema";
import { getFullGraph } from "./graphService";
import { parseExclusivityRules } from "./bingoService";
import type { ApprovedClaim } from "./engine";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

/**
 * Every item node of the bingo, placed: which tile it is on, and which part(s) above it. A part is a direct child
 * of a tile's root node, and a node reached under two parts (an item shared between pages) collects both. An item
 * that is itself a part (a bare item task) is its own part. Built fresh each call: the board can change while live.
 */
export function placeLeaves(db: Queryable, bingoId: string): Map<string, PlacedLeaf> {
  const { childrenOf, nodesById } = getFullGraph(db, bingoId);
  const tileRows = db.select({ id: tiles.id, name: tiles.name, nodeId: tiles.nodeId }).from(tiles).where(eq(tiles.bingoId, bingoId)).all();
  const partLabel = new Map(db.select({ id: nodes.id, label: nodes.label }).from(nodes).where(eq(nodes.bingoId, bingoId)).all().map((n) => [n.id, n.label ?? "Part"]));

  const placed = new Map<string, PlacedLeaf>();
  for (const tile of tileRows) {
    for (const partId of childrenOf.get(tile.nodeId) ?? []) {
      const stack = [partId];
      const visited = new Set<string>();
      while (stack.length > 0) {
        const id = stack.pop()!;
        if (visited.has(id)) continue;
        visited.add(id);
        const node = nodesById.get(id);
        if (node?.kind === "ITEM") {
          const existing = placed.get(id);
          if (!existing) placed.set(id, { nodeId: id, itemName: node.itemName, tileId: tile.id, tileName: tile.name, partIds: [partId], partLabels: [partLabel.get(partId) ?? "Part"] });
          else if (existing.tileId === tile.id && !existing.partIds.includes(partId)) {
            existing.partIds.push(partId);
            existing.partLabels.push(partLabel.get(partId) ?? "Part");
          }
        }
        stack.push(...(childrenOf.get(id) ?? []));
      }
    }
  }
  return placed;
}

/** The nodes a team has a live claim on: its pending and approved submissions (a rejection frees the item). */
export function liveClaimNodeIds(db: Queryable, teamId: string): string[] {
  return db
    .select({ nodeId: claims.nodeId })
    .from(claims)
    .innerJoin(submissions, eq(claims.submissionId, submissions.id))
    .where(and(eq(submissions.teamId, teamId), inArray(submissions.status, ["pending", "approved"])))
    .all()
    .map((r) => r.nodeId);
}

/** What the team can't claim under the bingo's exclusivity rules (empty when it has none). */
export function conflictsForClaims(db: Queryable, bingo: { id: string; exclusivityRulesJson: string }, teamId: string, nodeIds: string[]): ExclusivityConflict[] {
  const rules = parseExclusivityRules(bingo.exclusivityRulesJson);
  if (rules.length === 0) return [];
  return exclusivityConflicts(rules, placeLeaves(db, bingo.id), liveClaimNodeIds(db, teamId), nodeIds);
}

export function conflictMessage(c: ExclusivityConflict): string {
  return `${c.itemName} is already used on ${c.usedOn}: ${c.rule.label} can only be used on one ${c.rule.scope}`;
}

/**
 * For scoring: a team's approved claims minus the ones that lose to an earlier claim under the bingo's rules.
 * Refusing at submission normally keeps this a no-op; it matters when a rule is added after claims exist, or a
 * mod approves two pending claims that conflict.
 */
export function applyExclusivity(db: Queryable, bingoId: string, approved: ApprovedClaim[]): ApprovedClaim[] {
  const row = db.select({ json: schema.bingos.exclusivityRulesJson }).from(schema.bingos).where(eq(schema.bingos.id, bingoId)).get();
  const rules = parseExclusivityRules(row?.json);
  if (rules.length === 0) return approved;
  const wrapped = approved.map((claim) => ({ claim, nodeId: claim.nodeId, at: claim.reviewedAt }));
  return keepFirstScope(rules, placeLeaves(db, bingoId), wrapped).map((w) => w.claim);
}
