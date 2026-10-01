import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useBingoHeader, useBingoMenuEntries, useBoardModel, useRewindModel } from "../../../headless";
import type { RewindPopupModel, TileModel } from "../../../headless/types";
import { AppHeader } from "../../../core/ui/AppHeader";
import { UsersIcon } from "../../../core/ui/icons";
import { useSlot } from "../../context";
import { REWIND_POPUP_GAP } from "../../rewindPopupPointer";
import { ModPanelButton } from "../page/ModPanelButton";
import { placePopup, type Bounds, type Placement } from "./popupPlacement";
import { Tooltip } from "../../../core/ui/Tooltip";

// Kept this far from the header, the timeline and the screen's edges.
const EDGE_PX = 8;

/**
 * Rewind's page: the viewed Team's Board at the moment being viewed, every Team's score and the log of Submissions so
 * far beside it (under it on a phone), and the timeline with its controls pinned to the bottom. Popups rise over the Board while playing or
 * stepping, beside the Tile they landed on, and the closing card with the final Titles once the moment reaches the end. In the All Teams view the Board is the shared layout with each Tile's Team markers over it; hovering a
 * Tile titles every Team's progress on it and opening one lists it.
 */
export function RewindPageLayout() {
  const rewind = useRewindModel();
  const board = useBoardModel();
  const reduceMotion = useReducedMotion();
  const header = useBingoHeader(rewind.slug);
  const menuEntries = useBingoMenuEntries(rewind.slug, header);
  const rootRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  // Where a popup may go: under the (sticky) header and over the timeline, read afresh each frame.
  const bounds = useCallback((): Bounds => {
    const headerBottom = rootRef.current?.querySelector(":scope > header")?.getBoundingClientRect().bottom ?? 0;
    const timelineTop = timelineRef.current?.getBoundingClientRect().top ?? window.innerHeight;
    return {
      left: EDGE_PX,
      top: headerBottom + EDGE_PX,
      right: document.documentElement.clientWidth - EDGE_PX,
      bottom: timelineTop - EDGE_PX,
    };
  }, []);

  const TeamSelector = useSlot("TeamSelector");
  const BoardGrid = useSlot("BoardGrid");
  const TileModal = useSlot("TileModal");
  const RewindTimeline = useSlot("RewindTimeline");
  const RewindControls = useSlot("RewindControls");
  const RewindScoreboard = useSlot("RewindScoreboard");
  const RewindLog = useSlot("RewindLog");
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
        // Over the cell for the hover tooltip; a click goes on to open the Tile, like the cell's own. Out of the tab
        // order: the cell under it is the one a keyboard opens.
        return (
          <Tooltip content={`${teams.tileName}\n${teams.summary}`} excludeFromTabOrder>
            <div role="img" aria-label={`${teams.tileName}. ${teams.summary}`} className="absolute inset-0 z-20 cursor-pointer" onClick={() => rewind.openTile.open(tile.id)}>
              <RewindTileMarkers tile={teams} />
            </div>
          </Tooltip>
        );
      }
    : undefined;

  return (
    <div ref={rootRef} className="min-h-dvh bg-background text-on-surface">
      <AppHeader title="Rewind" subtitle={rewind.bingoName} menuEntries={menuEntries} controls={rewind.teamSelector.teams.length > 0 && <TeamSelector selector={rewind.teamSelector} />}>
        {header?.canModerate && <ModPanelButton slug={rewind.slug} pendingCount={header.pendingCount} />}
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
            <div
              className="mb-3 flex h-10 items-center justify-between gap-3 rounded-md border border-outline bg-surface px-3"
              style={rewind.team.color ? { borderColor: `${rewind.team.color}99` } : undefined}
            >
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
        {/* On a wide screen the column stays in view between the header and the timeline, and the log takes what the scoreboard leaves. */}
        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-15rem)] lg:self-start">
          <div className="shrink-0">
            <RewindScoreboard scoreboard={rewind.scoreboard} />
          </div>
          <div className="flex min-h-0 flex-col">
            <RewindLog log={rewind.log} />
          </div>
        </aside>
      </main>

      <div ref={timelineRef} className="fixed inset-x-0 bottom-0 z-30 border-t border-outline bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-6xl space-y-2 px-3 py-3 sm:px-6">
          <RewindTimeline timeline={rewind.timeline} />
          <RewindControls controls={rewind.controls} />
        </div>
      </div>

      {/* Over the Board, clear of the header and the timeline; only the card itself takes clicks. */}
      <div className="pointer-events-none fixed inset-0 z-40">
        <AnimatePresence mode="wait">
          {popup && <PlacedPopup key={popup.submission.id} popup={popup} bounds={bounds} />}
          {!popup && closing && (
            <motion.div
              key="closing"
              className="pointer-events-auto absolute inset-x-4 top-20 mx-auto w-fit"
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

/**
 * A popup's card, placed beside its Tile's cell (BoardGrid marks each with data-tile-id) and following it every frame
 * as the page scrolls or resizes. Hidden until first placed.
 */
function PlacedPopup({ popup, bounds }: { popup: RewindPopupModel; bounds: () => Bounds }) {
  const RewindPopup = useSlot("RewindPopup");
  const reduceMotion = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const tileId = popup.submission.tileId;

  useLayoutEffect(() => {
    let frame = 0;
    const track = () => {
      const card = cardRef.current;
      if (card) {
        const el = tileId ? document.querySelector(`[data-tile-id="${CSS.escape(tileId)}"]`) : null;
        const next = placePopup(el?.getBoundingClientRect() ?? null, { width: card.offsetWidth, height: card.offsetHeight }, bounds(), REWIND_POPUP_GAP);
        setPlacement((prev) => (prev && prev.left === next.left && prev.top === next.top && prev.pointer?.edge === next.pointer?.edge && prev.pointer?.offset === next.pointer?.offset ? prev : next));
      }
      frame = requestAnimationFrame(track);
    };
    track();
    return () => cancelAnimationFrame(frame);
  }, [tileId, bounds]);

  return (
    <motion.div
      ref={cardRef}
      className="pointer-events-auto absolute"
      style={{
        left: placement?.left ?? 0,
        top: placement?.top ?? 0,
        visibility: placement ? undefined : "hidden",
      }}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: popup.size === "big" ? 0.9 : 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
      transition={popup.size === "big" && !reduceMotion ? { type: "spring", stiffness: 380, damping: 24 } : { duration: 0.16 }}
    >
      <RewindPopup popup={popup} pointer={placement?.pointer ?? null} />
    </motion.div>
  );
}
