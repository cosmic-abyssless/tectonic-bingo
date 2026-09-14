import { eq, inArray, like, or } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { users } from "../db/schema";
import { ServiceError } from "./errors";
import { audit, markAuditedNoop } from "../audit/record";
import { userLabel } from "../audit/describe";

type Db = BetterSQLite3Database<typeof schema>;

// Global search across every registered user — used to pick mods/captains,
// which aren't scoped to "people signed up for this bingo" (that list is a
// Phase 6 concept; a mod can promote anyone who has ever logged in).
export function searchUsers(db: Db, query: string, limit = 20) {
  const q = `%${query}%`;
  return db
    .select()
    .from(users)
    .where(or(like(users.discordUsername, q), like(users.discordGlobalName, q), like(users.discordGuildNick, q)))
    .limit(limit)
    .all();
}

export function getUserById(db: Db, userId: string) {
  return db.select().from(users).where(eq(users.id, userId)).get();
}

// Only id + display columns: this feeds the partner picker, where the full
// user row (isAdmin etc.) has no business going to every player.
export function getUsersByDiscordIds(db: Db, discordIds: string[]) {
  if (discordIds.length === 0) return [];
  return db
    .select({ id: users.id, discordId: users.discordId, discordUsername: users.discordUsername, discordGlobalName: users.discordGlobalName, discordGuildNick: users.discordGuildNick })
    .from(users)
    .where(inArray(users.discordId, discordIds))
    .all();
}

export function setUserAdmin(db: Db, userId: string, isAdmin: boolean) {
  return db.transaction((tx) => {
    const user = tx.select().from(users).where(eq(users.id, userId)).get();
    if (!user) throw new ServiceError(404, "User not found");
    if (user.isAdmin === isAdmin) {
      markAuditedNoop();
      return user;
    }
    const updated = tx.update(users).set({ isAdmin }).where(eq(users.id, userId)).returning().get();
    audit(tx, {
      action: "user.admin_changed",
      bingoId: null,
      entity: { type: "user", id: userId, label: userLabel(user) },
      details: { isAdmin: { before: user.isAdmin, after: isAdmin }, source: "admin_panel" },
    });
    return updated;
  });
}
