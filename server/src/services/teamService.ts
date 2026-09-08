import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { signupAnswers, signups, teamMembers, teamNodeState, teamPointAdjustments, teams, users } from "../db/schema";
import { ServiceError } from "./errors";
import { PUBLIC_SIGNUP_COLS } from "./signupService";

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
}

export function getTeamProgress(db: Db, teamId: string): TeamProgressSummary {
  const nodeStates = db.select().from(teamNodeState).where(eq(teamNodeState.teamId, teamId)).all();
  const adjustments = db.select().from(teamPointAdjustments).where(eq(teamPointAdjustments.teamId, teamId)).all();

  const nodePoints = nodeStates.reduce((sum, s) => sum + s.pointsAwarded, 0);
  const adjustmentPoints = adjustments.reduce((sum, a) => sum + a.amount, 0);

  return { nodeStates, adjustments, totalPoints: nodePoints + adjustmentPoints };
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
  name?: string;
}
export function createTeam(db: Db, params: CreateTeamParams) {
  return db.transaction((tx) => {
    const signup = tx
      .select()
      .from(signups)
      .where(and(eq(signups.bingoId, params.bingoId), eq(signups.userId, params.captainUserId), eq(signups.status, "active")))
      .get();
    if (!signup) throw new ServiceError(400, "A captain must have an active signup for this bingo");

    const existingCaptaincy = tx
      .select()
      .from(teams)
      .where(and(eq(teams.bingoId, params.bingoId), eq(teams.captainUserId, params.captainUserId)))
      .get();
    if (existingCaptaincy) throw new ServiceError(409, "This user is already a captain for this bingo");
    assertUserNotOnATeam(tx, params.bingoId, params.captainUserId);

    let codeword = generateCodeword();
    for (let attempts = 0; attempts < 10; attempts++) {
      const taken = tx.select().from(teams).where(and(eq(teams.bingoId, params.bingoId), eq(teams.codeword, codeword))).get();
      if (!taken) break;
      codeword = generateCodeword();
    }

    const team = tx
      .insert(teams)
      .values({ bingoId: params.bingoId, captainUserId: params.captainUserId, name: params.name ?? "New Team", codeword })
      .returning()
      .get();
    tx.insert(teamMembers).values({ teamId: team.id, userId: params.captainUserId, isCaptain: true }).run();
    return team;
  });
}

export function updateTeam(db: Db, teamId: string, params: { name?: string; color?: string | null; codeword?: string }) {
  const existing = db.select().from(teams).where(eq(teams.id, teamId)).get();
  if (!existing) throw new ServiceError(404, "Team not found");
  return db.update(teams).set(params).where(eq(teams.id, teamId)).returning().get();
}

export function addTeamMember(db: Db, teamId: string, userId: string) {
  return db.transaction((tx) => {
    const team = tx.select().from(teams).where(eq(teams.id, teamId)).get();
    if (!team) throw new ServiceError(404, "Team not found");
    assertUserNotOnATeam(tx, team.bingoId, userId);
    return tx.insert(teamMembers).values({ teamId, userId, isCaptain: false }).returning().get();
  });
}

export function removeTeamMember(db: Db, teamId: string, userId: string): void {
  const team = db.select().from(teams).where(eq(teams.id, teamId)).get();
  if (!team) throw new ServiceError(404, "Team not found");
  if (team.captainUserId === userId) throw new ServiceError(400, "Cannot remove the captain — reassign the captaincy or delete the team instead");
  db.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))).run();
}

// Active signups not already on a team for this bingo — the pool mods pick
// captains from during the `captains` stage. Joined with the user row and
// every signup answer (e.g. "willing to captain?") so the admin UI can show
// context without a second round trip.
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
  return rows.map((r) => ({ ...r, answers: answers.filter((a) => a.signupId === r.signup.id) }));
}
