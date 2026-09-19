import { now as clockNow } from "../clock";
import { and, eq, inArray, or } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { FieldChanges } from "@bingo/shared";
import * as schema from "../db/schema";
import { draftPicks, nodeEdges, nodes, pickRatings, signupAnswers, signups, submissions, teamMembers, teamNodeState, teamPointAdjustments, teams, tileInterests, tiles, users } from "../db/schema";
import { ServiceError } from "./errors";
import { getAcceptedPairs } from "./pairingService";
import { PUBLIC_SIGNUP_COLS } from "./signupService";
import { MINIMAL_USER_COLS } from "./userService";
import { audit, diffFields, markAuditedNoop } from "../audit/record";
import { userLabelById } from "../audit/describe";

type Db = BetterSQLite3Database<typeof schema>;

export function getTeamsForBingo(db: Db, bingoId: string) {
  return db.select().from(teams).where(eq(teams.bingoId, bingoId)).all();
}

export function getTeamById(db: Db, teamId: string) {
  return db.select().from(teams).where(eq(teams.id, teamId)).get();
}

export function getTeamMembers(db: Db, teamId: string) {
  return db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId)).all();
}

// Teams plus their rosters — what the bingo shell ships so admins can see who
// is on each team and players can see teammates once the board is revealed.
export function getTeamsWithMembers(db: Db, bingoId: string) {
  const teamRows = getTeamsForBingo(db, bingoId);
  if (teamRows.length === 0) return [];
  const teamIds = teamRows.map((t) => t.id);
  const memberRows = db
    .select({ teamId: teamMembers.teamId, isCaptain: teamMembers.isCaptain, isCoCaptain: teamMembers.isCoCaptain, user: users })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(inArray(teamMembers.teamId, teamIds))
    .all();
  const draftedUserIds = new Set(
    db.select({ userId: draftPicks.userId }).from(draftPicks).where(inArray(draftPicks.teamId, teamIds)).all().map((p) => p.userId),
  );
  const rank = (m: { isCaptain: boolean; isCoCaptain: boolean }) => (m.isCaptain ? 0 : m.isCoCaptain ? 1 : 2);
  return teamRows.map((team) => ({
    ...team,
    members: memberRows
      .filter((m) => m.teamId === team.id)
      .sort((a, b) => rank(a) - rank(b))
      .map(({ user, isCaptain, isCoCaptain }) => ({ user, isCaptain, isCoCaptain, isDrafted: draftedUserIds.has(user.id) })),
  }));
}

// Captain or co-captain: the people who draft for and rename the team.
export function isTeamLead(db: Db, teamId: string, userId: string): boolean {
  return !!db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId), or(eq(teamMembers.isCaptain, true), eq(teamMembers.isCoCaptain, true))))
    .get();
}

// A user belongs to at most one team per bingo (enforced by the draft flow).
export function getUserTeamForBingo(db: Db, bingoId: string, userId: string) {
  const rows = db
    .select({ team: teams })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(and(eq(teams.bingoId, bingoId), eq(teamMembers.userId, userId)))
    .all();
  return rows[0]?.team ?? null;
}

export interface TeamProgressSummary {
  nodeStates: (typeof teamNodeState.$inferSelect)[];
  adjustments: (typeof teamPointAdjustments.$inferSelect)[];
  totalPoints: number;
  interests: { tileId: string; taskId: string; user: Pick<typeof users.$inferSelect, "id" | "discordUsername" | "discordGlobalName" | "discordGuildNick">; createdAt: Date }[];
}

export function getTeamProgress(db: Db, teamId: string): TeamProgressSummary {
  const nodeStates = db.select().from(teamNodeState).where(eq(teamNodeState.teamId, teamId)).all();
  const adjustments = db.select().from(teamPointAdjustments).where(eq(teamPointAdjustments.teamId, teamId)).all();
  const interests = db
    .select({ tileId: tileInterests.tileId, taskId: tileInterests.taskId, user: MINIMAL_USER_COLS, createdAt: tileInterests.createdAt })
    .from(tileInterests)
    .innerJoin(users, eq(tileInterests.userId, users.id))
    .where(eq(tileInterests.teamId, teamId))
    .all();

  const nodePoints = nodeStates.reduce((sum, s) => sum + s.pointsAwarded, 0);
  const adjustmentPoints = adjustments.reduce((sum, a) => sum + a.amount, 0);

  return { nodeStates, adjustments, totalPoints: nodePoints + adjustmentPoints, interests };
}

// A member raises (or lowers) their hand for one part (task) of a tile.
// Team-scoped so leaving a team takes the hand down with it; the task must be
// a direct child of the tile's root and the tile must belong to the team's bingo.
export function setTileInterest(db: Db, teamId: string, userId: string, tileId: string, taskId: string, interested: boolean): void {
  db.transaction((tx) => {
    const team = tx.select({ bingoId: teams.bingoId }).from(teams).where(eq(teams.id, teamId)).get();
    const tile = tx.select({ id: tiles.id, bingoId: tiles.bingoId, name: tiles.name, nodeId: tiles.nodeId }).from(tiles).where(eq(tiles.id, tileId)).get();
    if (!team || !tile || tile.bingoId !== team.bingoId) throw new ServiceError(404, "Tile not found");
    const task = tx
      .select({ label: nodes.label })
      .from(nodeEdges)
      .innerJoin(nodes, eq(nodeEdges.childId, nodes.id))
      .where(and(eq(nodeEdges.parentId, tile.nodeId), eq(nodeEdges.childId, taskId)))
      .get();
    if (!task) throw new ServiceError(404, "Task not found on this tile");

    const where = and(eq(tileInterests.taskId, taskId), eq(tileInterests.userId, userId));
    const existing = tx.select({ id: tileInterests.id }).from(tileInterests).where(where).get();
    if (interested === !!existing) {
      markAuditedNoop();
      return;
    }
    if (interested) tx.insert(tileInterests).values({ tileId, taskId, teamId, userId, createdAt: clockNow() }).run();
    else tx.delete(tileInterests).where(where).run();
    audit(tx, {
      action: "team.tile_interest_set",
      bingoId: team.bingoId,
      entity: { type: "tile", id: tileId, label: tile.name },
      teamId,
      details: { tileName: tile.name, taskLabel: task.label ?? "Untitled part", interested },
    });
  });
}

// The only way to hand out points outside the node graph now that approval
// no longer takes a per-submission points override (docs/node-graph-model.md
// §6) — e.g. correcting a mistake, or a bonus/penalty with no node behind it.
export interface CreatePointAdjustmentParams {
  teamId: string;
  bingoId: string;
  amount: number;
  reason: string;
  createdByUserId: string;
}
export function createPointAdjustment(db: Db, params: CreatePointAdjustmentParams) {
  if (!params.reason.trim()) throw new ServiceError(400, "reason is required");
  return db.transaction((tx) => {
    const adjustment = tx.insert(teamPointAdjustments).values({ ...params, createdAt: clockNow() }).returning().get();
    audit(tx, {
      action: "points.adjusted",
      bingoId: params.bingoId,
      entity: { type: "adjustment", id: adjustment.id, label: params.reason },
      teamId: params.teamId,
      details: { amount: params.amount, reason: params.reason },
      actor: { userId: params.createdByUserId },
    });
    return adjustment;
  });
}

// ---------------------------------------------------------------------------
// Admin team/roster management — used before the draft flow exists (Phase 7)
// so Phase 5's admin panel can still get a playable bingo end-to-end.
// ---------------------------------------------------------------------------

const CODEWORD_ADJECTIVES = ["crimson", "azure", "verdant", "amber", "shadow", "silver", "obsidian", "golden", "frost", "ember", "cobalt", "violet"];
const CODEWORD_NOUNS = ["falcon", "wolf", "raven", "tiger", "serpent", "phoenix", "griffin", "panther", "hawk", "lynx", "kraken", "wyvern"];

function generateCodeword(): string {
  const adj = CODEWORD_ADJECTIVES[Math.floor(Math.random() * CODEWORD_ADJECTIVES.length)];
  const noun = CODEWORD_NOUNS[Math.floor(Math.random() * CODEWORD_NOUNS.length)];
  return `${adj}-${noun}`;
}

// Distinguishable on the dark theme; new teams take the first unused colour
// and wrap once all eight are taken. Admins can still recolour later.
const TEAM_PALETTE = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f", "#9b59b6", "#e67e22", "#1abc9c", "#ec407a"];

function nextTeamColor(db: Db, bingoId: string): string {
  const used = db.select({ color: teams.color }).from(teams).where(eq(teams.bingoId, bingoId)).all().map((t) => t.color);
  return TEAM_PALETTE.find((c) => !used.includes(c)) ?? TEAM_PALETTE[used.length % TEAM_PALETTE.length];
}

function assertUserNotOnATeam(db: Db, bingoId: string, userId: string): void {
  const existing = db
    .select({ team: teams })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(and(eq(teams.bingoId, bingoId), eq(teamMembers.userId, userId)))
    .get();
  if (existing) throw new ServiceError(409, "This user is already on a team for this bingo");
}

export interface CreateTeamParams {
  bingoId: string;
  captainUserId: string;
  // Duo mode: the captain's partner, chosen explicitly by the mod. Must be
  // the captain's accepted duo partner (if the captain has one) and joins
  // with captain-equivalent permissions.
  coCaptainUserId?: string | null;
  name?: string;
}
export function createTeam(db: Db, params: CreateTeamParams) {
  return db.transaction((tx) => {
    const requireActiveSignup = (userId: string, role: string) => {
      const signup = tx
        .select({ id: signups.id })
        .from(signups)
        .where(and(eq(signups.bingoId, params.bingoId), eq(signups.userId, userId), eq(signups.status, "active")))
        .get();
      if (!signup) throw new ServiceError(400, `A ${role} must have an active signup for this bingo`);
    };
    requireActiveSignup(params.captainUserId, "captain");

    const existingCaptaincy = tx
      .select()
      .from(teams)
      .where(and(eq(teams.bingoId, params.bingoId), eq(teams.captainUserId, params.captainUserId)))
      .get();
    if (existingCaptaincy) throw new ServiceError(409, "This user is already a captain for this bingo");
    assertUserNotOnATeam(tx, params.bingoId, params.captainUserId);

    const coCaptainUserId = params.coCaptainUserId ?? null;
    if (coCaptainUserId) {
      if (coCaptainUserId === params.captainUserId) throw new ServiceError(400, "The co-captain must be a different player");
      requireActiveSignup(coCaptainUserId, "co-captain");
      assertUserNotOnATeam(tx, params.bingoId, coCaptainUserId);
    }
    // Duo pairs stay together: a paired captain's co-captain is their partner,
    // and vice versa.
    const pairs = getAcceptedPairs(tx, params.bingoId);
    const captainPair = pairs.find((p) => p.userIds.includes(params.captainUserId));
    const coCaptainPair = coCaptainUserId ? pairs.find((p) => p.userIds.includes(coCaptainUserId)) : undefined;
    if (captainPair && !captainPair.userIds.includes(coCaptainUserId ?? "")) {
      throw new ServiceError(400, "This captain has a duo partner — pick them as the co-captain");
    }
    if (coCaptainPair && !coCaptainPair.userIds.includes(params.captainUserId)) {
      throw new ServiceError(400, "That player is paired with someone else");
    }

    let codeword = generateCodeword();
    for (let attempts = 0; attempts < 10; attempts++) {
      const taken = tx.select().from(teams).where(and(eq(teams.bingoId, params.bingoId), eq(teams.codeword, codeword))).get();
      if (!taken) break;
      codeword = generateCodeword();
    }

    const team = tx
      .insert(teams)
      .values({ bingoId: params.bingoId, captainUserId: params.captainUserId, name: params.name ?? "New Team", codeword, color: nextTeamColor(tx, params.bingoId), createdAt: clockNow(), updatedAt: clockNow() })
      .returning()
      .get();
    tx.insert(teamMembers).values({ teamId: team.id, userId: params.captainUserId, isCaptain: true, joinedAt: clockNow() }).run();
    if (coCaptainUserId) tx.insert(teamMembers).values({ teamId: team.id, userId: coCaptainUserId, isCoCaptain: true, joinedAt: clockNow() }).run();
    audit(tx, {
      action: "team.created",
      bingoId: params.bingoId,
      entity: { type: "team", id: team.id, label: team.name },
      teamId: team.id,
      details: {
        name: team.name,
        captainUserId: params.captainUserId,
        captainName: userLabelById(tx, params.captainUserId) ?? "Unknown",
        coCaptainUserId,
        coCaptainName: coCaptainUserId ? (userLabelById(tx, coCaptainUserId) ?? "Unknown") : null,
        color: team.color,
      },
    });
    return team;
  });
}

export interface UpdateTeamParams {
  name?: string;
  color?: string | null;
  codeword?: string;
}
export function updateTeam(db: Db, teamId: string, params: UpdateTeamParams) {
  return db.transaction((tx) => {
    const existing = tx.select().from(teams).where(eq(teams.id, teamId)).get();
    if (!existing) throw new ServiceError(404, "Team not found");

    const patch: UpdateTeamParams = {};
    if (params.name !== undefined) {
      if (typeof params.name !== "string" || !params.name.trim()) throw new ServiceError(400, "name must be a non-empty string");
      patch.name = params.name.trim();
    }
    if (params.color !== undefined) {
      if (params.color !== null && typeof params.color !== "string") throw new ServiceError(400, "color must be a string or null");
      patch.color = params.color;
    }
    if (params.codeword !== undefined) {
      if (typeof params.codeword !== "string" || !params.codeword.trim()) throw new ServiceError(400, "codeword must be a non-empty string");
      const codeword = params.codeword.trim();
      const clash = tx.select({ id: teams.id }).from(teams).where(and(eq(teams.bingoId, existing.bingoId), eq(teams.codeword, codeword))).get();
      if (clash && clash.id !== teamId) throw new ServiceError(409, "Another team in this bingo already uses that password");
      patch.codeword = codeword;
    }
    if (Object.keys(patch).length === 0) {
      markAuditedNoop();
      return existing;
    }
    const updated = tx.update(teams).set(patch).where(eq(teams.id, teamId)).returning().get();

    const changes = diffFields(existing, updated, { only: ["name", "color"] });
    audit(tx, {
      action: "team.updated",
      bingoId: existing.bingoId,
      entity: { type: "team", id: teamId, label: existing.name },
      teamId,
      details: {
        changes: (changes ?? { before: {}, after: {} }) as FieldChanges<{ name: string; color: string | null }>,
        ...(params.codeword !== undefined ? { codeword: { changed: true as const } } : {}),
      },
    });
    return updated;
  });
}

export function addTeamMember(db: Db, teamId: string, userId: string) {
  return db.transaction((tx) => {
    const team = tx.select().from(teams).where(eq(teams.id, teamId)).get();
    if (!team) throw new ServiceError(404, "Team not found");
    assertUserNotOnATeam(tx, team.bingoId, userId);
    const member = tx.insert(teamMembers).values({ teamId, userId, isCaptain: false, joinedAt: clockNow() }).returning().get();
    audit(tx, {
      action: "team.member_added",
      bingoId: team.bingoId,
      entity: { type: "user", id: userId, label: userLabelById(tx, userId) },
      teamId,
      details: { userId, displayName: userLabelById(tx, userId) ?? "Unknown" },
    });
    return member;
  });
}

// Drafted players stay put: dropping only the membership would return them
// to the pool while their pick still shows on the roster, and dropping the
// pick would shift the snake order for everyone after it.
export function removeTeamMember(db: Db, teamId: string, userId: string): void {
  db.transaction((tx) => {
    const team = tx.select().from(teams).where(eq(teams.id, teamId)).get();
    if (!team) throw new ServiceError(404, "Team not found");
    if (team.captainUserId === userId) throw new ServiceError(400, "Cannot remove the captain — reassign the captaincy or delete the team instead");
    const member = tx.select({ isCoCaptain: teamMembers.isCoCaptain }).from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))).get();
    if (member?.isCoCaptain) throw new ServiceError(400, "Cannot remove the co-captain — delete the team instead");
    const pick = tx.select({ id: draftPicks.id }).from(draftPicks).where(and(eq(draftPicks.teamId, teamId), eq(draftPicks.userId, userId))).get();
    if (pick) throw new ServiceError(409, "This player was drafted onto the team and can't be removed");
    const displayName = userLabelById(tx, userId);
    tx.delete(tileInterests).where(and(eq(tileInterests.teamId, teamId), eq(tileInterests.userId, userId))).run();
    tx.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))).run();
    audit(tx, {
      action: "team.member_removed",
      bingoId: team.bingoId,
      entity: { type: "user", id: userId, label: displayName },
      teamId,
      details: { userId, displayName: displayName ?? "Unknown" },
    });
  });
}

// Only teams without game history can go: once a team has draft picks,
// submissions or point adjustments, removing it would orphan that record.
export function deleteTeam(db: Db, teamId: string): void {
  db.transaction((tx) => {
    const team = tx.select().from(teams).where(eq(teams.id, teamId)).get();
    if (!team) throw new ServiceError(404, "Team not found");
    const hasHistory = [draftPicks, submissions, teamPointAdjustments].some((table) => tx.select({ id: table.id }).from(table).where(eq(table.teamId, teamId)).get());
    if (hasHistory) throw new ServiceError(409, "This team has draft picks or submissions and can't be deleted");
    const memberCount = tx.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.teamId, teamId)).all().length;
    audit(tx, {
      action: "team.deleted",
      bingoId: team.bingoId,
      entity: { type: "team", id: teamId, label: team.name },
      teamId,
      details: { name: team.name, captainName: userLabelById(tx, team.captainUserId) ?? "Unknown", memberCount },
    });
    tx.delete(pickRatings).where(eq(pickRatings.teamId, teamId)).run();
    tx.delete(tileInterests).where(eq(tileInterests.teamId, teamId)).run();
    tx.delete(teamMembers).where(eq(teamMembers.teamId, teamId)).run();
    tx.delete(teams).where(eq(teams.id, teamId)).run();
  });
}

// Active signups not already on a team for this bingo — the pool mods pick
// captains from during the `captains` stage. Joined with the user row and
// every signup answer (e.g. "willing to captain?") and accepted duo pairing so
// the admin UI can show context without a second round trip.
export function getCaptainCandidates(db: Db, bingoId: string) {
  const teamIds = db.select({ id: teams.id }).from(teams).where(eq(teams.bingoId, bingoId)).all().map((t) => t.id);
  const onATeam = teamIds.length ? new Set(db.select({ userId: teamMembers.userId }).from(teamMembers).where(inArray(teamMembers.teamId, teamIds)).all().map((m) => m.userId)) : new Set<string>();

  const rows = db
    .select({ signup: PUBLIC_SIGNUP_COLS, user: users })
    .from(signups)
    .innerJoin(users, eq(signups.userId, users.id))
    .where(and(eq(signups.bingoId, bingoId), eq(signups.status, "active")))
    .all()
    .filter((r) => !onATeam.has(r.signup.userId));

  const signupIds = rows.map((r) => r.signup.id);
  const answers = signupIds.length ? db.select().from(signupAnswers).where(inArray(signupAnswers.signupId, signupIds)).all() : [];
  const pairingByUserId = new Map(getAcceptedPairs(db, bingoId).flatMap(({ pairing, userIds }) => userIds.map((id) => [id, pairing] as const)));
  return rows.map((r) => ({
    ...r,
    answers: answers.filter((a) => a.signupId === r.signup.id),
    pairing: pairingByUserId.get(r.signup.userId) ?? null,
  }));
}
