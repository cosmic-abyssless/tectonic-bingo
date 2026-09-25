// Denormalizers: turn a row/tree into the small, human-readable snapshot
// stored in an audit entry's `details`, so a reader never needs a DB lookup
// against a row that may since have been deleted or changed again.
import { eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { playerName, type GraphNode } from "@bingo/shared";
import { describeValuedAs, type TaskSnapshot } from "@bingo/shared";
import * as schema from "../db/schema";
import { users } from "../db/schema";
import { rsnsInBingo } from "../services/playerNames";

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

/** The RSN when there is one, otherwise the Discord name. */
export function userLabel(user: MinimalUserRow & { rsn?: string | null }): string {
  return playerName(user);
}

/**
 * Best-effort display name for a single userId — a fresh lookup, not a batch; fine for the low-frequency mutation paths audit() runs on.
 * Give the bingo the entry is about and the player is named by the RSN they signed up with there.
 */
export function userLabelById(db: Queryable, userId: string, bingoId?: string | null): string | null {
  const user = db.select(MINIMAL_USER_COLS).from(users).where(eq(users.id, userId)).get();
  if (!user) return null;
  return userLabel({ ...user, rsn: bingoId ? (rsnsInBingo(db, bingoId, [userId]).get(userId) ?? null) : null });
}

export function userLabelsByIds(db: Queryable, userIds: string[], bingoId?: string | null): Map<string, string> {
  if (userIds.length === 0) return new Map();
  const rows = db.select(MINIMAL_USER_COLS).from(users).where(inArray(users.id, userIds)).all();
  const rsns = bingoId ? rsnsInBingo(db, bingoId, userIds) : new Map<string, string>();
  return new Map(rows.map((r) => [r.id, userLabel({ ...r, rsn: rsns.get(r.id) ?? null })]));
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
    ...(node.valuedAs ? { valuedAs: `${describeValuedAs(node.valuedAs)}${node.valuedAs.source ? ` (${node.valuedAs.source})` : ""}` } : {}),
    children: node.children.map(describeTaskNode),
  };
}
