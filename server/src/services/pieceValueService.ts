// Site-wide Piece values (CONTEXT.md): an item piece priced as (its whole item − the whole item's Other pieces) ÷ N.
// Adding or changing one prices the claims that have no GP value yet (fillMissingGpValues); values already set stay
// as they were when submitted.
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { PieceValue, UnvaluedItem } from "@bingo/shared";
import * as schema from "../db/schema";
import { claims, pieceValueOtherPieces, pieceValues, unvaluedItemDismissals } from "../db/schema";
import { now } from "../clock";
import { ServiceError } from "./errors";
import { audit, markAuditedNoop } from "../audit/record";
import { getGePriceTable, type GePriceTable } from "./gePriceService";
import { fillMissingGpValuesAndNotify, loadPieceValueRules, pieceUnitPrice } from "./gpValueService";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface OtherPiece {
  itemName: string;
  quantity: number;
}

export interface PieceValueInput {
  pieceItemName: string;
  wholeItemName: string;
  /** How many of the whole item (Dizana's quiver is 4000× Sunfire splinters). Defaults to 1. */
  wholeQuantity: number;
  divisor: number;
  otherPieces: OtherPiece[];
}

const key = (name: string) => name.trim().toLowerCase();

export function getPieceValues(db: Db | Tx, table: GePriceTable = getGePriceTable()): PieceValue[] {
  return [...loadPieceValueRules(db).values()]
    .map((rule) => ({
      id: rule.id,
      pieceItemName: rule.pieceItemName,
      wholeItemName: rule.wholeItemName,
      wholeQuantity: rule.wholeQuantity,
      divisor: rule.divisor,
      otherPieces: rule.otherPieces,
      unitPrice: pieceUnitPrice(table, rule),
    }))
    .sort((a, b) => a.pieceItemName.localeCompare(b.pieceItemName));
}

function getPieceValue(db: Db | Tx, id: string, table: GePriceTable): PieceValue {
  const pieceValue = getPieceValues(db, table).find((p) => p.id === id);
  if (!pieceValue) throw new ServiceError(404, "Piece value not found");
  return pieceValue;
}

/** The GE list has to be loaded to check items are tradeable; loads it if it isn't yet. */
async function loadedTable(table: GePriceTable): Promise<GePriceTable> {
  if (!table.isLoaded()) await table.refreshIfStale();
  if (!table.isLoaded()) throw new ServiceError(503, "Couldn't load Grand Exchange prices from the OSRS Wiki — try again in a minute");
  return table;
}

function validOtherPieces(raw: unknown): OtherPiece[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new ServiceError(400, "otherPieces must be a list");
  const byName = new Map<string, OtherPiece>();
  for (const entry of raw as Partial<OtherPiece>[]) {
    const itemName = typeof entry?.itemName === "string" ? entry.itemName.trim() : "";
    const quantity = entry?.quantity;
    if (!itemName) throw new ServiceError(400, "Every other piece needs an item name");
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) throw new ServiceError(400, `The quantity of "${itemName}" must be a whole number of at least 1`);
    if (byName.has(key(itemName))) throw new ServiceError(400, `"${itemName}" is listed twice as an other piece`);
    byName.set(key(itemName), { itemName, quantity });
  }
  return [...byName.values()];
}

// No chains: the whole item and every other piece are GE-priced items that aren't themselves pieces, and a piece
// can't be the whole item or an other piece of another Piece value.
function validate(db: Db, table: GePriceTable, input: Partial<PieceValueInput>, excludeId: string | null): PieceValueInput {
  const pieceItemName = input.pieceItemName?.trim();
  const wholeItemName = input.wholeItemName?.trim();
  const divisor = input.divisor;
  const wholeQuantity = input.wholeQuantity ?? 1;
  if (!pieceItemName || !wholeItemName) throw new ServiceError(400, "pieceItemName and wholeItemName are required");
  if (typeof divisor !== "number" || !Number.isInteger(divisor) || divisor < 1) throw new ServiceError(400, "divisor must be a whole number of at least 1");
  if (typeof wholeQuantity !== "number" || !Number.isInteger(wholeQuantity) || wholeQuantity < 1) throw new ServiceError(400, "wholeQuantity must be a whole number of at least 1");
  const otherPieces = validOtherPieces(input.otherPieces);

  const priced = [wholeItemName, ...otherPieces.map((o) => o.itemName)];
  if (priced.some((name) => key(name) === key(pieceItemName))) throw new ServiceError(400, "A piece can't be valued by itself");
  if (otherPieces.some((o) => key(o.itemName) === key(wholeItemName))) throw new ServiceError(400, "The whole item can't also be one of its other pieces");
  for (const name of priced) {
    if (!table.isKnownItem(name)) throw new ServiceError(400, `"${name}" has no Grand Exchange price`);
  }

  const others = [...loadPieceValueRules(db).values()].filter((p) => p.id !== excludeId);
  if (others.some((p) => key(p.pieceItemName) === key(pieceItemName))) throw new ServiceError(409, `"${pieceItemName}" already has a piece value`);
  for (const name of priced) {
    if (others.some((p) => key(p.pieceItemName) === key(name))) throw new ServiceError(400, `"${name}" is itself a piece, so it can't be used to value another`);
  }
  const usedBy = others.find((p) => [p.wholeItemName, ...p.otherPieces.map((o) => o.itemName)].some((name) => key(name) === key(pieceItemName)));
  if (usedBy) throw new ServiceError(400, `"${pieceItemName}" is used to value ${usedBy.pieceItemName}, so it can't be a piece`);
  return { pieceItemName, wholeItemName, wholeQuantity, divisor, otherPieces };
}

function writeOtherPieces(tx: Tx, pieceValueId: string, otherPieces: OtherPiece[]) {
  tx.delete(pieceValueOtherPieces).where(eq(pieceValueOtherPieces.pieceValueId, pieceValueId)).run();
  for (const other of otherPieces) tx.insert(pieceValueOtherPieces).values({ pieceValueId, ...other }).run();
}

/** "3× Chromium ingot", as the audit log shows other pieces. */
const describeOtherPieces = (otherPieces: OtherPiece[]) => otherPieces.map((o) => `${o.quantity > 1 ? `${o.quantity}× ` : ""}${o.itemName}`);

export async function createPieceValue(db: Db, input: Partial<PieceValueInput>, createdByUserId: string, table: GePriceTable = getGePriceTable()): Promise<PieceValue> {
  const { otherPieces, ...valid } = validate(db, await loadedTable(table), input, null);
  const id = db.transaction((tx) => {
    const created = tx.insert(pieceValues).values({ ...valid, createdByUserId }).returning().get();
    writeOtherPieces(tx, created.id, otherPieces);
    audit(tx, {
      action: "piece_value.created",
      bingoId: null,
      entity: { type: "piece_value", id: created.id, label: created.pieceItemName },
      details: { ...valid, otherPieces: describeOtherPieces(otherPieces) },
    });
    return created.id;
  });
  fillMissingGpValuesAndNotify(db, table);
  return getPieceValue(db, id, table);
}

export async function updatePieceValue(db: Db, id: string, input: Partial<PieceValueInput>, table: GePriceTable = getGePriceTable()): Promise<PieceValue> {
  const before = getPieceValue(db, id, table);
  const { otherPieces, ...valid } = validate(db, await loadedTable(table), { ...before, ...input }, id);
  db.transaction((tx) => {
    tx.update(pieceValues).set({ ...valid, updatedAt: now() }).where(eq(pieceValues.id, id)).run();
    writeOtherPieces(tx, id, otherPieces);
    const beforeFields = { ...before, otherPieces: describeOtherPieces(before.otherPieces) };
    const afterFields = { ...valid, otherPieces: describeOtherPieces(otherPieces) };
    const changed = (Object.keys(afterFields) as (keyof typeof afterFields)[]).filter((k) => JSON.stringify(beforeFields[k]) !== JSON.stringify(afterFields[k]));
    if (changed.length) {
      audit(tx, {
        action: "piece_value.updated",
        bingoId: null,
        entity: { type: "piece_value", id, label: valid.pieceItemName },
        details: {
          changes: {
            before: Object.fromEntries(changed.map((k) => [k, beforeFields[k]])),
            after: Object.fromEntries(changed.map((k) => [k, afterFields[k]])),
          },
        },
      });
    } else {
      markAuditedNoop();
    }
  });
  fillMissingGpValuesAndNotify(db, table);
  return getPieceValue(db, id, table);
}

/** Claims already valued by it keep their GP value; only future claims lose the rule. Its other pieces go with it. */
export function deletePieceValue(db: Db, id: string): void {
  db.transaction((tx) => {
    const existing = tx.select().from(pieceValues).where(eq(pieceValues.id, id)).get();
    if (!existing) {
      markAuditedNoop();
      return;
    }
    const otherPieces = tx.select().from(pieceValueOtherPieces).where(eq(pieceValueOtherPieces.pieceValueId, id)).all();
    tx.delete(pieceValues).where(eq(pieceValues.id, id)).run();
    audit(tx, {
      action: "piece_value.deleted",
      bingoId: null,
      entity: { type: "piece_value", id, label: existing.pieceItemName },
      details: { pieceItemName: existing.pieceItemName, wholeItemName: existing.wholeItemName, wholeQuantity: existing.wholeQuantity, divisor: existing.divisor, otherPieces: describeOtherPieces(otherPieces) },
    });
  });
}

/**
 * Item names of claims that have no GP value, most claimed first, with the dismissed ones marked. Items that already
 * have a Piece value are left out: their claims are priced on the next fill, or their rule shows why it can't be.
 */
export function getUnvaluedItems(db: Db): UnvaluedItem[] {
  const valued = new Set(loadPieceValueRules(db).keys());
  const dismissed = new Set(
    db
      .select({ itemName: unvaluedItemDismissals.itemName })
      .from(unvaluedItemDismissals)
      .all()
      .map((d) => key(d.itemName)),
  );
  const rows = db
    .select({ itemName: sql<string>`min(${claims.itemName})`, claimCount: sql<number>`count(*)` })
    .from(claims)
    .where(and(isNotNull(claims.itemName), isNull(claims.gpValue)))
    .groupBy(sql`lower(${claims.itemName})`)
    .all();
  return rows
    .filter((r) => !valued.has(key(r.itemName)))
    .map((r) => ({ itemName: r.itemName, claimCount: r.claimCount, dismissed: dismissed.has(key(r.itemName)) })).sort((a, b) => b.claimCount - a.claimCount || a.itemName.localeCompare(b.itemName));
}

export function setUnvaluedItemDismissed(db: Db, itemName: string | undefined, dismissed: boolean, userId: string): void {
  const name = itemName?.trim();
  if (!name) throw new ServiceError(400, "itemName is required");
  db.transaction((tx) => {
    const existing = tx
      .select()
      .from(unvaluedItemDismissals)
      .all()
      .find((d) => key(d.itemName) === key(name));
    if (dismissed === !!existing) {
      markAuditedNoop();
      return;
    }
    if (dismissed) tx.insert(unvaluedItemDismissals).values({ itemName: name, dismissedByUserId: userId }).run();
    else tx.delete(unvaluedItemDismissals).where(eq(unvaluedItemDismissals.itemName, existing!.itemName)).run();
    audit(tx, {
      action: dismissed ? "piece_value.item_dismissed" : "piece_value.item_restored",
      bingoId: null,
      entity: { type: "piece_value", id: null, label: name },
      details: { itemName: name },
    });
  });
}
