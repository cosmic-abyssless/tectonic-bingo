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
 * counted as zero: a pet with no Drop value, or a drop Wise Old Man doesn't count for Luck, is judged on the rest.
 */
export interface SignificanceSignals {
  /** The best Luck ("1 in N") among its Claims. */
  luckOneIn?: number;
  /** The total Drop value of its Claims. */
  gpValue?: number;
  /** How many Reactions it got. */
  reactions?: number;
  /** What it completed. */
  completed?: RewindCompletion;
}

/**
 * The knobs. Each signal is turned into a strength, where 1 on its own makes a Submission huge. Luck and Drop value
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

/** The kinds of completion, strongest first; what a Submission completed counts as the strongest it has. */
export type CompletionKind = "line" | "firstTile" | "tile" | "firstPart";

/** The strongest thing a Submission completed, or null when it completed nothing. */
export function strongestCompletion(c: RewindCompletion): CompletionKind | null {
  if (c.lines.length) return "line";
  if (c.firstTiles.length) return "firstTile";
  if (c.tiles.length) return "tile";
  if (c.firstParts.length) return "firstPart";
  return null;
}

function completionStrength(c: RewindCompletion): number {
  const kind = strongestCompletion(c);
  return kind ? SIGNIFICANCE.completion[kind] : 0;
}

export type SignificanceSignal = "luck" | "gp" | "reactions" | "completed";

function signalStrengths(s: SignificanceSignals): { signal: SignificanceSignal; strength: number }[] {
  const out: { signal: SignificanceSignal; strength: number }[] = [];
  if (s.luckOneIn !== undefined) out.push({ signal: "luck", strength: logStrength(s.luckOneIn, SIGNIFICANCE.luck) });
  if (s.gpValue !== undefined) out.push({ signal: "gp", strength: logStrength(s.gpValue, SIGNIFICANCE.gp) });
  if (s.reactions !== undefined) out.push({ signal: "reactions", strength: Math.max(0, s.reactions) / SIGNIFICANCE.reactions.huge });
  if (s.completed) out.push({ signal: "completed", strength: completionStrength(s.completed) });
  return out;
}

/** Each signal the Submission has, as a strength. Missing signals aren't in the list. */
export function significanceStrengths(s: SignificanceSignals): number[] {
  return signalStrengths(s).map((x) => x.strength);
}

/**
 * The signal that counted most towards the score (the `top` of significanceScore): what made the Submission stand
 * out. A missing signal is never it; ties go to the earlier of Luck, Drop value, Reactions, what it completed. Null with
 * no signals at all.
 */
export function dominantSignal(s: SignificanceSignals): SignificanceSignal | null {
  let best: { signal: SignificanceSignal; strength: number } | null = null;
  for (const x of signalStrengths(s)) if (!best || x.strength > best.strength) best = x;
  return best?.signal ?? null;
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
  /** The kills its Luck is judged over (since the Player's previous drop of it, or the Bingo's start); null with no Luck. */
  luckKills: number | null;
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
  /** Total Drop value of its Claims; null when none has one. */
  gpValue: number | null;
  /** Shown to every viewer in Rewind. */
  reactions: SubmissionReactionGroup[];
  /** Empty for a rejected Submission: it never changed anything. */
  completed: RewindCompletion;
  significance: { score: number; tier: SignificanceTier };
}

/** The signals a Rewind Submission's Significance is built from: its best Luck, total Drop value, Reaction count, and
 * what it completed. Anything it doesn't have is left out. */
export function rewindSignals(sub: Pick<RewindSubmission, "claims" | "gpValue" | "reactions" | "completed">): SignificanceSignals {
  const lucks = sub.claims.map((c) => c.luckOneIn).filter((v): v is number => v !== null);
  const reactionCount = sub.reactions.reduce((sum, g) => sum + g.users.length, 0);
  return {
    luckOneIn: lucks.length ? Math.max(...lucks) : undefined,
    gpValue: sub.gpValue ?? undefined,
    reactions: reactionCount > 0 ? reactionCount : undefined,
    completed: strongestCompletion(sub.completed) ? sub.completed : undefined,
  };
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
