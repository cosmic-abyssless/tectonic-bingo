import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { can, type BingoViewerAccess, type Role } from "@bingo/shared";
import * as schema from "../db/schema";
import { signups } from "../db/schema";
import { getCutUserIds } from "./draftService";
import { bingoRoles } from "./permissions";
import { getUserTeamForBingo, removedFromTeamName } from "./teamService";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof schema.bingos.$inferSelect;

// Who may see a Bingo (CONTEXT.md "Player"). Every route that serves a Bingo's content answers by these, so the rule
// lives in one place rather than in client routing.

function hasActiveSignup(db: Db, bingoId: string, userId: string): boolean {
  return !!db
    .select({ id: signups.id })
    .from(signups)
    .where(and(eq(signups.bingoId, bingoId), eq(signups.userId, userId), eq(signups.status, "active")))
    .get();
}

/**
 * Whether `userId` is a Player of the Bingo: until Board revealed, anyone with an active Signup (except Cut signups
 * once the Draft stage begins); from Board revealed on, anyone on a Team. Someone already on a Team (a Captain, a
 * drafted player) is a Player at every stage. A withdrawn Signup never counts.
 */
export function isPlayerOf(db: Db, bingo: Bingo, userId: string): boolean {
  return playerStanding(db, bingo, userId).isPlayer;
}

function playerStanding(db: Db, bingo: Bingo, userId: string): { isPlayer: boolean; isCut: boolean } {
  if (getUserTeamForBingo(db, bingo.id, userId)) return { isPlayer: true, isCut: false };
  if (!hasActiveSignup(db, bingo.id, userId)) return { isPlayer: false, isCut: false };
  switch (bingo.stage) {
    case "planning":
    case "signup":
    case "captains":
      return { isPlayer: true, isCut: false };
    case "draft": {
      const cut = getCutUserIds(db, bingo).has(userId);
      return { isPlayer: !cut, isCut: cut };
    }
    default:
      // Board revealed on: the Teams are set, so an active Signup that isn't on one was left out of the draft.
      return { isPlayer: false, isCut: true };
  }
}

/**
 * What one viewer may see of a Bingo (view_bingo). Moderators and Admins see every Bingo at every stage. Everyone else
 * needs to be a Player, except that a Finished Bingo is open, read-only, to every clan member (requireGuildMember keeps
 * everyone else out), and a Planning Bingo is for Moderators and Admins only (requireBingo 404s it for anyone else).
 * `roles` are theirs in this Bingo, for whatever else the route asks can().
 */
export function getBingoAccess(db: Db, bingo: Bingo, user: { id: string; isAdmin: boolean }): BingoViewerAccess & { isMod: boolean; roles: Role[] } {
  const { isPlayer, isCut } = playerStanding(db, bingo, user.id);
  const roles = bingoRoles(db, bingo, user, isPlayer);
  const isMod = can(roles, bingo, "moderate_bingo").ok;
  const canSee = can(roles, bingo, "view_bingo").ok;
  // The Cut notice is for someone who can't see the Bingo; at Finished everyone can. So is the note that they were
  // taken off a Team (Remove from Team).
  return { isMod, roles, isPlayer, isCut: isCut && !canSee, canSee, removedFromTeam: canSee ? null : removedFromTeamName(db, bingo.id, user.id) };
}

/** Whether `userId` is in the Bingo at all, for whose player card may be opened: an active Signup, or on a Team. */
export function isPartOfBingo(db: Db, bingoId: string, userId: string): boolean {
  return hasActiveSignup(db, bingoId, userId) || !!getUserTeamForBingo(db, bingoId, userId);
}
