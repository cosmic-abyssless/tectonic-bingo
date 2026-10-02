// Wrapped (CONTEXT.md "Wrapped", "Steal"): a Finished Bingo's year-in-review, told from one Player's point of view.
// The server computes every Player's Wrapped and the Bingo-wide one when a Moderator publishes it, and stores them;
// these are the stored shapes, which the story (and share cards) read as they are. Only approved Submissions count,
// except for rejection counts. Pick Ratings are never included, and no data names an early pick who scored low.

import type { AvatarUser } from "./index.ts";

/** One Submission's drop, as Wrapped shows it: an item with its Drop value and when, and the screenshot to show. */
export interface WrappedDrop {
  submissionId: string;
  teamId: string;
  player: AvatarUser | null;
  itemName: string;
  quantity: number;
  /** Null for an item with no Drop value (a pet). */
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
  /** What moved it, as the stats chart words it: the task, tile or line bonus, or the Point Adjustment's reason. Missing from Wrapped published before it was stored. */
  source?: "node" | "adjustment";
  label?: string;
  delta?: number;
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
  /**
   * Rank of their Points share among every Player in the Bingo (1 = top; a Duo's halves ranked separately, tied Players
   * sharing a rank, as Teams on the same points share a placement), and how many Players were ranked. For the share
   * cards' "#3 of 42". Missing from Wrapped published before it was stored.
   */
  bingoRank?: number;
  bingoPlayers?: number;
  /** Total drop value (CONTEXT.md), and the Buy-in it's compared with (null when the Bingo had none). */
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
  /**
   * Their best moments together, best first (up to 3): a Submission by each half on the same Tile, then on the same
   * day. Missing from Wrapped published before it was stored.
   */
  moments?: WrappedDuoMoment[];
}

/** Two Submissions of a Duo, one by each half: on the same Tile (`tileName`), or else on the same UTC day. */
export interface WrappedDuoMoment {
  kind: "tile" | "day";
  tileName: string | null;
  /** The day (UTC, YYYY-MM-DD) of the earlier one. */
  date: string;
  /** Each half's drop: the most valuable of its Submission. */
  mine: WrappedDrop;
  theirs: WrappedDrop;
}

export interface WrappedCaptainPick {
  /** One Player, or both halves of a Duo (a Duo is one pick). */
  players: AvatarUser[];
  pickNumber: number;
  /** Draft position of the pick (Players drafted before it + 1). */
  position: number;
  /** Final Points share rank among every drafted Player (the pick's best half for a Duo). */
  rank: number;
  /**
   * The pick's Points share (its best half's, for a Duo). Everyone on 0 ties for a rank, so a pick that scored
   * nothing is never a Steal. Missing from Wrapped published before it was stored.
   */
  pointsShare?: number;
}

export interface WrappedCaptain {
  teamId: string;
  /** Every pick their Team made, in pick order. */
  picks: WrappedCaptainPick[];
  /** Players drafted in the whole Bingo: the range of positions and ranks. Missing from Wrapped published before it was stored. */
  drafted?: number;
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

/** A Superlative (CONTEXT.md) category's winner(s) within one Team, as fixed at publish time. A tie is shared. */
export interface WrappedTeamSuperlative {
  category: string;
  winners: AvatarUser[];
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
  /**
   * The Player with the biggest Points share, and its share of the Team's awarded points (0–1, as a Player's own
   * `teamPointsFraction`; missing from Wrapped published before it was stored).
   */
  mvp: { player: AvatarUser; pointsShare: number; teamPointsFraction?: number } | null;
  topGpEarner: { player: AvatarUser; gpGained: number } | null;
  /** Drop value (CONTEXT.md): the total of its Players' Total drop value. Missing from Wrapped published before it was stored. */
  dropValue?: number;
  biggestDrop: WrappedDrop | null;
  pointsOverTime: WrappedPointsPoint[];
  /** Superlative winners (CONTEXT.md), a category with no votes left out. Missing from Wrapped published before it was stored. */
  superlatives?: WrappedTeamSuperlative[];
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
  /** The one clock hour (its start) with the most reviews, and how many. Missing from Wrapped published before it was stored. */
  busiestClockHour?: { at: string; reviews: number } | null;
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
  /** Approved Submissions, and the Drop value of every approved Claim. */
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
 * A Credits entry (CONTEXT.md "Credits"): someone an Admin names in Wrapped, with an optional role ("Board design").
 * Free text, independent of the Admin and Moderator roles. Either attached to one Category image (its name captioned
 * on the art) or one of a category's additional credits (no image), listed under that category's images.
 */
export interface WrappedCredit {
  name: string;
  role: string | null;
}

/** Most additional credits one category holds, and the longest a name or role can be. */
export const MAX_WRAPPED_CREDITS = 30;
export const MAX_WRAPPED_CREDIT_LENGTH = 60;

/**
 * Wrapped art: decorative in-game character cut-outs, drawn as stickers on torn paper. Admins upload them per Bingo
 * (a new Bingo starts with a copy of the previous one's), in groups:
 * - Category images: any number per section of the story, shown side by side above its opening heading (a Team's
 *   three, a Duo's two). Duo and Captain are the sections of those names. Each can carry a credit, and each category
 *   can also hold additional credits with no image.
 * - Side images ("side"): one pool, shown large beside the story's sections in turn (wide screens only).
 * - Player card art ("playerCard"): a ranked pool for the Player card, best first (CONTEXT.md "Wrapped art"). Never
 *   shown in the story.
 * Side images and Player card art carry no credits.
 */
/**
 * `moderator` is a reviewing Moderator's own section (captioned with their name); `moderators` is the Bingo-wide
 * "Behind the scenes" moderation roundup in The Bingo section, crediting who moderated it.
 */
export const WRAPPED_ART_SECTIONS = ["intro", "you", "duo", "captain", "moderator", "team", "bingo", "moderators", "outro"] as const;
export type WrappedArtSection = (typeof WRAPPED_ART_SECTIONS)[number];

export const WRAPPED_ART_GROUPS = [...WRAPPED_ART_SECTIONS, "side", "playerCard"] as const;
export type WrappedArtGroup = (typeof WRAPPED_ART_GROUPS)[number];

/** How many images a group holds at most: a row above a heading gets crowded quickly; the side pool less so. */
export function maxWrappedArt(group: WrappedArtGroup): number {
  return group === "side" ? 12 : 6;
}

export function isWrappedArtSection(value: unknown): value is WrappedArtSection {
  return typeof value === "string" && (WRAPPED_ART_SECTIONS as readonly string[]).includes(value);
}

export function isWrappedArtGroup(value: unknown): value is WrappedArtGroup {
  return typeof value === "string" && (WRAPPED_ART_GROUPS as readonly string[]).includes(value);
}

/**
 * One sticker's two "boil" frames (transparent WebP, same size), which the page swaps slowly. The shadow isn't in
 * them: the page adds it with CSS drop-shadow, which follows the torn edge.
 */
export type WrappedArtFrames = [string, string];

/** One Category image as the story shows it: its frames, and the credit attached to it (null for none). */
export interface WrappedArtPiece {
  frames: WrappedArtFrames;
  credit: WrappedCredit | null;
}

/** A category's additional credits (no image), in the order the Admin set; a category with none is missing. */
export type WrappedArtCredits = Partial<Record<WrappedArtSection, WrappedCredit[]>>;

/**
 * A Bingo's Wrapped art, in order: each section's Category images (a section without any is missing), each
 * category's additional credits, the side pool, and the Player card art (best first; only the share cards show it).
 */
export interface WrappedArtSet {
  sections: Partial<Record<WrappedArtSection, WrappedArtPiece[]>>;
  additionalCredits: WrappedArtCredits;
  side: WrappedArtFrames[];
  playerCard: WrappedArtFrames[];
}

/**
 * How a solid-background screenshot was keyed (RGB distances, 0–441): within `tolerance` of the key colour is
 * background, and the next `softness` is the anti-aliased fringe.
 */
export interface WrappedArtKeying {
  tolerance: number;
  softness: number;
}

export const WRAPPED_ART_KEYING_DEFAULTS: WrappedArtKeying = { tolerance: 30, softness: 150 };

/** One image, as the admin UI shows it. */
export interface WrappedArtImage {
  id: string;
  group: WrappedArtGroup;
  /** The upload as it was: a transparent PNG, or the solid-background screenshot it was keyed from. */
  originalUrl: string;
  frames: WrappedArtFrames;
  /** How it was keyed; null for an upload that was already transparent. */
  keying: WrappedArtKeying | null;
  /** The background colour that was keyed out, "#rrggbb"; null when nothing was. */
  keyColor: string | null;
  /** Who it credits (CONTEXT.md "Credits"), captioned on it. Always null outside a section (side, Player card). */
  credit: WrappedCredit | null;
  updatedAt: string;
}
