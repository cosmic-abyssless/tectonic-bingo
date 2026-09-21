import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "./migrate";
import { knownMigrationCount, verifyDatabase } from "./verify";

const migrationsFolder = path.resolve(__dirname, "../../drizzle");

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-db-"));
  dbPath = path.join(dir, "bingo.db");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

function migratedDatabase(): Database.Database {
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  runMigrations(drizzle(sqlite), migrationsFolder);
  return sqlite;
}

describe("verifyDatabase", () => {
  it("passes a fully migrated database and counts its rows", () => {
    const sqlite = migratedDatabase();
    sqlite.close();

    const report = verifyDatabase(dbPath, migrationsFolder);

    expect(report.problems).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.migrations).toEqual({ applied: knownMigrationCount(migrationsFolder), known: knownMigrationCount(migrationsFolder) });
    expect(report.tables["users"]).toBe(0);
    expect(Object.keys(report.tables).length).toBeGreaterThan(10);
  });

  it("reports how many rows a table holds, so a restore can be compared with what it should contain", () => {
    const sqlite = migratedDatabase();
    sqlite.prepare("create table drill_marker (id integer primary key, note text)").run();
    const insert = sqlite.prepare("insert into drill_marker (note) values (?)");
    for (let i = 0; i < 25; i++) insert.run(`row ${i}`);
    sqlite.close();

    expect(verifyDatabase(dbPath, migrationsFolder).tables["drill_marker"]).toBe(25);
  });

  it("never changes the database file", () => {
    const sqlite = migratedDatabase();
    sqlite.pragma("wal_checkpoint(TRUNCATE)");
    sqlite.close();
    const before = fs.readFileSync(dbPath);

    verifyDatabase(dbPath, migrationsFolder);

    expect(fs.readFileSync(dbPath).equals(before)).toBe(true);
  });

  it("fails a file that isn't there", () => {
    const report = verifyDatabase(path.join(dir, "missing.db"), migrationsFolder);
    expect(report.ok).toBe(false);
    expect(report.problems[0]).toContain("cannot open");
  });

  it("fails a file that isn't a database", () => {
    fs.writeFileSync(dbPath, "this is not a sqlite file, just text that is long enough to have a header".repeat(20));
    const report = verifyDatabase(dbPath, migrationsFolder);
    expect(report.ok).toBe(false);
  });

  it("fails a database with damaged pages", () => {
    const sqlite = migratedDatabase();
    sqlite.pragma("wal_checkpoint(TRUNCATE)");
    sqlite.close();
    const bytes = fs.readFileSync(dbPath);
    // Overwrite a stretch in the middle of the file: the header survives, the pages do not.
    bytes.fill(0xab, bytes.length >> 1, (bytes.length >> 1) + 8192);
    fs.writeFileSync(dbPath, bytes);

    const report = verifyDatabase(dbPath, migrationsFolder);

    expect(report.ok).toBe(false);
    expect(report.problems.length).toBeGreaterThan(0);
  });

  it("fails a database that is missing the app's migration history", () => {
    const sqlite = new Database(dbPath);
    sqlite.prepare("create table something_else (id integer)").run();
    sqlite.close();

    const report = verifyDatabase(dbPath, migrationsFolder);

    expect(report.ok).toBe(false);
    expect(report.problems.join(" ")).toContain("no migration history");
  });

  it("fails a database that is ahead of this build, and only notes one that is behind", () => {
    const sqlite = migratedDatabase();
    sqlite.prepare("insert into __drizzle_migrations (hash, created_at) values ('future', 9999999999999)").run();
    sqlite.close();
    const ahead = verifyDatabase(dbPath, migrationsFolder);
    expect(ahead.ok).toBe(false);
    expect(ahead.problems.join(" ")).toContain("not in this build");

    const reopened = new Database(dbPath);
    reopened.prepare("delete from __drizzle_migrations where hash = 'future'").run();
    // drizzle declares `id` as SERIAL, which SQLite doesn't treat as the row id, so go by rowid.
    reopened.prepare("delete from __drizzle_migrations where rowid = (select max(rowid) from __drizzle_migrations)").run();
    reopened.close();
    const behind = verifyDatabase(dbPath, migrationsFolder);
    expect(behind.ok).toBe(true);
    expect(behind.notes.join(" ")).toContain("1 migration(s) will be applied");
  });

  it("fails a database with the same NUMBER of migrations but different ones, e.g. from another branch", () => {
    const sqlite = migratedDatabase();
    // Same count as this build, but one of the applied migrations is not one it knows.
    sqlite.prepare("update __drizzle_migrations set created_at = 12345 where rowid = (select min(rowid) from __drizzle_migrations)").run();
    sqlite.close();

    const report = verifyDatabase(dbPath, migrationsFolder);

    expect(report.migrations.applied).toBe(report.migrations.known);
    expect(report.ok).toBe(false);
    expect(report.problems.join(" ")).toContain("not in this build");
    expect(report.problems.join(" ")).toContain("would skip it forever");
  });

  it("fails a database missing a migration older than one it has, which drizzle would never apply", () => {
    const sqlite = migratedDatabase();
    sqlite.prepare("delete from __drizzle_migrations where rowid = (select min(rowid) from __drizzle_migrations)").run();
    sqlite.close();

    const report = verifyDatabase(dbPath, migrationsFolder);

    expect(report.ok).toBe(false);
    expect(report.problems.join(" ")).toContain("would skip it forever");
  });

  it("blames the image, not the database, when the migration journal cannot be read", () => {
    migratedDatabase().close();

    const report = verifyDatabase(dbPath, path.join(dir, "no-such-migrations"));

    expect(report.ok).toBe(false);
    expect(report.problems.join(" ")).toContain("the image is at fault, not the database");
    expect(report.problems.join(" ")).not.toContain("could not be read:");
  });
});
