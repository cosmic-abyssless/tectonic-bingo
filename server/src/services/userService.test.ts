import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { setUserAdmin } from "./userService";
import { ServiceError } from "./errors";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

describe("setUserAdmin", () => {
  it("grants and revokes admin", () => {
    const [user] = db.insert(schema.users).values({ discordId: "u1", discordUsername: "u1" }).returning().all();
    expect(setUserAdmin(db, user.id, true).isAdmin).toBe(true);
    expect(setUserAdmin(db, user.id, false).isAdmin).toBe(false);
  });

  it("404s for an unknown user", () => {
    expect(() => setUserAdmin(db, "nope", true)).toThrow(ServiceError);
  });
});

describe("audit trail", () => {
  it("records user.admin_changed, site-scoped, with before/after", () => {
    const [user] = db.insert(schema.users).values({ discordId: "u1", discordUsername: "u1" }).returning().all();
    setUserAdmin(db, user.id, true);
    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "user.admin_changed")).get()!;
    expect(row.bingoId).toBeNull();
    expect(JSON.parse(row.details)).toEqual({ isAdmin: { before: false, after: true }, source: "admin_panel" });
  });

  it("no-ops when the value doesn't actually change", () => {
    const [user] = db.insert(schema.users).values({ discordId: "u1", discordUsername: "u1", isAdmin: true }).returning().all();
    setUserAdmin(db, user.id, true);
    expect(db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "user.admin_changed")).all()).toHaveLength(0);
  });
});
