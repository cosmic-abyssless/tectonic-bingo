// Rewind (CONTEXT.md "Rewind", "Significance"): playback of a Finished Bingo on its own Board, and how much each
// Submission stands out in it. The Significance weights and thresholds live here, in one place, so they're easy to
// tune; the server scores each Submission with them and the client only reads the tier.

import type { MinimalUser, SubmissionReactionGroup } from "./index.ts";

export type SignificanceTier = "minor" | "notable" | "huge";

/** What a Submission completed, keyed on submission time. Empty lists when it completed nothing. */
export interface RewindCompletion {
  /** Tiles it finished. */
  tiles: string[];
  /** Lines it finished ("Row 2", "Diagonal 1"). */
  lines: string[];
  /** Tiles no other Team had finished before it. */
  firstTiles: string[];
  /** Parts ("ZULRAH — Page 1") no other Team had finished before it. */
  firstParts: string[];
}

/**
 * The signals a Submission's Significance is built from. A signal it doesn't have is left out (undefined), never
 * counted as zero: a pet with no GP value, or a drop Wise Old Man doesn't count for Luck, is judged on the rest.
 */
export interface SignificanceSignals {
  /** The best Luck ("1 in N") among its Claims. */
  luckOneIn?: number;
  /** The total GP value of its Claims. */
  gpValue?: number;
  /** How many Reactions it got. */
  reactions?: number;
  /** What it completed. */
  completed?: RewindCompletion;
}

/**
 * The knobs. Each signal is turned into a strength, where 1 on its own makes a Submission huge. Luck and GP value
 * grow on a log scale between `from` (strength 0) and `huge` (strength 1); Reactions grow linearly. A Submission's
 * score is its strongest signal plus `others` times each of the rest, so a signal can only ever add to a score.
 */
export const SIGNIFICANCE = {
  luck: { from: 10, huge: 1_000 },
  gp: { from: 100_000, huge: 100_000_000 },
  reactions: { huge: 8 },
  completion: { firstPart: 0.4, tile: 0.55, firstTile: 0.8, line: 1 },
  others: 0.35,
  tiers: { notable: 0.5, huge: 1 },
} as const;

function logStrength(value: number, scale: { from: number; huge: number }): number {
  if (value <= scale.from) return 0;
  return Math.log10(value / scale.from) / Math.log10(scale.huge / scale.from);
}

function completionStrength(c: RewindCompletion): number {
  const w = SIGNIFICANCE.completion;
  return Math.max(0, c.lines.length ? w.line : 0, c.firstTiles.length ? w.firstTile : 0, c.tiles.length ? w.tile : 0, c.firstParts.length ? w.firstPart : 0);
}

/** Each signal the Submission has, as a strength. Missing signals aren't in the list. */
export function significanceStrengths(s: SignificanceSignals): number[] {
  const out: number[] = [];
  if (s.luckOneIn !== undefined) out.push(logStrength(s.luckOneIn, SIGNIFICANCE.luck));
  if (s.gpValue !== undefined) out.push(logStrength(s.gpValue, SIGNIFICANCE.gp));
  if (s.reactions !== undefined) out.push(Math.max(0, s.reactions) / SIGNIFICANCE.reactions.huge);
  if (s.completed) out.push(completionStrength(s.completed));
  return out;
}

/** The strongest signal, plus a share of each of the others. 0 for a Submission with no signals at all. */
export function significanceScore(s: SignificanceSignals): number {
  const strengths = significanceStrengths(s).sort((a, b) => b - a);
  if (strengths.length === 0) return 0;
  const [top, ...rest] = strengths;
  return top! + SIGNIFICANCE.others * rest.reduce((sum, x) => sum + x, 0);
}

export function significanceTier(score: number): SignificanceTier {
  if (score >= SIGNIFICANCE.tiers.huge) return "huge";
  if (score >= SIGNIFICANCE.tiers.notable) return "notable";
  return "minor";
}

/** One Claim of a Rewind Submission. */
export interface RewindClaim {
  id: string;
  nodeId: string;
  /** The item, or the Task's label for a Claim with no item. */
  label: string;
  itemName: string | null;
  quantity: number;
  gpValue: number | null;
  /** "1 in N", when Wise Old Man counts the drop's boss and the Player's kills are known. */
  luckOneIn: number | null;
}

/** One Submission as Rewind plays it: approved or rejected, never pending. */
export interface RewindSubmission {
  id: string;
  teamId: string;
  status: "approved" | "rejected";
  /** When it was made: Rewind's clock. */
  submittedAt: string;
  /** The Player it's credited to. */
  player: MinimalUser | null;
  /** The Tile it landed on. */
  tileId: string | null;
  /** Its main screenshot. */
  screenshotUrl: string | null;
  claims: RewindClaim[];
  /** Total GP value of its Claims; null when none has one. */
  gpValue: number | null;
  /** Shown to every viewer in Rewind. */
  reactions: SubmissionReactionGroup[];
  /** Empty for a rejected Submission: it never changed anything. */
  completed: RewindCompletion;
  significance: { score: number; tier: SignificanceTier };
}

/** A node a Team completed, keyed on submission time. */
export interface RewindNodeState {
  nodeId: string;
  /** Submission time of the Submission that completed it. */
  completedAt: string;
  submissionId: string;
  /** Its points once earned (0 for a node that never earns any). */
  pointsAwarded: number;
  /** When it earned them: later than completedAt when a points gate opened after it. Null if it never did. */
  pointsAt: string | null;
}

export interface RewindTeam {
  teamId: string;
  /** Every node the Team completed by the end, as the Finished Board has them. */
  nodes: RewindNodeState[];
  adjustments: { id: string; amount: number; reason: string; createdAt: string }[];
  /** The Team's final score: its nodes' points plus every Point Adjustment. */
  finalPoints: number;
}

export interface RewindResponse {
  /** When the Bingo went Live and was Finished: the timeline's ends (widened to cover every Submission). */
  startAt: string;
  endAt: string;
  teams: RewindTeam[];
  /** Oldest first; ties in the order the scoring replays them. */
  submissions: RewindSubmission[];
}
