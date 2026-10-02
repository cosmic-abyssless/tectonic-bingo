// Restrictions (CONTEXT.md "Restriction"; docs/adr/0001-permissions.md): one Action, or a wildcard of them, taken from
// one user in one Bingo, with a reason, until it's lifted. Applied and lifted by the Bingo's Admins and Moderators from
// the mod roster; can() reads them (services/permissions.ts restrictionsOf), and both are in the audit log.
import { and, asc, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { isRestrictionTarget, mayRestrict, type PlayerAccess, type RestrictionEntry, type RestrictionTarget, type Role } from "@bingo/shared";
import * as schema from "../db/schema";
import { bingoRestrictions, users } from "../db/schema";
import { now as clockNow } from "../clock";
import { audit } from "../audit/record";
import { userLabelById, userLabelsByIds } from "../audit/describe";
import { ServiceError } from "./errors";
import { bingoRoles, bingoRolesOfEveryone, isOwner } from "./permissions";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof schema.bingos.$inferSelect;
type Actor = { id: string; isAdmin: boolean };

const REASON_MAX = 500;

/** Every Restriction in the Bingo, oldest first: what its Moderators and Admins see on the roster. */
export function getRestrictions(db: Db, bingoId: string): RestrictionEntry[] {
  const rows = db.select().from(bingoRestrictions).where(eq(bingoRestrictions.bingoId, bingoId)).orderBy(asc(bingoRestrictions.appliedAt)).all();
  const labels = userLabelsByIds(db, [...new Set(rows.flatMap((r) => (r.appliedByUserId ? [r.appliedByUserId] : [])))], bingoId);
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    action: r.action as RestrictionTarget,
    reason: r.reason,
    appliedByLabel: r.appliedByUserId ? (labels.get(r.appliedByUserId) ?? null) : null,
    appliedAt: r.appliedAt.toISOString(),
  }));
}

/** Which of `userIds` `actor` may restrict in `bingo` right now (shared mayRestrict), for the roster's Restrict control. */
export function restrictableUserIds(db: Db, bingo: Bingo, actor: Actor, userIds: string[]): Set<string> {
  const actorRoles = bingoRoles(db, bingo, actor);
  const everyone = bingoRolesOfEveryone(db, bingo);
  const admins = new Set(userIds.length === 0 ? [] : db.select({ id: users.id }).from(users).where(and(inArray(users.id, userIds), eq(users.isAdmin, true))).all().map((u) => u.id));
  return new Set(
    userIds.filter((id) => {
      const roles: Role[] = [...(admins.has(id) ? (["admin"] as const) : []), ...(everyone.get(id) ?? [])];
      return roles.length > 0 && mayRestrict(actorRoles, roles);
    }),
  );
}

/** Refuses unless `actor` may restrict `userId` in `bingo` (shared mayRestrict). An Admin may always lift. */
function assertMayRestrict(db: Db, bingo: Bingo, actor: Actor, userId: string, lifting: boolean): void {
  const target = db.select({ id: users.id, isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId)).get();
  if (!target) throw new ServiceError(404, "User not found");
  const targetRoles = bingoRoles(db, bingo, target);
  const actorRoles = bingoRoles(db, bingo, actor);
  if (lifting && actorRoles.includes("admin")) return;
  if (targetRoles.includes("admin")) throw new ServiceError(403, "Admins can't be restricted");
  if (!lifting && targetRoles.length === 0) throw new ServiceError(400, "They're not part of this bingo");
  if (!mayRestrict(actorRoles, targetRoles)) throw new ServiceError(403, "Moderators can only restrict Captains and Players");
}

/** Takes `action` (or a wildcard of them) from `userId` in `bingo`, with a reason. Audited as restriction.applied. */
export function applyRestriction(db: Db, bingo: Bingo, actor: Actor, params: { userId: string; action: unknown; reason: unknown }): RestrictionEntry {
  if (!isRestrictionTarget(params.action)) throw new ServiceError(400, "That can't be restricted: only Actions that do something, and never a Captain's draft pick");
  const action = params.action;
  const reason = typeof params.reason === "string" ? params.reason.trim() : "";
  if (!reason) throw new ServiceError(400, "A Restriction needs a reason");
  if (reason.length > REASON_MAX) throw new ServiceError(400, `Keep the reason under ${REASON_MAX} characters`);
  return db.transaction((tx) => {
    assertMayRestrict(tx, bingo, actor, params.userId, false);
    const existing = tx
      .select({ id: bingoRestrictions.id })
      .from(bingoRestrictions)
      .where(and(eq(bingoRestrictions.bingoId, bingo.id), eq(bingoRestrictions.userId, params.userId), eq(bingoRestrictions.action, action)))
      .get();
    if (existing) throw new ServiceError(409, "They're already restricted from that");
    const row = tx.insert(bingoRestrictions).values({ bingoId: bingo.id, userId: params.userId, action, reason, appliedByUserId: actor.id, appliedAt: clockNow() }).returning().get();
    const displayName = userLabelById(tx, params.userId, bingo.id) ?? "Unknown user";
    audit(tx, {
      action: "restriction.applied",
      bingoId: bingo.id,
      entity: { type: "user", id: params.userId, label: displayName },
      details: { userId: params.userId, displayName, action, reason },
    });
    return {
      id: row.id,
      userId: row.userId,
      action,
      reason,
      appliedByLabel: userLabelById(tx, actor.id, bingo.id),
      appliedAt: row.appliedAt.toISOString(),
    };
  });
}

/** Lifts a Restriction (deletes it: the audit log, restriction.lifted, keeps it). Returns whose it was. */
export function liftRestriction(db: Db, bingo: Bingo, actor: Actor, restrictionId: string): { userId: string } {
  return db.transaction((tx) => {
    const row = tx.select().from(bingoRestrictions).where(and(eq(bingoRestrictions.id, restrictionId), eq(bingoRestrictions.bingoId, bingo.id))).get();
    if (!row) throw new ServiceError(404, "Restriction not found");
    assertMayRestrict(tx, bingo, actor, row.userId, true);
    tx.delete(bingoRestrictions).where(eq(bingoRestrictions.id, row.id)).run();
    const displayName = userLabelById(tx, row.userId, bingo.id) ?? "Unknown user";
    audit(tx, {
      action: "restriction.lifted",
      bingoId: bingo.id,
      entity: { type: "user", id: row.userId, label: displayName },
      details: { userId: row.userId, displayName, action: row.action, reason: row.reason },
    });
    return { userId: row.userId };
  });
}

/**
 * What the player card's Permissions tab shows a Moderator or Admin about `userId` in `bingo`: the roles they hold there
 * (Owner included), their Restrictions, and whether `actor` may apply one or lift theirs (assertMayRestrict's rules).
 */
export function playerAccess(db: Db, bingo: Bingo, actor: Actor, userId: string): PlayerAccess {
  const target = db.select({ id: users.id, isAdmin: users.isAdmin, discordId: users.discordId }).from(users).where(eq(users.id, userId)).get();
  if (!target) throw new ServiceError(404, "User not found");
  const roles = bingoRoles(db, bingo, target);
  if (isOwner(target)) roles.splice(roles.indexOf("admin") + 1, 0, "owner");
  const actorRoles = bingoRoles(db, bingo, actor);
  const restrictable = roles.length > 0 && mayRestrict(actorRoles, roles);
  return {
    roles,
    restrictions: getRestrictions(db, bingo.id).filter((r) => r.userId === userId),
    restrictable,
    liftable: restrictable || actorRoles.includes("admin"),
  };
}
