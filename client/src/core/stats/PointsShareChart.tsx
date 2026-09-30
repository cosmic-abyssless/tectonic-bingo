import { useMemo, useState } from "react";
import type { ContributionCount, Team } from "@bingo/shared";
import { useAuth } from "../../context/AuthContext";
import { inclusionFilter } from "../ui/inclusionFilter";
import { MultiSelect } from "../ui/MultiSelect";
import { displayName } from "../ui/user";
import { formatShare } from "./PointsShareBreakdown";
import { pointsShareOverTime, topWithViewer, type ShareSeries } from "./pointsShareOverTime";
import { TimeChart, type TimeSeries } from "./TimeChart";

// index.css's eight categorical chart colours, in order. A made-up ninth hue wouldn't be told apart, so when more
// Players are ticked in, the ninth onwards reuse the first colours as dashed lines.
const PLAYER_COLORS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `var(--color-chart-${n})`);
const playerStyle = (i: number) => ({ color: PLAYER_COLORS[i % PLAYER_COLORS.length]!, dashed: i >= PLAYER_COLORS.length });

/** How many Players the chart starts with, highest Points share first, plus the viewer when they're further down. */
const TOP = 5;

/** The viewer is "You", in the picker, the legend and the tooltip. */
const nameOf = (s: ShareSeries, me: string | undefined) => (s.player.userId === me ? "You" : displayName(s.player.user));

const percentOf = (share: number, teamPoints: number) => (teamPoints > 0 ? (share / teamPoints) * 100 : 0);
const formatPercent = (p: number) => `${p.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;

/**
 * Each Player's Points share (CONTEXT.md) over time, across the Teams shown. Every Player of every Team is too many
 * lines to read, so it starts on the top five and the viewer, and the Players picker adds the rest.
 */
export function PointsShareChart({ contributions, teams }: { contributions: ContributionCount[]; teams: Team[] }) {
  // Keyed by the Teams shown, so a new choice of Teams starts again from its own top five.
  return <PlayersPointsShareChart key={teams.map((t) => t.id).join()} contributions={contributions} teams={teams} />;
}

function PlayersPointsShareChart({ contributions, teams }: { contributions: ContributionCount[]; teams: Team[] }) {
  const me = useAuth().user?.id;

  // Every Player with a share, highest first.
  const shares = useMemo(() => pointsShareOverTime(contributions).sort((a, b) => b.player.pointsShare - a.player.pointsShare), [contributions]);
  const starters = useMemo(() => topWithViewer(shares, TOP, me), [shares, me]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(starters.map((s) => s.player.userId)));
  // Colours go to the Players the chart starts with first, so they're all solid, then to the rest by share. Each one's
  // colour stays fixed, so ticking Players in or out of the picker never repaints the ones still shown.
  const styleOf = useMemo(
    () => new Map([...starters, ...shares.filter((s) => !starters.includes(s))].map((s, i) => [s.player.userId, playerStyle(i)])),
    [shares, starters],
  );
  const options = useMemo(() => shares.map((s) => ({ key: s.player.userId, label: nameOf(s, me) })), [shares, me]);
  const filter = inclusionFilter(selected, options);

  const series = useMemo(() => {
    const shown = inclusionFilter(selected, options);
    // With several Teams on the chart, the tooltip says whose Team a line is; the colour is the Player's, not the Team's.
    const teamName = teams.length > 1 ? new Map(teams.map((t) => [t.id, t.name])) : null;
    return shares
      .filter((s) => shown.matches(s.player.userId))
      .map((s) => toSeries(s, nameOf(s, me), teamName?.get(s.player.teamId) ?? null, styleOf.get(s.player.userId)!));
  }, [shares, styleOf, selected, options, teams, me]);

  if (shares.length === 0) return <p className="text-sm text-on-surface-subtle">No points share yet.</p>;
  return (
    <div className="space-y-3">
      {options.length > 1 && <MultiSelect label="Players" options={options} selected={filter.checked} onChange={(keys) => setSelected(new Set(keys))} />}
      <TimeChart series={series} ariaLabel="Points share over time, by player" yLabel="Points share" focusHovered restingFocus={me} />
    </div>
  );
}

function toSeries({ player, dots }: ShareSeries, name: string, teamName: string | null, style: { color: string; dashed: boolean }): TimeSeries {
  return {
    key: player.userId,
    name,
    ...style,
    dots: dots.map((d) => ({
      at: d.at,
      value: d.share,
      tooltip: (
        <>
          {teamName && <p className="text-on-surface-subtle">{teamName}</p>}
          {d.earned.map((e, i) => (
            <p key={i} className="mt-1 text-on-surface">
              <span className="num font-semibold">+{formatShare(e.points)}</span> {e.label}
            </p>
          ))}
          <p className="mt-1 text-on-surface">
            <span className="num font-semibold">{formatPercent(percentOf(d.share, d.teamPoints))}</span> of the team's points
          </p>
          <p className="mt-0.5 text-on-surface-subtle">
            Share <span className="num">{formatShare(d.share)}</span> of <span className="num">{formatShare(d.teamPoints)}</span> · {new Date(d.at).toLocaleString()}
          </p>
        </>
      ),
    })),
  };
}
