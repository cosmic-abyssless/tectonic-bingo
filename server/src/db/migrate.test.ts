import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { runMigrations } from "./migrate";
import { createTestDb } from "../testUtils/testDb";

const migrationsFolder = path.resolve(__dirname, "../../drizzle");
const journal = JSON.parse(fs.readFileSync(path.join(migrationsFolder, "meta/_journal.json"), "utf8")) as { entries: { tag: string; when: number }[] };

let dir: string;
let sqlite: Database.Database;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "migrate-"));
  sqlite = new Database(path.join(dir, "bingo.db"));
  sqlite.pragma("journal_mode = WAL");
});
afterEach(() => {
  sqlite.close();
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

const tables = (db: Database.Database) =>
  (db.prepare("select name, sql from sqlite_master where type = 'table' and name not like 'sqlite_%' and name != '__drizzle_migrations' order by name").all() as { name: string; sql: string }[]).map((t) => t.name);

describe("runMigrations", () => {
  it("builds the same schema the tests use, from an empty database", () => {
    runMigrations(drizzle(sqlite), migrationsFolder);
    const reference = createTestDb();
    expect(tables(sqlite)).toEqual(tables(reference.sqlite));
    reference.sqlite.close();
  });

  it("records every migration in the journal, once, and is a no-op the second time", () => {
    const db = drizzle(sqlite);
    runMigrations(db, migrationsFolder);
    const applied = () => (sqlite.prepare("select created_at from __drizzle_migrations order by created_at").all() as { created_at: number }[]).map((r) => r.created_at);
    expect(applied()).toEqual(journal.entries.map((e) => e.when));
    runMigrations(db, migrationsFolder);
    expect(applied()).toHaveLength(journal.entries.length);
  });

  it("applies only what a partly migrated database is missing", () => {
    // A database from the previous release: every migration but the newest.
    const older = path.join(dir, "older");
    fs.cpSync(migrationsFolder, older, { recursive: true });
    const trimmed = { ...journal, entries: journal.entries.slice(0, -1) };
    fs.writeFileSync(path.join(older, "meta/_journal.json"), JSON.stringify(trimmed));
    const db = drizzle(sqlite);
    runMigrations(db, older);
    const count = () => (sqlite.prepare("select count(*) n from __drizzle_migrations").get() as { n: number }).n;
    expect(count()).toBe(journal.entries.length - 1);

    runMigrations(db, migrationsFolder);
    expect(count()).toBe(journal.entries.length);
    const newest = journal.entries[journal.entries.length - 1]!;
    expect(sqlite.prepare("select 1 from __drizzle_migrations where created_at = ?").get(newest.when)).toBeTruthy();
  });

  it("keeps existing data when a later migration is applied", () => {
    const db = drizzle(sqlite);
    runMigrations(db, migrationsFolder);
    sqlite.prepare("insert into users (id, discord_id, discord_username, created_at, updated_at) values ('u1', 'd1', 'name', 0, 0)").run();
    runMigrations(db, migrationsFolder);
    expect((sqlite.prepare("select count(*) n from users").get() as { n: number }).n).toBe(1);
  });
});
