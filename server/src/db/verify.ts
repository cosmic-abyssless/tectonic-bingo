// Checks that a database file is one the app can safely start on. Used by the restore path (deploy/restore.sh) to
// decide whether a backup is real, and by the restore drill: a backup nobody has ever opened proves nothing.

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export interface DatabaseReport {
  ok: boolean;
  /** Anything that makes the database unfit to start on. Empty when `ok`. */
  problems: string[];
  /** Worth knowing but not fatal, e.g. migrations the next start will apply. */
  notes: string[];
  migrations: { applied: number; known: number };
  /** Rows per table, so a restore can be compared with what was expected. */
  tables: Record<string, number>;
}

export interface KnownMigration {
  tag: string;
  /** The journal's timestamp, which drizzle stores as `created_at` when it applies the migration. */
  when: number;
}

/** The migrations this build ships, in order, from drizzle's journal. */
export function knownMigrations(migrationsFolder: string): KnownMigration[] {
  const journal = JSON.parse(fs.readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8")) as { entries: KnownMigration[] };
  return journal.entries.map(({ tag, when }) => ({ tag, when }));
}

/** How many migrations the code ships. */
export function knownMigrationCount(migrationsFolder: string): number {
  return knownMigrations(migrationsFolder).length;
}

// Table names come from sqlite_master, not from a caller, but are quoted anyway.
const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

/**
 * Opens the file read-only and checks it: SQLite's own integrity and foreign-key checks, that its migration history is one
 * this build can continue, and how many rows each table holds.
 *
 * The migration history is compared by what was applied, not by how many: drizzle records each migration's journal
 * timestamp, and applies only migrations newer than the newest one recorded. So a database is unfit if it holds a migration
 * this build doesn't have (it is from a newer version, or another branch), or lacks an old one (drizzle would silently skip
 * it forever). Lacking only migrations newer than everything applied is normal: they run when the app next starts.
 */
export function verifyDatabase(dbPath: string, migrationsFolder: string): DatabaseReport {
  const report: DatabaseReport = { ok: false, problems: [], notes: [], migrations: { applied: 0, known: 0 }, tables: {} };

  let known: KnownMigration[] | undefined;
  try {
    known = knownMigrations(migrationsFolder);
    report.migrations.known = known.length;
  } catch (err) {
    // The build's own files are broken, which says nothing about the database: don't blame it.
    report.problems.push(`cannot read this build's migration journal (${(err as Error).message}): the image is at fault, not the database`);
  }

  let db: Database.Database;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch (err) {
    report.problems.push(`cannot open the database: ${(err as Error).message}`);
    return report;
  }

  try {
    const integrity = db.pragma("integrity_check") as { integrity_check: string }[];
    if (integrity.length !== 1 || integrity[0]!.integrity_check !== "ok") {
      report.problems.push(`integrity_check failed: ${integrity.map((r) => r.integrity_check).slice(0, 5).join("; ")}`);
    }

    const foreignKeyProblems = db.pragma("foreign_key_check") as unknown[];
    if (foreignKeyProblems.length > 0) report.problems.push(`${foreignKeyProblems.length} foreign key violation(s)`);

    const tableNames = (db.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name").all() as { name: string }[]).map((t) => t.name);
    for (const name of tableNames) report.tables[name] = (db.prepare(`select count(*) as n from ${quote(name)}`).get() as { n: number }).n;

    if (!tableNames.includes("__drizzle_migrations")) {
      report.problems.push("no migration history (this is not a database the app created)");
    } else {
      report.migrations.applied = report.tables["__drizzle_migrations"] ?? 0;
      if (known) checkMigrationHistory(db, known, report);
    }
  } catch (err) {
    report.problems.push(`the database could not be read: ${(err as Error).message}`);
  } finally {
    db.close();
  }

  report.ok = report.problems.length === 0;
  return report;
}

function checkMigrationHistory(db: Database.Database, known: KnownMigration[], report: DatabaseReport): void {
  const applied = (db.prepare("select created_at from __drizzle_migrations").all() as { created_at: number | string }[]).map((row) => Number(row.created_at));
  const knownWhen = new Set(known.map((m) => m.when));
  const appliedWhen = new Set(applied);
  const newestApplied = Math.max(0, ...applied);

  const unknown = applied.filter((when) => !knownWhen.has(when));
  if (unknown.length > 0) {
    report.problems.push(`${unknown.length} applied migration(s) are not in this build (dated ${unknown.map((when) => new Date(when).toISOString()).join(", ")}): the database is from a newer version or another branch`);
  }

  const missing = known.filter((m) => !appliedWhen.has(m.when));
  const skipped = missing.filter((m) => m.when <= newestApplied);
  if (skipped.length > 0) {
    report.problems.push(`${skipped.map((m) => m.tag).join(", ")} was never applied, and is dated before a migration that was, so drizzle would skip it forever`);
  }
  const pending = missing.length - skipped.length;
  if (pending > 0) report.notes.push(`${pending} migration(s) will be applied when the app next starts`);
}
