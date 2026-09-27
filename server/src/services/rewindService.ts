// Rewind (CONTEXT.md "Rewind", "Significance"): a Finished Bingo's Submissions on its own clock, submission time,
// with what each one completed and how much it stands out. The Board at any moment is the scoring engine re-run over
// the approved Claims made at or before it; see replayTeam for how one run covers every moment.
import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  rewindSignals,
  significanceScore,
  significanceTier,
  type RewindClaim,
  type RewindCompletion,
  type RewindNodeState,
  type RewindResponse,
  type RewindSubmission,
  type RewindTeam,
} from "@bingo/shared";
import * as schema from "../db/schema";
import { bingoLines, nodes, teamPointAdjustments, teams, tiles } from "../db/schema";
import { awardedPoints, evaluateGraph, type ApprovedClaim, type EngineNode } from "./engine";
import { getFullGraph } from "./graphService";
import { applyExclusivity } from "./exclusivityService";
import { getTeamSubmissions, type SubmissionDetails } from "./submissionService";
import { effectiveStartsAt, endedAt, lastWentLiveAt } from "./bingoStart";
import { loadTimelines } from "./womReadService";
import { dropLucks } from "./luck/luck";
import { getDropRates } from "./luck/dropRates";
import { ServiceError } from "./errors";

type Db = BetterSQLite3Database<typeof schema>;

interface Graph {
  engineNodes: EngineNode[];
  childrenOf: Map<string, string[]>;
  nodesById: Map<string, EngineNode>;
}

export interface ReplaySubmission {
  id: string;
  submittedAt: Date;
}

export interface ReplayClaim {
  submissionId: string;
  nodeId: string;
  itemName: string | null;
  quantity: number;
}

export interface ReplayedNode {
  nodeId: string;
  /** Index (in submission order) of the Submission that completed the node. */
  rank: number;
  submissionId: string;
  completedAt: Date;
  pointsAwarded: number;
  /** When its points were earned: its own completion, or its points gate's if that came later. */
  pointsAt: Date | null;
}

/** Submission order: submission time, then the id, so ties always replay the same way. */
export function bySubmissionOrder<T extends ReplaySubmission>(subs: T[]): T[] {
  return [...subs].sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Every node one Team completed, and the Submission that completed it, from one run of the scoring engine.
 *
 * The engine's completion is monotonic in the Claims it's given (more Claims never un-complete a node), and each
 * node's completedAt is the Claim that tipped it: the earliest moment it's complete. So scoring the Claims with each
 * Submission's rank in `subs` (submission order) standing in for its time gives, for every node, the first
 * Submission after which it's complete; the Board at time T is then every node whose Submission was made at or
 * before T. That's the same as re-running the engine over only those Submissions' Claims (rewindService.test.ts
 * checks it), without re-running it for every moment. Points follow their node, or the node's points gate when that
 * completed later. `claims` must already be exclusivity-filtered, as the real scoring does.
 */
export function replayTeam(graph: Graph, subs: ReplaySubmission[], claims: ReplayClaim[]): Map<string, ReplayedNode> {
  const ordered = bySubmissionOrder(subs);
  const rankOf = new Map(ordered.map((s, i) => [s.id, i]));
  const engineClaims: ApprovedClaim[] = claims
    .filter((c) => rankOf.has(c.submissionId))
    .map((c) => ({ nodeId: c.nodeId, itemName: c.itemName, quantity: c.quantity, reviewedAt: new Date(rankOf.get(c.submissionId)!) }));
  const results = evaluateGraph(graph.engineNodes, graph.childrenOf, engineClaims);

  const out = new Map<string, ReplayedNode>();
  for (const node of graph.engineNodes) {
    const r = results.get(node.id);
    if (!r?.complete || !r.completedAt) continue;
    const rank = r.completedAt.getTime();
    const sub = ordered[rank]!;
    const pointsAwarded = awardedPoints(node.id, results, graph.nodesById);
    let pointsAt: Date | null = null;
    if (pointsAwarded > 0) {
      const gateRank = node.pointsGateNodeId ? (results.get(node.pointsGateNodeId)?.completedAt?.getTime() ?? rank) : rank;
      pointsAt = ordered[Math.max(rank, gateRank)]!.submittedAt;
    }
    out.set(node.id, { nodeId: node.id, rank, submissionId: sub.id, completedAt: sub.submittedAt, pointsAwarded, pointsAt });
  }
  return out;
}

/** The replayed state at time T: nodes complete by then, with the points they had earned by then. */
export function replayedStateAt(replayed: Map<string, ReplayedNode>, at: Date): Map<string, { pointsAwarded: number }> {
  const out = new Map<string, { pointsAwarded: number }>();
  for (const n of replayed.values()) {
    if (n.completedAt > at) continue;
    out.set(n.nodeId, { pointsAwarded: n.pointsAt && n.pointsAt <= at ? n.pointsAwarded : 0 });
  }
  return out;
}

function lineLabel(line: { lineType: string; lineIndex: number }): string {
  if (line.lineType === "custom") return "A custom line";
  return `${line.lineType[0]!.toUpperCase()}${line.lineType.slice(1)} ${line.lineIndex + 1}`;
}

function emptyCompletion(): RewindCompletion {
  return { tiles: [], lines: [], firstTiles: [], firstParts: [] };
}

/** Everything Rewind plays for a Finished Bingo. Refuses any other stage. */
export function getRewind(db: Db, bingo: typeof schema.bingos.$inferSelect): RewindResponse {
  if (bingo.stage !== "complete") throw new ServiceError(403, "Rewind is only available once the bingo is finished");
  const bingoId = bingo.id;

  const graph = getFullGraph(db, bingoId);
  const teamRows = db.select({ id: teams.id }).from(teams).where(eq(teams.bingoId, bingoId)).all();
  const tileRows = db.select({ id: tiles.id, name: tiles.name, nodeId: tiles.nodeId }).from(tiles).where(eq(tiles.bingoId, bingoId)).all();
  const lineRows = db.select().from(bingoLines).where(eq(bingoLines.bingoId, bingoId)).all();
  const nodeLabels = new Map(db.select({ id: nodes.id, label: nodes.label }).from(nodes).where(eq(nodes.bingoId, bingoId)).all().map((n) => [n.id, n.label]));

  const tileByNodeId = new Map(tileRows.map((t) => [t.nodeId, t]));
  const lineByNodeId = new Map(lineRows.map((l) => [l.nodeId, l]));
  // A Part is a direct child of a Tile's node; "first to complete" is judged on Tiles and Parts.
  const partLabel = new Map<string, string>();
  // Which Tile a leaf sits on (the first one found, as submissions resolve it).
  const tileOfNode = new Map<string, string>();
  for (const tile of tileRows) {
    for (const partId of graph.childrenOf.get(tile.nodeId) ?? []) partLabel.set(partId, `${tile.name} — ${nodeLabels.get(partId) ?? "Part"}`);
    const stack = [tile.nodeId];
    while (stack.length) {
      const id = stack.pop()!;
      if (tileOfNode.has(id)) continue;
      tileOfNode.set(id, tile.id);
      stack.push(...(graph.childrenOf.get(id) ?? []));
    }
  }

  // Approved and rejected only: a pending Submission never happened as far as the Finished Bingo is concerned.
  const detailsByTeam = new Map<string, SubmissionDetails[]>(
    teamRows.map((t) => [t.id, getTeamSubmissions(db, t.id).filter((d) => d.submission.status !== "pending")]),
  );
  
  // Replay each Team: the Claims the real scoring kept (exclusivity is decided by approval order, as it was), on the
  // submission-time clock.
  const replayed = new Map<string, Map<string, ReplayedNode>>();
  for (const team of teamRows) {
    const approved = detailsByTeam.get(team.id)!.filter((d) => d.submission.status === "approved");
    const claimRows = approved.flatMap((d) =>
      d.claims.map((c) => ({ submissionId: d.submission.id, nodeId: c.nodeId, itemName: c.itemName, quantity: c.quantity, reviewedAt: d.submission.reviewedAt ?? d.submission.submittedAt })),
    );
    const kept = applyExclusivity(db, bingoId, claimRows.filter((c) => graph.nodesById.has(c.nodeId)));
    replayed.set(team.id, replayTeam(graph, approved.map((d) => ({ id: d.submission.id, submittedAt: d.submission.submittedAt })), kept));
  }

  // The earliest any Team completed each Tile and Part, for "first to complete". Teams tied to the second share it.
  const firstAt = new Map<string, number>();
  for (const nodesOfTeam of replayed.values()) {
    for (const n of nodesOfTeam.values()) {
      if (!tileByNodeId.has(n.nodeId) && !partLabel.has(n.nodeId)) continue;
      const t = n.completedAt.getTime();
      if (!firstAt.has(n.nodeId) || t < firstAt.get(n.nodeId)!) firstAt.set(n.nodeId, t);
    }
  }

  const completedBy = new Map<string, RewindCompletion>();
  for (const nodesOfTeam of replayed.values()) {
    for (const n of nodesOfTeam.values()) {
      const c = completedBy.get(n.submissionId) ?? emptyCompletion();
      const tile = tileByNodeId.get(n.nodeId);
      const line = lineByNodeId.get(n.nodeId);
      const isFirst = firstAt.get(n.nodeId) === n.completedAt.getTime();
      if (tile) {
        c.tiles.push(tile.name);
        if (isFirst) c.firstTiles.push(tile.name);
      } else if (line) c.lines.push(lineLabel(line));
      else if (partLabel.has(n.nodeId) && isFirst) c.firstParts.push(partLabel.get(n.nodeId)!);
      completedBy.set(n.submissionId, c);
    }
  }

  // Each drop's own Luck. Rejected drops are judged too, but don't shorten the next drop's stretch.
  const start = effectiveStartsAt(db, bingo);
  const lucks = start
    ? dropLucks({
        rates: getDropRates(),
        bingoStart: start,
        timelines: loadTimelines(db, bingoId),
        claims: [...detailsByTeam.values()].flat().flatMap((d) =>
          d.claims
            .filter((c) => c.itemName)
            .map((c) => ({ claimId: c.id, userId: d.submission.submittedByUserId, itemName: c.itemName!, at: d.submission.submittedAt, taskNodeId: null, gpValue: c.gpValue, counts: d.submission.status === "approved" })),
        ),
      })
    : new Map();

  const submissions: RewindSubmission[] = [];
  for (const team of teamRows) {
    const ordered = bySubmissionOrder(detailsByTeam.get(team.id)!.map((d) => ({ id: d.submission.id, submittedAt: d.submission.submittedAt, d })));
    for (const { d } of ordered) {
      const claims: RewindClaim[] = d.claims.map((c) => ({
        id: c.id,
        nodeId: c.nodeId,
        label: c.itemName ?? nodeLabels.get(c.nodeId) ?? "Task",
        itemName: c.itemName,
        quantity: c.quantity,
        gpValue: c.gpValue,
        luckOneIn: lucks.get(c.id)?.oneIn ?? null,
        luckKills: lucks.get(c.id)?.kills ?? null,
      }));
      const approved = d.submission.status === "approved";
      const completed = approved ? (completedBy.get(d.submission.id) ?? emptyCompletion()) : emptyCompletion();
      const gpValues = claims.map((c) => c.gpValue).filter((v): v is number => v !== null);
      const reactions = d.reactions ?? [];
      const signals = rewindSignals({ claims, gpValue: gpValues.length ? gpValues.reduce((a, b) => a + b, 0) : null, reactions, completed });
      const score = significanceScore(signals);
      const firstLeaf = d.claims[0]?.nodeId;
      submissions.push({
        id: d.submission.id,
        teamId: team.id,
        status: approved ? "approved" : "rejected",
        submittedAt: d.submission.submittedAt.toISOString(),
        player: d.submittedByUser,
        tileId: firstLeaf ? (tileOfNode.get(firstLeaf) ?? null) : null,
        screenshotUrl: (d.screenshots.find((s) => s.screenshotType === "main") ?? d.screenshots[0])?.storageUrl ?? null,
        claims,
        gpValue: signals.gpValue ?? null,
        reactions,
        completed,
        significance: { score, tier: significanceTier(score) },
      });
    }
  }
  submissions.sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const adjustmentRows = teamRows.length ? db.select().from(teamPointAdjustments).where(and(eq(teamPointAdjustments.bingoId, bingoId), inArray(teamPointAdjustments.teamId, teamRows.map((t) => t.id)))).all() : [];
  const rewindTeams: RewindTeam[] = teamRows.map((team) => {
    const nodeStates: RewindNodeState[] = [...replayed.get(team.id)!.values()].map((n) => ({
      nodeId: n.nodeId,
      completedAt: n.completedAt.toISOString(),
      submissionId: n.submissionId,
      pointsAwarded: n.pointsAwarded,
      pointsAt: n.pointsAt?.toISOString() ?? null,
    }));
    const adjustments = adjustmentRows
      .filter((a) => a.teamId === team.id)
      .map((a) => ({ id: a.id, amount: a.amount, reason: a.reason, createdAt: a.createdAt.toISOString() }))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const finalPoints = nodeStates.reduce((sum, n) => sum + n.pointsAwarded, 0) + adjustments.reduce((sum, a) => sum + a.amount, 0);
    return { teamId: team.id, nodes: nodeStates, adjustments, finalPoints };
  });

  // From going Live to Finishing, widened to cover anything made outside that (a Submission from before a restart).
  const moments = [...submissions.map((s) => Date.parse(s.submittedAt)), ...adjustmentRows.map((a) => a.createdAt.getTime())];
  const liveAt = lastWentLiveAt(db, bingoId) ?? start;
  const finishedAt = endedAt(db, bingo);
  let startMs = Math.min(liveAt?.getTime() ?? Infinity, ...moments);
  let endMs = Math.max(finishedAt?.getTime() ?? -Infinity, ...moments);
  if (!Number.isFinite(startMs)) startMs = finishedAt?.getTime() ?? Date.now();
  if (!Number.isFinite(endMs)) endMs = startMs;
  if (endMs <= startMs) endMs = startMs + 60_000;

  return { startAt: new Date(startMs).toISOString(), endAt: new Date(endMs).toISOString(), teams: rewindTeams, submissions };
}

/**
 * What a viewer may see of it: with "Show screenshots once Finished" off, other Teams' screenshots are left out for
 * anyone but the mods (the Submissions themselves stay), the same rule as a Team's submission list.
 */
export function hideScreenshots(rewind: RewindResponse, viewer: { isMod: boolean; myTeamId: string | null; showScreenshotsWhenFinished: boolean }): RewindResponse {
  if (viewer.isMod || viewer.showScreenshotsWhenFinished) return rewind;
  return { ...rewind, submissions: rewind.submissions.map((s) => (s.teamId === viewer.myTeamId ? s : { ...s, screenshotUrl: null })) };
}
