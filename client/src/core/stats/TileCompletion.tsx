import { useState } from "react";
import type { Team, Tile, TileHeatmapCell, TileProgress } from "@bingo/shared";
import { SingleSelect } from "../ui/SingleSelect";
import { FALLBACK_TEAM_COLOR } from "./PointsChart";

const ALL = "all";
// One hue, light to dark: 8% for nothing, ramping to ~85% for done.
const shade = (color: string, fraction: number) => `color-mix(in srgb, ${color} ${Math.round(8 + fraction * 77)}%, transparent)`;
// "All teams" shades by how many teams finished a tile, so it uses one neutral hue rather than any team's colour.
const ALL_COLOR = "var(--color-accent)";

const isDone = (cell: TileHeatmapCell | undefined) => !!cell && cell.totalTasks > 0 && cell.completedTasks >= cell.totalTasks;

// In progress, for one team: diagonal stripes of its colour, so it can't be read as a lighter "done".
const stripes = (color: string) => `repeating-linear-gradient(135deg, ${shade(color, 0.55)} 0 3px, ${shade(color, 0.05)} 3px 6px)`;

interface Segment {
  label: string;
  /** How done: 0 or 1 for one team, the share of the teams for all of them. */
  fraction: number;
  /** One team only: some progress, not done. */
  started?: boolean;
}

/** A Tile's progress bar, one rounded bar: each Part, then the Tile, then a line through it, split by hairlines. */
function ProgressBar({ segments, color, height = "h-3" }: { segments: Segment[]; color: string; height?: string }) {
  return (
    <div className={`flex w-full divide-x divide-outline overflow-hidden rounded-[3px] border border-outline ${height}`}>
      {segments.map((seg) => (
        <div key={seg.label} className="h-full flex-1" style={{ background: seg.started ? stripes(color) : shade(color, seg.fraction) }} />
      ))}
    </div>
  );
}

/**
 * The board, each Tile with a bar of its Parts, then the Tile itself, then a line through it. One team: which of those
 * it has done. All teams: how many of the selected teams did each, which shows what is contested and what nobody
 * touched.
 */
export function TileCompletion({ heatmap, tiles, teams }: { heatmap: TileHeatmapCell[]; tiles: Tile[]; teams: Team[] }) {
  const [picked, setPicked] = useState<string>(ALL);
  if (tiles.length === 0 || teams.length === 0) return <p className="text-sm text-on-surface-subtle">No tiles to show yet.</p>;

  // "All" only means something with more than one team; a picked team that's been filtered away falls back.
  const view = teams.some((t) => t.id === picked) ? picked : teams.length > 1 ? ALL : teams[0]!.id;
  const team = teams.find((t) => t.id === view);
  const color = view === ALL ? ALL_COLOR : (team?.color ?? FALLBACK_TEAM_COLOR);

  const rows = Math.max(...tiles.map((t) => t.boardRow)) + 1;
  const cols = Math.max(...tiles.map((t) => t.boardCol)) + 1;
  const tileAt = (r: number, c: number) => tiles.find((t) => t.boardRow === r && t.boardCol === c);
  const cellFor = (tileId: string, teamId: string) => heatmap.find((c) => c.tileId === tileId && c.teamId === teamId);
  const teamsDone = (tileId: string) => teams.filter((t) => isDone(cellFor(tileId, t.id))).length;
  const shown = view === ALL ? teams : teams.filter((t) => t.id === view);

  // All teams count only what's done; one team also shows what it has started.
  const segmentsOf = (tile: Tile): Segment[] => {
    const cells = shown.map((t) => cellFor(tile.id, t.id));
    const segment = (label: string, progress: (c: TileHeatmapCell) => TileProgress | undefined): Segment => {
      const states = cells.map((c) => (c ? progress(c) : undefined) ?? "none");
      return { label, fraction: states.filter((p) => p === "done").length / shown.length, started: view !== ALL && states[0] === "started" };
    };
    const parts = Math.max(0, ...cells.map((c) => c?.parts.length ?? 0));
    return [...Array.from({ length: parts }, (_, i) => segment(`Part ${i + 1}`, (c) => c.parts[i])), segment("Tile", (c) => c.tile), segment("Line", (c) => c.line)];
  };
  const describe = (seg: Segment) =>
    view === ALL ? `${seg.label}: ${Math.round(seg.fraction * shown.length)} of ${shown.length} teams` : `${seg.label}: ${seg.fraction >= 1 ? "done" : seg.started ? "in progress" : "not yet"}`;

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
              const segments = segmentsOf(tile);
              const finished = view === ALL ? teamsDone(tile.id) === teams.length : isDone(cellFor(tile.id, view));
              return (
                <div
                  key={tile.id}
                  title={[tile.name, ...segments.map(describe)].join("\n")}
                  className={`flex aspect-square flex-col items-center justify-between gap-1 overflow-hidden rounded-sm border bg-surface p-1 text-center leading-tight text-on-surface ${finished ? "border-on-surface" : "border-outline"}`}
                >
                  <span className="line-clamp-2 flex flex-1 items-center text-[10px]">{tile.name}</span>
                  <ProgressBar segments={segments} color={color} />
                </div>
              );
            }),
          )}
        </div>
        <Summary view={view} teams={teams} tiles={tiles} color={color} cellFor={cellFor} teamsDone={teamsDone} />
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
    <div className="space-y-2">
      <div className="w-40 space-y-1">
        <ProgressBar
          color={color}
          height="h-2"
          segments={[
            { label: "Part 1", fraction: 1 },
            { label: "Part 2", fraction: 1 },
            { label: "Tile", fraction: 1 },
            { label: "Line", fraction: 1 },
          ]}
        />
        {/* Under each segment of the bar above. */}
        <div className="flex text-[10px] text-on-surface-subtle">
          <span className="flex-1 text-center">Part 1</span>
          <span className="flex-1 text-center">Part 2</span>
          <span className="flex-1 text-center">Tile</span>
          <span className="flex-1 text-center">Line</span>
        </div>
      </div>
      {view === ALL ? <TeamCountScale teams={teams.length} color={color} /> : <DoneKey color={color} />}
      <p className="text-xs text-on-surface-subtle">
        Each tile's bar shows its parts, then the whole tile, then a line through it:{" "}
        {view === ALL ? "the darker, the more of the selected teams did it." : "striped while the team is on it, filled once it's done."} A dark border marks a finished tile.
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
  const started = tiles.filter((t) => !isDone(cellFor(t.id, view)) && cellFor(t.id, view)?.tile === "started").length;
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

/** The shades the bars use with all teams shown, one step per number of teams that did it, so each reads exactly. */
function TeamCountScale({ teams, color }: { teams: number; color: string }) {
  const steps = Array.from({ length: teams + 1 }, (_, k) => k);
  // Past a handful of teams the numbers crowd: then only the ends are labelled.
  const labelled = (k: number) => teams <= 6 || k === 0 || k === teams;
  return (
    <div className="w-40 space-y-1">
      <div className="flex h-3 divide-x divide-outline overflow-hidden rounded-[3px] border border-outline">
        {steps.map((k) => (
          <div key={k} className="flex-1" style={{ backgroundColor: shade(color, k / teams) }} />
        ))}
      </div>
      <div className="flex text-[10px] text-on-surface-subtle">
        {steps.map((k) => (
          <span key={k} className="num flex-1 text-center">
            {labelled(k) ? k : ""}
          </span>
        ))}
      </div>
      <p className="text-xs text-on-surface-subtle">teams that did it</p>
    </div>
  );
}

/** The three looks the bars use for one team. */
function DoneKey({ color }: { color: string }) {
  const swatch = (background: string, label: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-3 w-5 rounded-[3px] border border-outline" style={{ background }} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-surface-subtle">
      {swatch(shade(color, 0), "Not yet")}
      {swatch(stripes(color), "In progress")}
      {swatch(shade(color, 1), "Done")}
    </div>
  );
}
