import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { ItemGroup } from "@bingo/shared";
import * as schema from "../db/schema";
import { itemGroupItems, itemGroups } from "../db/schema";
import { ServiceError } from "./errors";
import { audit, diffFields, markAuditedNoop } from "../audit/record";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

export interface ItemGroupInput {
  name: string;
  description?: string | null;
  itemNames: string[];
}

export function getItemGroups(db: Queryable): ItemGroup[] {
  const groups = db.select().from(itemGroups).orderBy(itemGroups.name).all();
  const items = db.select().from(itemGroupItems).all();
  return groups.map((g) => ({ ...g, itemNames: items.filter((i) => i.groupId === g.id).map((i) => i.itemName) }));
}

export function getItemGroup(db: Queryable, id: string): ItemGroup {
  const group = db.select().from(itemGroups).where(eq(itemGroups.id, id)).get();
  if (!group) throw new ServiceError(404, "Item group not found");
  const items = db.select().from(itemGroupItems).where(eq(itemGroupItems.groupId, id)).all();
  return { ...group, itemNames: items.map((i) => i.itemName) };
}

function replaceItems(db: Queryable, groupId: string, itemNames: string[]) {
  db.delete(itemGroupItems).where(eq(itemGroupItems.groupId, groupId)).run();
  for (const itemName of new Set(itemNames.map((n) => n.trim()).filter(Boolean))) {
    db.insert(itemGroupItems).values({ groupId, itemName }).run();
  }
}

export function createItemGroup(db: Db, input: ItemGroupInput): ItemGroup {
  if (db.select().from(itemGroups).where(eq(itemGroups.name, input.name)).get()) {
    throw new ServiceError(409, `An item group named "${input.name}" already exists`);
  }
  return db.transaction((tx) => {
    const group = tx.insert(itemGroups).values({ name: input.name, description: input.description ?? null }).returning().get();
    replaceItems(tx, group.id, input.itemNames);
    const full = getItemGroup(tx, group.id);
    audit(tx, {
      action: "item_group.created",
      bingoId: null,
      entity: { type: "item_group", id: group.id, label: group.name },
      details: { name: group.name, itemCount: full.itemNames.length },
    });
    return full;
  });
}

export function updateItemGroup(db: Db, id: string, input: Partial<ItemGroupInput>): ItemGroup {
  const before = getItemGroup(db, id);
  return db.transaction((tx) => {
    const { itemNames, ...fields } = input;
    if (Object.keys(fields).length) tx.update(itemGroups).set(fields).where(eq(itemGroups.id, id)).run();
    if (itemNames) replaceItems(tx, id, itemNames);
    const after = getItemGroup(tx, id);

    const changes = diffFields(before, after, { only: Object.keys(fields) as (keyof typeof before)[] });
    const beforeSet = new Set(before.itemNames);
    const afterSet = new Set(after.itemNames);
    const added = after.itemNames.filter((n) => !beforeSet.has(n));
    const removed = before.itemNames.filter((n) => !afterSet.has(n));
    if (changes || added.length || removed.length) {
      audit(tx, {
        action: "item_group.updated",
        bingoId: null,
        entity: { type: "item_group", id, label: before.name },
        details: { changes: (changes ?? { before: {}, after: {} }) as never, items: { added, removed } },
      });
    } else {
      markAuditedNoop();
    }
    return after;
  });
}

// No "referenced by a tile requirement" guard: item groups are an
// authoring-time template now (picking one expands into plain ITEM leaves
// with no lasting reference back to the group), so a group is always safe
// to delete — see docs/item-quantity-model.md §6.
export function deleteItemGroup(db: Db, id: string): void {
  db.transaction((tx) => {
    const existing = tx.select().from(itemGroups).where(eq(itemGroups.id, id)).get();
    const items = existing ? tx.select({ itemName: itemGroupItems.itemName }).from(itemGroupItems).where(eq(itemGroupItems.groupId, id)).all() : [];
    tx.delete(itemGroupItems).where(eq(itemGroupItems.groupId, id)).run();
    tx.delete(itemGroups).where(eq(itemGroups.id, id)).run();
    if (existing) {
      audit(tx, {
        action: "item_group.deleted",
        bingoId: null,
        entity: { type: "item_group", id, label: existing.name },
        details: { name: existing.name, itemNames: items.map((i) => i.itemName) },
      });
    } else {
      markAuditedNoop();
    }
  });
}
