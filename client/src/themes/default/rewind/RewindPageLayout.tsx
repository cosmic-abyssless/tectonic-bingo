import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useBoardModel, useRewindModel } from "../../../headless";
import type { TileModel } from "../../../headless/types";
import { AppHeader } from "../../../core/ui/AppHeader";
import { UsersIcon } from "../../../core/ui/icons";
import { useSlot } from "../../context";

/**
 * Rewind's page: the viewed Team's Board at the moment being viewed, every Team's score beside it (under it on a
 * phone), and the timeline with its controls pinned to the bottom. Popups rise over the Board while playing or
 * stepping, and the closing card with the final Titles once the moment reaches the end. In the All Teams view the Board is the shared layout with each Tile's Team markers over it; hovering a
 * Tile titles every Team's progress on it and opening one lists it.
 */
export function RewindPageLayout() {
  const rewind = useRewindModel();
  const board = useBoardModel();
  const reduceMotion = useReducedMotion();

  const TeamSelector = useSlot("TeamSelector");
  const BoardGrid = useSlot("BoardGrid");
  const TileModal = useSlot("TileModal");
  const RewindTimeline = useSlot("RewindTimeline");
  const RewindControls = useSlot("RewindControls");
  const RewindScoreboard = useSlot("RewindScoreboard");
  const RewindPopup = useSlot("RewindPopup");
  const RewindClosing = useSlot("RewindClosing");
  const RewindTileMarkers = useSlot("RewindTileMarkers");
  const RewindTileTeams = useSlot("RewindTileTeams");

  const popup = rewind.popup;
  const closing = rewind.closing;
  const tileTeams = rewind.tileTeams;
  const tileOverlay = tileTeams
    ? (tile: TileModel) => {
        const teams = tileTeams.get(tile.id);
        if (!teams) return null;
        // Over the cell for the hover title; a click goes on to open the Tile, like the cell's own.
        return (
          <div title={`${teams.tileName}\n${teams.summary}`} className="absolute inset-0 z-20 cursor-pointer" onClick={() => rewind.openTile.open(tile.id)}>
            <RewindTileMarkers tile={teams} />
          </div>
        );
      }
    : undefined;

  return (
    <div className="min-h-dvh bg-background text-on-surface">
      <AppHeader back={{ to: `/b/${rewind.slug}`, label: "Back to bingo" }} title="Rewind" subtitle={rewind.bingoName}>
        {rewind.teamSelector.teams.length > 0 && <TeamSelector selector={rewind.teamSelector} />}
      </AppHeader>

      <main className="mx-auto grid max-w-6xl gap-4 px-3 py-4 pb-44 sm:px-6 sm:py-6 sm:pb-40 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0">
          {rewind.allTeams && (
            <div className="mb-3 flex h-10 items-center justify-between gap-3 rounded-md border border-outline bg-surface px-3">
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <UsersIcon size={14} className="shrink-0 text-on-surface-subtle" />
                <span className="truncate font-semibold">All Teams</span>
              </span>
              <span className="truncate text-xs text-on-surface-subtle">Dots mark the Teams that completed a Tile</span>
            </div>
          )}
          {rewind.team && (
            <div className="mb-3 flex h-10 items-center justify-between gap-3 rounded-md border border-outline bg-surface px-3" style={rewind.team.color ? { borderColor: `${rewind.team.color}99` } : undefined}>
              <span className="flex min-w-0 items-center gap-2 text-sm">
                {rewind.team.color && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: rewind.team.color }} />}
                <span className="truncate font-semibold">{rewind.team.name}</span>
              </span>
              <span className="num text-sm font-semibold">
                {rewind.teamPoints.toLocaleString()} <span className="font-normal text-on-surface-subtle">pts</span>
              </span>
            </div>
          )}
          <BoardGrid board={board} onOpenTile={rewind.openTile.open} highlightedTileId={rewind.highlightedTileId} tileOverlay={tileOverlay} />
        </div>
        <aside className="min-w-0">
          <RewindScoreboard scoreboard={rewind.scoreboard} />
        </aside>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-outline bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-6xl space-y-2 px-3 py-3 sm:px-6">
          <RewindTimeline timeline={rewind.timeline} />
          <RewindControls controls={rewind.controls} />
        </div>
      </div>

      {/* Over the Board, clear of the header and the timeline; only the card itself takes clicks. */}
      <div className="pointer-events-none fixed inset-x-0 top-20 z-40 flex justify-center px-4">
        <AnimatePresence mode="wait">
          {popup && (
            <motion.div
              key={popup.submission.id}
              className="pointer-events-auto"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: popup.size === "big" ? 0.9 : 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
              transition={popup.size === "big" && !reduceMotion ? { type: "spring", stiffness: 380, damping: 24 } : { duration: 0.16 }}
            >
              <RewindPopup popup={popup} />
            </motion.div>
          )}
          {!popup && closing && (
            <motion.div
              key="closing"
              className="pointer-events-auto"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
              transition={reduceMotion ? { duration: 0.16 } : { type: "spring", stiffness: 320, damping: 28 }}
            >
              <RewindClosing closing={closing} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <TileModal tile={rewind.openTile.tile} isOpen={rewind.openTile.tile !== null} onClose={rewind.openTile.close} />
      <RewindTileTeams tile={rewind.openTile.teams} isOpen={rewind.openTile.teams !== null} onClose={rewind.openTile.close} />
    </div>
  );
}
