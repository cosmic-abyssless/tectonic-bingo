// GP values of Claims (CONTEXT.md "GP value"): unit price × quantity, fixed when the claim is made and never
// changed after. Prices come from the in-memory GE price table (gePriceService.ts) or a site-wide Piece value, so
// pricing a claim never waits on the wiki. A claim made while the table is cold, or on an item with no price yet,
// is left null and filled in by fillMissingGpValues once there is a price for it. Never used for scoring.
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import type { ValuedAs } from "@bingo/shared";
import { claims, nodes, pieceValueOtherPieces, pieceValues, submissions, teams } from "../db/schema";
import { broadcast } from "../ws";
import { log } from "../log";
import { getGePriceTable, type GePriceTable } from "./gePriceService";
import * as achievementService from "./achievementService";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface Pricer {
  /**
   * GP value of `quantity` of `itemName`, or null when there's no price for it. `valuedAs` is the claimed Task's
   * Valued as (CONTEXT.md), which prices the claim as that item ÷ divisor instead.
   */
  gpValue(itemName: string | null, quantity: number, valuedAs?: ValuedAs | null): number | null;
}

export interface PieceValueRule {
  wholeItemName: string;
  wholeQuantity: number;
  divisor: number;
  otherPieces: { itemName: string; quantity: number }[];
}

/**
 * What one piece is worth at today's prices: (quantity × whole item − other pieces) ÷ divisor. Null when it works out to
 * nothing: the whole item or an other piece has no price right now, or the result is zero or less. Such claims stay
 * without a GP value until it works out again, rather than being frozen at a wrong one.
 */
export function pieceUnitPrice(table: GePriceTable, rule: PieceValueRule): number | null {
  const whole = table.unitPrice(rule.wholeItemName);
  if (whole === null) return null;
  let rest = whole * rule.wholeQuantity;
  for (const other of rule.otherPieces) {
    const price = table.unitPrice(other.itemName);
    if (price === null) return null;
    rest -= price * other.quantity;
  }
  const unit = Math.round(rest / rule.divisor);
  return unit > 0 ? unit : null;
}

/** Every Piece value with its Other pieces, keyed by the piece's name (lowercased). */
export function loadPieceValueRules(db: Db | Tx): Map<string, PieceValueRule & { id: string; pieceItemName: string }> {
  const others = db.select().from(pieceValueOtherPieces).all();
  return new Map(
    db
      .select()
      .from(pieceValues)
      .all()
      .map((p) => [
        p.pieceItemName.trim().toLowerCase(),
        { ...p, otherPieces: others.filter((o) => o.pieceValueId === p.id).map((o) => ({ itemName: o.itemName, quantity: o.quantity })) },
      ]),
  );
}

/** Prices items from the current table and Piece values; a Piece value wins over the piece's own GE price. */
export function pricer(db: Db | Tx, table: GePriceTable = getGePriceTable()): Pricer {
  const pieces = loadPieceValueRules(db);
  const unitPrice = (itemName: string) => {
    const piece = pieces.get(itemName.trim().toLowerCase());
    return piece ? pieceUnitPrice(table, piece) : table.unitPrice(itemName);
  };
  return {
    gpValue(itemName, quantity, valuedAs) {
      if (!itemName) return null;
      const valuedAsPrice = valuedAs ? unitPrice(valuedAs.itemName) : null;
      const unit = valuedAs ? (valuedAsPrice === null ? null : Math.round(valuedAsPrice / valuedAs.divisor)) : unitPrice(itemName);
      return unit === null ? null : unit * quantity;
    },
  };
}

/** A leaf row's Valued as, from its two columns. */
export function valuedAsOf(row: { valuedAsItemName: string | null; valuedAsDivisor: number | null; valuedAsSource?: string | null }): ValuedAs | null {
  return row.valuedAsItemName && row.valuedAsDivisor ? { itemName: row.valuedAsItemName, divisor: row.valuedAsDivisor, source: row.valuedAsSource ?? null } : null;
}

export interface GpValueFillResult {
  bingoIds: string[];
  /** Submissions with at least one claim that just got its first GP value — for Achievements' Big spender (CONTEXT.md). */
  submissionIds: string[];
}

/**
 * Prices every item claim that has no GP value yet, at today's prices. Only ever fills nulls, so a value once set
 * stays what it was when submitted. Returns the bingos and submissions whose claims changed.
 */
export function fillMissingGpValues(db: Db, table: GePriceTable = getGePriceTable()): GpValueFillResult {
  const price = pricer(db, table);
  const rows = db
    .select({
      id: claims.id,
      submissionId: claims.submissionId,
      itemName: claims.itemName,
      quantity: claims.quantity,
      bingoId: teams.bingoId,
      valuedAsItemName: nodes.valuedAsItemName,
      valuedAsDivisor: nodes.valuedAsDivisor,
    })
    .from(claims)
    .innerJoin(submissions, eq(claims.submissionId, submissions.id))
    .innerJoin(teams, eq(submissions.teamId, teams.id))
    .innerJoin(nodes, eq(claims.nodeId, nodes.id))
    .where(and(isNotNull(claims.itemName), isNull(claims.gpValue)))
    .all();
  const bingoIds = new Set<string>();
  const submissionIds = new Set<string>();
  db.transaction((tx) => {
    for (const row of rows) {
      const gpValue = price.gpValue(row.itemName, row.quantity, valuedAsOf(row));
      if (gpValue === null) continue;
      tx.update(claims).set({ gpValue }).where(and(eq(claims.id, row.id), isNull(claims.gpValue))).run();
      bingoIds.add(row.bingoId);
      submissionIds.add(row.submissionId);
    }
  });
  return { bingoIds: [...bingoIds], submissionIds: [...submissionIds] };
}

/** Fills missing GP values, tells the bingos' clients to refetch, and notifies Achievements' Big spender for whichever submissions just got a claim first-priced. */
export function fillMissingGpValuesAndNotify(db: Db, table: GePriceTable = getGePriceTable()): void {
  const { bingoIds, submissionIds } = fillMissingGpValues(db, table);
  if (bingoIds.length) log.info("gp values filled", { bingoIds });
  for (const bingoId of bingoIds) broadcast({ type: "gp_values_updated", bingoId, payload: {} });
  achievementService.recordSubmissionsFirstPriced(db, submissionIds);
}

/**
 * Refreshes the price table if it's due and, when new prices came in, prices whatever claims are still missing a
 * GP value. Called after a submission is made (after the response), and on startup. Never throws.
 */
export async function refreshPricesAndFill(db: Db, table: GePriceTable = getGePriceTable()): Promise<void> {
  if (!(await table.refreshIfStale())) return;
  try {
    fillMissingGpValuesAndNotify(db, table);
  } catch (err) {
    log.warn("gp value fill failed", { err });
  }
}
