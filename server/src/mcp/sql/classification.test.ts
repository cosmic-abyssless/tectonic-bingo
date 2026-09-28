// Every table and column the live database has is classified as allowed or denied for the SQL tool, so a migration
// can't put a new secret in front of it by default.
import { describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "../../db/schema";
import { createTestDb } from "../../testUtils/testDb";
import { isDenied, SQL_TABLES } from "./classification";
import { addSessionStore } from "../../testUtils/mcpSql";

/** Tables and columns the database has that the classification doesn't mention. */
function unclassified(sqlite: Database.Database): string[] {
  const missing: string[] = [];
  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").pluck().all() as string[];
  for (const table of tables) {
    const cls = SQL_TABLES[table];
    if (!cls) {
      missing.push(table);
      continue;
    }
    if (isDenied(cls)) continue;
    for (const column of sqlite.prepare("SELECT name FROM pragma_table_info(?)").pluck().all(table) as string[]) {
      if (!(column in cls.columns)) missing.push(`${table}.${column}`);
    }
  }
  return missing;
}

function liveShapedDb(): Database.Database {
  const { sqlite } = createTestDb();
  addSessionStore(sqlite);
  return sqlite;
}

describe("SQL tool classification", () => {
  it("classifies every table and column of the migrated database and the session store", () => {
    expect(unclassified(liveShapedDb())).toEqual([]);
  });

  it("covers every table and column in the Drizzle schema", () => {
    const missing: string[] = [];
    for (const value of Object.values(schema)) {
      if (!is(value, SQLiteTable)) continue;
      const { name, columns } = getTableConfig(value);
      const cls = SQL_TABLES[name];
      if (!cls) missing.push(name);
      else if (!isDenied(cls)) for (const c of columns) if (!(c.name in cls.columns)) missing.push(`${name}.${c.name}`);
    }
    expect(missing).toEqual([]);
  });

  it("fails on a new table or column that is in neither list", () => {
    const sqlite = liveShapedDb();
    sqlite.exec("CREATE TABLE api_keys (id TEXT, secret TEXT); ALTER TABLE users ADD COLUMN password_hash TEXT");
    expect(unclassified(sqlite).sort()).toEqual(["api_keys", "users.password_hash"]);
  });

  it("lists nothing the database doesn't have", () => {
    const sqlite = liveShapedDb();
    const stale: string[] = [];
    for (const [table, cls] of Object.entries(SQL_TABLES)) {
      const columns = sqlite.prepare("SELECT name FROM pragma_table_info(?)").pluck().all(table) as string[];
      if (columns.length === 0) stale.push(table);
      else if (!isDenied(cls)) for (const c of Object.keys(cls.columns)) if (!columns.includes(c)) stale.push(`${table}.${c}`);
    }
    expect(stale).toEqual([]);
  });

  it("denies the secrets named in #292", () => {
    for (const t of ["sessions", "phone_login_links", "pick_ratings", "oauth_clients", "oauth_codes", "oauth_tokens"]) expect(isDenied(SQL_TABLES[t])).toBe(true);
    for (const t of Object.keys(SQL_TABLES).filter((t) => t.startsWith("oauth_"))) expect(isDenied(SQL_TABLES[t])).toBe(true);
    const bingos = SQL_TABLES.bingos;
    expect(!isDenied(bingos) && isDenied(bingos.columns.wom_group_verification_code)).toBe(true);
    const users = SQL_TABLES.users;
    expect(!isDenied(users) && users.columns.discord_id).toBeTypeOf("string");
  });
});
