// Superlative (CONTEXT.md "Superlative"): an award within a Team, voted by its Players ("Team MVP", "Team Spirit",
// "The Grinder"). Categories are admin-managed per Bingo; voting is open for the whole of Live and secret throughout.

import type { AvatarUser } from "./index.ts";

/** Most categories a Bingo can have: each Team's share card fits 3 (CONTEXT.md "Wrapped"). */
export const MAX_SUPERLATIVE_CATEGORIES = 3;

export interface SuperlativeCategory {
  id: string;
  bingoId: string;
  name: string;
  sortOrder: number;
}

/** A teammate as a vote nominee: who they are, plus the badges the dropdown and a filled slot show. */
export interface SuperlativeNominee extends AvatarUser {
  isCaptain: boolean;
  isCoCaptain: boolean;
  /** The voter's own Duo partner (CONTEXT.md), regardless of Captaincy. */
  isMyDuoPartner: boolean;
}

/**
 * A category as the voter's own Team area shows it: their current pick (if any), and how many of their teammates
 * have voted in it so far — a participation count, never who voted or who they picked (votes are secret).
 */
export interface SuperlativeBallotCategory {
  id: string;
  name: string;
  sortOrder: number;
  myPick: string | null;
  votedCount: number;
  eligibleCount: number;
}

/** GET .../superlatives/me: the caller's own Team's ballot. */
export interface SuperlativeBallotResponse {
  votingOpen: boolean;
  categories: SuperlativeBallotCategory[];
  teammates: SuperlativeNominee[];
}

/** One nominee's vote count within a category, for the admin-only tally read (after voting closes). */
export interface SuperlativeTally {
  categoryId: string;
  categoryName: string;
  counts: { user: AvatarUser; votes: number }[];
}

/** GET .../mod/superlatives/tally: every Team's tallies, admin-only, refused before the Bingo is Finished. */
export interface SuperlativeTeamTally {
  teamId: string;
  teamName: string;
  tallies: SuperlativeTally[];
}

/**
 * GET .../mod/superlatives/turnout: how many of a Team's Players have voted so far, admin-only, at any stage. Counts
 * only, never who voted or for whom (votes are secret), kept live by `superlative_votes_changed`.
 */
export interface SuperlativeTeamTurnout {
  teamId: string;
  teamName: string;
  color: string | null;
  /** The Team's Players: everyone who can vote. */
  players: number;
  /** Players who have voted in at least one category, and in every category. */
  votedAny: number;
  votedAll: number;
  categories: { categoryId: string; categoryName: string; voted: number }[];
}
