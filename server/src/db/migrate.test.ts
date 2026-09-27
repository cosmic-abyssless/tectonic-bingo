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

// Applies every migration before `tag`: a database from before it.
function migrateBefore(db: ReturnType<typeof drizzle>, tag: string) {
  const older = path.join(dir, "older");
  fs.cpSync(migrationsFolder, older, { recursive: true });
  const upTo = journal.entries.findIndex((e) => e.tag === tag);
  fs.writeFileSync(path.join(older, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, upTo) }));
  runMigrations(db, older);
}

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

  it("backfills a frozen copy of the Title settings onto every Bingo already Finished (#221)", () => {
    const db = drizzle(sqlite);
    migrateBefore(db, "0038_bingo_title_settings");
    sqlite.prepare("insert into users (id, discord_id, discord_username, created_at, updated_at) values ('u1', 'd1', 'name', 0, 0)").run();
    const bingo = sqlite.prepare("insert into bingos (id, slug, name, board_rows, board_cols, stage, created_by_user_id) values (?, ?, ?, 1, 1, ?, 'u1')");
    bingo.run("done", "done", "Done", "complete");
    bingo.run("live", "live", "Live", "live");
    const overrides = { minimums: { grinder: 25 }, disabled: ["dry"], luck: { spoonMinLuck: 2 } };
    sqlite.prepare("insert into site_settings (key, value_json, updated_by_user_id, updated_at) values ('titles', ?, 'u1', 0)").run(JSON.stringify(overrides));

    runMigrations(db, migrationsFolder);
    const rows = sqlite.prepare("select bingo_id, settings_json, title_ids_json from bingo_title_settings").all() as { bingo_id: string; settings_json: string; title_ids_json: string }[];
    expect(rows.map((r) => r.bingo_id)).toEqual(["done"]);
    // The defaults and Titles as they were when the migration was written.
    expect(JSON.parse(rows[0]!.settings_json)).toEqual({
      minimums: { on_fire: 10, carry: 1, closer: 1, grinder: 25, butterfingers: 2, sniper: 3, collector: 3, tourist: 3, specialist: 3, hoarder: 10, postman: 2, overachiever: 5 },
      disabled: ["dry"],
      luck: { spoonDecay: 0.5, spoonMinLuck: 2, dryMinLuck: 1, clutchMinLuck: 1 },
    });
    expect(JSON.parse(rows[0]!.title_ids_json)).toEqual(["on_fire", "carry", "closer", "clutch", "grinder", "spoon", "butterfingers", "dry", "sniper", "collector", "tourist", "specialist", "hoarder", "postman", "overachiever"]);
  });

  it("backfills the defaults when no Title settings were ever saved (#221)", () => {
    const db = drizzle(sqlite);
    migrateBefore(db, "0038_bingo_title_settings");
    sqlite.prepare("insert into users (id, discord_id, discord_username, created_at, updated_at) values ('u1', 'd1', 'name', 0, 0)").run();
    sqlite.prepare("insert into bingos (id, slug, name, board_rows, board_cols, stage, created_by_user_id) values ('done', 'done', 'Done', 1, 1, 'complete', 'u1')").run();

    runMigrations(db, migrationsFolder);
    const row = sqlite.prepare("select settings_json from bingo_title_settings").get() as { settings_json: string };
    expect(JSON.parse(row.settings_json)).toMatchObject({ disabled: [], luck: { spoonDecay: 0.5, spoonMinLuck: 1, dryMinLuck: 1, clutchMinLuck: 1 } });
    expect(JSON.parse(row.settings_json).minimums.grinder).toBe(10);
  });
});
