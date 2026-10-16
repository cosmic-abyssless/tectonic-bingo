import { and, eq, isNull } from "drizzle-orm";
import * as z from "zod";
import { NOT_RECORDED_HISTORICAL, type GraphNode } from "@bingo/shared";
import { bingoLines, claims, nodes, submissions } from "../../db/schema";
import { getBoardTiles } from "../../services/boardService";
import { evaluateGraph } from "../../services/engine";
import { applyExclusivity } from "../../services/exclusivityService";
import { getApprovedClaims, getFullGraph, leafDescendants } from "../../services/graphService";
import { getRecorded, getStandings } from "../../services/historicalService";
import { labelNodes } from "../../services/statsService";
import { getTeamProgress } from "../../services/teamService";
import { defineTool, McpToolError } from "../tool";
import { ruleOf } from "./bingoBoard";
import { bingoBySlug, bingoIdForSlug, bingoSpan, fitList, hoursFrom, LIST_BUDGET, slugInput, teamNames } from "./common";

/** The answer budget the Lines and the Point adjustments each get; the Tiles get the rest. */
const SIDE_LIST_BUDGET = 10_000;

/** Item names and their summed quantities, most first. */
function itemTotals(rows: { itemName: string | null; quantity: number }[]): { item: string; quantity: number }[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const item = r.itemName ?? "manual check";
    totals.set(item, (totals.get(item) ?? 0) + r.quantity);
  }
  return [...totals].map(([item, quantity]) => ({ item, quantity })).sort((a, b) => b.quantity - a.quantity || a.item.localeCompare(b.item));
}

export const teamProgress = defineTool({
  name: "team_progress",
  title: "Team progress",
  description:
    "One Team's progress on one Bingo's Board, as its board shows it. totalPoints matches the scoreboard: pointsFromBoard (Parts, Tasks, Tile bonuses and Line bonuses) plus its Point adjustments. " +
    "tiles: each Tile in board order (row and column count from 1) with complete, completedAtHours (hours from the Bingo's start), pointsAwarded (everything under the Tile, its bonus included) " +
    "and its parts (the Tile's pages or sections), each a tree of tasks. Every Part and Task has rule (how it's completed, as bingo_board words it), label or item, points (on offer), complete, " +
    "pointsAwarded (less than points when its points are withheld until another Part is complete: pointsWithheldUntil names it), and completedAtHours once complete. " +
    "An unfinished one also has progress {have, need}: approved Tasks so far for 'all of' and 'at least N of', the approved total for 'collect N in total'; " +
    "approvedItems (the approved drops under it that count, item and quantity) and pendingItems (drops under it still awaiting review). An Item has approvedQuantity when any of it was approved. " +
    "lines: each Line the Team completed, when and for how many points. adjustments: each Point adjustment (amount, reason, atHours from the start). " +
    "submissions: the Team's Submissions by status, Proof screenshots included. A Historical Bingo shows what it never recorded as 'Not recorded for historical Bingos', and its recorded final place.",
  input: z.object({
    slug: slugInput,
    team: z.string().min(1).describe("The Team's name (any case)."),
    tile: z.string().optional().describe("Only Tiles whose name contains this text (any case)."),
    limit: z.number().int().positive().optional().describe("At most this many Tiles."),
  }),
  bingoIdFor: bingoIdForSlug,
  run: ({ slug, team: teamName, tile: nameFilter, limit }, { db, scope }) => {
    const bingo = bingoBySlug(db, slug, scope);
    const names = teamNames(db, bingo.id);
    const teamId = [...names].find(([, name]) => name.toLowerCase() === teamName.trim().toLowerCase())?.[0];
    if (!teamId) {
      const all = [...names.values()].sort();
      throw new McpToolError(all.length ? `No Team in this Bingo is named "${teamName}". Its Teams: ${all.join(", ")}.` : "This Bingo has no Teams.");
    }
    const { start } = bingoSpan(db, bingo);
    const recorded = bingo.historical ? getRecorded(db, bingo.id) : null;
    const tasksRecorded = !recorded || recorded.tasks;
    const progress = getTeamProgress(db, teamId);
    const stateOf = new Map(progress.nodeStates.map((s) => [s.nodeId, s]));

    // Partial progress the way scoring sees it (scoringService.scoreTeam): the approved Claims that count under the
    // Exclusive Item rules, run through the engine, which gives each Item and total its approved quantity.
    const graph = getFullGraph(db, bingo.id);
    const counted = applyExclusivity(db, bingo.id, getApprovedClaims(db, teamId, bingo.id));
    const results = evaluateGraph(graph.engineNodes, graph.childrenOf, counted);
    const countedOn = new Map<string, typeof counted>();
    for (const c of counted) countedOn.set(c.nodeId, [...(countedOn.get(c.nodeId) ?? []), c]);
    const pendingOn = new Map<string, { itemName: string | null; quantity: number }[]>();
    const pendingRows = db
      .select({ nodeId: claims.nodeId, itemName: claims.itemName, quantity: claims.quantity })
      .from(claims)
      .innerJoin(submissions, eq(claims.submissionId, submissions.id))
      .innerJoin(nodes, eq(claims.nodeId, nodes.id))
      .where(and(eq(submissions.teamId, teamId), eq(submissions.status, "pending"), eq(nodes.bingoId, bingo.id), isNull(nodes.removedAt)))
      .all();
    for (const r of pendingRows) pendingOn.set(r.nodeId, [...(pendingOn.get(r.nodeId) ?? []), r]);

    const gateIds = graph.engineNodes.filter((n) => n.pointsGateNodeId).map((n) => n.pointsGateNodeId!);
    const gateLabels = labelNodes(db, bingo.id, gateIds);

    const requirement = (node: GraphNode): Record<string, unknown> => {
      const state = stateOf.get(node.id);
      const result = results.get(node.id);
      const awarded = state?.pointsAwarded ?? 0;
      const out: Record<string, unknown> = {
        rule: ruleOf(node),
        ...(node.label ? { label: node.label } : {}),
        ...(node.itemName ? { item: node.itemName } : {}),
        points: node.points,
        complete: !!state,
        pointsAwarded: awarded,
      };
      if (state) out.completedAtHours = hoursFrom(start, state.completedAt);
      if (state && awarded < node.points && node.pointsGateNodeId) out.pointsWithheldUntil = gateLabels.get(node.pointsGateNodeId)?.label ?? "another Part";
      if (node.kind === "ITEM" && result?.value) out.approvedQuantity = result.value;
      if (!state) {
        const children = node.children.map((c) => !!stateOf.get(c.id));
        if (node.kind === "ALL") out.progress = { have: children.filter(Boolean).length, need: children.length };
        if (node.kind === "COUNT") out.progress = { have: children.filter(Boolean).length, need: node.minCount ?? 1 };
        if (node.kind === "SUM") out.progress = { have: result?.value ?? 0, need: node.quantity ?? 1 };
        if (node.kind !== "ITEM" && node.kind !== "MANUAL") {
          const leaves = leafDescendants(node.id, graph.childrenOf, graph.nodesById);
          const approved = itemTotals(leaves.flatMap((id) => countedOn.get(id) ?? []));
          if (approved.length) out.approvedItems = approved;
        }
        const pending = itemTotals(leafDescendants(node.id, graph.childrenOf, graph.nodesById).flatMap((id) => pendingOn.get(id) ?? []));
        if (pending.length) out.pendingItems = pending;
      }
      if (node.children.length) out.tasks = node.children.map(requirement);
      return out;
    };

    // Everything under a Tile once, so an Item shared by two of its Parts isn't counted twice.
    const pointsUnder = (node: GraphNode, seen = new Set<string>()): number => {
      if (seen.has(node.id)) return 0;
      seen.add(node.id);
      return (stateOf.get(node.id)?.pointsAwarded ?? 0) + node.children.reduce((sum, c) => sum + pointsUnder(c, seen), 0);
    };

    const tiles = getBoardTiles(db, bingo.id)
      .filter((t) => !nameFilter || t.name.toLowerCase().includes(nameFilter.toLowerCase()))
      .sort((a, b) => a.boardRow - b.boardRow || a.boardCol - b.boardCol)
      .map((t) => {
        const state = stateOf.get(t.nodeId);
        return {
          tile: t.name,
          row: t.boardRow + 1,
          column: t.boardCol + 1,
          complete: !!state,
          ...(state ? { completedAtHours: hoursFrom(start, state.completedAt) } : {}),
          pointsAwarded: pointsUnder(t.node),
          ...(t.node.points ? { bonusPoints: t.node.points, bonusPointsAwarded: state?.pointsAwarded ?? 0 } : {}),
          parts: t.node.children.map(requirement),
        };
      });

    const lineRows = db.select().from(bingoLines).where(eq(bingoLines.bingoId, bingo.id)).all();
    const lineLabels = labelNodes(
      db,
      bingo.id,
      lineRows.map((l) => l.nodeId),
    );
    const lines = lineRows
      .filter((l) => stateOf.has(l.nodeId))
      .map((l) => ({ line: lineLabels.get(l.nodeId)?.label.replace(/ line bonus$/, "") ?? "Line", state: stateOf.get(l.nodeId)! }))
      .sort((a, b) => a.state.completedAt.getTime() - b.state.completedAt.getTime())
      .map(({ line, state }) => ({ line, completedAtHours: hoursFrom(start, state.completedAt), points: state.pointsAwarded }));

    const adjustments = progress.adjustments
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((a) => ({ amount: a.amount, reason: a.reason, atHours: hoursFrom(start, a.createdAt) }));

    const fittedAdjustments = fitList(adjustments, undefined, "Every Point adjustment couldn't fit.", SIDE_LIST_BUDGET);

    const statuses = db.select({ status: submissions.status }).from(submissions).where(eq(submissions.teamId, teamId)).all();
    const submissionCounts = { total: statuses.length, approved: 0, rejected: 0, pending: 0 };
    for (const s of statuses) submissionCounts[s.status]++;

    const notRecorded = (what: string) => `${NOT_RECORDED_HISTORICAL}: this Bingo ran on another website, which didn't record ${what}.`;
    const standing = recorded ? getStandings(db, bingo.id).find((s) => s.teamId === teamId) : undefined;
    const adjustmentPoints = progress.adjustments.reduce((sum, a) => sum + a.amount, 0);

    if (!tasksRecorded) {
      return {
        bingo: { slug: bingo.slug, name: bingo.name, stage: bingo.stage, historical: true },
        team: names.get(teamId)!,
        recordedPlace: standing?.place ?? notRecorded("the final standings"),
        totalPoints: standing?.points ?? notRecorded("the Teams' points"),
        tiles: notRecorded("Tile completion"),
        lines: notRecorded("Tile completion, so nor Lines"),
        adjustments: fittedAdjustments.items,
        submissions: recorded!.submissions ? submissionCounts : notRecorded("Submissions"),
        ...(fittedAdjustments.truncated ? { truncated: `Point adjustments: ${fittedAdjustments.truncated}` } : {}),
      };
    }

    const fittedTiles = fitList(tiles, limit, "Pass `tile` to pick Tiles by name, or a smaller `limit`.", LIST_BUDGET - 2 * SIDE_LIST_BUDGET);
    const fittedLines = fitList(lines, undefined, "Every Line couldn't fit.", SIDE_LIST_BUDGET);
    const truncated = [
      fittedTiles.truncated,
      fittedLines.truncated && `Lines: ${fittedLines.truncated}`,
      fittedAdjustments.truncated && `Point adjustments: ${fittedAdjustments.truncated}`,
    ].filter(Boolean);
    return {
      bingo: { slug: bingo.slug, name: bingo.name, stage: bingo.stage, historical: bingo.historical },
      team: names.get(teamId)!,
      ...(recorded ? { recordedPlace: standing?.place ?? notRecorded("the final standings") } : {}),
      totalPoints: progress.totalPoints,
      pointsFromBoard: progress.totalPoints - adjustmentPoints,
      tiles: fittedTiles.items,
      lines: fittedLines.items,
      adjustments: fittedAdjustments.items,
      submissions: recorded && !recorded.submissions ? notRecorded("Submissions") : submissionCounts,
      ...(truncated.length ? { truncated: truncated.join(" ") } : {}),
    };
  },
});
