// Denormalizers: turn a row/tree into the small, human-readable snapshot
// stored in an audit entry's `details`, so a reader never needs a DB lookup
// against a row that may since have been deleted or changed again.
import { eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { GraphNode } from "@bingo/shared";
import type { TaskSnapshot } from "@bingo/shared";
import * as schema from "../db/schema";
import { users } from "../db/schema";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

export type MinimalUserRow = Pick<typeof users.$inferSelect, "id" | "discordUsername" | "discordGlobalName" | "discordGuildNick">;
export const MINIMAL_USER_COLS = {
  id: users.id,
  discordUsername: users.discordUsername,
  discordGlobalName: users.discordGlobalName,
  discordGuildNick: users.discordGuildNick,
};

export function userLabel(user: MinimalUserRow): string {
  return user.discordGuildNick ?? user.discordGlobalName ?? user.discordUsername;
}

/** Best-effort display name for a single userId — a fresh lookup, not a batch; fine for the low-frequency mutation paths audit() runs on. */
export function userLabelById(db: Queryable, userId: string): string | null {
  const user = db.select(MINIMAL_USER_COLS).from(users).where(eq(users.id, userId)).get();
  return user ? userLabel(user) : null;
}

export function userLabelsByIds(db: Queryable, userIds: string[]): Map<string, string> {
  if (userIds.length === 0) return new Map();
  const rows = db.select(MINIMAL_USER_COLS).from(users).where(inArray(users.id, userIds)).all();
  return new Map(rows.map((r) => [r.id, userLabel(r)]));
}

/** Bounded recursive snapshot of a tile/task subtree, for task.created/updated/deleted details. */
export function describeTaskNode(node: GraphNode): TaskSnapshot {
  return {
    kind: node.kind,
    label: node.label,
    points: node.points,
    minCount: node.minCount,
    quantity: node.quantity,
    itemName: node.itemName,
    children: node.children.map(describeTaskNode),
  };
}
