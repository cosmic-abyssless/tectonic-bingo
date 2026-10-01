// The server's side of can() (@bingo/shared permissions.ts): what roles a user holds in a Bingo, and turning a refusal
// into the error a route has always answered with.
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { can, type Action, type PermissionBingo, type PermissionDenial, type Role } from "@bingo/shared";
import * as schema from "../db/schema";
import { isPlayerOf } from "./bingoAccess";
import { isBingoMod } from "./bingoService";
import { ServiceError } from "./errors";
import { getLedTeam } from "./teamService";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof schema.bingos.$inferSelect;

/** Roles outside any Bingo: a site admin's, on the Site admin pages. */
export function siteRoles(user: { isAdmin: boolean }): Role[] {
  return user.isAdmin ? ["admin"] : [];
}

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

/** The error a refusal answers with, by why it was refused. Stage and rule fall back to the role's when not given. */
export type Refusals = { role: ServiceError } & { [R in Exclude<PermissionDenial, "role">]?: ServiceError };

/** Throws the matching refusal unless `roles` may take `action` in `bingo`. */
export function assertCan(roles: readonly Role[], bingo: PermissionBingo | null, action: Action, refusals: Refusals): void {
  const permission = can(roles, bingo, action);
  if (!permission.ok) throw refusals[permission.reason] ?? refusals.role;
}
