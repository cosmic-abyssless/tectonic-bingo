import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useSetUrlParams } from "../core/ui/useUrlParam";
import { STAGE_LABEL, areRulesHidden, areTilesSealed, nextMilestone, type BingoShellResponse, type BoardLine, type PointAdjustment, type SubmissionDetails, type SubmissionKind, type TeamNodeState, type Tile, type TileCategory, type TileInterest } from "@bingo/shared";
import { useBingo, useBoard, useDraftState, useFeedbackForm, usePendingCount, usePermissions, useRecordAchievementOpened, useSetSubmissionReaction, useSetTileInterest, useTeamProgress, useTeamSubmissions } from "../api/queries";
import { useAuth } from "../context/AuthContext";
import { displayName, avatarUrl } from "../core/ui/user";
import { useHasPassed } from "../core/ui/useHasPassed";
import { toCategoryModel, toTeamModel, buildSubmissionModels, sealedBoardAsTiles } from "./boardModel";
import { lockedLeaves, type ExclusiveLocks } from "../core/board/exclusivity";
import { OPEN_PARAM, TEAM_PARAM, TILE_PARAM, resolveBoardUrl, type BoardDialog } from "./boardUrlState";
import { useBingoCan, useCloseOnLoss } from "./permissions";
import { canRewind as canRewindOf, canScout as canScoutOf, canViewStats as canViewStatsOf } from "./useBingoHeader";
import { TileSearchProvider } from "./TileSearchProvider";
import { tileSearchMatcher } from "../core/board/tileSearch";
import { toastQueue } from "../core/ui/Toast";
import { usePageEvents } from "./usePageEvents";
import { BoardProvider } from "./BoardProvider";
import { TutorialProvider } from "./useTutorial";
import type { BingoPageModel, StageView, TeamModel } from "./types";

// Internal escape hatch: only useSubmissionFlow.ts (which needs raw
// tiles/categories/nodeStates/teamSubmissions/bingo for the submission
// flow's claim logic) reads this. No theme should ever import it — themes
// only get the headless barrel's clean models.
interface BingoPageRaw {
  slug: string;
  bingo: BingoShellResponse["bingo"];
  tiles: Tile[];
  categories: TileCategory[];
  nodeStates: TeamNodeState[];
  teamSubmissions: SubmissionDetails[];
  /** The team being viewed (a mod's picked team, otherwise your own) and who you are on it, for who a submission is for. */
  viewingTeam: TeamModel | null;
  viewerId: string;
  /** Item nodes the viewed team can't claim because it used them elsewhere (exclusive items). */
  locks: ExclusiveLocks;
  /** Each Tile's Tags, its Parts' included, for searching the Tiles (BoardResponse.tileTags); none while sealed. */
  tileTags: Readonly<Record<string, string[]>>;
  /** The viewed team's progress (its Task interest among it) has arrived, from the server or the cache. */
  progressLoaded: boolean;
}

const BingoPageContext = createContext<BingoPageModel | null>(null);
const BingoPageRawContext = createContext<BingoPageRaw | null>(null);

const EMPTY_TILES: Tile[] = [];
const EMPTY_CATEGORIES: TileCategory[] = [];
const NO_TILE_TAGS: Readonly<Record<string, string[]>> = {};
const EMPTY_LINES: BoardLine[] = [];
const EMPTY_NODE_STATES: TeamNodeState[] = [];
const EMPTY_INTERESTS: TileInterest[] = [];
const EMPTY_SUBMISSIONS: SubmissionDetails[] = [];
const EMPTY_ADJUSTMENTS: PointAdjustment[] = [];

// Clicking a sealed tile says so, once: a click on another replaces the note instead of stacking a new one.
let sealedNoteKey: string | null = null;
function showSealedNote() {
  if (sealedNoteKey) toastQueue.close(sealedNoteKey);
  sealedNoteKey = toastQueue.add({ title: "The Tiles are sealed", description: "They open at a later date." }, { timeout: 4000 });
}

export function BingoPageProvider({
  slug,
  children,
  renderLoading,
  renderError,
}: {
  slug: string;
  children: ReactNode;
  renderLoading: () => ReactNode;
  renderError: (message: string) => ReactNode;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: shell, isLoading: shellLoading, error: shellError } = useBingo(slug);
  // Someone who can't see the bingo gets only its landing data (the server refuses the rest), so nothing else is asked for.
  const canSee = !!shell?.viewer.canSee;
  const { data: boardData } = useBoard(canSee ? slug : undefined);
  // Sealed Tiles (CONTEXT.md): the server decides, by sending this viewer the sealed board.
  const sealed = !!boardData?.sealed;
  const bingoId = shell?.bingo.id ?? "";
  const { tiles, lines } = useMemo(
    () => (!boardData ? { tiles: EMPTY_TILES, lines: EMPTY_LINES } : boardData.sealed ? sealedBoardAsTiles(boardData, bingoId) : boardData),
    [boardData, bingoId],
  );
  // The board's search matches in the browser (core/board/tileSearch.ts), with the full board's Tags; the sealed board
  // has none, and while sealed a Tile is found by its name and Category only.
  const tileTags = (boardData && !boardData.sealed ? boardData.tileTags : undefined) ?? NO_TILE_TAGS;
  const shellCategories = shell?.categories ?? EMPTY_CATEGORIES;
  const matchTile = useMemo(() => tileSearchMatcher(sealed, shellCategories, tileTags), [sealed, shellCategories, tileTags]);

  const can = useBingoCan(slug);
  const { data: permissions, dataUpdatedAt: permissionsAt } = usePermissions(slug);
  // The Feedback form (CONTEXT.md), for the card inviting a Player to answer it: asked for only of a Finished Bingo.
  const { data: feedbackForm } = useFeedbackForm(slug, shell?.bingo.stage === "complete" && !shell.historical && can("answer_feedback").allowed);

  // The open Tile, the viewed Team and the open dialog live in the URL (#389), so a link reopens them. What the viewer
  // can't see, or what doesn't exist, isn't opened, and its param is dropped quietly once that's known.
  const [searchParams] = useSearchParams();
  const setUrl = useSetUrlParams();
  const location = useLocation();
  const myTeamId = shell?.myTeam?.id ?? null;
  // Whoever sees other teams can look at any team's board: mods, and once the bingo is Finished everyone (read-only).
  const canPickTeam = !!shell && can("view_other_teams").allowed && (!shell.historical || shell.historical.tasks);
  const tileIds = useMemo(() => (shell && !canSee ? new Set<string>() : boardData ? new Set(tiles.map((t) => t.id)) : null), [shell, canSee, boardData, tiles]);
  const url = resolveBoardUrl(
    { tile: searchParams.get(TILE_PARAM), team: searchParams.get(TEAM_PARAM), open: searchParams.get(OPEN_PARAM) },
    {
      tileIds,
      sealed,
      // A copy of the permissions from storage (dataUpdatedAt 0) may be out of date, so nothing is dropped on it.
      ready: !!shell && !!permissions && permissionsAt > 0,
      teamIds: shell?.teams.map((t) => t.id) ?? [],
      myTeamId,
      canPickTeam,
      hasRules: !!shell && (!!shell.bingo.rulesMarkdown || (!can("view_hidden_board").allowed && areRulesHidden(shell.bingo))),
    },
  );
  const { openTileId, viewingTeamId, dialog } = url;
  const dropKey = url.drop.join(",");
  useEffect(() => {
    if (dropKey) setUrl(Object.fromEntries(dropKey.split(",").map((name) => [name, null])));
  }, [dropKey, setUrl]);
  // Opening pushes a history entry, marked as this open's, so Back closes it; closing one opened here goes Back to
  // the entry before it, and otherwise (a link that arrived open) just removes the param. Switching what's open
  // replaces it, so one Back still closes it.
  const openedHere = (location.state as { opened?: string } | null)?.opened;
  // A double-click outside the Tile closes it twice, and each close must not go Back again, off the board:
  // - before Back lands, this page still shows it open, so the entry already gone Back from is remembered;
  // - after, the second click can still reach the closing Tile (it animates out with this render's close), so a close
  //   rendered for an entry the browser has since left does nothing.
  const wentBackFrom = useRef<string | null>(null);
  // Landing anywhere (Back, or Forward onto that same entry again) makes a close go Back again.
  useEffect(() => {
    wentBackFrom.current = null;
  }, [location.key]);
  const openParam = (name: string, value: string) => {
    if (searchParams.get(name) === value) return;
    if (searchParams.get(name) !== null) setUrl({ [name]: value });
    else setUrl({ [name]: value }, { push: true, state: { opened: name } });
  };
  const closeParam = (name: string) => {
    if (searchParams.get(name) === null) return;
    // React Router keeps the entry's key in history.state ("default" for the first entry, which has none).
    if (((window.history.state as { key?: string } | null)?.key ?? "default") !== location.key) return;
    if (openedHere !== name) setUrl({ [name]: null });
    else if (wentBackFrom.current !== location.key) {
      wentBackFrom.current = location.key;
      navigate(-1);
    }
  };
  const showDialog = (which: BoardDialog) => openParam(OPEN_PARAM, which);
  const hideDialog = (which: BoardDialog) => {
    if (dialog === which) closeParam(OPEN_PARAM);
  };
  const setViewingTeamId = (id: string) => setUrl({ [TEAM_PARAM]: id === myTeamId ? null : id });

  const { data: progressData } = useTeamProgress(canSee ? slug : undefined, viewingTeamId ?? undefined);
  const setTileInterest = useSetTileInterest(slug);
  const setReaction = useSetSubmissionReaction(slug);
  const { data: submissionsData } = useTeamSubmissions(canSee ? slug : undefined, viewingTeamId ?? undefined);
  const canModerate = can("moderate_bingo").allowed;
  const { data: pendingData } = usePendingCount(slug, canModerate);
  // Only fetches while actually on the draft stage — same net effect as the
  // old DraftStageView only ever mounting (and thus only ever querying)
  // while it was rendered, just expressed via TanStack Query's `enabled`.
  const { data: draftState, isLoading: draftLoading } = useDraftState(shell?.bingo.stage === "draft" && canSee ? slug : undefined);

  usePageEvents(shell, canModerate);
  // Mirrors the server's submission gate: nothing can be submitted before startsAt.
  const hasStarted = useHasPassed(shell?.bingo.effectiveStartsAt);

  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitInitialTileId, setSubmitInitialTileId] = useState<string | undefined>(undefined);
  const [submitInitialTaskId, setSubmitInitialTaskId] = useState<string | undefined>(undefined);
  const [submitInitialFile, setSubmitInitialFile] = useState<File | undefined>(undefined);
  const [submitInitialKind, setSubmitInitialKind] = useState<SubmissionKind | undefined>(undefined);
  // A Restriction on submitting, applied while the submission dialog is open, closes it and says why.
  useCloseOnLoss(viewingTeamId && viewingTeamId !== shell?.myTeam?.id ? "submit_for_any_team" : "submit", submitOpen, () => setSubmitOpen(false), slug);

  // Achievements' "Tile opened" / "Rules opened" signal (CONTEXT.md "Achievement"): fire-and-forget, and only from
  // Board revealed through Live, with the viewer on a team — the server decides (sealed Tiles and hidden rules earn
  // nothing, and never open for a Player anyway), but there's no point sending the request otherwise. Sent whenever a Tile or the Rules come open, however they were opened (a click, the
  // search box, a link).
  const recordOpened = useRecordAchievementOpened(slug);
  const eligibleForOpens = (shell?.bingo.stage === "reveal" || shell?.bingo.stage === "live") && !!shell?.myTeam;
  const rulesOpen = dialog === "rules";
  useEffect(() => {
    if (openTileId && eligibleForOpens) recordOpened.mutate({ kind: "tile", tileId: openTileId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTileId, eligibleForOpens]);
  useEffect(() => {
    if (rulesOpen && eligibleForOpens) recordOpened.mutate({ kind: "rules" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rulesOpen, eligibleForOpens]);
  // One function for the page's whole life: every Tile cell gets it, and a new one each render would re-draw them all.
  const openTileLatest = useRef<(tileId: string | null) => void>(() => {});
  openTileLatest.current = (tileId) => {
    if (!tileId) return closeParam(TILE_PARAM);
    // A sealed tile doesn't open: the note says when it will.
    if (sealed) return showSealedNote();
    openParam(TILE_PARAM, tileId);
  };
  const openTileTracked = useCallback((tileId: string | null) => openTileLatest.current(tileId), []);
  const exclusivityRules = shell?.bingo.exclusivityRules;
  const locks = useMemo(() => lockedLeaves(exclusivityRules ?? [], tiles, submissionsData?.submissions ?? EMPTY_SUBMISSIONS), [exclusivityRules, tiles, submissionsData]);

  if (!user) return null;
  if (shellLoading) return renderLoading();
  if (shellError || !shell) return renderError("Bingo not found");

  const { bingo, categories: categoriesRaw, teams, myTeam } = shell;
  const nodeStates = progressData?.nodeStates ?? EMPTY_NODE_STATES;
  const interests = progressData?.interests ?? EMPTY_INTERESTS;
  const teamSubmissions = submissionsData?.submissions ?? EMPTY_SUBMISSIONS;

  // A Historical Bingo (CONTEXT.md): what it recorded decides what's shown. With no Tasks there are no Team boards.
  const historical = shell.historical;
  const isViewingOtherTeam = canPickTeam && !!viewingTeamId && viewingTeamId !== myTeam?.id;
  // Mods can submit for the team they are viewing too (naming the player it is for), so this doesn't depend on whose team it is.
  const submitWindow = bingo.stage === "live" && hasStarted && !!viewingTeamId;
  // A Restriction on submitting (to your own team, or for the mods to the team they're viewing) disables Submit with
  // its reason. Neither Action has a stage of its own, so a reason here is always a Restriction's.
  const submitCheck = can(viewingTeamId && viewingTeamId !== myTeam?.id ? "submit_for_any_team" : "submit");
  const submitRestricted = submitWindow && !submitCheck.allowed ? submitCheck.reason : null;
  const canSubmit = submitWindow && !submitRestricted;
  // Hands go up on your own team's board only, from reveal onwards (the
  // board isn't visible to players before that) until the bingo is over,
  // and not by anyone while the Tiles are sealed (the server refuses it).
  const canToggleInterest = !!myTeam && viewingTeamId === myTeam.id && (bingo.stage === "reveal" || bingo.stage === "live") && !areTilesSealed(bingo);
  // Reactions are for teammates: on your own team's submissions, until the bingo is Finished (then they're closed).
  // A Restriction on reacting leaves the reactions there to read, with its reason in place of the picker.
  const reactOpen = !!myTeam && viewingTeamId === myTeam.id && bingo.stage !== "complete";
  const reactCheck = can("react");
  const reactRestricted = reactOpen && !reactCheck.allowed ? reactCheck.reason : null;
  const canReact = reactOpen && !reactRestricted;
  const canViewStats = canViewStatsOf(shell, can);

  // Exact branch order as the old BingoPage.tsx: signup -> planning|captains
  // -> draft -> !viewingTeamId -> board, with anyone who isn't part of the
  // bingo stopped at a notice once signups have closed (while they're open,
  // the signup form is the landing page).
  const stageView: StageView =
    bingo.stage === "signup"
      ? "signup"
      : !shell.viewer.canSee
        ? "notPart"
        : bingo.stage === "planning" || bingo.stage === "captains"
          ? bingo.stage
          : bingo.stage === "draft"
            ? "draft"
            : historical && !historical.tasks
              ? "historical"
              : !viewingTeamId
              ? "noTeam"
              : "board";

  const teamModels = teams.map((t) => toTeamModel(t, myTeam?.id ?? null, can));
  // shell.myTeam is the bare row; the roster lives on the matching entry in shell.teams.
  const myTeamModel = teamModels.find((t) => t.isMine) ?? null;
  // Shared with the header of the pages around the board (useBingoHeader), which shows the same way in.
  const canScout = canScoutOf(shell, can);
  const viewingTeamModel = teamModels.find((t) => t.id === viewingTeamId) ?? null;

  const openSubmit = (tileId?: string, file?: File, taskId?: string) => {
    setSubmitInitialTileId(tileId);
    setSubmitInitialTaskId(tileId ? taskId : undefined);
    setSubmitInitialFile(file);
    setSubmitInitialKind(undefined);
    hideDialog("submissions");
    setSubmitOpen(true);
  };
  const openProof = (tileId: string, taskId?: string) => {
    openSubmit(tileId, undefined, taskId);
    setSubmitInitialKind("proof");
  };

  const pageModel: BingoPageModel = {
    slug,
    themeKey: bingo.theme,
    bingo: {
      name: bingo.name,
      stage: bingo.stage,
      stageLabel: STAGE_LABEL[bingo.stage],
      rulesMarkdown: bingo.rulesMarkdown,
      rulesComeLater: !can("view_hidden_board").allowed && areRulesHidden(bingo),
      startsAt: bingo.effectiveStartsAt ? new Date(bingo.effectiveStartsAt).getTime() : null,
      endsAt: bingo.endsAt ? new Date(bingo.endsAt).getTime() : null,
      boardRows: bingo.boardRows,
      boardCols: bingo.boardCols,
      historical: bingo.historical,
    },
    historical,
    milestone: nextMilestone(bingo),
    user: { displayName: myTeamModel?.members.find((m) => m.id === user.id)?.displayName ?? displayName(user), avatarUrl: avatarUrl(user) },
    canModerate,
    // Ratings go to the Team the viewer leads: an Admin on none has nothing to rate for.
    canRatePicks: can("rate_picks").allowed && !!myTeam,
    myTeam: myTeamModel,
    teams: teamModels,
    categories: categoriesRaw.map(toCategoryModel),
    stageView,
    isCut: shell.viewer.isCut,
    removedFromTeam: shell.viewer.removedFromTeam ?? null,
    canPickTeam,
    canViewStats,
    canRewind: canRewindOf(shell),
    // Wrapped is made at the end of a Bingo, never recorded: not for a Historical one.
    wrapped: { canOpen: bingo.stage === "complete" && !bingo.historical && (shell.wrappedPublished || can("view_wrapped_preview").allowed), preview: !shell.wrappedPublished },
    // The Feedback form is open to a Finished Bingo's Players while it has questions for them (the server says who).
    feedback: { canOpen: !!feedbackForm?.open && feedbackForm.questions.length > 0, responded: !!(feedbackForm?.responded || feedbackForm?.respondedAsCaptain) },
    canScout,
    draft: { state: draftState ?? null, isLoading: draftLoading },
    viewing: {
      team: viewingTeamModel,
      isOtherTeam: isViewingOtherTeam,
      pendingSubmissionCount: teamSubmissions.filter((s) => s.submission.status === "pending").length,
    },
    canSubmit,
    submitRestricted,
    pendingCount: pendingData?.count ?? 0,
    showEndCountdown: bingo.stage === "live" && !!bingo.endsAt,
    submissions: buildSubmissionModels(tiles, teamSubmissions, user.id),
    teamSelector: { teams: teamModels, selectedId: viewingTeamId, select: setViewingTeamId },
    openTile: { id: openTileId, open: openTileTracked, close: () => closeParam(TILE_PARAM) },
    sealed: { forMe: sealed, forPlayers: areTilesSealed(bingo) },
    rules: { open: rulesOpen, show: () => showDialog("rules"), hide: () => hideDialog("rules") },
    teamInfo: { open: dialog === "team", show: () => showDialog("team"), hide: () => hideDialog("team") },
    pointBreakdown: { open: dialog === "points", show: () => showDialog("points"), hide: () => hideDialog("points") },
    drawer: { open: dialog === "submissions", show: () => showDialog("submissions"), hide: () => hideDialog("submissions") },
    submit: {
      open: submitOpen,
      initialTileId: submitInitialTileId,
      initialTaskId: submitInitialTaskId,
      initialFile: submitInitialFile,
      initialKind: submitInitialKind,
      show: openSubmit,
      showProof: openProof,
      hide: () => {
        setSubmitOpen(false);
        setSubmitInitialTileId(undefined);
        setSubmitInitialTaskId(undefined);
        setSubmitInitialFile(undefined);
        setSubmitInitialKind(undefined);
      },
    },
    actions: {
      goHome: () => navigate("/"),
      goToStats: () => navigate(`/b/${slug}/stats`),
      goToRewind: () => navigate(`/b/${slug}/rewind`),
      goToWrapped: () => navigate(`/b/${slug}/wrapped`),
      goToFeedback: () => navigate(`/b/${slug}/feedback`),
      goToMod: () => navigate(`/b/${slug}/mod`),
      goToDraft: () => navigate(`/b/${slug}/draft`),
    },
    tileInterest: {
      toggle: (tileId, taskId) => {
        if (!canToggleInterest) return;
        const mine = interests.some((i) => i.taskId === taskId && i.user.id === user.id);
        setTileInterest.mutate({ teamId: myTeam.id, tileId, taskId, user, interested: !mine });
      },
    },
    reactions: {
      canReact,
      restricted: reactRestricted,
      toggle: (submissionId, emoji) => {
        if (!canReact) return;
        const reactors = teamSubmissions.find((s) => s.submission.id === submissionId)?.reactions?.find((g) => g.emoji === emoji)?.users ?? [];
        setReaction.mutate({ teamId: myTeam.id, submissionId, emoji, user, reacted: !reactors.some((u) => u.id === user.id) });
      },
    },
    // Only while Live: shown any earlier, it would let a screenshot be staged before the bingo starts.
    codeword: bingo.stage === "live" ? (myTeamModel?.codeword ?? null) : null,
  };

  const raw: BingoPageRaw = { slug, bingo, tiles, categories: categoriesRaw, nodeStates, teamSubmissions, viewingTeam: viewingTeamModel, viewerId: user.id, locks, tileTags, progressLoaded: !!progressData };

  return (
    // The search keeps its own state below the page (TileSearchProvider), so typing doesn't re-render the page.
    <TileSearchProvider tiles={canSee ? tiles : EMPTY_TILES} matches={matchTile} onChoose={openTileTracked}>
    <BingoPageRawContext.Provider value={raw}>
      <BingoPageContext.Provider value={pageModel}>
        <BoardProvider
          tiles={tiles}
          categories={categoriesRaw}
          lines={lines}
          nodeStates={nodeStates}
          teamSubmissions={teamSubmissions}
          bingoStartsAt={bingo.effectiveStartsAt}
          bingoRows={bingo.boardRows}
          bingoCols={bingo.boardCols}
          canSubmit={canSubmit}
          canToggleInterest={canToggleInterest}
          interests={interests}
          viewerUserId={user.id}
          viewerOnTeam={!!viewingTeamModel?.members.some((m) => m.id === user.id)}
          totalPoints={progressData?.totalPoints ?? null}
          adjustments={progressData?.adjustments ?? EMPTY_ADJUSTMENTS}
          locks={locks}
          sealed={sealed}
        >
          <TutorialProvider>{children}</TutorialProvider>
        </BoardProvider>
      </BingoPageContext.Provider>
    </BingoPageRawContext.Provider>
    </TileSearchProvider>
  );
}

export function useBingoPage(): BingoPageModel {
  const ctx = useContext(BingoPageContext);
  if (!ctx) throw new Error("useBingoPage must be used within BingoPageProvider");
  return ctx;
}

// Internal/transitional — see BingoPageRaw's own doc comment above.
export function useBingoPageRaw(): BingoPageRaw {
  const ctx = useContext(BingoPageRawContext);
  if (!ctx) throw new Error("useBingoPageRaw must be used within BingoPageProvider");
  return ctx;
}
