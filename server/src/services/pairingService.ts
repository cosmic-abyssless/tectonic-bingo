import { now as clockNow } from "../clock";
import { and, eq, inArray, or } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { signupPairings, signups, teamMembers, teams, users } from "../db/schema";
import { ServiceError } from "./errors";
import { audit, markAuditedNoop } from "../audit/record";
import { userLabel, userLabelById } from "../audit/describe";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof schema.bingos.$inferSelect;
type Pairing = typeof schema.signupPairings.$inferSelect;
type MinimalUser = Pick<typeof users.$inferSelect, "id" | "discordId" | "discordUsername" | "discordGlobalName" | "discordGuildNick"> & { rsn?: string | null };
const MINIMAL_USER_COLS = {
  id: users.id,
  discordId: users.discordId,
  discordUsername: users.discordUsername,
  discordGlobalName: users.discordGlobalName,
  discordGuildNick: users.discordGuildNick,
};

// Who a pairing involves. The requester is always a user row; the target is
// a Discord id that may or may not have a user row yet.
interface Participant {
  id: string;
  discordId: string;
}

function assertDuoSignupOpen(bingo: Bingo): void {
  if (bingo.signupMode !== "duo") throw new ServiceError(400, "This bingo doesn't use duo signups");
  if (bingo.stage !== "signup") {
    throw new ServiceError(400, `Pairings can only change during the signup stage (current stage: ${bingo.stage})`);
  }
}

function involves(p: Participant) {
  return or(eq(signupPairings.requesterUserId, p.id), eq(signupPairings.targetDiscordId, p.discordId));
}

function pairingsFor(db: Db, bingoId: string, p: Participant) {
  return db
    .select()
    .from(signupPairings)
    .where(and(eq(signupPairings.bingoId, bingoId), involves(p)))
    .orderBy(signupPairings.createdAt)
    .all();
}

function hasActiveSignup(db: Db, bingoId: string, userId: string): boolean {
  return !!db
    .select({ id: signups.id })
    .from(signups)
    .where(and(eq(signups.bingoId, bingoId), eq(signups.userId, userId), eq(signups.status, "active")))
    .get();
}

// Captains can be assigned during signups; once someone leads a team their
// pairing is fixed (their co-captain), so they can't pair or be paired.
function assertNotOnATeam(db: Db, bingoId: string, userId: string, message: string): void {
  const onTeam = db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(and(eq(teams.bingoId, bingoId), eq(teamMembers.userId, userId)))
    .get();
  if (onTeam) throw new ServiceError(409, message);
}

function userByDiscordId(db: Db, discordId: string): MinimalUser | null {
  return db.select(MINIMAL_USER_COLS).from(users).where(eq(users.discordId, discordId)).get() ?? null;
}

function userById(db: Db, id: string): MinimalUser | null {
  return db.select(MINIMAL_USER_COLS).from(users).where(eq(users.id, id)).get() ?? null;
}

// The RSN a user signed up with, once they have. Lets the client show
// "Discord name (rsn)" instead of whatever the clan roster lists.
function signupRsn(db: Db, bingoId: string, user: MinimalUser | null): string | null {
  if (!user) return null;
  return (
    db
      .select({ rsn: signups.rsn })
      .from(signups)
      .where(and(eq(signups.bingoId, bingoId), eq(signups.userId, user.id), eq(signups.status, "active")))
      .get()?.rsn ?? null
  );
}

// The other half of a pairing from `me`'s point of view.
function otherParty(db: Db, pairing: Pairing, me: Participant): MinimalUser | null {
  return pairing.requesterUserId === me.id ? userByDiscordId(db, pairing.targetDiscordId) : userById(db, pairing.requesterUserId);
}

export function getAcceptedPairing(db: Db, bingoId: string, p: Participant): Pairing | null {
  return (
    db
      .select()
      .from(signupPairings)
      .where(and(eq(signupPairings.bingoId, bingoId), eq(signupPairings.status, "accepted"), involves(p)))
      .get() ?? null
  );
}

// Every accepted pair in the bingo, resolved to user ids. Feeds the draft
// pool (pairs are drafted together) and the mod roster.
export function getAcceptedPairs(db: Db, bingoId: string): { pairing: Pairing; userIds: [string, string] }[] {
  const rows = db
    .select({ pairing: signupPairings, targetUserId: users.id })
    .from(signupPairings)
    .innerJoin(users, eq(users.discordId, signupPairings.targetDiscordId))
    .where(and(eq(signupPairings.bingoId, bingoId), eq(signupPairings.status, "accepted")))
    .all();
  return rows.map((r) => ({ pairing: r.pairing, userIds: [r.pairing.requesterUserId, r.targetUserId] }));
}

// Everything the signup page needs to render the player's pairing situation.
export function getPairingState(db: Db, bingoId: string, me: Participant) {
  const rows = pairingsFor(db, bingoId, me);
  const accepted = rows.find((p) => p.status === "accepted") ?? null;
  const outgoing = rows.find((p) => p.status === "pending" && p.requesterUserId === me.id) ?? null;
  const incoming = rows.filter((p) => p.status === "pending" && p.targetDiscordId === me.discordId);

  const party = (user: MinimalUser | null) => {
    const rsn = signupRsn(db, bingoId, user);
    return { user: user ? { ...user, rsn } : null, rsn };
  };

  // Only worth mentioning while the player is unpaired, and only for endings
  // they didn't choose themselves.
  let lastOutcome: { status: "declined" | "dissolved"; other: ReturnType<typeof party> } | null = null;
  if (!accepted) {
    const last = rows.at(-1);
    if (last && ((last.status === "declined" && last.requesterUserId === me.id) || last.status === "dissolved")) {
      lastOutcome = { status: last.status, other: party(otherParty(db, last, me)) };
    }
  }

  return {
    partner: accepted ? { pairing: accepted, ...party(otherParty(db, accepted, me)) } : null,
    outgoing: outgoing ? { pairing: outgoing, target: party(userByDiscordId(db, outgoing.targetDiscordId)) } : null,
    incoming: incoming.map((pairing) => ({ pairing, requester: party(userById(db, pairing.requesterUserId)) })),
    lastOutcome,
  };
}

function closePending(db: Db, bingoId: string, p: Participant, status: "declined" | "cancelled" | "dissolved", except?: string) {
  const pending = db
    .select({ id: signupPairings.id, requesterUserId: signupPairings.requesterUserId })
    .from(signupPairings)
    .where(and(eq(signupPairings.bingoId, bingoId), eq(signupPairings.status, "pending"), involves(p)))
    .all()
    .filter((row) => row.id !== except);
  if (pending.length === 0) return;
  // A player's own outgoing request is cancelled, requests made to them are
  // answered with whatever `status` the caller decided.
  const own = pending.filter((row) => row.requesterUserId === p.id).map((row) => row.id);
  const others = pending.filter((row) => row.requesterUserId !== p.id).map((row) => row.id);
  const now = clockNow();
  if (own.length) db.update(signupPairings).set({ status: "cancelled", respondedAt: now }).where(inArray(signupPairings.id, own)).run();
  if (others.length) db.update(signupPairings).set({ status, respondedAt: now }).where(inArray(signupPairings.id, others)).run();
}

function accept(db: Db, pairing: Pairing, target: Participant): Pairing {
  const requester = userById(db, pairing.requesterUserId)!;
  const now = clockNow();
  const accepted = db
    .update(signupPairings)
    .set({ status: "accepted", respondedAt: now })
    .where(eq(signupPairings.id, pairing.id))
    .returning()
    .get();
  // Both halves are spoken for now: drop everything else either had open.
  closePending(db, pairing.bingoId, target, "declined", pairing.id);
  closePending(db, pairing.bingoId, requester, "declined", pairing.id);
  audit(db, {
    action: "pairing.accepted",
    bingoId: pairing.bingoId,
    entity: { type: "pairing", id: pairing.id },
    details: { requesterUserId: pairing.requesterUserId, targetDiscordId: pairing.targetDiscordId, partnerUserId: target.id || null },
  });
  return accepted;
}

export interface RequestPairingParams {
  requester: Participant;
  targetDiscordId: string;
}

// A player asks a clan member to be their duo. Mutual requests pair
// immediately; otherwise the request waits until the target answers.
export function requestPairing(db: Db, bingo: Bingo, params: RequestPairingParams): Pairing {
  assertDuoSignupOpen(bingo);
  const { requester, targetDiscordId } = params;
  if (targetDiscordId === requester.discordId) throw new ServiceError(400, "You can't pair with yourself");

  return db.transaction((tx) => {
    if (!hasActiveSignup(tx, bingo.id, requester.id)) throw new ServiceError(400, "Sign up before requesting a partner");
    if (getAcceptedPairing(tx, bingo.id, requester)) throw new ServiceError(409, "You already have a partner");
    assertNotOnATeam(tx, bingo.id, requester.id, "You're already on a team");

    const state = getPairingState(tx, bingo.id, requester);
    if (state.outgoing) throw new ServiceError(409, "Cancel your current request before making another");

    const targetUser = userByDiscordId(tx, targetDiscordId);
    const target: Participant = { id: targetUser?.id ?? "", discordId: targetDiscordId };
    if (getAcceptedPairing(tx, bingo.id, target)) throw new ServiceError(409, "That player already has a partner");
    if (targetUser) assertNotOnATeam(tx, bingo.id, targetUser.id, "That player is already on a team");

    const mutual = state.incoming.find((r) => r.pairing.requesterUserId === targetUser?.id);
    if (mutual) return accept(tx, mutual.pairing, requester);

    const pairing = tx
      .insert(signupPairings)
      .values({ bingoId: bingo.id, requesterUserId: requester.id, targetDiscordId, createdByUserId: requester.id, createdAt: clockNow() })
      .returning()
      .get();
    audit(tx, {
      action: "pairing.requested",
      bingoId: bingo.id,
      entity: { type: "pairing", id: pairing.id },
      details: { requesterUserId: requester.id, targetDiscordId },
    });
    return pairing;
  });
}

export function cancelRequest(db: Db, bingo: Bingo, requester: Participant, pairingId: string): void {
  assertDuoSignupOpen(bingo);
  db.transaction((tx) => {
    const pairing = tx.select().from(signupPairings).where(eq(signupPairings.id, pairingId)).get();
    if (!pairing || pairing.bingoId !== bingo.id || pairing.requesterUserId !== requester.id) throw new ServiceError(404, "Request not found");
    if (pairing.status !== "pending") throw new ServiceError(400, "That request has already been answered");
    tx.update(signupPairings).set({ status: "cancelled", respondedAt: clockNow() }).where(eq(signupPairings.id, pairingId)).run();
    audit(tx, {
      action: "pairing.cancelled",
      bingoId: bingo.id,
      entity: { type: "pairing", id: pairingId },
      details: { requesterUserId: requester.id, targetDiscordId: pairing.targetDiscordId },
    });
  });
}

export function respondToRequest(db: Db, bingo: Bingo, target: Participant, pairingId: string, accepted: boolean): Pairing {
  assertDuoSignupOpen(bingo);
  return db.transaction((tx) => {
    const pairing = tx.select().from(signupPairings).where(eq(signupPairings.id, pairingId)).get();
    if (!pairing || pairing.bingoId !== bingo.id || pairing.targetDiscordId !== target.discordId) throw new ServiceError(404, "Request not found");
    if (pairing.status !== "pending") throw new ServiceError(400, "That request has already been answered");
    if (!accepted) {
      const declined = tx.update(signupPairings).set({ status: "declined", respondedAt: clockNow() }).where(eq(signupPairings.id, pairingId)).returning().get();
      audit(tx, {
        action: "pairing.declined",
        bingoId: bingo.id,
        entity: { type: "pairing", id: pairingId },
        details: { requesterUserId: pairing.requesterUserId, targetDiscordId: pairing.targetDiscordId },
      });
      return declined;
    }
    if (!hasActiveSignup(tx, bingo.id, target.id)) throw new ServiceError(400, "Sign up before accepting a partner");
    if (getAcceptedPairing(tx, bingo.id, target)) throw new ServiceError(409, "You already have a partner");
    assertNotOnATeam(tx, bingo.id, target.id, "You're already on a team");
    if (!hasActiveSignup(tx, bingo.id, pairing.requesterUserId)) throw new ServiceError(409, "That player has withdrawn their signup");
    assertNotOnATeam(tx, bingo.id, pairing.requesterUserId, "That player is already on a team");
    return accept(tx, pairing, target);
  });
}

export interface AdminPairParams {
  userIdA: string;
  userIdB: string;
  createdByUserId: string;
}

// Mods pair two unpaired signups by hand; no consent step.
export function adminPair(db: Db, bingo: Bingo, params: AdminPairParams): Pairing {
  assertDuoSignupOpen(bingo);
  if (params.userIdA === params.userIdB) throw new ServiceError(400, "Pick two different players");
  return db.transaction((tx) => {
    const a = userById(tx, params.userIdA);
    const b = userById(tx, params.userIdB);
    if (!a || !b) throw new ServiceError(404, "User not found");
    for (const p of [a, b]) {
      if (!hasActiveSignup(tx, bingo.id, p.id)) throw new ServiceError(400, "Both players need an active signup");
      if (getAcceptedPairing(tx, bingo.id, p)) throw new ServiceError(409, "One of those players already has a partner");
      assertNotOnATeam(tx, bingo.id, p.id, "One of those players is already on a team");
      closePending(tx, bingo.id, p, "declined");
    }
    const pairing = tx
      .insert(signupPairings)
      .values({
        bingoId: bingo.id,
        requesterUserId: a.id,
        targetDiscordId: b.discordId,
        status: "accepted",
        createdByUserId: params.createdByUserId,
        respondedAt: clockNow(),
        createdAt: clockNow(),
      })
      .returning()
      .get();
    audit(tx, {
      action: "pairing.admin_paired",
      bingoId: bingo.id,
      entity: { type: "pairing", id: pairing.id, label: `${userLabelById(tx, a.id, bingo.id) ?? userLabel(a)} & ${userLabelById(tx, b.id, bingo.id) ?? userLabel(b)}` },
      details: { userIds: [a.id, b.id], displayNames: [userLabelById(tx, a.id, bingo.id) ?? userLabel(a), userLabelById(tx, b.id, bingo.id) ?? userLabel(b)] },
      actor: { userId: params.createdByUserId },
    });
    return pairing;
  });
}

// Mods split an accepted pair; both players go back to picking.
export function unpair(db: Db, bingo: Bingo, pairingId: string): void {
  assertDuoSignupOpen(bingo);
  db.transaction((tx) => {
    const pairing = tx.select().from(signupPairings).where(eq(signupPairings.id, pairingId)).get();
    if (!pairing || pairing.bingoId !== bingo.id) throw new ServiceError(404, "Pairing not found");
    if (pairing.status !== "accepted") throw new ServiceError(400, "Those players aren't paired");
    const requester = userById(tx, pairing.requesterUserId);
    const target = userByDiscordId(tx, pairing.targetDiscordId);
    tx.update(signupPairings).set({ status: "dissolved", respondedAt: clockNow() }).where(eq(signupPairings.id, pairingId)).run();

    const userIds = [pairing.requesterUserId, target?.id].filter((id): id is string => !!id);
    const displayNames = [requester, target].filter((u): u is MinimalUser => !!u).map((u) => userLabelById(tx, u.id, bingo.id) ?? userLabel(u));
    audit(tx, {
      action: "pairing.unpaired",
      bingoId: bingo.id,
      entity: { type: "pairing", id: pairingId, label: displayNames.join(" & ") },
      details: { userIds, displayNames },
    });
  });
}

// Called when a signup is withdrawn: the partner (or anyone waiting on this
// player) is freed up to pick someone else.
export function dissolveForUser(db: Db, bingoId: string, p: Participant): void {
  const accepted = getAcceptedPairing(db, bingoId, p);
  if (accepted) {
    db.update(signupPairings).set({ status: "dissolved", respondedAt: clockNow() }).where(eq(signupPairings.id, accepted.id)).run();
    audit(db, {
      action: "pairing.dissolved",
      bingoId,
      entity: { type: "pairing", id: accepted.id },
      details: { requesterUserId: accepted.requesterUserId, targetDiscordId: accepted.targetDiscordId, cause: "withdrawal" },
    });
  } else {
    markAuditedNoop();
  }
  closePending(db, bingoId, p, "dissolved");
}
