import { useState, type ReactNode } from "react";
import type { ContributionCount, PointsOverTimePoint, Team, Tile, TileHeatmapCell, TimelineEvent } from "@bingo/shared";
import { useBingo, useBoard, useStats } from "../../api/queries";
import { displayName } from "../ui/user";
import { PlayerName } from "../tectonic/PlayerName";
import { Card, CardHeader } from "../ui/Card";
import { Select } from "../ui/Field";

// Tracks the current theme's muted-text color rather than a hardcoded hex —
// a fixed mid-gray reads fine on the default theme's near-black background
// but washes out against a bright/light theme's (e.g. comic's yellow) bg.
const FALLBACK_TEAM_COLOR = "var(--color-on-surface-muted)";

function Empty({ children }: { children: string }) {
  return <p className="text-sm text-on-surface-subtle">{children}</p>;
}

function PointsChart({ points, teams }: { points: PointsOverTimePoint[]; teams: Team[] }) {
  if (points.length === 0) return <Empty>No scoring activity yet.</Empty>;

  const width = 640;
  const height = 220;
  const pad = 28;
  const times = points.map((p) => new Date(p.at).getTime());
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const values = points.map((p) => p.cumulativePoints);
  const minY = Math.min(0, ...values);
  const maxY = Math.max(1, ...values);
  const x = (t: number) => pad + ((t - minT) / (maxT - minT || 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - minY) / (maxY - minY || 1)) * (height - pad * 2);

  const byTeam = new Map<string, PointsOverTimePoint[]>();
  for (const p of points) {
    const arr = byTeam.get(p.teamId) ?? [];
    arr.push(p);
    byTeam.set(p.teamId, arr);
  }

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full rounded-md border border-outline bg-background">
        <line x1={pad} y1={y(0)} x2={width - pad} y2={y(0)} stroke="var(--color-outline-strong)" strokeWidth={1} />
        {[...byTeam.entries()].map(([teamId, series]) => {
          const team = teams.find((t) => t.id === teamId);
          const color = team?.color ?? FALLBACK_TEAM_COLOR;
          const coords = series.map((p) => ({ x: x(new Date(p.at).getTime()), y: y(p.cumulativePoints) }));
          return (
            <g key={teamId}>
              {coords.length > 1 && <polyline points={coords.map((c) => `${c.x},${c.y}`).join(" ")} fill="none" stroke={color} strokeWidth={2} />}
              {coords.map((c, i) => (
                <circle key={i} cx={c.x} cy={c.y} r={3} fill={color} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3">
        {[...byTeam.keys()].map((teamId) => {
          const team = teams.find((t) => t.id === teamId);
          return (
            <span key={teamId} className="flex items-center gap-1.5 text-xs text-on-surface-muted">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: team?.color ?? FALLBACK_TEAM_COLOR }} />
              {team?.name ?? "Unknown team"}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function TimelineList({ events }: { events: TimelineEvent[] }) {
  const sorted = [...events].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  if (sorted.length === 0) return <Empty>Nothing has happened yet.</Empty>;
  return (
    <ol className="max-h-96 space-y-1.5 overflow-y-auto pr-1 text-sm">
      {sorted.map((e, i) => (
        <li key={i} className="flex items-start gap-2 text-on-surface-muted">
          <span className="num mt-0.5 shrink-0 text-xs text-on-surface-subtle">{new Date(e.at).toLocaleString()}</span>
          <span>{e.label}</span>
        </li>
      ))}
    </ol>
  );
}

function ContributionList({ contributions, teams }: { contributions: ContributionCount[]; teams: Team[] }) {
  if (contributions.length === 0) return <Empty>No approved submissions yet.</Empty>;
  return (
    <ol className="space-y-1.5 text-sm">
      {contributions.map((c, i) => {
        const team = teams.find((t) => t.id === c.teamId);
        return (
          <li key={c.userId} className="flex items-center justify-between text-on-surface-muted">
            <span>
              <span className="num text-on-surface-subtle">#{i + 1}</span>{" "}
              <PlayerName userId={c.userId} className="text-on-surface">
                {displayName(c.user)}
              </PlayerName>{" "}
              <span className="text-on-surface-subtle">— {team?.name ?? "Unknown team"}</span>
            </span>
            <span className="num shrink-0 font-semibold text-on-surface">{c.approvedSubmissions}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Heatmap({ heatmap, tiles, teams }: { heatmap: TileHeatmapCell[]; tiles: Tile[]; teams: Team[] }) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  if (tiles.length === 0 || teams.length === 0) return null;

  const rows = Math.max(...tiles.map((t) => t.boardRow)) + 1;
  const cols = Math.max(...tiles.map((t) => t.boardCol)) + 1;
  const tileAt = (r: number, c: number) => tiles.find((t) => t.boardRow === r && t.boardCol === c);
  const cellFor = (tileId: string) => heatmap.find((c) => c.tileId === tileId && c.teamId === teamId);
  const teamColor = teams.find((t) => t.id === teamId)?.color ?? FALLBACK_TEAM_COLOR;

  return (
    <div className="space-y-3">
      {teams.length > 1 && (
        <Select aria-label="Team" value={teamId} onChange={(e) => setTeamId(e.target.value)} className="w-auto!">
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      )}
      <div className="grid max-w-md gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) => {
            const tile = tileAt(r, c);
            if (!tile) return <div key={`${r}-${c}`} />;
            const cell = cellFor(tile.id);
            const frac = cell && cell.totalTasks > 0 ? cell.completedTasks / cell.totalTasks : 0;
            return (
              <div
                key={tile.id}
                title={`${tile.name}: ${cell?.completedTasks ?? 0}/${cell?.totalTasks ?? 0} tasks`}
                className="flex aspect-square items-center justify-center overflow-hidden rounded-sm border border-outline px-0.5 text-center text-[9px] leading-tight text-on-surface"
                // Team colour at 8% opacity for untouched tiles, ramping to ~85% when complete.
                style={{ backgroundColor: `color-mix(in srgb, ${teamColor} ${Math.round(8 + frac * 77)}%, transparent)` }}
              >
                {tile.name}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} />
      <div className="p-5">{children}</div>
    </Card>
  );
}

export function StatsView({ slug }: { slug: string }) {
  const { data: shell } = useBingo(slug);
  const { data: stats, error } = useStats(slug);
  const { data: boardData } = useBoard(slug);

  if (error) return <div className="py-24 text-center text-sm text-on-surface-muted">{error.message}</div>;
  if (!shell || !stats) return <div className="py-24 text-center text-sm text-on-surface-muted">Loading…</div>;

  // While the bingo is live the server only returns the viewer's own team, so
  // scope the team list to whatever actually has rows.
  const statTeamIds = new Set([...stats.heatmap, ...stats.pointsOverTime, ...stats.contributions].map((r) => r.teamId));
  const teams = shell.teams.filter((t) => statTeamIds.has(t.id));
  const tiles = boardData?.tiles ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-6">
      <Section title="Points over time">
        <PointsChart points={stats.pointsOverTime} teams={teams} />
      </Section>

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Timeline">
          <TimelineList events={stats.timeline} />
        </Section>
        <Section title="Top contributors">
          <ContributionList contributions={stats.contributions} teams={teams} />
        </Section>
      </div>

      <Section title="Tile completion">
        <Heatmap heatmap={stats.heatmap} tiles={tiles} teams={teams} />
      </Section>
    </div>
  );
}
