// What the audit log's search (q) matches: the text a row shows, stored on the row as search_text. Rendering needs
// the TypeScript renderer, so it's computed here rather than in SQL: audit() fills it as each row is written, and
// fillAuditSearchText backfills rows written before the column existed. Rewording a label? Clear the column and the
// next startup re-renders it.
import { eq, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { AUDIT_ACTIONS, type AuditAction, type AuditEntry } from "@bingo/shared";
import * as schema from "../db/schema";
import { auditLog } from "../db/schema";
import { toAuditEntries } from "./query";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

const BATCH_SIZE = 500;

/** Lower-cased: the row's title, its sentence, and its Team's name (its subject and actor are in the sentence). */
export function auditSearchText(entry: AuditEntry): string {
  const def = AUDIT_ACTIONS[entry.action as AuditAction] as (typeof AUDIT_ACTIONS)[AuditAction] | undefined;
  return [def?.title, entry.label, entry.team?.name].filter(Boolean).join("\n").toLowerCase();
}

function fillRows(db: Queryable, rows: (typeof auditLog.$inferSelect)[]): void {
  for (const entry of toAuditEntries(db, rows)) {
    db.update(auditLog).set({ searchText: auditSearchText(entry) }).where(eq(auditLog.id, entry.id)).run();
  }
}

/** Fills one just-written row's search_text, inside the writer's transaction. */
export function fillAuditSearchTextFor(db: Queryable, id: number): void {
  fillRows(db, db.select().from(auditLog).where(eq(auditLog.id, id)).all());
}

/** Fills every row whose search_text is null, in batches. Idempotent; returns how many rows it filled. */
export function fillAuditSearchText(db: Db, batchSize = BATCH_SIZE): number {
  let filled = 0;
  for (;;) {
    const rows = db.select().from(auditLog).where(isNull(auditLog.searchText)).limit(batchSize).all();
    if (!rows.length) return filled;
    db.transaction((tx) => fillRows(tx, rows));
    filled += rows.length;
  }
}

