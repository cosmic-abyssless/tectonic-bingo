// Historical Bingos (CONTEXT.md "Historical Bingo", docs/historical-bingos-plan.md): past Bingos run on other websites,
// imported so this site holds the clan's whole history. Always Finished and read-only. What one never recorded is shown
// as not recorded, decided per feature by whether its data is there (HistoricalRecorded), never as zero or empty.
import type { PublicUser } from "./index.ts";

/** What a page or section of a Historical Bingo says in place of data it never recorded. */
export const NOT_RECORDED_HISTORICAL = "Not recorded for historical Bingos";

/**
 * What one Historical Bingo recorded, feature by feature. A feature shows when its data is there and says
 * NOT_RECORDED_HISTORICAL when it isn't. Wrapped, the audit log and Achievements are never recorded, so they aren't
 * listed: they're off for every Historical Bingo.
 */
export interface HistoricalRecorded {
  /** Tasks under its Tiles: the board's checklist and Team completion. */
  tasks: boolean;
  /** Submissions: the Submissions lists, Stats and Rewind. */
  submissions: boolean;
  /** Signup questions and their answers: the signups roster. Every Player has a Signup (their RSN) either way. */
  signupRoster: boolean;
  /** Draft picks: the Draft room. */
  draft: boolean;
  /** Wise Old Man snapshots: the Wise Old Man-based Titles. */
  womSnapshots: boolean;
}

/**
 * Whether a Title can't be judged for a Historical Bingo because its data was never recorded: the Wise Old Man-based
 * ones without snapshots, and Overachiever (Achievements are off for every Historical Bingo). Such a Title shows
 * NOT_RECORDED_HISTORICAL, never a holder picked from partial data. Always false for any other Bingo (`recorded` null).
 */
export function titleNotRecorded(title: { id: string; source: "bingo" | "wom" }, recorded: HistoricalRecorded | null): boolean {
  if (!recorded) return false;
  if (title.source === "wom") return !recorded.womSnapshots;
  return title.id === "overachiever";
}

/** One Team's final place, as recorded, and its points when they're known. */
export interface HistoricalStanding {
  teamId: string;
  teamName: string;
  teamColor: string | null;
  place: number;
  points: number | null;
}

/** One Team's total in the Wise Old Man competition. teamId is null for a WOM team matching none of the Bingo's. */
export interface WomLeaderboardTeam {
  teamId: string | null;
  name: string;
  color: string | null;
  gained: number;
  players: number;
}

/**
 * One participant's gains. `user` is the Player it maps to (by their Signup RSN in the Bingo); null for a Player whose
 * Discord id isn't known, who appears here by RSN only.
 */
export interface WomLeaderboardPlayer {
  rsn: string;
  user: PublicUser | null;
  teamId: string | null;
  teamName: string | null;
  gained: number;
}

/** A Bingo's Wise Old Man gains leaderboard, from its stored competition (wom_past_competitions). Highest first. */
export interface WomLeaderboard {
  womId: number;
  title: string;
  metric: string;
  startsAt: string;
  endsAt: string;
  teams: WomLeaderboardTeam[];
  players: WomLeaderboardPlayer[];
}

/** GET /api/bingos/:slug/historical: what a Historical Bingo shows besides its board. */
export interface HistoricalBingoResponse {
  recorded: HistoricalRecorded;
  /** Best place first. Empty when none were recorded. */
  standings: HistoricalStanding[];
  /** Null when no competition is stored for the Bingo. */
  wom: WomLeaderboard | null;
}
