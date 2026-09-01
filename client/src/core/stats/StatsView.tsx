import { useState } from "react";
import type { ContributionCount, PointsOverTimePoint, Team, Tile, TileHeatmapCell, TimelineEvent } from "@bingo/shared";
import { useBingo, useBoard, useStats } from "../../api/queries";
import { displayName } from "../ui/user";

function PointsChart({ points, teams }: { points: PointsOverTimePoint[]; teams: Team[] }) {
  if (points.length === 0) return <p className="text-slate-500 text-sm">No scoring activity yet.</p>;

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
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-slate-900 rounded-lg border border-slate-700">
        <line x1={pad} y1={y(0)} x2={width - pad} y2={y(0)} stroke="#334155" strokeWidth={1} />
        {[...byTeam.entries()].map(([teamId, series]) => {
          const team = teams.find((t) => t.id === teamId);
          const color = team?.color ?? "#6366f1";
          const coords = series.map((p) => ({ x: x(new Date(p.at).getTime()), y: y(p.cumulativePoints) }));
          return (
            <g key={teamId}>
              {coords.length > 1 && <polyline points={coords.map((c) => `${c.x},${c.y}`).join(" ")} fill="none" stroke={color} strokeWidth={2.5} />}
              {coords.map((c, i) => (
                <circle key={i} cx={c.x} cy={c.y} r={3.5} fill={color} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-3 mt-2">
        {[...byTeam.keys()].map((teamId) => {
          const team = teams.find((t) => t.id === teamId);
          return (
            <span key={teamId} className="flex items-center gap-1.5 text-xs text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: team?.color ?? "#6366f1" }} />
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
  if (sorted.length === 0) return <p className="text-slate-500 text-sm">Nothing has happened yet.</p>;
  return (
    <ol className="space-y-1.5 text-sm max-h-96 overflow-y-auto pr-1">
      {sorted.map((e, i) => (
        <li key={i} className="flex items-start gap-2 text-slate-300">
          <span className="text-slate-600 text-xs mt-0.5 shrink-0 tabular-nums">{new Date(e.at).toLocaleString()}</span>
          <span>{e.label}</span>
        </li>
      ))}
    </ol>
  );
}

function ContributionList({ contributions, teams }: { contributions: ContributionCount[]; teams: Team[] }) {
  if (contributions.length === 0) return <p className="text-slate-500 text-sm">No approved submissions yet.</p>;
  return (
    <ol className="space-y-1.5 text-sm">
      {contributions.map((c, i) => {
        const team = teams.find((t) => t.id === c.teamId);
        return (
          <li key={c.userId} className="flex items-center justify-between text-slate-300">
            <span>
              <span className="text-slate-500 tabular-nums">#{i + 1}</span> {displayName(c.user)}{" "}
              <span className="text-slate-500">— {team?.name ?? "Unknown team"}</span>
            </span>
            <span className="text-white font-semibold shrink-0">{c.approvedSubmissions}</span>
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

  return (
    <div>
      <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-1.5 text-sm mb-3 focus:outline-none focus:border-indigo-500">
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <div className="grid gap-1 max-w-md" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
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
                className="aspect-square rounded flex items-center justify-center text-[9px] text-white/90 leading-tight text-center px-0.5 overflow-hidden"
                style={{ backgroundColor: `rgba(99,102,241,${0.12 + frac * 0.78})` }}
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

export function StatsView({ slug }: { slug: string }) {
  const { data: shell } = useBingo(slug);
  const { data: stats } = useStats(slug);
  const { data: boardData } = useBoard(slug);

  if (!shell || !stats) return <div className="text-center text-slate-400 py-24">Loading…</div>;

  const teams = shell.teams;
  const tiles = boardData?.tiles ?? [];

  return (
    <div className="w-full max-w-5xl mx-auto px-6 py-6 space-y-8">
      <section>
        <h3 className="text-white font-semibold mb-2">Points over time</h3>
        <PointsChart points={stats.pointsOverTime} teams={teams} />
      </section>

      <div className="grid md:grid-cols-2 gap-8">
        <section>
          <h3 className="text-white font-semibold mb-2">Timeline</h3>
          <TimelineList events={stats.timeline} />
        </section>
        <section>
          <h3 className="text-white font-semibold mb-2">Top contributors</h3>
          <ContributionList contributions={stats.contributions} teams={teams} />
        </section>
      </div>

      <section>
        <h3 className="text-white font-semibold mb-2">Tile completion</h3>
        <Heatmap heatmap={stats.heatmap} tiles={tiles} teams={teams} />
      </section>
    </div>
  );
}
