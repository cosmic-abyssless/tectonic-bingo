// Pure pieces of Rewind (CONTEXT.md "Rewind"): what a Team's Board and every Team's points are at time T, which
// Submission a step lands on, and how long Play holds each one. No React; RewindProvider wires these up. The server
// (rewindService) has already replayed the scoring engine on submission time, so the Board at T is a filter over its
// results, cheap enough to redo on every scrub.
import type { PointAdjustment, RewindResponse, RewindSubmission, RewindTeam, SignificanceTier, SubmissionDetails, TeamNodeState } from "@bingo/shared";

/** A Submission on the timeline, its time parsed once. */
export interface RewindItem {
  sub: RewindSubmission;
  at: number;
}

export interface PreparedRewind {
  start: number;
  end: number;
  /** Every approved and rejected Submission, oldest first, by Team. */
  itemsByTeam: Map<string, RewindItem[]>;
  teams: Map<string, RewindTeam>;
}

export function prepareRewind(data: RewindResponse): PreparedRewind {
  const itemsByTeam = new Map<string, RewindItem[]>();
  for (const sub of data.submissions) {
    const list = itemsByTeam.get(sub.teamId) ?? [];
    list.push({ sub, at: Date.parse(sub.submittedAt) });
    itemsByTeam.set(sub.teamId, list);
  }
  return { start: Date.parse(data.startAt), end: Date.parse(data.endAt), itemsByTeam, teams: new Map(data.teams.map((t) => [t.teamId, t])) };
}

/** The Submissions the timeline shows for a Team: its approved ones, plus its rejected ones when they're switched on. */
export function visibleItems(items: RewindItem[], showRejected: boolean): RewindItem[] {
  return showRejected ? items : items.filter((i) => i.sub.status === "approved");
}

/** How many of `items` (oldest first) were made at or before `at`. */
export function countUpTo(items: { at: number }[], at: number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid]!.at <= at) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** A Rewind Submission in the shape the Board builders read (they only look at its status, time and Claims). */
function toSubmissionDetails(sub: RewindSubmission): SubmissionDetails {
  return {
    submission: {
      id: sub.id,
      teamId: sub.teamId,
      submittedByUserId: sub.player?.id ?? "",
      postedByUserId: null,
      status: sub.status,
      submittedAt: sub.submittedAt,
      reviewedAt: null,
      reviewedByUserId: null,
      reviewerNotes: null,
      createdAt: sub.submittedAt,
      updatedAt: sub.submittedAt,
    },
    screenshots: [],
    claims: sub.claims.map((c) => ({ id: c.id, submissionId: sub.id, nodeId: c.nodeId, itemName: c.itemName, quantity: c.quantity, gpValue: c.gpValue })),
    submittedByUser: sub.player,
    postedByUser: null,
    reactions: sub.reactions,
  };
}

/**
 * A Team's Board at time T: the nodes its approved Submissions made by then had completed (with the points they had
 * earned by then), and those Submissions themselves, which the Board reads its SUM/COUNT progress from. Rejected
 * Submissions never change the Board.
 */
export function boardStateAt(team: RewindTeam | undefined, items: RewindItem[], at: number): { nodeStates: TeamNodeState[]; teamSubmissions: SubmissionDetails[] } {
  const nodeStates: TeamNodeState[] = [];
  for (const n of team?.nodes ?? []) {
    if (Date.parse(n.completedAt) > at) continue;
    nodeStates.push({ nodeId: n.nodeId, completedAt: n.completedAt, pointsAwarded: n.pointsAt && Date.parse(n.pointsAt) <= at ? n.pointsAwarded : 0 });
  }
  const teamSubmissions = items.filter((i) => i.sub.status === "approved" && i.at <= at).map((i) => toSubmissionDetails(i.sub));
  return { nodeStates, teamSubmissions };
}

/** The Team's Point Adjustments made by T, in the Board's shape. */
export function adjustmentsAt(team: RewindTeam | undefined, bingoId: string, at: number): PointAdjustment[] {
  return (team?.adjustments ?? [])
    .filter((a) => Date.parse(a.createdAt) <= at)
    .map((a) => ({ id: a.id, teamId: team!.teamId, bingoId, amount: a.amount, reason: a.reason, createdByUserId: "", createdAt: a.createdAt }));
}

/** A Team's points at T: what its nodes had earned by then, plus the Point Adjustments made by then. */
export function teamPointsAt(team: RewindTeam | undefined, at: number): number {
  if (!team) return 0;
  let points = 0;
  for (const n of team.nodes) if (n.pointsAt && Date.parse(n.pointsAt) <= at) points += n.pointsAwarded;
  for (const a of team.adjustments) if (Date.parse(a.createdAt) <= at) points += a.amount;
  return points;
}

/** Notable or bigger: what the "notable" steps stop on. */
export const isNotable = (tier: SignificanceTier) => tier !== "minor";

/**
 * Where "next" goes from the current moment: the Submission after the focused one, or, with none focused, the first
 * one made after `at`. `filter` narrows to notable-or-bigger ones. -1 when there's none.
 */
export function stepNext(items: RewindItem[], at: number, focusIndex: number, filter: (i: RewindItem) => boolean = () => true): number {
  const from = focusIndex >= 0 ? focusIndex + 1 : countUpTo(items, at);
  for (let i = from; i < items.length; i++) if (filter(items[i]!)) return i;
  return -1;
}

/**
 * Where "previous" goes: the Submission before the focused one, or, with none focused, the latest one already on the
 * Board at `at` (so stepping back from a scrubbed moment first shows the drop that got it there). -1 when there's none.
 */
export function stepPrev(items: RewindItem[], at: number, focusIndex: number, filter: (i: RewindItem) => boolean = () => true): number {
  const from = focusIndex >= 0 ? focusIndex - 1 : countUpTo(items, at) - 1;
  for (let i = from; i >= 0; i--) if (filter(items[i]!)) return i;
  return -1;
}

/**
 * Play's timing: the whole Bingo in about `totalMs` (7 minutes) whatever the Submission count, shared out by tier.
 * A huge Submission holds 4× a notable one, and a minor one only a brief flash of its Tile. When there are so many
 * minor ones that their share would drop below `minMinorMs`, they get that minimum and the rest share what's left;
 * with nothing left (a very large Bingo), everything gets its minimum.
 */
export const PLAYBACK = {
  totalMs: 7 * 60_000,
  units: { minor: 0.25, notable: 1, huge: 4 } satisfies Record<SignificanceTier, number>,
  minMinorMs: 150,
  minNotableMs: 600,
} as const;

export function playbackHolds(tiers: SignificanceTier[]): number[] {
  const { totalMs, units, minMinorMs, minNotableMs } = PLAYBACK;
  const total = tiers.reduce((sum, t) => sum + units[t], 0);
  if (total === 0) return [];
  const unit = totalMs / total;
  if (unit * units.minor >= minMinorMs) return tiers.map((t) => unit * units[t]);

  const minors = tiers.filter((t) => t === "minor").length;
  const restUnits = total - minors * units.minor;
  const left = totalMs - minors * minMinorMs;
  const restUnit = restUnits > 0 ? Math.max(minNotableMs, left / restUnits) : 0;
  return tiers.map((t) => (t === "minor" ? minMinorMs : restUnit * units[t]));
}

/** "1 in 1,234" (rounded to something readable). */
export function formatOneIn(oneIn: number): string {
  const rounded = oneIn >= 100 ? Math.round(oneIn / 10) * 10 : Math.round(oneIn);
  return `1 in ${rounded.toLocaleString()}`;
}
