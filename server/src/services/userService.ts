import { and, eq, inArray, isNull, like, or } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { users } from "../db/schema";
import { ServiceError } from "./errors";
import { audit, markAuditedNoop } from "../audit/record";
import { userLabel } from "../audit/describe";
import { withRsn } from "./playerNames";
import { revokeAllForUser } from "../mcp/connections";
import { getAuditContext } from "../audit/context";
import { now } from "../clock";
import { getAdminDiscordIds, isAdminDiscordId } from "../config";
import { playerName } from "@bingo/shared";

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

/** Display columns only — for player-facing responses where the full row (isAdmin etc.) has no business going out. */
export const MINIMAL_USER_COLS = { id: users.id, discordUsername: users.discordUsername, discordGlobalName: users.discordGlobalName, discordGuildNick: users.discordGuildNick };

/**
 * The columns of a PublicUser (shared): select these wherever a response lists someone other than the viewer, then
 * add their `rsn` in the bingo. The full row (isAdmin, inGuild, timestamps) is for the viewer's own record and
 * site-admin user management only.
 */
export const PUBLIC_USER_COLS = {
  id: users.id,
  discordId: users.discordId,
  discordUsername: users.discordUsername,
  discordGlobalName: users.discordGlobalName,
  discordGuildNick: users.discordGuildNick,
  discordAvatar: users.discordAvatar,
};

export function getMinimalUser(db: Db, userId: string) {
  return db.select(MINIMAL_USER_COLS).from(users).where(eq(users.id, userId)).get();
}

// PublicUsers, with their RSN in this bingo: this feeds the partner picker, where
// the full user row (isAdmin etc.) has no business going to every player.
export function getPublicUsersByDiscordIds(db: Db, bingoId: string, discordIds: string[]) {
  if (discordIds.length === 0) return [];
  return withRsn(db, bingoId, db.select(PUBLIC_USER_COLS).from(users).where(inArray(users.discordId, discordIds)).all());
}

export function setUserAdmin(db: Db, userId: string, isAdmin: boolean) {
  return db.transaction((tx) => {
    const user = tx.select().from(users).where(eq(users.id, userId)).get();
    if (!user) throw new ServiceError(404, "User not found");
    // An Owner's site admin comes from ADMIN_DISCORD_IDS, and they'd get it back on their next login anyway.
    if (!isAdmin && isAdminDiscordId(user.discordId)) throw new ServiceError(403, `${userLabel(user)} is an Owner. Remove them from ADMIN_DISCORD_IDS first`);
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
    // Losing the role ends every Claude connection with it (#293); getting it back means connecting again.
    if (!isAdmin) revokeAllForUser(tx, userId, getAuditContext()?.actorUserId ?? null);
    return updated;
  });
}

/**
 * Site admin > Site admins: the Owners (ADMIN_DISCORD_IDS, in its order), with their account if they've ever signed in,
 * then every other site admin by name. Someone taken off ADMIN_DISCORD_IDS shows as a plain site admin from then on.
 */
export function listSiteAdmins(db: Db) {
  const ownerIds = getAdminDiscordIds();
  const ownerAccounts = ownerIds.length ? db.select().from(users).where(inArray(users.discordId, ownerIds)).all() : [];
  const owners = ownerIds.map((discordId) => ({ discordId, user: ownerAccounts.find((u) => u.discordId === discordId) ?? null }));
  const admins = db
    .select()
    .from(users)
    .where(eq(users.isAdmin, true))
    .all()
    .filter((u) => !ownerIds.includes(u.discordId))
    .sort((a, b) => playerName(a).localeCompare(playerName(b), undefined, { sensitivity: "base" }));
  return { owners, admins };
}

// The account finished or skipped the Tutorial (CONTEXT.md). Kept at the first time: seeing it again (on a device
// that hadn't heard yet) changes nothing.
export function markTutorialSeen(db: Db, userId: string) {
  db.update(users).set({ tutorialSeenAt: now() }).where(and(eq(users.id, userId), isNull(users.tutorialSeenAt))).run();
  return getUserById(db, userId);
}
