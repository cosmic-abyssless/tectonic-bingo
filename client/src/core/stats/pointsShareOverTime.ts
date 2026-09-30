import type { ContributionCount } from "@bingo/shared";

// Each Player's Points share (CONTEXT.md) as it built up, for the stats chart. Kept apart from the SVG so it can be tested.

export interface ShareDot {
  at: number;
  /** Their running Points share. */
  share: number;
  /** Their Team's running points from awards (Point Adjustments aren't shared out), so share / teamPoints is their part. */
  teamPoints: number;
  /** What they earned at this moment. */
  earned: { label: string; points: number }[];
}

export interface ShareSeries {
  player: ContributionCount;
  dots: ShareDot[];
}

/** One series per Player who has earned anything: a dot at each moment they did, with where their Team stood then. */
export function pointsShareOverTime(contributions: readonly ContributionCount[]): ShareSeries[] {
  const byTeam = new Map<string, ContributionCount[]>();
  for (const c of contributions) if (c.awards.length > 0) byTeam.set(c.teamId, [...(byTeam.get(c.teamId) ?? []), c]);

  const out: ShareSeries[] = [];
  for (const players of byTeam.values()) {
    // Everything credited at the same moment (a Task and the Tile bonus it finished) is one step.
    const moments = new Map<number, { player: ContributionCount; award: ContributionCount["awards"][number] }[]>();
    for (const player of players) {
      for (const award of player.awards) {
        const at = new Date(award.at).getTime();
        if (Number.isNaN(at)) continue;
        moments.set(at, [...(moments.get(at) ?? []), { player, award }]);
      }
    }
    const series = new Map(players.map((p) => [p.userId, { player: p, dots: [] as ShareDot[] }]));
    const running = new Map<string, number>();
    let teamPoints = 0;
    for (const [at, events] of [...moments].sort(([a], [b]) => a - b)) {
      const earned = new Map<string, ShareDot["earned"]>();
      for (const { player, award } of events) {
        running.set(player.userId, (running.get(player.userId) ?? 0) + award.points);
        teamPoints += award.points;
        earned.set(player.userId, [...(earned.get(player.userId) ?? []), { label: award.label, points: award.points }]);
      }
      for (const [userId, items] of earned) series.get(userId)!.dots.push({ at, share: running.get(userId)!, teamPoints, earned: items });
    }
    out.push(...[...series.values()].filter((s) => s.dots.length > 0));
  }
  return out;
}

/** The top `count` by Points share, highest first, plus the viewer at the end when they're further down. */
export function topWithViewer(series: readonly ShareSeries[], count: number, viewerId: string | undefined): ShareSeries[] {
  const ranked = [...series].sort((a, b) => b.player.pointsShare - a.player.pointsShare);
  const mine = ranked.slice(count).find((s) => s.player.userId === viewerId);
  return mine ? [...ranked.slice(0, count), mine] : ranked.slice(0, count);
}
