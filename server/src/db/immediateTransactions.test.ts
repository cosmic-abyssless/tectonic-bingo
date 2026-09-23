import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withImmediateTransactions } from "./immediateTransactions";

// Two real connections to one WAL file, standing in for the app and Litestream (TECTONIC-SERVER-4).
const notes = sqliteTable("notes", { id: text("id").primaryKey(), body: text("body").notNull() });
const schema = { notes };

let dir: string;
let file: string;
let app: Database.Database;
let other: Database.Database;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "immediate-tx-"));
  file = path.join(dir, "test.db");
  app = new Database(file, { timeout: 0 });
  app.pragma("journal_mode = WAL");
  app.exec("CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL)");
  app.exec("INSERT INTO notes VALUES ('a', 'first')");
  other = new Database(file, { timeout: 0 });
});

afterEach(() => {
  app.close();
  other.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** A read, then another connection commits, then a write: the pattern that failed a draft pick. */
function readThenWrite(db: ReturnType<typeof drizzle<typeof schema>>) {
  return db.transaction((tx) => {
    tx.select().from(notes).all();
    try {
      other.exec("INSERT INTO notes VALUES ('from-litestream', 'x')");
    } catch {
      // Under an immediate transaction the other connection can't get in; that's the point.
    }
    tx.insert(notes).values({ id: "b", body: "second" }).run();
  });
}

describe("withImmediateTransactions", () => {
  it("(the failure it fixes) a deferred transaction fails at once if another connection commits between its read and its write", () => {
    const deferred = drizzle(app, { schema });
    expect(() => readThenWrite(deferred)).toThrow(/database is locked/);
  });

  it("takes the write lock at BEGIN, so that interleaving can't happen and the transaction succeeds", () => {
    const immediate = withImmediateTransactions(drizzle(app, { schema }));
    expect(() => readThenWrite(immediate)).not.toThrow();
    expect(app.prepare("SELECT id FROM notes ORDER BY id").pluck().all()).toEqual(["a", "b"]);
  });

  it("still lets a call site choose another behavior", () => {
    const db = withImmediateTransactions(drizzle(app, { schema }));
    expect(() => db.transaction(() => readThenWriteBody(db), { behavior: "deferred" })).toThrow(/database is locked/);
  });
});

function readThenWriteBody(db: ReturnType<typeof drizzle<typeof schema>>) {
  db.select().from(notes).all();
  other.exec("INSERT INTO notes VALUES ('from-litestream-2', 'x')");
  db.insert(notes).values({ id: "c", body: "third" }).run();
}
