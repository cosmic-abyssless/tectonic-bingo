import { titlesHeldBy, type ContributionCount, type PickedTitle } from "@bingo/shared";
import { fullBoard, useBingo, useBoard, useStats } from "../../api/queries";
import { useCan } from "../../headless/permissions";
import { pickStatsTitles } from "./titles";

export interface PlayerContribution {
  contribution: ContributionCount;
  teamColor: string | null;
  rank: { place: number; of: number };
  /** Every Title they hold among the Players the viewer may see (the whole Bingo unfiltered), in priority order. */
  titles: PickedTitle[];
  /** Their top 3 Tiles by Effort (CONTEXT.md), most first; empty when Effort isn't recorded for them. */
  effortTiles: { name: string; hours: number }[];
}

/**
 * A player's Points share in this bingo, for their profile. It comes from the stats the viewer may already see
 * (the server filters them), so a profile never shows another team's numbers while the bingo is live: a player
 * the viewer's stats don't include gives null.
 */
export function usePlayerContribution(slug: string, userId: string): PlayerContribution | null {
  const { data: shell } = useBingo(slug);
  const seesOtherTeams = useCan("view_other_teams", slug).allowed;
  const stage = shell?.bingo.stage;
  const maySee = !!shell && (stage === "live" || stage === "complete") && (seesOtherTeams || !!shell.myTeam);
  const { data: stats } = useStats(slug, maySee);
  const tiles = fullBoard(useBoard(slug).data)?.tiles;
  if (!maySee || !stats || !shell) return null;

  const contribution = stats.contributions.find((c) => c.userId === userId);
  if (!contribution) return null;
  const teammates = stats.contributions.filter((c) => c.teamId === contribution.teamId).sort((a, b) => b.pointsShare - a.pointsShare);
  return {
    contribution,
    teamColor: shell.teams.find((t) => t.id === contribution.teamId)?.color ?? null,
    rank: { place: teammates.findIndex((c) => c.userId === userId) + 1, of: teammates.length },
    titles: titlesHeldBy(pickStatsTitles(stats, stats.titleFacts), userId),
    effortTiles: (contribution.effort?.byTile ?? []).slice(0, 3).map((t) => ({ name: tiles?.find((tile) => tile.id === t.tileId)?.name ?? "A tile", hours: t.hours })),
  };
}
