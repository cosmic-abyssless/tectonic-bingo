// Pure pieces of Rewind (CONTEXT.md "Rewind"): what a Team's Board and every Team's points are at time T, which
// Submission a step lands on, and how long Play holds each one. No React; RewindProvider wires these up. The server
// (rewindService) has already replayed the scoring engine on submission time, so the Board at T is a filter over its
// results, cheap enough to redo on every scrub.
import type { PointAdjustment, RewindResponse, RewindSubmission, RewindTeam, SignificanceTier, SubmissionDetails, TeamNodeState, Tile } from "@bingo/shared";
import { summarizeTileProgress } from "../core/board/tileProgress";
import type { BoardModel, TileModel } from "./types";

/** The ?team= value (and view id) for the All Teams view: every Team's progress on one Board. */
export const ALL_TEAMS = "all";

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
  /** The same, every Team's together (the All Teams view). */
  allItems: RewindItem[];
  teams: Map<string, RewindTeam>;
}

export function prepareRewind(data: RewindResponse): PreparedRewind {
  const itemsByTeam = new Map<string, RewindItem[]>();
  const allItems: RewindItem[] = [];
  for (const sub of data.submissions) {
    const item = { sub, at: Date.parse(sub.submittedAt) };
    allItems.push(item);
    const list = itemsByTeam.get(sub.teamId) ?? [];
    list.push(item);
    itemsByTeam.set(sub.teamId, list);
  }
  return { start: Date.parse(data.startAt), end: Date.parse(data.endAt), itemsByTeam, allItems, teams: new Map(data.teams.map((t) => [t.teamId, t])) };
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

/** One Team's progress on one Tile at time T. */
export interface TileTeamProgress {
  teamId: string;
  completedTasks: number;
  totalTasks: number;
  pointsAwarded: number;
  totalPoints: number;
  complete: boolean;
}

/**
 * Every Team's progress on every Tile at time T (the All Teams view), by Tile id, in `teamIds` order. Each Team's is
 * exactly what its own Board shows at T (boardStateAt), so a Tile's "completed by" Teams match the single-Team views.
 */
export function tileTeamsAt(tiles: Tile[], prepared: PreparedRewind, teamIds: string[], at: number): Map<string, TileTeamProgress[]> {
  const out = new Map<string, TileTeamProgress[]>(tiles.map((t) => [t.id, []]));
  for (const teamId of teamIds) {
    const { nodeStates, teamSubmissions } = boardStateAt(prepared.teams.get(teamId), prepared.itemsByTeam.get(teamId) ?? [], at);
    for (const tile of tiles) {
      const s = summarizeTileProgress(tile, nodeStates, teamSubmissions);
      out.get(tile.id)!.push({ teamId, completedTasks: s.completedTasks, totalTasks: s.totalTasks, pointsAwarded: s.pointsAwarded, totalPoints: s.totalPoints, complete: s.allComplete });
    }
  }
  return out;
}

const NO_PROGRESS: TileModel["progress"] = { completedTasks: 0, totalTasks: 0, pointsAwarded: 0, totalPoints: 0, bonusAwarded: 0, allComplete: false };

/**
 * The All Teams view's Board: the shared layout with nothing of any one Team's on it, so a Tile shows no points
 * badge or part dots of its own (its Team markers say who completed it).
 */
export function layoutOnly(board: BoardModel): BoardModel {
  const strip = (tile: TileModel): TileModel => ({ ...tile, progress: NO_PROGRESS, taskStatuses: [] });
  const tiles = board.tiles.map(strip);
  const tileById = new Map(tiles.map((t) => [t.id, t]));
  return { ...board, tiles, tileById, grid: board.grid.map((row) => row.map((t) => (t ? tileById.get(t.id)! : null))), totalPoints: null, adjustments: [] };
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
 * Play's timing: each Submission holds for its tier's `holdMs` (a notable popup long enough to read, a huge one twice
 * that, a minor one only a brief flash of its Tile), so a small Bingo plays in a couple of minutes. `maxTotalMs`
 * (7 minutes) is a ceiling, not a target: a Bingo that would run longer has every hold shrunk to fit, keeping the
 * tiers' ratios. When so many minor ones would drop below `minMinorMs`, they get that minimum and the rest share
 * what's left, never below `minNotableMs` for a notable one (a very large Bingo can then run over the ceiling).
 * The All Teams view plays every Team's Submissions at once, several times as many, so its minor ones may flash by
 * as quickly as `allTeamsMinMinorMs` to keep the whole Bingo near the same 7 minutes.
 */
export const PLAYBACK = {
  maxTotalMs: 7 * 60_000,
  holdMs: { minor: 500, notable: 3_000, huge: 6_000 } satisfies Record<SignificanceTier, number>,
  minMinorMs: 150,
  allTeamsMinMinorMs: 50,
  minNotableMs: 600,
} as const;

export function playbackHolds(tiers: SignificanceTier[], minMinorMs: number = PLAYBACK.minMinorMs): number[] {
  const { maxTotalMs, holdMs, minNotableMs } = PLAYBACK;
  const total = tiers.reduce((sum, t) => sum + holdMs[t], 0);
  if (total <= maxTotalMs) return tiers.map((t) => holdMs[t]);
  const scale = maxTotalMs / total;
  if (holdMs.minor * scale >= minMinorMs) return tiers.map((t) => holdMs[t] * scale);

  const minors = tiers.filter((t) => t === "minor").length;
  const rest = total - minors * holdMs.minor;
  const left = maxTotalMs - minors * minMinorMs;
  const restScale = rest > 0 ? Math.max(minNotableMs / holdMs.notable, left / rest) : 0;
  return tiers.map((t) => (t === "minor" ? minMinorMs : holdMs[t] * restScale));
}

/** "1 in 1,234" (rounded to something readable). */
export function formatOneIn(oneIn: number): string {
  const rounded = oneIn >= 100 ? Math.round(oneIn / 10) * 10 : Math.round(oneIn);
  return `1 in ${rounded.toLocaleString()}`;
}
