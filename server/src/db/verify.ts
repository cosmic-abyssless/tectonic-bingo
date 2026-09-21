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

/** How many migrations the code ships, from drizzle's journal. */
export function knownMigrationCount(migrationsFolder: string): number {
  const journal = JSON.parse(fs.readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8")) as { entries: unknown[] };
  return journal.entries.length;
}

// Table names come from sqlite_master, not from a caller, but are quoted anyway.
const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

/**
 * Opens the file read-only and checks it: SQLite's own integrity and foreign-key checks, that the migration history is
 * one this code can continue (never *ahead* of it: an old build must not start on a newer database), and how many rows
 * each table holds.
 */
export function verifyDatabase(dbPath: string, migrationsFolder: string): DatabaseReport {
  const report: DatabaseReport = { ok: false, problems: [], notes: [], migrations: { applied: 0, known: 0 }, tables: {} };

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

    report.migrations.known = knownMigrationCount(migrationsFolder);
    if (!tableNames.includes("__drizzle_migrations")) {
      report.problems.push("no migration history (this is not a database the app created)");
    } else {
      report.migrations.applied = report.tables["__drizzle_migrations"] ?? 0;
      if (report.migrations.applied > report.migrations.known) {
        report.problems.push(`the database has ${report.migrations.applied} migrations but this build only knows ${report.migrations.known}: it is from a newer version`);
      } else if (report.migrations.applied < report.migrations.known) {
        report.notes.push(`${report.migrations.known - report.migrations.applied} migration(s) will be applied when the app next starts`);
      }
    }
  } catch (err) {
    report.problems.push(`the database could not be read: ${(err as Error).message}`);
  } finally {
    db.close();
  }

  report.ok = report.problems.length === 0;
  return report;
}
