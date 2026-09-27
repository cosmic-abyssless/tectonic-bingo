// Wrapped (CONTEXT.md "Wrapped", "Steal"): a Finished Bingo's year-in-review, told from one Player's point of view.
// The server computes every Player's Wrapped and the Bingo-wide one when a Moderator publishes it, and stores them;
// these are the stored shapes, which the story (and share cards) read as they are. Only approved Submissions count,
// except for rejection counts. Pick Ratings are never included, and no data names an early pick who scored low.

import type { AvatarUser } from "./index.ts";

/** One Submission's drop, as Wrapped shows it: an item with its GP value and when, and the screenshot to show. */
export interface WrappedDrop {
  submissionId: string;
  teamId: string;
  player: AvatarUser | null;
  itemName: string;
  quantity: number;
  /** Null for an item with no GP value (a pet). */
  gpValue: number | null;
  /** "1 in N" when it can be judged (CONTEXT.md "Luck"). */
  luckOneIn: number | null;
  /** The kills that Luck is judged over. Missing from Wrapped published before it was stored. */
  luckKills?: number | null;
  /** Submission time, ISO. */
  at: string;
  /** Its main screenshot. Left out on read for other Teams' drops when the Bingo hides them once Finished. */
  screenshotUrl: string | null;
}

/** A Team's points over time: each award or Point Adjustment that moved it, with the running total. */
export interface WrappedPointsPoint {
  at: string;
  points: number;
}

export interface WrappedYou {
  /** Approved Submissions credited to them, and the average over every Player in the Bingo. */
  submissions: number;
  bingoAverageSubmissions: number;
  /** The average Points share over every Player in the Bingo. Missing from Wrapped published before it was stored. */
  bingoAveragePointsShare?: number;
  /** Points share (CONTEXT.md), unrounded; its share of the Team's awarded points (0–1); rank on the Team (1 = top). */
  pointsShare: number;
  teamPointsFraction: number;
  teamRank: number;
  teamSize: number;
  /** GP gained (CONTEXT.md), and the Buy-in it's compared with (null when the Bingo had none). */
  gpGained: number;
  buyIn: number | null;
  coveredBuyIn: boolean | null;
  /** Their most valuable drops, highest first (up to 3). */
  topDrops: WrappedDrop[];
  /** Their drop with the best Luck. */
  luckiestDrop: WrappedDrop | null;
  /** Their most unlikely dry streak (the Dry Title's facts), whether or not it made them a Title holder. */
  driestStreak: { boss: string; kills: number; oneIn: number } | null;
  firstDrop: WrappedDrop | null;
  lastDrop: WrappedDrop | null;
  /** The day (UTC, YYYY-MM-DD) they made the most approved Submissions, and that day's drops. */
  mostActiveDay: { date: string; submissions: number; drops: WrappedDrop[] } | null;
  /** The Titles they held when Wrapped was published, with the number behind each. */
  titles: { id: string; name: string; text: string }[];
  /** Achievements earned in this Bingo (only ones switched on), oldest first. */
  achievements: { key: string; name: string; itemName: string; earnedAt: string }[];
  /** Wise Old Man gains over the Bingo: EHB and their biggest boss kill counts. Null without Wise Old Man data. */
  wom: { ehb: number; bosses: { metric: string; name: string; kills: number }[]; asOf: string } | null;
  /** Their Draft pick: the pick number, and the draft position (Players drafted before them + 1). Null if not drafted. */
  draft: { pickNumber: number; position: number } | null;
}

export interface WrappedDuo {
  partner: AvatarUser;
  /** Both halves' Points share, and each half's. */
  combinedPointsShare: number;
  myPointsShare: number;
  partnerPointsShare: number;
  /** Rank of the Duo's combined Points share among every Duo in the Bingo (1 = top), and how many Duos there were. */
  rank: number;
  duoCount: number;
  /** The Duo's pick (null when it wasn't drafted, e.g. a Captain pair). */
  pickNumber: number | null;
}

export interface WrappedCaptainPick {
  /** One Player, or both halves of a Duo (a Duo is one pick). */
  players: AvatarUser[];
  pickNumber: number;
  /** Draft position of the pick (Players drafted before it + 1). */
  position: number;
  /** Final Points share rank among every drafted Player (the pick's best half for a Duo). */
  rank: number;
}

export interface WrappedCaptain {
  teamId: string;
  /** Every pick their Team made, in pick order. */
  picks: WrappedCaptainPick[];
}

export interface WrappedModerator {
  /** Submissions of this Bingo they reviewed (approved or rejected). */
  reviewed: number;
  /** Median time from submission to their review, ms. */
  medianReviewMs: number;
  /** Share of their reviews that were rejections (0–1). */
  rejectionRate: number;
}

/**
 * One Player's Wrapped. The Team section is the Team's entry in the Bingo-wide data (BingoWrapped.teams), and the
 * Moderator section a reviewer's entry in its moderation stats (MyWrappedResponse.moderator), so a Moderator who
 * didn't play gets theirs too.
 */
export interface PlayerWrapped {
  userId: string;
  teamId: string;
  you: WrappedYou;
  /** Only when they were in a Duo. */
  duo: WrappedDuo | null;
  /** Only for Captains (and co-Captains). */
  captain: WrappedCaptain | null;
}

export interface WrappedTeam {
  teamId: string;
  name: string;
  color: string | null;
  /** 1 = first; Teams on the same points share a placement. */
  placement: number;
  points: number;
  tilesCompleted: number;
  linesCompleted: number;
  /** The Player with the biggest Points share. */
  mvp: { player: AvatarUser; pointsShare: number } | null;
  topGpEarner: { player: AvatarUser; gpGained: number } | null;
  biggestDrop: WrappedDrop | null;
  pointsOverTime: WrappedPointsPoint[];
}

export interface WrappedReviewStats {
  /** Submissions reviewed (approved or rejected). */
  reviewed: number;
  medianReviewMs: number | null;
  fastestReviewMs: number | null;
  /** Share reviewed within an hour of being made (0–1). */
  withinHourFraction: number | null;
  /** The UTC hour of day (0–23) with the most reviews, and how many. */
  busiestHour: { hour: number; reviews: number } | null;
  topReviewer: { user: AvatarUser; reviewed: number } | null;
  /**
   * Every Moderator or Admin who reviewed any, highest rejection rate first: "who had to deal with the most nonsense".
   * A reviewer's own entry is their Moderator section.
   */
  reviewers: (WrappedModerator & { user: AvatarUser; rejected: number })[];
}

/** A Steal (CONTEXT.md): a late pick who finished near the top. Only Steals are named. */
export interface WrappedSteal {
  /** One Player, or a Duo's higher scorer. */
  player: AvatarUser;
  teamId: string;
  pickNumber: number;
  position: number;
  rank: number;
  /** Places beaten: position − rank. */
  placesBeaten: number;
}

export interface BingoWrapped {
  bingoName: string;
  /** Approved Submissions, and the GP value of every approved Claim. */
  totalSubmissions: number;
  totalGp: number;
  /** The drop with the best Luck in the Bingo. */
  rarestDrop: WrappedDrop | null;
  /** The approved Submission with the most Reactions. */
  mostReacted: { drop: WrappedDrop; reactions: number } | null;
  /** Every Team, by placement. */
  teams: WrappedTeam[];
  /** The draft's biggest Steal; null without a Draft or when nobody beat their position. */
  biggestSteal: WrappedSteal | null;
  moderation: WrappedReviewStats;
}

export interface WrappedState {
  published: boolean;
  /** ISO; null until it's published. */
  publishedAt: string | null;
  /**
   * The Bingo publishes it on its own once it's Finished and nothing is pending: at the finish, or as the last pending
   * Submission is reviewed (a per-Bingo setting, off by default).
   */
  publishOnFinish: boolean;
  /** Submissions still waiting for review. Publishing (and publishing again) is refused until there are none. */
  pendingSubmissions: number;
}

/**
 * GET /api/bingos/:slug/wrapped/me: the viewer's Wrapped. `player` is null for a viewer who isn't one of its Players.
 * `preview` is true for a Moderator's live preview before it's published (computed on the spot, never stored).
 */
export interface MyWrappedResponse {
  state: WrappedState;
  preview: boolean;
  bingo: BingoWrapped;
  player: PlayerWrapped | null;
  /** The viewer's reviews, when they're a Moderator or Admin who reviewed Submissions of this Bingo. */
  moderator: WrappedModerator | null;
  /** The Bingo's Wrapped art as it is now (not fixed by publishing). */
  art: WrappedArtSet;
}

/** GET /api/bingos/:slug/wrapped: the Bingo-wide Wrapped. */
export interface BingoWrappedResponse {
  state: WrappedState;
  preview: boolean;
  bingo: BingoWrapped;
  art: WrappedArtSet;
}

/**
 * Wrapped art: a decorative in-game character cut-out for a section of the story, drawn as a sticker on torn paper.
 * Admins upload them per Bingo (a new Bingo starts with a copy of the previous one's). Duo and Captain are kept for
 * the sections of those names.
 */
export const WRAPPED_ART_SECTIONS = ["intro", "you", "duo", "captain", "moderator", "team", "bingo", "outro"] as const;
export type WrappedArtSection = (typeof WRAPPED_ART_SECTIONS)[number];

export function isWrappedArtSection(value: unknown): value is WrappedArtSection {
  return typeof value === "string" && (WRAPPED_ART_SECTIONS as readonly string[]).includes(value);
}

/**
 * The two "boil" frames of a section's sticker (transparent WebP, same size), which the page swaps slowly. The shadow
 * isn't in them: the page adds it with CSS drop-shadow, which follows the torn edge.
 */
export type WrappedArtFrames = [string, string];

/** The art the story shows, by section; a section without art is missing. */
export type WrappedArtSet = Partial<Record<WrappedArtSection, WrappedArtFrames>>;

/**
 * How a solid-background screenshot was keyed (RGB distances, 0–441): within `tolerance` of the key colour is
 * background, and the next `softness` is the anti-aliased fringe.
 */
export interface WrappedArtKeying {
  tolerance: number;
  softness: number;
}

export const WRAPPED_ART_KEYING_DEFAULTS: WrappedArtKeying = { tolerance: 30, softness: 150 };

/** One section's art, as the admin UI shows it. */
export interface WrappedArtSlot {
  section: WrappedArtSection;
  /** The upload as it was: a transparent PNG, or the solid-background screenshot it was keyed from. */
  originalUrl: string;
  frames: WrappedArtFrames;
  /** How it was keyed; null for an upload that was already transparent. */
  keying: WrappedArtKeying | null;
  /** The background colour that was keyed out, "#rrggbb"; null when nothing was. */
  keyColor: string | null;
  updatedAt: string;
}
