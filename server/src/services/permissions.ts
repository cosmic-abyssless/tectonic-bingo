// The server's side of can() (@bingo/shared permissions.ts): what roles a user holds in a Bingo, and turning a refusal
// into the error a route has always answered with.
import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { can, siteRoles, unavailableReason, type Action, type PermissionBingo, type PermissionDenial, type Role } from "@bingo/shared";
import * as schema from "../db/schema";
import { bingoModerators, signups, teamMembers, teams } from "../db/schema";
import { isPlayerOf, playerStandingFrom } from "./bingoAccess";
import { isBingoMod } from "./bingoService";
import { getCutUserIds } from "./draftService";
import { ServiceError } from "./errors";
import { getLedTeam } from "./teamService";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof schema.bingos.$inferSelect;

export { siteRoles };

/**
 * The roles `user` holds in `bingo`: Admin (a site admin), Moderator (a bingo_moderators row), Captain (Captain or
 * co-captain of a Team) and Player (bingoAccess.isPlayerOf). A site admin is an Admin, not also a Moderator: Admin's
 * grants already cover a Moderator's. `isPlayer` is for a caller that has already worked it out.
 */
export function bingoRoles(db: Db, bingo: Bingo, user: { id: string; isAdmin: boolean }, isPlayer = isPlayerOf(db, bingo, user.id)): Role[] {
  const roles = siteRoles(user);
  if (isBingoMod(db, bingo.id, user.id, false)) roles.push("moderator");
  if (getLedTeam(db, bingo.id, user.id)) roles.push("captain");
  if (isPlayer) roles.push("player");
  return roles;
}

/**
 * The roles in `bingo` of everyone who holds one there, as bingoRoles works them out one user at a time but in a few
 * queries, for telling who a write changed them for (middleware/broadcastAccessChanges.ts). Admin is left out: it's a
 * site-wide flag, not the Bingo's. Someone with no role isn't in the map.
 */
export function bingoRolesOfEveryone(db: Db, bingo: Bingo): Map<string, Role[]> {
  const mods = new Set(db.select({ userId: bingoModerators.userId }).from(bingoModerators).where(eq(bingoModerators.bingoId, bingo.id)).all().map((r) => r.userId));
  const members = db
    .select({ userId: teamMembers.userId, isCaptain: teamMembers.isCaptain, isCoCaptain: teamMembers.isCoCaptain })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(teams.bingoId, bingo.id))
    .all();
  const onTeam = new Set(members.map((m) => m.userId));
  const leads = new Set(members.filter((m) => m.isCaptain || m.isCoCaptain).map((m) => m.userId));
  const signedUp = new Set(
    db
      .select({ userId: signups.userId })
      .from(signups)
      .where(and(eq(signups.bingoId, bingo.id), eq(signups.status, "active")))
      .all()
      .map((r) => r.userId),
  );
  let cut: Set<string> | null = null;
  const isCut = (userId: string) => (cut ??= getCutUserIds(db, bingo)).has(userId);

  const everyone = new Map<string, Role[]>();
  for (const userId of new Set([...mods, ...onTeam, ...signedUp])) {
    const roles: Role[] = [];
    if (mods.has(userId)) roles.push("moderator");
    if (leads.has(userId)) roles.push("captain");
    if (playerStandingFrom(bingo.stage, onTeam.has(userId), signedUp.has(userId), () => isCut(userId)).isPlayer) roles.push("player");
    if (roles.length > 0) everyone.set(userId, roles);
  }
  return everyone;
}

/** The users whose roles differ between two bingoRolesOfEveryone answers. */
export function changedRoleHolders(before: ReadonlyMap<string, readonly Role[]>, after: ReadonlyMap<string, readonly Role[]>): string[] {
  const changed: string[] = [];
  for (const userId of new Set([...before.keys(), ...after.keys()])) {
    if ((before.get(userId) ?? []).join() !== (after.get(userId) ?? []).join()) changed.push(userId);
  }
  return changed;
}

/**
 * The error a refusal answers with, by why it was refused. A stage or rule refusal not given is a 400 in the shared
 * words (unavailableReason), the same the client shows on the control; a role refusal is always the route's own.
 */
export type Refusals = { role: ServiceError } & { [R in Exclude<PermissionDenial, "role">]?: ServiceError };

/** The 400 for an Action closed in this Bingo right now, in the words the client shows (unavailableReason). */
export function unavailable(bingo: PermissionBingo, action: Action): ServiceError {
  return new ServiceError(400, unavailableReason(bingo, action));
}

/** Throws the matching refusal unless `roles` may take `action` in `bingo`. */
export function assertCan(roles: readonly Role[], bingo: PermissionBingo | null, action: Action, refusals: Refusals): void {
  const permission = can(roles, bingo, action);
  if (permission.ok) return;
  if (permission.reason === "role" || !bingo) throw refusals.role;
  throw refusals[permission.reason] ?? unavailable(bingo, action);
}
