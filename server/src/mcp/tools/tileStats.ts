import { and, eq, inArray } from "drizzle-orm";
import * as z from "zod";
import { claims, nodes, submissions, tileCategories, tiles } from "../../db/schema";
import { getFullGraph } from "../../services/graphService";
import { getTileHeatmap } from "../../services/statsService";
import { getTeamProgress } from "../../services/teamService";
import { defineTool } from "../tool";
import { bingoBySlug, bingoIdForSlug, bingoSpan, fitList, hoursFrom, slugInput, teamNames } from "./common";

/** Distinct rejection reasons kept per Task; the rest are counted. */
const MAX_REASONS = 10;

type SubmissionRow = { id: string; status: "pending" | "approved" | "rejected"; notes: string | null };

function submissionCounts(rows: SubmissionRow[], withReasons: boolean) {
  const counts = { total: rows.length, approved: 0, rejected: 0, pending: 0 };
  for (const r of rows) counts[r.status]++;
  if (!withReasons) return counts;
  const reasons = [...new Set(rows.filter((r) => r.status === "rejected" && r.notes?.trim()).map((r) => r.notes!.trim()))];
  return { ...counts, rejectionReasons: reasons.slice(0, MAX_REASONS), ...(reasons.length > MAX_REASONS ? { moreRejectionReasons: reasons.length - MAX_REASONS } : {}) };
}

export const tileStats = defineTool({
  name: "tile_stats",
  title: "Tile stats",
  description:
    "Every Tile of one Bingo in board order (row and column count from 1), and each Task (the Tile's direct Parts) within it: " +
    "which Teams completed it and when (hours from the Bingo's start); how many Teams started the Tile; " +
    "Submissions touching it (approved, rejected, pending) with the reviewers' notes on rejections as rejectionReasons; " +
    "how many Teams and Players marked interest; and points on offer against points earned. " +
    "pointsOnOffer is the sum of the points set on the Tile and every Task and Part under it (an ANY's alternatives all count, so it can be more than one Team can earn); " +
    "pointsEarned is what Teams were awarded for them, in total and per Team. Line bonuses are in bingo_summary, not here. " +
    "A Submission can claim several Tasks, so it counts once for each.",
  input: z.object({
    slug: slugInput,
    tile: z.string().optional().describe("Only Tiles whose name contains this text (any case)."),
    limit: z.number().int().positive().optional().describe("At most this many Tiles."),
  }),
  bingoIdFor: bingoIdForSlug,
  run: ({ slug, tile: nameFilter, limit }, { db }) => {
    const bingo = bingoBySlug(db, slug);
    const { start } = bingoSpan(db, bingo);
    const names = teamNames(db, bingo.id);
    const progress = [...names.keys()].map((teamId) => ({ teamId, ...getTeamProgress(db, teamId) }));
    const { childrenOf, nodesById } = getFullGraph(db, bingo.id);
    const labelOf = new Map(db.select({ id: nodes.id, label: nodes.label }).from(nodes).where(eq(nodes.bingoId, bingo.id)).all().map((n) => [n.id, n.label]));
    const categoryOf = new Map(db.select({ id: tileCategories.id, label: tileCategories.label }).from(tileCategories).where(eq(tileCategories.bingoId, bingo.id)).all().map((c) => [c.id, c.label]));
    const started = new Map<string, number>();
    for (const cell of getTileHeatmap(db, bingo.id)) if (cell.tile !== "none") started.set(cell.tileId, (started.get(cell.tileId) ?? 0) + 1);

    // Which Submissions have a Claim on each node.
    const teamIds = [...names.keys()];
    const claimRows = teamIds.length
      ? db
          .select({ nodeId: claims.nodeId, id: submissions.id, status: submissions.status, notes: submissions.reviewerNotes })
          .from(claims)
          .innerJoin(submissions, eq(claims.submissionId, submissions.id))
          .innerJoin(nodes, eq(claims.nodeId, nodes.id))
          .where(and(inArray(submissions.teamId, teamIds), eq(nodes.bingoId, bingo.id)))
          .all()
      : [];
    const submissionsOn = new Map<string, SubmissionRow[]>();
    for (const r of claimRows) submissionsOn.set(r.nodeId, [...(submissionsOn.get(r.nodeId) ?? []), r]);

    const under = (id: string, seen = new Set<string>()): Set<string> => {
      if (seen.has(id)) return seen;
      seen.add(id);
      for (const child of childrenOf.get(id) ?? []) under(child, seen);
      return seen;
    };

    const stats = (rootId: string, withReasons: boolean) => {
      const ids = under(rootId);
      const byTeam: Record<string, number> = {};
      let earned = 0;
      const completedBy: { team: string; hours: number | null }[] = [];
      for (const p of progress) {
        let points = 0;
        for (const s of p.nodeStates) {
          if (!ids.has(s.nodeId)) continue;
          points += s.pointsAwarded;
          if (s.nodeId === rootId) completedBy.push({ team: names.get(p.teamId)!, hours: hoursFrom(start, s.completedAt) });
        }
        if (points) byTeam[names.get(p.teamId)!] = points;
        earned += points;
      }
      const subs = new Map<string, SubmissionRow>();
      for (const id of ids) for (const s of submissionsOn.get(id) ?? []) subs.set(s.id, s);
      return {
        pointsOnOffer: [...ids].reduce((sum, id) => sum + (nodesById.get(id)?.points ?? 0), 0),
        pointsEarned: { total: earned, byTeam },
        completedBy: completedBy.sort((a, b) => (a.hours ?? 0) - (b.hours ?? 0)),
        submissions: submissionCounts([...subs.values()], withReasons),
      };
    };

    const tileRows = db
      .select()
      .from(tiles)
      .where(eq(tiles.bingoId, bingo.id))
      .all()
      .filter((t) => !nameFilter || t.name.toLowerCase().includes(nameFilter.toLowerCase()))
      .sort((a, b) => a.boardRow - b.boardRow || a.boardCol - b.boardCol);

    const out = tileRows.map((t) => {
      const { submissions: tileSubmissions, ...tileNumbers } = stats(t.nodeId, false);
      return {
        tile: t.name,
        row: t.boardRow + 1,
        column: t.boardCol + 1,
        category: t.categoryId ? (categoryOf.get(t.categoryId) ?? null) : null,
        ...tileNumbers,
        teamsStarted: started.get(t.id) ?? 0,
        submissions: tileSubmissions,
        tasks: (childrenOf.get(t.nodeId) ?? []).map((taskId) => {
          const interested = progress.flatMap((p) => p.interests.filter((i) => i.taskId === taskId).map((i) => ({ teamId: p.teamId, userId: i.user.id })));
          return {
            task: labelOf.get(taskId) ?? "Untitled part",
            ...stats(taskId, true),
            interest: { teams: new Set(interested.map((i) => i.teamId)).size, players: interested.length },
          };
        }),
      };
    });

    const { items, truncated } = fitList(out, limit, "Pass `tile` to pick Tiles by name, or a smaller `limit`.");
    return { bingo: { slug: bingo.slug, name: bingo.name, stage: bingo.stage }, teams: names.size, tiles: items, ...(truncated ? { truncated } : {}) };
  },
});
