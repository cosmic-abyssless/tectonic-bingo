import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createItemGroup, deleteItemGroup, getItemGroups, updateItemGroup } from "./itemGroupService";
import { ServiceError } from "./errors";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

describe("createItemGroup", () => {
  it("creates a group with its items", () => {
    const group = createItemGroup(db, { name: "Boss jars", itemNames: ["Jar of eyes", "Jar of dirt"] });
    expect(group.itemNames.sort()).toEqual(["Jar of dirt", "Jar of eyes"]);
  });

  it("rejects a duplicate name", () => {
    createItemGroup(db, { name: "Boss jars", itemNames: [] });
    expect(() => createItemGroup(db, { name: "Boss jars", itemNames: [] })).toThrow(ServiceError);
  });
});

describe("updateItemGroup / deleteItemGroup", () => {
  it("replaces items and renames the group", () => {
    const group = createItemGroup(db, { name: "Old", itemNames: ["A"] });
    const updated = updateItemGroup(db, group.id, { name: "New", itemNames: ["B", "C"] });
    expect(updated.name).toBe("New");
    expect(updated.itemNames.sort()).toEqual(["B", "C"]);
  });

  it("removes the group and its items", () => {
    const group = createItemGroup(db, { name: "Gone", itemNames: ["A"] });
    deleteItemGroup(db, group.id);
    expect(getItemGroups(db).some((g) => g.id === group.id)).toBe(false);
  });
});

describe("audit trail", () => {
  it("createItemGroup records item_group.created, site-scoped (bingoId null)", () => {
    const group = createItemGroup(db, { name: "Boss jars", itemNames: ["A", "B"] });
    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "item_group.created")).get()!;
    expect(row.bingoId).toBeNull();
    expect(JSON.parse(row.details)).toEqual({ name: "Boss jars", itemCount: 2 });
    expect(row.entityId).toBe(group.id);
  });

  it("updateItemGroup records item_group.updated with field changes and item deltas", () => {
    const group = createItemGroup(db, { name: "Old", itemNames: ["A", "B"] });
    updateItemGroup(db, group.id, { name: "New", itemNames: ["B", "C"] });

    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "item_group.updated")).get()!;
    const details = JSON.parse(row.details);
    expect(details.changes).toEqual({ before: { name: "Old" }, after: { name: "New" } });
    expect(details.items).toEqual({ added: ["C"], removed: ["A"] });
  });

  it("updateItemGroup no-ops when nothing actually changes", () => {
    const group = createItemGroup(db, { name: "Same", itemNames: ["A"] });
    updateItemGroup(db, group.id, { name: "Same", itemNames: ["A"] });
    expect(db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "item_group.updated")).all()).toHaveLength(0);
  });

  it("deleteItemGroup records item_group.deleted with the item names it held", () => {
    const group = createItemGroup(db, { name: "Gone", itemNames: ["A", "B"] });
    deleteItemGroup(db, group.id);
    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "item_group.deleted")).get()!;
    expect(JSON.parse(row.details).itemNames.sort()).toEqual(["A", "B"]);
  });
});
