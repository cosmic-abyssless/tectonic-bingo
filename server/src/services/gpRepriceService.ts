// Re-pricing (CONTEXT.md "GP value"): the one exception to a GP value never changing once set. For fixing values
// that were priced from the wrong thing (a Task given a Valued as, or an item a Piece value, after its claims came
// in), not for bringing values up to today's prices. A Moderator re-prices one submission; an Admin changing a
// Task's Valued as can re-price every submission with a claim on it.
import { and, eq, isNotNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { claims, nodes, submissions, teams } from "../db/schema";
import { audit, markAuditedNoop } from "../audit/record";
import { broadcast } from "../ws";
import { ServiceError } from "./errors";
import { getGePriceTable, type GePriceTable } from "./gePriceService";
import { pricer, valuedAsOf, type Pricer } from "./gpValueService";
import { describeSubmissionTarget } from "./scoringService";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface RepricedClaim {
  itemName: string;
  before: number | null;
  after: number | null;
}

async function loadedTable(table: GePriceTable): Promise<GePriceTable> {
  await table.refreshIfStale();
  if (!table.isLoaded()) throw new ServiceError(503, "Couldn't load Grand Exchange prices from the OSRS Wiki — try again in a minute");
  return table;
}

/**
 * Prices one submission's item claims again (only those on `onlyNodeId`, when given), writing and auditing the ones
 * whose GP value changed. A claim that can't be priced right now keeps what it had.
 */
function repriceInTx(tx: Tx, bingoId: string, submissionId: string, price: Pricer, onlyNodeId?: string): RepricedClaim[] {
  const submission = tx
    .select({ teamId: submissions.teamId, bingoId: teams.bingoId })
    .from(submissions)
    .innerJoin(teams, eq(submissions.teamId, teams.id))
    .where(eq(submissions.id, submissionId))
    .get();
  if (!submission || submission.bingoId !== bingoId) throw new ServiceError(404, "Submission not found");

  const rows = tx
    .select({ id: claims.id, nodeId: claims.nodeId, itemName: claims.itemName, quantity: claims.quantity, gpValue: claims.gpValue, valuedAsItemName: nodes.valuedAsItemName, valuedAsDivisor: nodes.valuedAsDivisor })
    .from(claims)
    .innerJoin(nodes, eq(claims.nodeId, nodes.id))
    .where(eq(claims.submissionId, submissionId))
    .all();
  const changes: RepricedClaim[] = [];
  for (const row of rows) {
    if (!row.itemName || (onlyNodeId && row.nodeId !== onlyNodeId)) continue;
    const after = price.gpValue(row.itemName, row.quantity, valuedAsOf(row));
    if (after === null || after === row.gpValue) continue;
    tx.update(claims).set({ gpValue: after }).where(eq(claims.id, row.id)).run();
    changes.push({ itemName: row.itemName, before: row.gpValue, after });
  }
  if (changes.length === 0) return changes;

  const { tileName, taskLabels } = describeSubmissionTarget(tx, bingoId, rows.map((r) => r.nodeId));
  audit(tx, {
    action: "submission.repriced",
    bingoId,
    entity: { type: "submission", id: submissionId, label: tileName },
    teamId: submission.teamId,
    details: { tileName, taskLabels, claims: changes },
  });
  return changes;
}

/** Re-prices every item claim of one submission. Returns the claims whose GP value changed. */
export async function repriceSubmission(db: Db, bingoId: string, submissionId: string, table: GePriceTable = getGePriceTable()): Promise<RepricedClaim[]> {
  const loaded = await loadedTable(table);
  const changed = db.transaction((tx) => repriceInTx(tx, bingoId, submissionId, pricer(tx, loaded)));
  if (changed.length) broadcast({ type: "gp_values_updated", bingoId, payload: {} });
  else markAuditedNoop();
  return changed;
}

/** The submissions of this bingo with a claim on `nodeId`: only those whose claim already has a GP value, if `priced`. */
function submissionIdsOn(db: Db | Tx, bingoId: string, nodeId: string, priced: boolean): string[] {
  const rows = db
    .selectDistinct({ submissionId: claims.submissionId })
    .from(claims)
    .innerJoin(submissions, eq(claims.submissionId, submissions.id))
    .innerJoin(teams, eq(submissions.teamId, teams.id))
    .where(and(eq(claims.nodeId, nodeId), eq(teams.bingoId, bingoId), priced ? isNotNull(claims.gpValue) : undefined))
    .all();
  return rows.map((r) => r.submissionId);
}

/** How many submissions already have a GP value from this Task, so changing its Valued as can offer to re-price them. */
export function countPricedSubmissions(db: Db, bingoId: string, nodeId: string): number {
  return submissionIdsOn(db, bingoId, nodeId, true).length;
}

/**
 * Re-prices this Task's claims in every submission that has one (after its Valued as changed), including any with no
 * GP value yet. Other claims in those submissions are left alone. Returns how many submissions changed.
 */
export async function repriceNodeClaims(db: Db, bingoId: string, nodeId: string, table: GePriceTable = getGePriceTable()): Promise<number> {
  const loaded = await loadedTable(table);
  const changedSubmissions = db.transaction((tx) => {
    const price = pricer(tx, loaded);
    return submissionIdsOn(tx, bingoId, nodeId, false).filter((submissionId) => repriceInTx(tx, bingoId, submissionId, price, nodeId).length > 0).length;
  });
  if (changedSubmissions) broadcast({ type: "gp_values_updated", bingoId, payload: {} });
  else markAuditedNoop();
  return changedSubmissions;
}
