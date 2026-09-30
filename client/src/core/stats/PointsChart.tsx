import { useMemo } from "react";
import type { PointsOverTimePoint, Team } from "@bingo/shared";
import { TimeChart, type TimeSeries } from "./TimeChart";

// Tracks the current theme's muted-text color rather than a hardcoded hex —
// a fixed mid-gray reads fine on the default theme's near-black background
// but washes out against a bright/light theme's (e.g. comic's yellow) bg.
export const FALLBACK_TEAM_COLOR = "var(--color-on-surface-muted)";

const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toLocaleString()}`;

/**
 * Each team's running points over time. The axes are labelled, and hovering (or touching) near a dot says which
 * event earned those points: the task, tile bonus or line bonus, or a moderator's adjustment.
 */
export function PointsChart({ points, teams }: { points: PointsOverTimePoint[]; teams: Team[] }) {
  const series = useMemo(() => {
    const teamById = new Map(teams.map((t) => [t.id, t]));
    const byTeam = new Map<string, TimeSeries>();
    for (const p of points) {
      const team = teamById.get(p.teamId);
      const s = byTeam.get(p.teamId) ?? { key: p.teamId, name: team?.name ?? "Unknown team", color: team?.color ?? FALLBACK_TEAM_COLOR, dots: [] };
      s.dots.push({
        at: new Date(p.at).getTime(),
        value: p.cumulativePoints,
        tooltip: (
          <>
            <p className="mt-1 text-on-surface">
              <span className="num font-semibold">{signed(p.delta)}</span> {p.source === "adjustment" ? `Moderator adjustment: ${p.label}` : p.label}
            </p>
            <p className="mt-0.5 text-on-surface-subtle">
              Total <span className="num">{p.cumulativePoints.toLocaleString()}</span> · {new Date(p.at).toLocaleString()}
            </p>
          </>
        ),
      });
      byTeam.set(p.teamId, s);
    }
    return [...byTeam.values()];
  }, [points, teams]);

  if (points.length === 0) return <p className="text-sm text-on-surface-subtle">No scoring activity yet.</p>;
  return <TimeChart series={series} ariaLabel="Points over time, by team" yLabel="Points" />;
}
