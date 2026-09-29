import { useState } from "react";
import type { HistoricalRecorded, HistoricalStanding, WomLeaderboard } from "@bingo/shared";
import { useHistorical } from "../../api/queries";
import { fullUrl, thumbUrl } from "../../api/imageVariants";
import type { BoardModel, TeamModel, TileModel } from "../../headless/types";
import { PlayerName } from "../tectonic/PlayerName";
import { CaptainEmblem } from "../ui/CaptainEmblem";
import { Badge } from "../ui/Card";
import { Panel } from "../ui/Panel";
import { formatPoints } from "../ui/points";
import { useDialogParts } from "../ui/useDialogParts";
import { NotRecorded } from "./NotRecorded";

/**
 * A Historical Bingo (CONTEXT.md) that recorded no Tasks: the page under its header, in place of a Team's board. The
 * original grid of Tile pictures (a Tile opens to its picture, points if known and rules), the standings, the Teams,
 * the Wise Old Man gains leaderboard, and what was never recorded. Built from core parts (Panel, the dialog parts)
 * so each theme dresses it.
 */
export function HistoricalBingoView({ slug, board, teams, recorded }: { slug: string; board: BoardModel; teams: TeamModel[]; recorded: HistoricalRecorded }) {
  const { data, error } = useHistorical(slug);
  const [openTileId, setOpenTileId] = useState<string | null>(null);
  const openTile = openTileId ? (board.tileById.get(openTileId) ?? null) : null;

  return (
    <div className="flex flex-col gap-4">
      <PictureBoard board={board} onOpen={setOpenTileId} />

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Standings">
          {error ? <p className="text-sm text-danger">Couldn't load the standings.</p> : !data ? <Loading /> : data.standings.length === 0 ? <NotRecorded /> : <Standings standings={data.standings} />}
        </Panel>
        <Panel title="Teams">
          <Teams teams={teams} />
        </Panel>
      </div>

      <Panel title="Wise Old Man gains">
        {error ? <p className="text-sm text-danger">Couldn't load the leaderboard.</p> : !data ? <Loading /> : data.wom ? <WomBoard wom={data.wom} /> : <NotRecorded />}
      </Panel>

      <Panel title="Not recorded">
        <p className="mb-2 text-sm text-on-surface-muted">This Bingo ran on another website, which didn't record everything this one does.</p>
        <ul className="flex flex-col gap-1.5">
          {!recorded.tasks && (
            <li>
              <NotRecorded what="Tile completion" />
            </li>
          )}
          {!recorded.submissions && (
            <li>
              <NotRecorded what="Submissions, Stats and Rewind" />
            </li>
          )}
          {!recorded.draft && (
            <li>
              <NotRecorded what="The Draft" />
            </li>
          )}
          {!recorded.signupRoster && (
            <li>
              <NotRecorded what="Signups" />
            </li>
          )}
          <li>
            <NotRecorded what="The audit log, Achievements, Wrapped and Titles" />
          </li>
        </ul>
      </Panel>

      <TileDialog tile={openTile} isOpen={openTile !== null} onClose={() => setOpenTileId(null)} />
    </div>
  );
}

function Loading() {
  return <p className="text-sm text-on-surface-muted">Loading…</p>;
}

/** A Tile's points, when the old site recorded them (0 means they weren't). */
function knownPoints(tile: TileModel): number | null {
  return tile.progress.totalPoints > 0 ? tile.progress.totalPoints : null;
}

function PictureBoard({ board, onOpen }: { board: BoardModel; onOpen: (tileId: string) => void }) {
  return (
    <Panel>
      <div className="overflow-x-auto">
        <div className="mx-auto grid w-full gap-1.5" style={{ gridTemplateColumns: `repeat(${board.cols}, minmax(72px, 1fr))`, maxWidth: board.cols * 150 }}>
          {Array.from({ length: board.rows }, (_, row) =>
            Array.from({ length: board.cols }, (_, col) => {
              const tile = board.grid[row]?.[col];
              if (!tile) return <div key={`empty-${row}-${col}`} className="aspect-square rounded-md border border-dashed border-outline" />;
              const points = knownPoints(tile);
              return (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => onOpen(tile.id)}
                  title={tile.name}
                  className="group flex cursor-pointer flex-col overflow-hidden rounded-md border-2 border-outline bg-surface text-left transition-colors hover:border-accent"
                >
                  <span className="relative aspect-square w-full">
                    {tile.imageUrl ? (
                      <img src={thumbUrl(tile.imageUrl)} alt="" className="absolute inset-0 h-full w-full object-contain p-1.5 transition-transform duration-150 group-hover:scale-105" />
                    ) : null}
                    {points !== null && <span className="num absolute bottom-1 left-1 rounded-sm bg-background/80 px-1 py-0.5 text-[9px] font-semibold leading-none text-on-surface-muted">{points}</span>}
                  </span>
                  <span className="truncate border-t border-outline px-1.5 py-1 text-center text-[11px] font-medium leading-tight text-on-surface">{tile.name}</span>
                </button>
              );
            }),
          )}
        </div>
      </div>
    </Panel>
  );
}

function TileDialog({ tile, isOpen, onClose }: { tile: TileModel | null; isOpen: boolean; onClose: () => void }) {
  const { Dialog, DialogHeader } = useDialogParts();
  const points = tile ? knownPoints(tile) : null;
  return (
    <Dialog isOpen={isOpen} onClose={onClose} size="lg">
      {tile && (
        <>
          <DialogHeader title={tile.name} subtitle={points !== null ? `${formatPoints(points)} pts` : undefined} onClose={onClose} />
          <div className="flex flex-col gap-4 p-5">
            {tile.imageUrl && <img src={fullUrl(tile.imageUrl)} alt={tile.name} className="mx-auto max-h-[50vh] w-auto max-w-full object-contain" />}
            {tile.rulesText ? <p className="whitespace-pre-line text-sm text-on-surface">{tile.rulesText}</p> : <p className="text-sm text-on-surface-muted">No rules were recorded for this Tile.</p>}
          </div>
        </>
      )}
    </Dialog>
  );
}

function Standings({ standings }: { standings: HistoricalStanding[] }) {
  const anyPoints = standings.some((s) => s.points !== null);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-on-surface-muted">
          <th className="w-12 py-1 font-medium">Place</th>
          <th className="py-1 font-medium">Team</th>
          {anyPoints && <th className="py-1 text-right font-medium">Points</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-outline">
        {standings.map((s) => (
          <tr key={s.teamId}>
            <td className="num py-1.5 font-semibold text-on-surface">{ordinal(s.place)}</td>
            <td className="py-1.5">
              <TeamSwatch color={s.teamColor} />
              <span className="text-on-surface">{s.teamName}</span>
            </td>
            {anyPoints && <td className="num py-1.5 text-right text-on-surface">{s.points !== null ? formatPoints(s.points) : "—"}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Teams({ teams }: { teams: TeamModel[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {teams.map((team) => (
        <li key={team.id}>
          <p className="mb-1 text-sm font-semibold text-on-surface">
            <TeamSwatch color={team.color} />
            {team.name}
          </p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-on-surface">
            {team.members.map((m) => (
              <li key={m.id} className="inline-flex items-center gap-1">
                {(m.isCaptain || m.isCoCaptain) && <CaptainEmblem co={m.isCoCaptain} />}
                <PlayerName userId={m.id}>{m.displayName}</PlayerName>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function WomBoard({ wom }: { wom: WomLeaderboard }) {
  const metric = wom.metric.toUpperCase();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-on-surface-muted">
        {wom.title} · {metric} gained
      </p>
      {wom.teams.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-on-surface-muted">
              <th className="py-1 font-medium">Team</th>
              <th className="py-1 text-right font-medium">Players</th>
              <th className="py-1 text-right font-medium">{metric}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline">
            {wom.teams.map((t) => (
              <tr key={t.teamId ?? t.name}>
                <td className="py-1.5 text-on-surface">
                  <TeamSwatch color={t.color} />
                  {t.name}
                </td>
                <td className="num py-1.5 text-right text-on-surface-muted">{t.players}</td>
                <td className="num py-1.5 text-right text-on-surface">{formatGained(t.gained)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-on-surface-muted">
            <th className="w-10 py-1 font-medium">#</th>
            <th className="py-1 font-medium">Player</th>
            <th className="py-1 font-medium max-sm:hidden">Team</th>
            <th className="py-1 text-right font-medium">{metric}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline">
          {wom.players.map((p, i) => (
            <tr key={`${p.rsn}-${i}`}>
              <td className="num py-1.5 text-on-surface-muted">{i + 1}</td>
              <td className="py-1.5 text-on-surface">
                {p.user ? <PlayerName userId={p.user.id}>{p.rsn}</PlayerName> : <span>{p.rsn}</span>}
                {!p.user && (
                  <Badge className="ml-1.5" tone="neutral">
                    Unmapped
                  </Badge>
                )}
              </td>
              <td className="py-1.5 text-on-surface-muted max-sm:hidden">{p.teamName ?? "—"}</td>
              <td className="num py-1.5 text-right text-on-surface">{formatGained(p.gained)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamSwatch({ color }: { color: string | null }) {
  return <span aria-hidden className="mr-1.5 inline-block size-2.5 rounded-full border border-outline align-middle" style={{ background: color ?? "transparent" }} />;
}

function formatGained(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}
