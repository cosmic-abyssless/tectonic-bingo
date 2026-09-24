import type { ContributionCount } from "@bingo/shared";
import { useBingo, useStats } from "../../api/queries";

export interface PlayerContribution {
  contribution: ContributionCount;
  teamColor: string | null;
  rank: { place: number; of: number };
}

/**
 * A player's Points share in this bingo, for their profile. It comes from the stats the viewer may already see
 * (the server filters them), so a profile never shows another team's numbers while the bingo is live: a player
 * the viewer's stats don't include gives null.
 */
export function usePlayerContribution(slug: string, userId: string): PlayerContribution | null {
  const { data: shell } = useBingo(slug);
  const stage = shell?.bingo.stage;
  const maySee = !!shell && (stage === "live" || stage === "complete") && (shell.isMod || stage === "complete" || !!shell.myTeam);
  const { data: stats } = useStats(slug, maySee);
  if (!maySee || !stats || !shell) return null;

  const contribution = stats.contributions.find((c) => c.userId === userId);
  if (!contribution) return null;
  const teammates = stats.contributions.filter((c) => c.teamId === contribution.teamId).sort((a, b) => b.pointsShare - a.pointsShare);
  return {
    contribution,
    teamColor: shell.teams.find((t) => t.id === contribution.teamId)?.color ?? null,
    rank: { place: teammates.findIndex((c) => c.userId === userId) + 1, of: teammates.length },
  };
}
