import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { LuckFacts, LuckWeights, PlayerTitleFacts, TileHeatmapCell, TileProgress, TitleAwardFact, TitleSettings, ValuedAs } from "@bingo/shared";
import { valuedAsOf } from "./gpValueService";
import * as schema from "../db/schema";
import { bingoLines, bingos, claims, nodeEdges, nodes, stageTransitions, submissions, teamMembers, teamNodeState, teamPointAdjustments, teams, tiles, users } from "../db/schema";
import { findAncestorIds, getFullGraph } from "./graphService";
import { applyExclusivity } from "./exclusivityService";
import { creditAwards, type AwardCredit, type CreditClaim } from "./pointsShare";
import { rsnsInBingo } from "./playerNames";
import { effectiveStartsAt, endedAt } from "./bingoStart";
import { gainsOf, lastReadAt, loadTimelines } from "./womReadService";
import { getAchievementTallies } from "./achievementService";
import type { EngineNode } from "./engine";
import { openItems } from "./openItems";
import { playerLuck, type LuckClaim } from "./luck/luck";
import { getDropRates } from "./luck/dropRates";
import { BOSS_NAMES } from "./luck/bossSources";
import type { WomSnapshot } from "./womService";
import { now } from "../clock";
import { getTitleSettings } from "./titleSettingsService";

type Db = BetterSQLite3Database<typeof schema>;

type MinimalUser = Pick<typeof users.$inferSelect, "id" | "discordUsername" | "discordGlobalName" | "discordGuildNick"> & { rsn?: string | null };
const MINIMAL_USER_COLS = { id: users.id, discordUsername: users.discordUsername, discordGlobalName: users.discordGlobalName, discordGuildNick: users.discordGuildNick };

export interface PointsOverTimePoint {
  at: Date;
  teamId: string;
  source: "node" | "adjustment";
  label: string;
  delta: number;
  cumulativePoints: number;
}

type NodeLabel = { kind: "line" | "tile" | "task"; label: string };

// A human name for each scoring node: a line bonus ("row 2 line bonus"), a tile's own bonus (the tile's name), or a
// task under a tile ("ZULRAH — Page 1"). Shared by the points chart and the timeline so they read the same.
function labelNodes(db: Db, bingoId: string, nodeIds: string[]): Map<string, NodeLabel> {
  const nodeRows = nodeIds.length ? db.select().from(nodes).where(inArray(nodes.id, nodeIds)).all() : [];
  const nodeById = new Map(nodeRows.map((n) => [n.id, n]));
  const tileRows = db.select().from(tiles).where(eq(tiles.bingoId, bingoId)).all();
  const tileByNodeId = new Map(tileRows.map((t) => [t.nodeId, t]));
  const lineRows = db.select().from(bingoLines).where(eq(bingoLines.bingoId, bingoId)).all();
  const lineByNodeId = new Map(lineRows.map((l) => [l.nodeId, l]));

  const labels = new Map<string, NodeLabel>();
  for (const nodeId of nodeIds) {
    const line = lineByNodeId.get(nodeId);
    if (line) {
      labels.set(nodeId, { kind: "line", label: `${line.lineType[0]!.toUpperCase()}${line.lineType.slice(1)} ${line.lineIndex + 1} line bonus` });
      continue;
    }
    const directTile = tileByNodeId.get(nodeId);
    if (directTile) {
      labels.set(nodeId, { kind: "tile", label: directTile.name });
      continue;
    }
    const node = nodeById.get(nodeId);
    const ancestorTile = [...findAncestorIds(db, nodeId)].map((id) => tileByNodeId.get(id)).find((t): t is NonNullable<typeof t> => !!t);
    labels.set(nodeId, { kind: "task", label: ancestorTile ? `${ancestorTile.name} — ${node?.label ?? "Task"}` : node?.label ?? "Bonus" });
  }
  return labels;
}

// Chronological, per-team-running-total reconstruction of every point-scoring
// event — the exact same rows teamService.getTeamProgress sums for its
// totalPoints, just timestamped and ordered, so a team's final
// cumulativePoints here always reconciles with its scoreboard total. Only
// events that moved the total are included: a node completed for no points
// (an item, a gated part) isn't a scoring event.
export function getPointsOverTime(db: Db, bingoId: string): PointsOverTimePoint[] {
  const teamRows = db.select().from(teams).where(eq(teams.bingoId, bingoId)).all();
  const teamIds = teamRows.map((t) => t.id);
  if (teamIds.length === 0) return [];

  const stateRows = db.select().from(teamNodeState).where(inArray(teamNodeState.teamId, teamIds)).all();
  const labels = labelNodes(db, bingoId, [...new Set(stateRows.map((r) => r.nodeId))]);

  const nodeEvents = stateRows.map((r) => ({ at: r.completedAt, teamId: r.teamId, source: "node" as const, label: labels.get(r.nodeId)!.label, delta: r.pointsAwarded }));

  const adjustmentRows = db.select().from(teamPointAdjustments).where(eq(teamPointAdjustments.bingoId, bingoId)).all();
  const adjustmentEvents = adjustmentRows.map((a) => ({ at: a.createdAt, teamId: a.teamId, source: "adjustment" as const, label: a.reason, delta: a.amount }));

  const all = [...nodeEvents, ...adjustmentEvents].filter((e) => e.delta !== 0).sort((a, b) => a.at.getTime() - b.at.getTime());

  const running = new Map<string, number>();
  return all.map((e) => {
    const cumulativePoints = (running.get(e.teamId) ?? 0) + e.delta;
    running.set(e.teamId, cumulativePoints);
    return { ...e, cumulativePoints };
  });
}

export interface TimelineEvent {
  at: Date;
  type: "points_earned" | "line_completed" | "point_adjustment" | "first_completion" | "stage_changed";
  teamId: string | null;
  /** What happened, without the team or the points: "ZULRAH — Page 1", "Row 2 line bonus", a mod's reason. */
  what: string;
  /** Points it moved; null for events that aren't an award (first completions, stage changes). */
  points: number | null;
}

// What happened, in a stats context: every award of points (a task or tile completed, a line bonus, a mod's
// adjustment) plus the bingo starting and ending. `first_completion` is a mod-only extra (see getStatsForViewer).
// Draft picks are not here: they belong to the draft room and the audit log.
export function getTimeline(db: Db, bingoId: string): TimelineEvent[] {
  const stageEvents: TimelineEvent[] = db
    .select()
    .from(stageTransitions)
    .where(eq(stageTransitions.bingoId, bingoId))
    .all()
    .filter((s) => s.toStage === "live" || s.toStage === "complete")
    .map((s) => ({ at: s.createdAt, type: "stage_changed", teamId: null, what: s.toStage === "live" ? "The bingo went live" : "The bingo ended", points: null }));

  const teamIds = db.select({ id: teams.id }).from(teams).where(eq(teams.bingoId, bingoId)).all().map((t) => t.id);
  if (teamIds.length === 0) return stageEvents.sort((a, b) => a.at.getTime() - b.at.getTime());

  const tileRows = db.select().from(tiles).where(eq(tiles.bingoId, bingoId)).all();
  const tileByNodeId = new Map(tileRows.map((t) => [t.nodeId, t]));
  const tileNodeIds = tileRows.map((t) => t.nodeId);

  // Everything that earned points. A node completed with nothing awarded (a gated part, a container) isn't an award.
  const awards = db.select().from(teamNodeState).where(inArray(teamNodeState.teamId, teamIds)).all().filter((r) => r.pointsAwarded > 0);
  const labels = labelNodes(db, bingoId, [...new Set(awards.map((r) => r.nodeId))]);
  const awardEvents: TimelineEvent[] = awards.map((r) => {
    const { kind, label } = labels.get(r.nodeId)!;
    const what = kind === "tile" ? `${label} tile bonus` : label;
    return { at: r.completedAt, type: kind === "line" ? "line_completed" : "points_earned", teamId: r.teamId, what, points: r.pointsAwarded };
  });

  const adjustmentEvents: TimelineEvent[] = db
    .select()
    .from(teamPointAdjustments)
    .where(eq(teamPointAdjustments.bingoId, bingoId))
    .all()
    .map((a) => ({ at: a.createdAt, type: "point_adjustment", teamId: a.teamId, what: a.reason, points: a.amount }));

  // "Task" here means any node that's a direct child of a tile's node.
  const taskEdges = tileNodeIds.length ? db.select({ parentId: nodeEdges.parentId, childId: nodeEdges.childId }).from(nodeEdges).where(inArray(nodeEdges.parentId, tileNodeIds)).all() : [];
  const taskNodeIds = taskEdges.map((e) => e.childId);
  const tileIdByTaskNode = new Map(taskEdges.map((e) => [e.childId, e.parentId]));
  const taskNodeRows = taskNodeIds.length ? db.select().from(nodes).where(inArray(nodes.id, taskNodeIds)).all() : [];
  const taskNodeById = new Map(taskNodeRows.map((n) => [n.id, n]));

  const taskStateRows = taskNodeIds.length
    ? db.select().from(teamNodeState).where(and(inArray(teamNodeState.teamId, teamIds), inArray(teamNodeState.nodeId, taskNodeIds))).all()
    : [];
  const firstByTask = new Map<string, (typeof taskStateRows)[number]>();
  for (const r of taskStateRows) {
    const existing = firstByTask.get(r.nodeId);
    if (!existing || r.completedAt.getTime() < existing.completedAt.getTime()) firstByTask.set(r.nodeId, r);
  }
  const firstEvents: TimelineEvent[] = [...firstByTask.values()].map((r) => {
    const tile = tileByNodeId.get(tileIdByTaskNode.get(r.nodeId)!);
    const node = taskNodeById.get(r.nodeId);
    return { at: r.completedAt, type: "first_completion", teamId: r.teamId, what: `${tile?.name ?? ""} — ${node?.label ?? "Task"}`, points: null };
  });

  return [...stageEvents, ...awardEvents, ...adjustmentEvents, ...firstEvents].sort((a, b) => a.at.getTime() - b.at.getTime());
}

export interface ContributionClaim {
  submissionId: string;
  /** The item or task the claim was for. */
  label: string;
  /** How much of it counted (a SUM's last claim only counts for what was still needed). */
  quantity: number;
}

export interface ContributionAward {
  nodeId: string;
  kind: "task" | "tile" | "line";
  label: string;
  /** The whole award, and this player's part of it. */
  awardPoints: number;
  points: number;
  fraction: number;
  claims: ContributionClaim[];
  /** Line bonuses: the tiles of the line this player had a share of. */
  viaTiles?: string[];
}

export interface ContributionCount {
  userId: string;
  user: MinimalUser;
  teamId: string;
  approvedSubmissions: number;
  /** Points share (CONTEXT.md), unrounded. */
  pointsShare: number;
  /** GP gained (CONTEXT.md): GP values of this player's approved claims. */
  gpGained: number;
  awards: ContributionAward[];
}

/** A Team's exclusivity-filtered approved Claims, and the awards they earned. */
export interface TeamCredits {
  teamId: string;
  claims: (CreditClaim & { submittedAt: Date; gpValue: number | null })[];
  credits: AwardCredit[];
}

/**
 * Every award each team holds, credited to the Players whose Claims completed it (pointsShare.ts). Replays the
 * same inputs rebuildTeamState scored from: the bingo's graph and each team's exclusivity-filtered approved claims.
 */
export function getTeamCredits(db: Db, bingoId: string): TeamCredits[] {
  const teamIds = db.select({ id: teams.id }).from(teams).where(eq(teams.bingoId, bingoId)).all().map((t) => t.id);
  if (teamIds.length === 0) return [];

  const { engineNodes, childrenOf } = getFullGraph(db, bingoId);
  const tileNodeIds = new Set(db.select({ nodeId: tiles.nodeId }).from(tiles).where(eq(tiles.bingoId, bingoId)).all().map((t) => t.nodeId));
  const lineNodeIds = new Set(db.select({ nodeId: bingoLines.nodeId }).from(bingoLines).where(eq(bingoLines.bingoId, bingoId)).all().map((l) => l.nodeId));

  return teamIds.map((teamId) => {
    const approved = db
      .select({ claimId: claims.id, submissionId: submissions.id, userId: submissions.submittedByUserId, nodeId: claims.nodeId, itemName: claims.itemName, quantity: claims.quantity, reviewedAt: submissions.reviewedAt, submittedAt: submissions.submittedAt, gpValue: claims.gpValue })
      .from(claims)
      .innerJoin(submissions, eq(claims.submissionId, submissions.id))
      .innerJoin(nodes, eq(claims.nodeId, nodes.id))
      .where(and(eq(submissions.teamId, teamId), eq(submissions.status, "approved"), eq(nodes.bingoId, bingoId)))
      .all()
      .map((r) => ({ ...r, reviewedAt: r.reviewedAt! }));
    const awards = db
      .select({ nodeId: teamNodeState.nodeId, points: teamNodeState.pointsAwarded })
      .from(teamNodeState)
      .where(eq(teamNodeState.teamId, teamId))
      .all()
      .filter((a) => a.points > 0);
    const kept = applyExclusivity(db, bingoId, approved);
    return { teamId, claims: kept, credits: creditAwards({ nodes: engineNodes, childrenOf, claims: kept, awards, tileNodeIds, lineNodeIds }) };
  });
}

/** Each Player's credits from getTeamCredits. The per-player breakdown is kept whole so other stats (Titles) can build on it. */
export function getPointsShares(db: Db, bingoId: string, teamCredits = getTeamCredits(db, bingoId)): Map<string, { teamId: string; credits: AwardCredit[] }> {
  const out = new Map<string, { teamId: string; credits: AwardCredit[] }>();
  for (const { teamId, credits } of teamCredits) {
    for (const credit of credits) {
      for (const share of credit.shares) {
        const entry = out.get(share.userId) ?? { teamId, credits: [] };
        entry.credits.push({ ...credit, shares: [share] });
        out.set(share.userId, entry);
      }
    }
  }
  return out;
}

// Every member of every team with their approved submissions and Points share, highest share first. Members
// with nothing approved yet are included at 0, so a team sees its whole roster.
export function getContributionCounts(db: Db, bingoId: string, shares = getPointsShares(db, bingoId)): ContributionCount[] {
  const teamIds = db.select({ id: teams.id }).from(teams).where(eq(teams.bingoId, bingoId)).all().map((t) => t.id);
  if (teamIds.length === 0) return [];

  const teamByUser = new Map<string, string>();
  for (const m of db.select({ userId: teamMembers.userId, teamId: teamMembers.teamId }).from(teamMembers).where(inArray(teamMembers.teamId, teamIds)).all()) teamByUser.set(m.userId, m.teamId);

  const submissionCounts = new Map<string, number>();
  const rows = db
    .select({ userId: submissions.submittedByUserId, teamId: submissions.teamId })
    .from(submissions)
    .where(and(inArray(submissions.teamId, teamIds), eq(submissions.status, "approved")))
    .all();
  for (const r of rows) {
    submissionCounts.set(r.userId, (submissionCounts.get(r.userId) ?? 0) + 1);
    if (!teamByUser.has(r.userId)) teamByUser.set(r.userId, r.teamId);
  }

  const gpByUser = new Map<string, number>();
  for (const r of approvedGpRows(db, teamIds)) {
    gpByUser.set(r.userId, (gpByUser.get(r.userId) ?? 0) + r.gpValue!);
    if (!teamByUser.has(r.userId)) teamByUser.set(r.userId, r.teamId);
  }

  const nodeIds = [...new Set([...shares.values()].flatMap((s) => s.credits.flatMap((c) => [c.nodeId, ...c.shares.flatMap((sh) => sh.claims.map((cl) => cl.nodeId))])))];
  const labels = labelNodes(db, bingoId, nodeIds);
  const leafRows = nodeIds.length ? db.select({ id: nodes.id, label: nodes.label, itemName: nodes.itemName }).from(nodes).where(inArray(nodes.id, nodeIds)).all() : [];
  const leafById = new Map(leafRows.map((n) => [n.id, n]));
  const tileNameByNodeId = new Map(db.select({ nodeId: tiles.nodeId, name: tiles.name }).from(tiles).where(eq(tiles.bingoId, bingoId)).all().map((t) => [t.nodeId, t.name]));

  const awardsFor = (credits: AwardCredit[]): ContributionAward[] =>
    credits
      .map((credit) => {
        const share = credit.shares[0]!;
        const label = labels.get(credit.nodeId)?.label ?? "Bonus";
        return {
          nodeId: credit.nodeId,
          kind: credit.kind,
          label: credit.kind === "tile" ? `${label} tile bonus` : label,
          awardPoints: credit.points,
          points: share.points,
          fraction: share.fraction,
          claims: share.claims.map((c) => {
            const leaf = leafById.get(c.nodeId);
            return { submissionId: c.submissionId, label: c.itemName ?? leaf?.itemName ?? leaf?.label ?? "Task", quantity: c.quantity };
          }),
          ...(share.viaTileNodeIds ? { viaTiles: share.viaTileNodeIds.map((id) => tileNameByNodeId.get(id) ?? "A tile") } : {}),
        };
      })
      .sort((a, b) => b.points - a.points);

  const userIds = [...teamByUser.keys()];
  const userRows = userIds.length ? db.select(MINIMAL_USER_COLS).from(users).where(inArray(users.id, userIds)).all() : [];
  const rsns = rsnsInBingo(db, bingoId, userIds);
  const userById = new Map(userRows.map((u) => [u.id, { ...u, rsn: rsns.get(u.id) ?? null }]));

  return userIds
    .map((userId) => {
      const awards = awardsFor(shares.get(userId)?.credits ?? []);
      return {
        userId,
        user: userById.get(userId)!,
        teamId: teamByUser.get(userId)!,
        approvedSubmissions: submissionCounts.get(userId) ?? 0,
        pointsShare: awards.reduce((sum, a) => sum + a.points, 0),
        gpGained: gpByUser.get(userId) ?? 0,
        awards,
      };
    })
    .sort((a, b) => b.pointsShare - a.pointsShare || b.approvedSubmissions - a.approvedSubmissions);
}

// The approved claims that have a GP value, with whose drop and which team. What GP gained is summed from.
function approvedGpRows(db: Db, teamIds: string[]) {
  if (teamIds.length === 0) return [];
  return db
    .select({
      claimId: claims.id,
      submissionId: submissions.id,
      userId: submissions.submittedByUserId,
      teamId: submissions.teamId,
      itemName: claims.itemName,
      quantity: claims.quantity,
      gpValue: claims.gpValue,
      at: submissions.submittedAt,
      valuedAsItemName: nodes.valuedAsItemName,
      valuedAsDivisor: nodes.valuedAsDivisor,
      valuedAsSource: nodes.valuedAsSource,
    })
    .from(claims)
    .innerJoin(submissions, eq(claims.submissionId, submissions.id))
    .innerJoin(nodes, eq(claims.nodeId, nodes.id))
    .where(and(inArray(submissions.teamId, teamIds), eq(submissions.status, "approved"), isNotNull(claims.gpValue)))
    .all();
}

export interface TeamGpGained {
  teamId: string;
  gpGained: number;
}

export interface GpDrop {
  claimId: string;
  submissionId: string;
  teamId: string;
  user: MinimalUser;
  itemName: string;
  quantity: number;
  gpValue: number;
  at: Date;
  /** The claimed Task's Valued as, when it has one: why an ordinary item has this value. */
  valuedAs: ValuedAs | null;
}

/** GP gained per team, every team included (at 0 when nothing valued is approved yet). */
export function getTeamGpGained(db: Db, bingoId: string): TeamGpGained[] {
  const teamIds = db.select({ id: teams.id }).from(teams).where(eq(teams.bingoId, bingoId)).all().map((t) => t.id);
  const gp = new Map(teamIds.map((id) => [id, 0]));
  for (const r of approvedGpRows(db, teamIds)) gp.set(r.teamId, gp.get(r.teamId)! + r.gpValue!);
  return teamIds.map((teamId) => ({ teamId, gpGained: gp.get(teamId)! })).sort((a, b) => b.gpGained - a.gpGained);
}

/** Every approved claim with a GP value, most valuable first. */
export function getGpDrops(db: Db, bingoId: string): GpDrop[] {
  const teamIds = db.select({ id: teams.id }).from(teams).where(eq(teams.bingoId, bingoId)).all().map((t) => t.id);
  const rows = approvedGpRows(db, teamIds).sort((a, b) => b.gpValue! - a.gpValue!);
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const userRows = userIds.length ? db.select(MINIMAL_USER_COLS).from(users).where(inArray(users.id, userIds)).all() : [];
  const rsns = rsnsInBingo(db, bingoId, userIds);
  const userById = new Map(userRows.map((u) => [u.id, { ...u, rsn: rsns.get(u.id) ?? null }]));
  return rows.map((r) => ({
    claimId: r.claimId,
    submissionId: r.submissionId,
    teamId: r.teamId,
    user: userById.get(r.userId)!,
    itemName: r.itemName!,
    quantity: r.quantity,
    gpValue: r.gpValue!,
    at: r.at,
    valuedAs: valuedAsOf(r),
  }));
}

// Each tile's node, for every node under it: which Tile a Task or Part award counts towards.
function tileOfNodes(childrenOf: Map<string, string[]>, tileNodeIds: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const tileNodeId of tileNodeIds) {
    const walk = (id: string) => {
      for (const child of childrenOf.get(id) ?? []) {
        if (out.has(child)) continue;
        out.set(child, tileNodeId);
        walk(child);
      }
    };
    walk(tileNodeId);
  }
  return out;
}

// How far each node is below the top of its Tile: the outermost of several awards has the smallest depth.
function depthOfNodes(nodeIds: string[], childrenOf: Map<string, string[]>): Map<string, number> {
  const children = new Set([...childrenOf.values()].flat());
  const out = new Map<string, number>();
  const queue: [string, number][] = nodeIds.filter((id) => !children.has(id)).map((id) => [id, 0]);
  for (let i = 0; i < queue.length; i++) {
    const [id, depth] = queue[i]!;
    if (out.has(id)) continue;
    out.set(id, depth);
    for (const child of childrenOf.get(id) ?? []) queue.push([child, depth + 1]);
  }
  return out;
}

/**
 * Each Player's Luck (#195), from their Team's approved Claims and their Wise Old Man timeline. A Claim's Task for
 * Clutch is the outermost Task or Part award it earned Points share on: the most Items could still advance that, so
 * its drop is never made to look rarer than it was.
 */
function luckFacts(
  graph: { engineNodes: EngineNode[]; childrenOf: Map<string, string[]> },
  teamCredits: TeamCredits[],
  timelines: Map<string, WomSnapshot[]>,
  teamByUser: Map<string, string>,
  bingoStart: Date,
  bingoEnd: Date | null,
  weights: LuckWeights,
): Map<string, LuckFacts> {
  const { engineNodes, childrenOf } = graph;
  const boardItems = [...new Set(engineNodes.filter((n) => n.kind === "ITEM" && n.itemName).map((n) => n.itemName!))];
  const depth = depthOfNodes(engineNodes.map((n) => n.id), childrenOf);
  const rates = getDropRates();
  const out = new Map<string, LuckFacts>();

  for (const team of teamCredits) {
    const taskOf = new Map<string, string>();
    for (const credit of team.credits) {
      if (credit.kind !== "task") continue;
      for (const claim of credit.shares.flatMap((sh) => sh.claims)) {
        const current = taskOf.get(claim.claimId);
        if (!current || (depth.get(credit.nodeId) ?? 0) < (depth.get(current) ?? 0)) taskOf.set(claim.claimId, credit.nodeId);
      }
    }
    const claims: LuckClaim[] = team.claims
      .filter((c) => c.itemName)
      .map((c) => ({ claimId: c.claimId, userId: c.userId, itemName: c.itemName!, at: c.submittedAt, taskNodeId: taskOf.get(c.claimId) ?? null, gpValue: c.gpValue }));
    // Every call replays the Team's whole graph, and many Claims share a start (the Bingo's).
    const openAt = new Map<number, Map<string, Set<string>>>();
    const openItemsAt = (taskNodeId: string, at: Date) => {
      let open = openAt.get(at.getTime());
      if (!open) openAt.set(at.getTime(), (open = openItems(engineNodes, childrenOf, team.claims, at)));
      return open.get(taskNodeId) ?? new Set<string>();
    };
    const teamTimelines = new Map([...timelines].filter(([userId]) => teamByUser.get(userId) === team.teamId));

    const luck = playerLuck({ rates, bingoStart, bingoEnd, now: now(), claims, timelines: teamTimelines, boardItems, openItemsAt, weights });
    for (const [userId, l] of luck) {
      out.set(userId, {
        spoon: l.spoon && { value: l.spoon.value, itemName: l.spoon.best.itemName, kills: l.spoon.best.kills },
        dry: l.dry && { value: l.dry.value, boss: BOSS_NAMES[l.dry.metric], kills: l.dry.kills },
        clutch: l.clutch && { value: l.clutch.value, luck: l.clutch.drop.luck, itemName: l.clutch.drop.itemName, gpValue: l.clutch.gpValue },
      });
    }
  }
  return out;
}

/**
 * What Titles (shared/titles.ts) are picked from: one entry per Player of `contributions`, built from their awards
 * (with when each completed and whether they closed it), their Submissions and Claims, and their Wise Old Man gains.
 */
export function getTitleFacts(
  db: Db,
  bingoId: string,
  contributions: ContributionCount[],
  teamCredits: TeamCredits[],
  shares = getPointsShares(db, bingoId, teamCredits),
  luckWeights = getTitleSettings(db).luck,
): PlayerTitleFacts[] {
  const teamIds = [...new Set(contributions.map((c) => c.teamId))];
  if (teamIds.length === 0) return [];
  const bingo = db.select().from(bingos).where(eq(bingos.id, bingoId)).get()!;

  const stateRows = db.select().from(teamNodeState).where(inArray(teamNodeState.teamId, teamIds)).all();
  const completedAt = new Map(stateRows.map((r) => [`${r.teamId}:${r.nodeId}`, r.completedAt]));
  const teamAwardPoints = new Map<string, number>();
  for (const r of stateRows) teamAwardPoints.set(r.teamId, (teamAwardPoints.get(r.teamId) ?? 0) + r.pointsAwarded);

  const tileRows = db.select({ nodeId: tiles.nodeId, name: tiles.name }).from(tiles).where(eq(tiles.bingoId, bingoId)).all();
  const tileName = new Map(tileRows.map((t) => [t.nodeId, t.name]));
  const graph = getFullGraph(db, bingoId);
  const tileOf = tileOfNodes(graph.childrenOf, tileRows.map((t) => t.nodeId));

  const teamByUser = new Map(contributions.map((c) => [c.userId, c.teamId]));
  const count = () => new Map<string, number>();
  const bump = (m: Map<string, number>, userId: string, by = 1) => m.set(userId, (m.get(userId) ?? 0) + by);
  const approved = count();
  const rejected = count();
  const posted = count();
  // When each count last went up, for Title ties (PlayerTitleFacts.lastAt).
  const stamp = () => new Map<string, Date>();
  const mark = (m: Map<string, Date>, userId: string, at: Date) => {
    const prev = m.get(userId);
    if (!prev || at > prev) m.set(userId, at);
  };
  const approvedAt = stamp();
  const rejectedAt = stamp();
  const postedAt = stamp();
  for (const sub of db.select().from(submissions).where(inArray(submissions.teamId, teamIds)).all()) {
    // The poster counts only when they're on the Team (a Moderator posting for a Team isn't one of its Players).
    const postedByTeammate = sub.postedByUserId && sub.postedByUserId !== sub.submittedByUserId && teamByUser.get(sub.postedByUserId) === sub.teamId;
    if (sub.status === "approved") {
      bump(approved, sub.submittedByUserId);
      mark(approvedAt, sub.submittedByUserId, sub.submittedAt);
      if (postedByTeammate) {
        bump(posted, sub.postedByUserId!);
        mark(postedAt, sub.postedByUserId!, sub.submittedAt);
      }
    } else if (sub.status === "rejected") {
      const who = postedByTeammate ? sub.postedByUserId! : sub.submittedByUserId;
      bump(rejected, who);
      mark(rejectedAt, who, sub.submittedAt);
    }
  }

  const items = new Map<string, Set<string>>();
  const quantity = count();
  const newItemAt = stamp();
  const itemAt = stamp();
  const itemClaims = db
    .select({ userId: submissions.submittedByUserId, itemName: claims.itemName, quantity: claims.quantity, at: submissions.submittedAt })
    .from(claims)
    .innerJoin(submissions, eq(claims.submissionId, submissions.id))
    .where(and(inArray(submissions.teamId, teamIds), eq(submissions.status, "approved"), isNotNull(claims.itemName)))
    .orderBy(submissions.submittedAt)
    .all();
  for (const c of itemClaims) {
    const mine = items.get(c.userId) ?? new Set<string>();
    const name = c.itemName!.toLowerCase();
    if (!mine.has(name)) mark(newItemAt, c.userId, c.at);
    items.set(c.userId, mine.add(name));
    bump(quantity, c.userId, c.quantity);
    mark(itemAt, c.userId, c.at);
  }

  const start = effectiveStartsAt(db, bingo);
  const end = endedAt(db, bingo);
  const timelines: Map<string, WomSnapshot[]> = start ? loadTimelines(db, bingoId) : new Map();
  const luck = start ? luckFacts(graph, teamCredits, timelines, teamByUser, start, end, luckWeights) : new Map<string, LuckFacts>();
  const achievementTallies = getAchievementTallies(db, bingo);

  return contributions.map((c) => {
    const awards: TitleAwardFact[] = (shares.get(c.userId)?.credits ?? []).map((credit) => {
      const tileNodeId = credit.kind === "line" ? null : credit.kind === "tile" ? credit.nodeId : (tileOf.get(credit.nodeId) ?? null);
      return {
        kind: credit.kind,
        tileNodeId,
        tileName: tileNodeId ? (tileName.get(tileNodeId) ?? null) : null,
        points: credit.shares[0]!.points,
        completedAt: (completedAt.get(`${c.teamId}:${credit.nodeId}`) ?? new Date(0)).toISOString(),
        closed: credit.kind === "task" && credit.closedBy.includes(c.userId),
      };
    });
    const timeline = timelines.get(c.userId);
    return {
      userId: c.userId,
      teamId: c.teamId,
      pointsShare: c.pointsShare,
      teamAwardPoints: teamAwardPoints.get(c.teamId) ?? 0,
      awards,
      approvedSubmissions: approved.get(c.userId) ?? 0,
      rejectedSubmissions: rejected.get(c.userId) ?? 0,
      postedForTeammates: posted.get(c.userId) ?? 0,
      distinctItems: items.get(c.userId)?.size ?? 0,
      totalQuantity: quantity.get(c.userId) ?? 0,
      wom: start && timeline ? gainsOf(timeline, start, end) : null,
      luck: luck.get(c.userId) ?? null,
      achievements: achievementTallies ? (achievementTallies.get(c.userId) ?? { earned: 0, lastEarnedAt: null }) : null,
      lastAt: {
        approved: approvedAt.get(c.userId)?.toISOString() ?? null,
        rejected: rejectedAt.get(c.userId)?.toISOString() ?? null,
        posted: postedAt.get(c.userId)?.toISOString() ?? null,
        newItem: newItemAt.get(c.userId)?.toISOString() ?? null,
        item: itemAt.get(c.userId)?.toISOString() ?? null,
      },
    };
  });
}

export interface Stats {
  pointsOverTime: PointsOverTimePoint[];
  timeline: TimelineEvent[];
  contributions: ContributionCount[];
  heatmap: TileHeatmapCell[];
  teamGpGained: TeamGpGained[];
  drops: GpDrop[];
  titleFacts: PlayerTitleFacts[];
  titleContext: { liveAt: Date | null; endedAt: Date | null };
  /** The Site admin's Title settings: which Titles are on and their minimums, for picking holders. */
  titleSettings: TitleSettings;
  womReadAt: Date | null;
}

export function getStats(db: Db, bingoId: string): Stats {
  const teamCredits = getTeamCredits(db, bingoId);
  const shares = getPointsShares(db, bingoId, teamCredits);
  const contributions = getContributionCounts(db, bingoId, shares);
  const bingo = db.select().from(bingos).where(eq(bingos.id, bingoId)).get()!;
  const titleSettings = getTitleSettings(db);
  return {
    pointsOverTime: getPointsOverTime(db, bingoId),
    timeline: getTimeline(db, bingoId),
    contributions,
    heatmap: getTileHeatmap(db, bingoId),
    teamGpGained: getTeamGpGained(db, bingoId),
    drops: getGpDrops(db, bingoId),
    titleFacts: getTitleFacts(db, bingoId, contributions, teamCredits, shares, titleSettings.luck),
    titleContext: { liveAt: effectiveStartsAt(db, bingo), endedAt: endedAt(db, bingo) },
    titleSettings,
    womReadAt: lastReadAt(db, bingoId),
  };
}

// What a player may see while the bingo is live: only their own team's rows.
// Stage changes (teamId null) and other teams' draft picks drop out of the
// timeline along with everything else that isn't theirs.
export function filterStatsForTeam(stats: Stats, teamId: string): Stats {
  const own = <T extends { teamId: string | null }>(rows: T[]) => rows.filter((r) => r.teamId === teamId);
  return {
    pointsOverTime: own(stats.pointsOverTime),
    timeline: own(stats.timeline),
    contributions: own(stats.contributions),
    heatmap: own(stats.heatmap),
    teamGpGained: own(stats.teamGpGained),
    drops: own(stats.drops),
    titleFacts: own(stats.titleFacts),
    titleContext: stats.titleContext,
    titleSettings: stats.titleSettings,
    womReadAt: stats.womReadAt,
  };
}

// "Team X was first to complete Y" tells a team what the others have and haven't done, so a Player only gets it
// once the bingo is over. Mods get it throughout.
function withoutFirstCompletions(stats: Stats): Stats {
  return { ...stats, timeline: stats.timeline.filter((e) => e.type !== "first_completion") };
}

/**
 * The stats one viewer may see. Mods get everything. A Player still in the running (`teamId` set) sees only
 * their own team's rows, and first completions only once the bingo is `complete`.
 */
export function getStatsForViewer(db: Db, bingoId: string, viewer: { isMod: boolean; teamId: string | null; bingoComplete: boolean }): Stats {
  const stats = getStats(db, bingoId);
  if (viewer.isMod) return stats;
  const visible = viewer.bingoComplete ? stats : withoutFirstCompletions(stats);
  return viewer.teamId ? filterStatsForTeam(visible, viewer.teamId) : visible;
}

// One cell per (team, tile) — completedTasks/totalTasks lets the client shade
// by completion fraction rather than a binary done/not-done. "Task" again
// means a direct child of the tile's node.
export function getTileHeatmap(db: Db, bingoId: string): TileHeatmapCell[] {
  const teamIds = db.select({ id: teams.id }).from(teams).where(eq(teams.bingoId, bingoId)).all().map((t) => t.id);
  const tileRows = db.select().from(tiles).where(eq(tiles.bingoId, bingoId)).all();
  if (teamIds.length === 0 || tileRows.length === 0) return [];

  const tileNodeIds = tileRows.map((t) => t.nodeId);
  // Each Tile's Parts in board order, and the lines through it (a line's node has its Tiles' nodes as children).
  const taskEdges = db.select({ parentId: nodeEdges.parentId, childId: nodeEdges.childId, sortOrder: nodeEdges.sortOrder }).from(nodeEdges).where(inArray(nodeEdges.parentId, tileNodeIds)).all();
  const partsOf = new Map<string, string[]>();
  for (const e of [...taskEdges].sort((a, b) => a.sortOrder - b.sortOrder)) partsOf.set(e.parentId, [...(partsOf.get(e.parentId) ?? []), e.childId]);
  const lineNodeIds = db.select({ nodeId: bingoLines.nodeId }).from(bingoLines).where(eq(bingoLines.bingoId, bingoId)).all().map((l) => l.nodeId);
  const lineEdges = lineNodeIds.length ? db.select({ parentId: nodeEdges.parentId, childId: nodeEdges.childId }).from(nodeEdges).where(inArray(nodeEdges.parentId, lineNodeIds)).all() : [];
  const linesThrough = new Map<string, string[]>();
  const tilesOnLine = new Map<string, string[]>();
  for (const e of lineEdges) {
    linesThrough.set(e.childId, [...(linesThrough.get(e.childId) ?? []), e.parentId]);
    tilesOnLine.set(e.parentId, [...(tilesOnLine.get(e.parentId) ?? []), e.childId]);
  }

  // Every node under each Part, for whether it has any progress: a finished requirement, or an approved Claim.
  const { childrenOf } = getFullGraph(db, bingoId);
  const under = (id: string): string[] => [id, ...(childrenOf.get(id) ?? []).flatMap(under)];
  const partIds = taskEdges.map((e) => e.childId);
  const nodesUnder = new Map(partIds.map((id) => [id, under(id)]));

  const done = new Set(
    db
      .select({ teamId: teamNodeState.teamId, nodeId: teamNodeState.nodeId })
      .from(teamNodeState)
      .where(inArray(teamNodeState.teamId, teamIds))
      .all()
      .map((r) => `${r.teamId}:${r.nodeId}`),
  );
  const claimed = new Set(
    db
      .select({ teamId: submissions.teamId, nodeId: claims.nodeId })
      .from(claims)
      .innerJoin(submissions, eq(claims.submissionId, submissions.id))
      .where(and(inArray(submissions.teamId, teamIds), eq(submissions.status, "approved")))
      .all()
      .map((r) => `${r.teamId}:${r.nodeId}`),
  );

  const cells: TileHeatmapCell[] = [];
  for (const teamId of teamIds) {
    const isDone = (nodeId: string) => done.has(`${teamId}:${nodeId}`);
    for (const tile of tileRows) {
      const parts: TileProgress[] = (partsOf.get(tile.nodeId) ?? []).map((id) =>
        isDone(id) ? "done" : (nodesUnder.get(id) ?? []).some((n) => isDone(n) || claimed.has(`${teamId}:${n}`)) ? "started" : "none",
      );
      const lines = linesThrough.get(tile.nodeId) ?? [];
      const completedTasks = parts.filter((p) => p === "done").length;
      cells.push({
        tileId: tile.id,
        teamId,
        completedTasks,
        totalTasks: parts.length,
        parts,
        tile: isDone(tile.nodeId) ? "done" : parts.some((p) => p !== "none") ? "started" : "none",
        line: lines.some(isDone) ? "done" : lines.some((l) => (tilesOnLine.get(l) ?? []).some(isDone)) ? "started" : "none",
      });
    }
  }
  return cells;
}
