import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { BoardLine, RewindSubmission, TileInterest } from "@bingo/shared";
import { fullBoard, useBoard, useRewind } from "../api/queries";
import { thumbUrl } from "../api/imageVariants";
import { useAuth } from "../context/AuthContext";
import { NO_LOCKS } from "../core/board/exclusivity";
import { sinceStart } from "../core/stats/timeFormat";
import { formatGp } from "../core/ui/gp";
import { displayName } from "../core/ui/user";
import { BoardModelProvider, BoardProvider, useBoardModel } from "./BoardProvider";
import { useBingoPage, useBingoPageRaw } from "./BingoPageProvider";
import { adjustmentsAt, ALL_TEAMS, layoutOnly, boardStateAt, countUpTo, formatOneIn, isNotable, playbackHolds, PLAYBACK, PLAYBACK_SPEEDS, playsAt, prepareRewind, stepNext, stepPrev, teamPointsAt, tileTeamsAt, visibleItems, type RewindItem } from "./rewindModel";
import { readRewindSpeed, writeRewindSpeed } from "./rewindSpeedStore";
import type { RewindModel, RewindSubmissionModel, RewindTileTeamsModel, TeamModel } from "./types";

const RewindContext = createContext<RewindModel | null>(null);

const EMPTY_LINES: BoardLine[] = [];
const EMPTY_INTERESTS: TileInterest[] = [];
const EMPTY_ITEMS: RewindItem[] = [];
const EMPTY_BOARD_STATE = boardStateAt(undefined, EMPTY_ITEMS, 0);
// How long the URL waits for the moment to settle before recording it (a drag moves it many times a second).
const URL_WRITE_DELAY_MS = 300;

const clock = (ms: number) => new Date(ms).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });

function toSubmissionModel(sub: RewindSubmission, at: number, start: number, team: TeamModel | undefined, tileName: string | null): RewindSubmissionModel {
  const c = sub.completed;
  const highlights = [
    ...c.lines.map((l) => `${l} complete`),
    ...c.firstTiles.map((t) => `First to complete ${t}`),
    ...c.tiles.filter((t) => !c.firstTiles.includes(t)).map((t) => `Completed ${t}`),
    ...c.firstParts.map((p) => `First to complete ${p}`),
  ];
  return {
    id: sub.id,
    at,
    timeLabel: clock(at),
    sinceStartLabel: sinceStart(new Date(at), new Date(start)),
    tier: sub.significance.tier,
    rejected: sub.status === "rejected",
    playerName: sub.player ? displayName(sub.player) : null,
    team: { id: sub.teamId, name: team?.name ?? "", color: team?.color ?? null },
    tileId: sub.tileId,
    tileName,
    thumbnailUrl: thumbUrl(sub.screenshotUrl) ?? null,
    screenshotUrl: sub.screenshotUrl,
    items: sub.claims.map((cl) => ({
      label: cl.label,
      quantity: cl.quantity,
      gpValue: cl.gpValue,
      gpLabel: formatGp(cl.gpValue),
      // Below 1 in 2 a drop wasn't lucky at all; "1 in 1" would only be noise.
      luckLabel: cl.luckOneIn !== null && cl.luckOneIn >= 2 ? formatOneIn(cl.luckOneIn) : null,
    })),
    gpValue: sub.gpValue,
    gpLabel: formatGp(sub.gpValue),
    reactions: sub.reactions.map((g) => ({ emoji: g.emoji, count: g.users.length, names: g.users.map(displayName), mine: false })),
    highlights,
  };
}

/**
 * Rewind's headless state (CONTEXT.md "Rewind"): the moment being viewed (in the URL as ?at=, with ?team=), Play and
 * stepping, the scoreboard, and the popups. Wraps a BoardProvider fed with the viewed Team's Board at that moment, so
 * the ordinary Board slots draw it. In the All Teams view (?team=all) that Board is the shared layout with no one's
 * progress, and tileTeams says which Teams have completed each Tile. Sits inside BingoPageProvider, whose shell
 * (teams, tiles) it reads.
 */
export function RewindProvider({ slug, children, renderLoading, renderError }: { slug: string; children: ReactNode; renderLoading: () => ReactNode; renderError: (message: string) => ReactNode }) {
  const page = useBingoPage();
  const raw = useBingoPageRaw();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: boardData } = useBoard(slug);
  const { data, error, isLoading } = useRewind(slug, page.bingo.stage === "complete");
  const prepared = useMemo(() => (data ? prepareRewind(data) : null), [data]);

  const [atState, setAtState] = useState<number | null>(null);
  const [teamState, setTeamState] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [popupId, setPopupId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(readRewindSpeed);
  const [showRejected, setShowRejected] = useState(false);
  const [openTileId, setOpenTileId] = useState<string | null>(null);

  const start = prepared?.start ?? 0;
  const end = prepared?.end ?? 0;
  const clamp = useCallback((ms: number) => Math.min(end, Math.max(start, ms)), [start, end]);
  const urlAt = Number(params.get("at"));
  const at = atState ?? (params.get("at") && Number.isFinite(urlAt) ? clamp(urlAt) : start);

  // The view: a Team's id, or ALL_TEAMS.
  const urlTeam = params.get("team");
  const viewId = teamState ?? (urlTeam === ALL_TEAMS || page.teams.some((t) => t.id === urlTeam) ? urlTeam : null) ?? page.myTeam?.id ?? page.teams[0]?.id ?? null;
  const allTeams = viewId === ALL_TEAMS;
  const teamId = allTeams ? null : viewId;
  const teamModel = page.teams.find((t) => t.id === teamId) ?? null;

  const allItems = (allTeams ? prepared?.allItems : teamId && prepared?.itemsByTeam.get(teamId)) || EMPTY_ITEMS;
  const items = useMemo(() => visibleItems(allItems, showRejected), [allItems, showRejected]);
  const holds = useMemo(() => playbackHolds(items.map((i) => i.sub.significance.tier), allTeams ? PLAYBACK.allTeamsMinMinorMs : PLAYBACK.minMinorMs, speed), [items, allTeams, speed]);
  // What Play stops on at this speed: a fast one skips minor Submissions (rewindModel.playsAt).
  const playable = useCallback((i: RewindItem) => playsAt(i.sub.significance.tier, speed), [speed]);
  const focusIndex = focusId ? items.findIndex((i) => i.sub.id === focusId) : -1;

  // The moment into the URL once it settles, so a link (or a reload) opens Rewind right there.
  useEffect(() => {
    if (atState === null && teamState === null) return;
    const timer = setTimeout(() => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (atState !== null) next.set("at", String(Math.round(atState)));
          if (viewId) next.set("team", viewId);
          return next;
        },
        { replace: true },
      );
    }, URL_WRITE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [atState, teamState, viewId, setParams]);

  const show = useCallback(
    (index: number, withPopup: boolean) => {
      const item = items[index];
      if (!item) return;
      setAtState(item.at);
      setFocusId(item.sub.id);
      setPopupId(withPopup && isNotable(item.sub.significance.tier) ? item.sub.id : null);
    },
    [items],
  );

  // Play: event by event, skipping the gaps, each held for its tier's time at the chosen speed (rewindModel.playbackHolds).
  // Changing the speed mid-hold keeps the hold's start, so only the time left changes.
  // Each hold ends at a deadline carried over from the one before, rather than "now + hold", so the time spent
  // rendering each step (and timers firing late) doesn't pile up over a thousand Submissions.
  const atRef = useRef(at);
  atRef.current = at;
  const holdStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (!playing || !prepared) {
      holdStartRef.current = null;
      return;
    }
    if (focusIndex < 0) {
      const first = stepNext(items, atRef.current, -1, playable);
      if (first < 0) setPlaying(false);
      else show(first, true);
      return;
    }
    const now = performance.now();
    // A stale start (Play resumed, or the tab was in the background) starts the hold afresh instead of racing ahead.
    const holdStart = holdStartRef.current !== null && now - holdStartRef.current < holds[focusIndex]! + 1_000 ? holdStartRef.current : now;
    holdStartRef.current = holdStart;
    const deadline = holdStart + holds[focusIndex]!;
    const timer = setTimeout(() => {
      holdStartRef.current = deadline;
      const next = stepNext(items, atRef.current, focusIndex, playable);
      if (next >= 0) show(next, true);
      else {
        // The end: the Finished Board, with anything made after the last drop (a late Point Adjustment) counted too.
        setPlaying(false);
        setFocusId(null);
        setPopupId(null);
        setAtState(prepared.end);
      }
    }, Math.max(0, deadline - now));
    return () => clearTimeout(timer);
  }, [playing, prepared, focusIndex, items, holds, playable, show]);

  // The viewed Team's Board at `at`. Only approved Submissions move it, and every change it has comes at one of their
  // times, so it's rebuilt only when one more (or one fewer) of them is on it. In the All Teams view the Board itself
  // stays empty and every Team's progress per Tile is rebuilt instead, on the same cutoff over every Team's Submissions.
  const team = teamId ? prepared?.teams.get(teamId) : undefined;
  const approved = useMemo(() => allItems.filter((i) => i.sub.status === "approved"), [allItems]);
  const approvedCount = countUpTo(approved, at);
  const cutoff = approvedCount > 0 ? approved[approvedCount - 1]!.at : start - 1;
  const { nodeStates, teamSubmissions } = useMemo(() => (allTeams ? EMPTY_BOARD_STATE : boardStateAt(team, allItems, cutoff)), [allTeams, team, allItems, cutoff]);
  const tileTeams = useMemo(() => {
    if (!allTeams || !prepared) return null;
    const progress = tileTeamsAt(raw.tiles, prepared, page.teams.map((t) => t.id), cutoff);
    // Scoreboard order at the cutoff, so a Tile's markers and its list read the same way as the scoreboard.
    const order = [...page.teams].sort((a, b) => teamPointsAt(prepared.teams.get(b.id), cutoff) - teamPointsAt(prepared.teams.get(a.id), cutoff) || a.name.localeCompare(b.name));
    const rank = new Map(order.map((t, i) => [t.id, i]));
    const out = new Map<string, RewindTileTeamsModel>();
    for (const tile of raw.tiles) {
      const teams = (progress.get(tile.id) ?? [])
        .map((p) => {
          const t = page.teams.find((o) => o.id === p.teamId)!;
          return { id: t.id, name: t.name, color: t.color, complete: p.complete, completedTasks: p.completedTasks, totalTasks: p.totalTasks, pointsAwarded: p.pointsAwarded, totalPoints: p.totalPoints };
        })
        .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
      out.set(tile.id, {
        tileId: tile.id,
        tileName: tile.name,
        completedBy: teams.filter((t) => t.complete).map(({ id, name, color }) => ({ id, name, color })),
        teams,
        summary: teams.map((t) => `${t.name}: ${t.complete ? "complete" : `${t.completedTasks}/${t.totalTasks} parts`}`).join(" · "),
      });
    }
    return out;
  }, [allTeams, prepared, raw.tiles, page.teams, cutoff]);
  const adjustmentCount = team ? countUpTo(team.adjustments.map((a) => ({ at: Date.parse(a.createdAt) })), at) : 0;
  const adjustments = useMemo(() => adjustmentsAt(team, raw.bingo.id, at), [team, raw.bingo.id, adjustmentCount]); // eslint-disable-line react-hooks/exhaustive-deps
  const teamPoints = allTeams ? 0 : teamPointsAt(team, at);

  if (!user) return null;
  if (page.bingo.stage !== "complete") return renderError("Rewind is only available once the bingo is finished");
  if (error) return renderError(error instanceof Error ? error.message : "Couldn't load Rewind");
  if (isLoading || !prepared) return renderLoading();

  const tileName = (id: string | null) => (id ? (raw.tiles.find((t) => t.id === id)?.name ?? null) : null);
  const teamById = new Map(page.teams.map((t) => [t.id, t]));
  const current = focusIndex >= 0 ? items[focusIndex]! : null;
  const popupItem = popupId ? (items.find((i) => i.sub.id === popupId) ?? null) : null;
  const span = Math.max(1, end - start);
  const notable = (i: RewindItem) => isNotable(i.sub.significance.tier);

  const pause = () => setPlaying(false);
  const step = (index: number) => {
    if (index < 0) return;
    pause();
    show(index, true);
  };
  const seek = (ms: number) => {
    pause();
    setAtState(clamp(ms));
    setFocusId(null);
    setPopupId(null);
  };
  // A Team's id, or ALL_TEAMS.
  const selectTeam = (id: string) => {
    setTeamState(id);
    setFocusId(null);
    setPopupId(null);
  };

  const scoreboardTeams = page.teams
    .map((t) => ({ id: t.id, name: t.name, color: t.color, points: teamPointsAt(prepared.teams.get(t.id), at), isViewed: t.id === viewId, isMine: t.isMine }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  const ranked = scoreboardTeams.map((t) => ({ ...t, rank: 1 + scoreboardTeams.findIndex((o) => o.points === t.points) }));

  const model: RewindModelWithoutOpenTile = {
    slug,
    bingoName: page.bingo.name,
    team: teamModel,
    allTeams,
    tileTeams,
    teamSelector: { teams: page.teams, selectedId: teamId, select: selectTeam, allTeams: { selected: allTeams, select: () => selectTeam(ALL_TEAMS) } },
    teamPoints,
    timeline: {
      start,
      end,
      at,
      position: (at - start) / span,
      atLabel: sinceStart(new Date(at), new Date(start)),
      atClockLabel: clock(at),
      startLabel: clock(start),
      endLabel: clock(end),
      ticks: items.map((i) => ({
        id: i.sub.id,
        position: (i.at - start) / span,
        tier: i.sub.significance.tier,
        rejected: i.sub.status === "rejected",
        past: i.at <= at,
        current: i.sub.id === current?.sub.id,
        teamColor: allTeams ? (teamById.get(i.sub.teamId)?.color ?? null) : null,
      })),
      seek,
      jumpTo: (id) => step(items.findIndex((i) => i.sub.id === id)),
    },
    controls: {
      playing,
      togglePlay: () => {
        if (playing) return pause();
        // At the end there's nothing left to play: start over.
        if (stepNext(items, at, focusIndex, playable) < 0) {
          setAtState(start);
          setFocusId(null);
          setPopupId(null);
        }
        setPlaying(true);
      },
      canPrev: stepPrev(items, at, focusIndex) >= 0,
      canNext: stepNext(items, at, focusIndex) >= 0,
      canPrevNotable: stepPrev(items, at, focusIndex, notable) >= 0,
      canNextNotable: stepNext(items, at, focusIndex, notable) >= 0,
      prev: () => step(stepPrev(items, at, focusIndex)),
      next: () => step(stepNext(items, at, focusIndex)),
      prevNotable: () => step(stepPrev(items, at, focusIndex, notable)),
      nextNotable: () => step(stepNext(items, at, focusIndex, notable)),
      showRejected,
      setShowRejected: (on) => {
        setShowRejected(on);
        if (!on && current?.sub.status === "rejected") {
          setFocusId(null);
          setPopupId(null);
        }
      },
      speed,
      speeds: PLAYBACK_SPEEDS,
      setSpeed: (s) => {
        setSpeed(s);
        writeRewindSpeed(s);
      },
      positionLabel: `${focusIndex >= 0 ? focusIndex + 1 : countUpTo(items, at)} / ${items.length}`,
    },
    scoreboard: { teams: ranked, select: selectTeam },
    current: current ? toSubmissionModel(current.sub, current.at, start, teamById.get(current.sub.teamId), tileName(current.sub.tileId)) : null,
    highlightedTileId: current?.sub.tileId ?? null,
    popup: popupItem
      ? {
          submission: toSubmissionModel(popupItem.sub, popupItem.at, start, teamById.get(popupItem.sub.teamId), tileName(popupItem.sub.tileId)),
          size: popupItem.sub.significance.tier === "huge" ? "big" : "small",
          // Resuming Play starts the hold afresh (the effect above), so the countdown starts over with it.
          holdMs: playing && popupItem === current ? (holds[focusIndex] ?? null) : null,
          close: () => setPopupId(null),
        }
      : null,
    exit: () => navigate(`/b/${slug}`),
    openTileId,
    openTileActions: { open: setOpenTileId, close: () => setOpenTileId(null) },
  };

  return (
    <BoardProvider
      tiles={raw.tiles}
      categories={raw.categories}
      lines={fullBoard(boardData)?.lines ?? EMPTY_LINES}
      nodeStates={nodeStates}
      teamSubmissions={teamSubmissions}
      bingoStartsAt={raw.bingo.effectiveStartsAt}
      bingoRows={raw.bingo.boardRows}
      bingoCols={raw.bingo.boardCols}
      searchQuery=""
      canSubmit={false}
      canToggleInterest={false}
      interests={EMPTY_INTERESTS}
      viewerUserId={user.id}
      totalPoints={allTeams ? null : teamPoints}
      adjustments={adjustments}
      locks={NO_LOCKS}
      // A Finished Bingo's Tiles are never sealed.
      sealed={false}
    >
      <WithOpenTile model={model}>{children}</WithOpenTile>
    </BoardProvider>
  );
}

type RewindModelWithoutOpenTile = Omit<RewindModel, "openTile"> & { openTileId: string | null; openTileActions: { open(id: string): void; close(): void } };

// The open Tile comes from the Rewind Board, so it's read inside the BoardProvider above. Its Submissions are left
// out: the timeline and popups show those, and the Tile's own list would offer Reactions for the wrong moment. In the
// All Teams view the Board has no one's progress, so the open Tile is every Team's progress on it instead.
function WithOpenTile({ model, children }: { model: RewindModelWithoutOpenTile; children: ReactNode }) {
  const board = useBoardModel();
  const { openTileId, openTileActions, ...rest } = model;
  const tile = openTileId && !rest.allTeams ? board.tileById.get(openTileId) : undefined;
  const teams = openTileId ? (rest.tileTeams?.get(openTileId) ?? null) : null;
  const value: RewindModel = { ...rest, openTile: { tile: tile ? { ...tile, submissions: [] } : null, teams, ...openTileActions } };
  const layout = useMemo(() => (rest.allTeams ? layoutOnly(board) : null), [rest.allTeams, board]);
  const content = <RewindContext.Provider value={value}>{children}</RewindContext.Provider>;
  return layout ? <BoardModelProvider value={layout}>{content}</BoardModelProvider> : content;
}

export function useRewindModel(): RewindModel {
  const ctx = useContext(RewindContext);
  if (!ctx) throw new Error("useRewindModel must be used within RewindProvider");
  return ctx;
}
