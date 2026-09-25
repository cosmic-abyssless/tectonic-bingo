// Re-pricing a Submission (CONTEXT.md "GP value"): the one exception to a GP value never changing once set. For a
// Moderator fixing values that were priced from the wrong thing (a Task given a Valued as or a Piece value after its
// claims came in), not for bringing values up to today's prices.
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { claims, nodes, submissions, teams } from "../db/schema";
import { audit, markAuditedNoop } from "../audit/record";
import { broadcast } from "../ws";
import { ServiceError } from "./errors";
import { getGePriceTable, type GePriceTable } from "./gePriceService";
import { pricer, valuedAsOf } from "./gpValueService";
import { describeSubmissionTarget } from "./scoringService";

type Db = BetterSQLite3Database<typeof schema>;

export interface RepricedClaim {
  itemName: string;
  before: number | null;
  after: number | null;
}

/**
 * Prices every item claim of the submission again at today's prices and rules. A claim that can't be priced right
 * now keeps what it had. Returns the claims whose GP value changed.
 */
export async function repriceSubmission(db: Db, bingoId: string, submissionId: string, table: GePriceTable = getGePriceTable()): Promise<RepricedClaim[]> {
  await table.refreshIfStale();
  if (!table.isLoaded()) throw new ServiceError(503, "Couldn't load Grand Exchange prices from the OSRS Wiki — try again in a minute");

  const changed = db.transaction((tx) => {
    const submission = tx
      .select({ id: submissions.id, teamId: submissions.teamId, bingoId: teams.bingoId })
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
    const price = pricer(tx, table);
    const changes: RepricedClaim[] = [];
    for (const row of rows) {
      if (!row.itemName) continue;
      const after = price.gpValue(row.itemName, row.quantity, valuedAsOf(row));
      if (after === null || after === row.gpValue) continue;
      tx.update(claims).set({ gpValue: after }).where(eq(claims.id, row.id)).run();
      changes.push({ itemName: row.itemName, before: row.gpValue, after });
    }

    if (changes.length === 0) {
      markAuditedNoop();
      return changes;
    }
    const { tileName, taskLabels } = describeSubmissionTarget(tx, bingoId, rows.map((r) => r.nodeId));
    audit(tx, {
      action: "submission.repriced",
      bingoId,
      entity: { type: "submission", id: submissionId, label: tileName },
      teamId: submission.teamId,
      details: { tileName, taskLabels, claims: changes },
    });
    return changes;
  });

  if (changed.length) broadcast({ type: "gp_values_updated", bingoId, payload: {} });
  return changed;
}
