// Who a submission is for, and who posted it. A player submits to their own team, for themselves or for a
// teammate: the usual case is someone at a PC posting a drop a teammate got on mobile. A mod (or site admin) may
// also submit to any team of the bingo, but has to say which of its players the drop belongs to.
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "../db/schema";
import { isBingoMod } from "./bingoService";
import { ServiceError } from "./errors";
import { getTeamById, getTeamMembers, getUserTeamForBingo } from "./teamService";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof schema.bingos.$inferSelect;
type Team = typeof schema.teams.$inferSelect;

export interface SubmissionTargetInput {
  /** The team to submit to. Only a mod may name a team other than their own. */
  teamId?: string | null;
  /** The teammate the drop belongs to, when it isn't the poster's own. */
  forUserId?: string | null;
}

export interface SubmissionTarget {
  team: Team;
  /** The player the drop belongs to: credited for it. */
  submittedByUserId: string;
  /** Who uploaded it, when that isn't the same player. */
  postedByUserId: string | null;
}

/** The team a submission goes to: the poster's own, or (for a mod) the one named. Also what the screenshot analysis needs. */
export function resolveSubmissionTeam(db: Db, bingo: Bingo, user: { id: string; isAdmin: boolean }, teamId?: string | null): Team {
  const myTeam = getUserTeamForBingo(db, bingo.id, user.id);
  let team: Team | null = myTeam;
  if (teamId && teamId !== myTeam?.id) {
    if (!isBingoMod(db, bingo.id, user.id, user.isAdmin)) throw new ServiceError(403, "You can only submit for your own team");
    const other = getTeamById(db, teamId);
    if (!other || other.bingoId !== bingo.id) throw new ServiceError(404, "Team not found");
    team = other;
  }
  if (!team) throw new ServiceError(403, "You are not on a team for this bingo");
  return team;
}

export function resolveSubmissionTarget(db: Db, bingo: Bingo, user: { id: string; isAdmin: boolean }, input: SubmissionTargetInput): SubmissionTarget {
  const myTeam = getUserTeamForBingo(db, bingo.id, user.id);
  const team = resolveSubmissionTeam(db, bingo, user, input.teamId);

  // Naming yourself is the same as naming no one.
  const forUserId = input.forUserId && input.forUserId !== user.id ? input.forUserId : null;
  if (!forUserId) {
    if (team.id !== myTeam?.id) throw new ServiceError(400, "Choose which player this submission is for");
    return { team, submittedByUserId: user.id, postedByUserId: null };
  }

  if (!getTeamMembers(db, team.id).some((m) => m.userId === forUserId)) {
    throw new ServiceError(400, `That player isn't on ${team.name}`);
  }
  return { team, submittedByUserId: forUserId, postedByUserId: user.id };
}
