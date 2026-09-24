import { useState } from "react";
import type { Team, Tile, TileHeatmapCell } from "@bingo/shared";
import { SingleSelect } from "../ui/SingleSelect";
import { FALLBACK_TEAM_COLOR } from "./PointsChart";

const ALL = "all";
// One hue, light to dark: 8% for nothing, ramping to ~85% for done.
const shade = (color: string, fraction: number) => `color-mix(in srgb, ${color} ${Math.round(8 + fraction * 77)}%, transparent)`;
// "All teams" shades by how many teams finished a tile, so it uses one neutral hue rather than any team's colour.
const ALL_COLOR = "var(--color-accent)";

const isDone = (cell: TileHeatmapCell | undefined) => !!cell && cell.totalTasks > 0 && cell.completedTasks >= cell.totalTasks;

/**
 * The board, shaded by progress. One team: how many of each Tile's Parts it has done. All teams: how many of
 * the selected teams completed each Tile, which shows what is contested and what nobody touched.
 */
export function TileCompletion({ heatmap, tiles, teams }: { heatmap: TileHeatmapCell[]; tiles: Tile[]; teams: Team[] }) {
  const [picked, setPicked] = useState<string>(ALL);
  if (tiles.length === 0 || teams.length === 0) return <p className="text-sm text-on-surface-subtle">No tiles to show yet.</p>;

  // "All" only means something with more than one team; a picked team that's been filtered away falls back.
  const view = teams.some((t) => t.id === picked) ? picked : teams.length > 1 ? ALL : teams[0]!.id;
  const team = teams.find((t) => t.id === view);
  const teamColor = team?.color ?? FALLBACK_TEAM_COLOR;

  const rows = Math.max(...tiles.map((t) => t.boardRow)) + 1;
  const cols = Math.max(...tiles.map((t) => t.boardCol)) + 1;
  const tileAt = (r: number, c: number) => tiles.find((t) => t.boardRow === r && t.boardCol === c);
  const cellFor = (tileId: string, teamId: string) => heatmap.find((c) => c.tileId === tileId && c.teamId === teamId);
  const teamsDone = (tileId: string) => teams.filter((t) => isDone(cellFor(tileId, t.id))).length;

  const cell = (tile: Tile) => {
    if (view === ALL) {
      const done = teamsDone(tile.id);
      return { fraction: done / teams.length, color: ALL_COLOR, count: `${done}/${teams.length}`, title: `${tile.name}: ${done} of ${teams.length} teams completed it` };
    }
    const c = cellFor(tile.id, view);
    const doneParts = c?.completedTasks ?? 0;
    const total = c?.totalTasks ?? 0;
    return { fraction: total > 0 ? doneParts / total : 0, color: teamColor, count: `${doneParts}/${total}`, title: `${tile.name}: ${doneParts} of ${total} parts` };
  };

  return (
    <div className="space-y-3">
      {teams.length > 1 && (
        <SingleSelect label="Show" options={[{ key: ALL, label: "All selected teams" }, ...teams.map((t) => ({ key: t.id, label: t.name }))]} selected={view} onChange={setPicked} />
      )}
      <div className="flex flex-col gap-5 md:flex-row md:items-start">
        <div className="grid w-full max-w-md gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: rows }, (_, r) =>
            Array.from({ length: cols }, (_, c) => {
              const tile = tileAt(r, c);
              if (!tile) return <div key={`${r}-${c}`} />;
              const { fraction, color, count, title } = cell(tile);
              return (
                <div
                  key={tile.id}
                  title={title}
                  className={`flex aspect-square flex-col items-center justify-center gap-0.5 overflow-hidden rounded-sm border px-0.5 text-center leading-tight text-on-surface ${fraction >= 1 ? "border-on-surface" : "border-outline"}`}
                  style={{ backgroundColor: shade(color, fraction) }}
                >
                  <span className="line-clamp-2 text-[10px]">{tile.name}</span>
                  <span className="num text-[10px] font-semibold">{count}</span>
                </div>
              );
            }),
          )}
        </div>
        <Summary view={view} teams={teams} tiles={tiles} color={view === ALL ? ALL_COLOR : teamColor} cellFor={cellFor} teamsDone={teamsDone} />
      </div>
    </div>
  );
}

function Summary({
  view,
  teams,
  tiles,
  color,
  cellFor,
  teamsDone,
}: {
  view: string;
  teams: Team[];
  tiles: Tile[];
  color: string;
  cellFor: (tileId: string, teamId: string) => TileHeatmapCell | undefined;
  teamsDone: (tileId: string) => number;
}) {
  const legend = (
    <div className="space-y-1">
      <div className="h-2.5 w-40 rounded-sm border border-outline" style={{ background: `linear-gradient(to right, ${shade(color, 0)}, ${shade(color, 1)})` }} />
      <div className="flex w-40 justify-between text-xs text-on-surface-subtle">
        <span>{view === ALL ? "No team" : "No parts"}</span>
        <span>{view === ALL ? "Every team" : "All parts"}</span>
      </div>
      <p className="text-xs text-on-surface-subtle">
        {view === ALL ? "Each tile shows how many of the selected teams completed it." : "Each tile shows how many of its parts the team has done."} A dark border marks a finished
        tile.
      </p>
    </div>
  );

  if (view === ALL) {
    const untouched = tiles.filter((t) => teams.every((team) => (cellFor(t.id, team.id)?.completedTasks ?? 0) === 0)).length;
    const everyone = tiles.filter((t) => teamsDone(t.id) === teams.length).length;
    return (
      <div className="space-y-3 text-sm text-on-surface-muted">
        <ul className="space-y-1">
          {teams.map((team) => (
            <li key={team.id} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: team.color ?? FALLBACK_TEAM_COLOR }} />
              <span className="text-on-surface">{team.name}</span>
              <span className="num">{tiles.filter((t) => isDone(cellFor(t.id, team.id))).length} of {tiles.length} tiles</span>
            </li>
          ))}
        </ul>
        <p>
          <span className="num">{everyone}</span> completed by every team · <span className="num">{untouched}</span> untouched by all
        </p>
        {legend}
      </div>
    );
  }

  const done = tiles.filter((t) => isDone(cellFor(t.id, view))).length;
  const started = tiles.filter((t) => !isDone(cellFor(t.id, view)) && (cellFor(t.id, view)?.completedTasks ?? 0) > 0).length;
  return (
    <div className="space-y-3 text-sm text-on-surface-muted">
      <p>
        <span className="num font-semibold text-on-surface">{done}</span> of <span className="num">{tiles.length}</span> tiles complete · <span className="num">{started}</span> in
        progress
      </p>
      {legend}
    </div>
  );
}
