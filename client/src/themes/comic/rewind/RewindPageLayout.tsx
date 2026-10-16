import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { useReducedMotion } from "../../../core/settings/animations";
import { useBingoHeader, useBingoMenuEntries, useBoardModel, useRewindModel } from "../../../headless";
import type { RewindModel, RewindPopupModel, TileModel } from "../../../headless/types";
import { AppHeader } from "../../../core/ui/AppHeader";
import { Tooltip } from "../../../core/ui/Tooltip";
import { useSlot } from "../../context";
import { REWIND_POPUP_GAP } from "../../rewindPopupPointer";
import { rewindPopupTransition } from "../../rewindPopupMotion";
import { placePopup, type Bounds, type Placement } from "../../default/rewind/popupPlacement";
import { ComicPage } from "../fx/ComicPage";
import { comicHeaderProps } from "../page/headerStyle";
import { ModPanelLink } from "../page/Masthead";
import { useComic } from "../ui/useComic";
import { COVER } from "../wrapped/coverParts";
import { display, Kicker } from "../wrapped/sections/sectionParts-team-bingo";
import { LETTERED } from "../../lettering";
import { BandGround } from "./rewindParts";

// Kept this far from the header, the dock and the screen's edges.
const EDGE_PX = 8;

/**
 * The comic Rewind: the viewed Team's Board under a printed title band (the Wrapped's splash, in the Team's colour),
 * every Team's score and the log of Submissions in ink panels beside it (under it on a phone), and the timeline with its
 * controls docked at the foot like a strip of panels. Popups rise over the Board beside the Tile they landed on, and the
 * closing card with the final Titles once the moment reaches the end. Same behaviour as the default theme's page; only
 * the drawing differs.
 */
export function RewindPageLayout() {
  const rewind = useRewindModel();
  const board = useBoardModel();
  const reduceMotion = useReducedMotion();
  const { colors } = useComic();
  const header = useBingoHeader(rewind.slug);
  const menuEntries = useBingoMenuEntries(rewind.slug, header);
  const rootRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  // Where a popup may go: under the (sticky) header and over the dock, read afresh each frame.
  const bounds = useCallback((): Bounds => {
    const headerBottom = rootRef.current?.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
    const dockTop = dockRef.current?.getBoundingClientRect().top ?? window.innerHeight;
    return {
      left: EDGE_PX,
      top: headerBottom + EDGE_PX,
      right: document.documentElement.clientWidth - EDGE_PX,
      bottom: dockTop - EDGE_PX,
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
            <div
              role="img"
              aria-label={`${teams.tileName}. ${teams.summary}`}
              className="absolute inset-0 z-20 cursor-pointer"
              onClick={() => rewind.openTile.open(tile.id)}
            >
              <RewindTileMarkers tile={teams} />
            </div>
          </Tooltip>
        );
      }
    : undefined;

  return (
    <ComicPage>
      <div ref={rootRef}>
        <AppHeader
          title="Rewind"
          subtitle={rewind.bingoName}
          menuEntries={menuEntries}
          controls={rewind.teamSelector.teams.length > 0 && <TeamSelector selector={rewind.teamSelector} />}
          {...comicHeaderProps()}
        >
          {header?.canModerate && <ModPanelLink slug={rewind.slug} pendingCount={header.pendingCount} />}
        </AppHeader>

        <main className="relative mx-auto grid max-w-6xl gap-5 px-3 py-4 pb-48 sm:px-6 sm:py-6 sm:pb-44 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="min-w-0">
            <TitleBand rewind={rewind} />
            <BoardGrid board={board} onOpenTile={rewind.openTile.open} highlightedTileId={rewind.highlightedTileId} tileOverlay={tileOverlay} />
          </div>
          {/* On a wide screen the column stays in view between the header and the dock, and the log takes what the scoreboard leaves. */}
          <aside className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-17rem)] lg:self-start">
            <div className="shrink-0">
              <RewindScoreboard scoreboard={rewind.scoreboard} />
            </div>
            <div className="flex min-h-0 flex-col">
              <RewindLog log={rewind.log} />
            </div>
          </aside>
        </main>

        {/* The dock: raised paper on a thick ink rule with a hard shadow cast up onto the page. */}
        <div
          ref={dockRef}
          className="fixed inset-x-0 bottom-0 z-30 border-t-[3px]"
          style={{
            background: colors.PAPER_RAISED,
            borderColor: colors.LINE,
            boxShadow: `0 -4px 0 ${colors.SHADOW}`,
            color: colors.INK_BODY,
          }}
        >
          <div className="mx-auto max-w-6xl space-y-2.5 px-3 pb-3 pt-2.5 sm:px-6">
            <RewindTimeline timeline={rewind.timeline} />
            <RewindControls controls={rewind.controls} />
          </div>
        </div>

        {/* Over the Board, clear of the header and the dock; only the card itself takes clicks. */}
        <div className="pointer-events-none fixed inset-0 z-40">
          {/* Not mode="wait": at 4x and 8x the next popup comes before the last has gone, and waiting on each exit queued them
              up until a popup stuck on screen while Play went on without it. The new one comes in as the old one goes. */}
          <AnimatePresence>
            {popup && <PlacedPopup key={popup.submission.id} popup={popup} bounds={bounds} />}
            {!popup && closing && (
              <m.div
                key="closing"
                className="pointer-events-auto absolute inset-x-4 top-24 mx-auto w-fit"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.92, rotate: -2 }}
                animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
                transition={reduceMotion ? { duration: 0.16 } : { type: "spring", stiffness: 340, damping: 22 }}
              >
                <RewindClosing closing={closing} />
              </m.div>
            )}
          </AnimatePresence>
        </div>

        <TileModal tile={rewind.openTile.tile} isOpen={rewind.openTile.tile !== null} onClose={rewind.openTile.close} />
        <RewindTileTeams tile={rewind.openTile.teams} isOpen={rewind.openTile.teams !== null} onClose={rewind.openTile.close} />
      </div>
    </ComicPage>
  );
}

/**
 * Whose Board this is, as the Wrapped's section splash prints it: the Team's colour with rays and a rising halftone, a
 * kicker, the name lettered big, and its points at the moment being viewed in a yellow tab. The All Teams view gets the
 * same band in yellow, saying what the marks on the Tiles mean.
 */
function TitleBand({ rewind }: { rewind: RewindModel }) {
  const { colors } = useComic();
  const team = rewind.team;
  if (!team && !rewind.allTeams) return null;
  const accent = team?.color ?? COVER.YELLOW;
  const name = team ? team.name : "All Teams";
  const size = name.length > 26 ? 24 : name.length > 16 ? 30 : 36;
  return (
    <div
      className="relative mb-4 flex min-h-[76px] items-stretch overflow-hidden border-[3px]"
      style={{
        borderColor: colors.LINE,
        boxShadow: `4px 4px 0 ${colors.SHADOW}`,
      }}
    >
      <BandGround accent={accent} />
      <div className="relative flex min-w-0 flex-1 flex-col justify-center gap-1.5 px-4 py-2.5">
        <Kicker fill={COVER.PAPER_RAISED} tilt={-2}>
          {team ? "Now showing" : "Every Team at once"}
        </Kicker>
        <h2
          className={`${LETTERED} truncate`}
          style={{
            ...display(size),
            color: COVER.TITLE_FILL,
            WebkitTextStroke: `${Math.max(1.5, size / 22)}px ${COVER.INK}`,
            paintOrder: "stroke fill",
            textShadow: `${size / 12}px ${size / 12}px 0 ${COVER.INK}`,
            paddingRight: size / 8,
            paddingBottom: size / 14,
          }}
        >
          {name}
        </h2>
      </div>
      {team ? (
        <div
          className="relative flex shrink-0 flex-col items-center justify-center border-l-[3px] px-4"
          style={{
            background: COVER.YELLOW,
            borderColor: COVER.INK,
            color: COVER.INK,
          }}
        >
          <span
            className={`${LETTERED} num leading-none`}
            style={display(34, {
              textShadow: `2px 2px 0 ${COVER.PAPER_RAISED}`,
            })}
          >
            {rewind.teamPoints.toLocaleString()}
          </span>
          <span className={`${LETTERED} mt-1 leading-none`} style={display(13, { letterSpacing: "0.08em" })}>
            Points
          </span>
        </div>
      ) : (
        <p className="relative hidden max-w-[16rem] shrink-0 self-center px-4 text-right text-sm font-bold leading-snug sm:block" style={{ color: COVER.INK }}>
          The dots on each Tile are the Teams that completed it.
        </p>
      )}
    </div>
  );
}

/**
 * A popup's card, placed beside its Tile's cell (BoardGrid marks each with data-tile-id) and following it every frame
 * as the page scrolls or resizes. Hidden until first placed. A big one lands with a slam and a tilt, as a Wrapped panel's
 * headline does.
 */
function PlacedPopup({ popup, bounds }: { popup: RewindPopupModel; bounds: () => Bounds }) {
  const RewindPopup = useSlot("RewindPopup");
  const reduceMotion = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const tileId = popup.submission.tileId;
  const big = popup.size === "big";

  useLayoutEffect(() => {
    let frame = 0;
    const track = () => {
      const card = cardRef.current;
      if (card) {
        const el = tileId ? document.querySelector(`[data-tile-id="${CSS.escape(tileId)}"]`) : null;
        const next = placePopup(el?.getBoundingClientRect() ?? null, { width: card.offsetWidth, height: card.offsetHeight }, bounds(), REWIND_POPUP_GAP);
        setPlacement((prev) =>
          prev && prev.left === next.left && prev.top === next.top && prev.pointer?.edge === next.pointer?.edge && prev.pointer?.offset === next.pointer?.offset
            ? prev
            : next,
        );
      }
      frame = requestAnimationFrame(track);
    };
    track();
    return () => cancelAnimationFrame(frame);
  }, [tileId, bounds]);

  return (
    <m.div
      ref={cardRef}
      className="pointer-events-auto absolute"
      style={{
        left: placement?.left ?? 0,
        top: placement?.top ?? 0,
        visibility: placement ? undefined : "hidden",
      }}
      initial={
        reduceMotion
          ? { opacity: 0 }
          : {
              opacity: 0,
              y: 16,
              scale: big ? 0.86 : 0.94,
              rotate: big ? -3 : 0,
            }
      }
      animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
      transition={rewindPopupTransition(popup.holdMs, big && !reduceMotion ? { type: "spring", stiffness: 380, damping: 20 } : null)}
    >
      <RewindPopup popup={popup} pointer={placement?.pointer ?? null} />
    </m.div>
  );
}
