import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { STAGE_LABEL, areRulesHidden, areTilesSealed, nextMilestone, type BingoShellResponse, type BoardLine, type PointAdjustment, type SubmissionDetails, type SubmissionKind, type TeamNodeState, type Tile, type TileCategory, type TileInterest } from "@bingo/shared";
import { useBingo, useBoard, useDraftState, usePendingCount, useRecordAchievementOpened, useSetSubmissionReaction, useSetTileInterest, useTeamProgress, useTeamSubmissions } from "../api/queries";
import { useAuth } from "../context/AuthContext";
import { displayName, avatarUrl } from "../core/ui/user";
import { useHasPassed } from "../core/ui/useHasPassed";
import { toCategoryModel, toTeamModel, buildSubmissionModels, sealedBoardAsTiles } from "./boardModel";
import { lockedLeaves, type ExclusiveLocks } from "../core/board/exclusivity";
import { useViewingTeam } from "./useViewingTeam";
import { canRewind as canRewindOf, canViewStats as canViewStatsOf } from "./useBingoHeader";
import { tileSearchMatcher, useTileSearch } from "./useTileSearch";
import { toastQueue } from "../core/ui/Toast";
import { usePageEvents } from "./usePageEvents";
import { BoardProvider } from "./BoardProvider";
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
}

const BingoPageContext = createContext<BingoPageModel | null>(null);
const BingoPageRawContext = createContext<BingoPageRaw | null>(null);

const EMPTY_TILES: Tile[] = [];
const EMPTY_LINES: BoardLine[] = [];
const EMPTY_NODE_STATES: TeamNodeState[] = [];
const EMPTY_INTERESTS: TileInterest[] = [];
const EMPTY_SUBMISSIONS: SubmissionDetails[] = [];
const EMPTY_ADJUSTMENTS: PointAdjustment[] = [];
const EMPTY_CATEGORIES: TileCategory[] = [];

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

  const { viewingTeamId, setViewingTeamId } = useViewingTeam(shell?.myTeam ?? null);
  const { data: progressData } = useTeamProgress(canSee ? slug : undefined, viewingTeamId ?? undefined);
  const setTileInterest = useSetTileInterest(slug);
  const setReaction = useSetSubmissionReaction(slug);
  const { data: submissionsData } = useTeamSubmissions(canSee ? slug : undefined, viewingTeamId ?? undefined);
  const { data: pendingData } = usePendingCount(slug, !!shell?.isMod);
  // Only fetches while actually on the draft stage — same net effect as the
  // old DraftStageView only ever mounting (and thus only ever querying)
  // while it was rendered, just expressed via TanStack Query's `enabled`.
  const { data: draftState, isLoading: draftLoading } = useDraftState(shell?.bingo.stage === "draft" && canSee ? slug : undefined);

  usePageEvents(shell);
  // Mirrors the server's submission gate: nothing can be submitted before startsAt.
  const hasStarted = useHasPassed(shell?.bingo.effectiveStartsAt);

  const [openTileId, setOpenTileId] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [teamInfoOpen, setTeamInfoOpen] = useState(false);
  const [pointBreakdownOpen, setPointBreakdownOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitInitialTileId, setSubmitInitialTileId] = useState<string | undefined>(undefined);
  const [submitInitialTaskId, setSubmitInitialTaskId] = useState<string | undefined>(undefined);
  const [submitInitialFile, setSubmitInitialFile] = useState<File | undefined>(undefined);
  const [submitInitialKind, setSubmitInitialKind] = useState<SubmissionKind | undefined>(undefined);

  // Achievements' "Tile opened" / "Rules opened" signal (CONTEXT.md "Achievement"): fire-and-forget, and only while
  // the bingo is Live and the viewer is on a team — the server ignores an ineligible caller anyway, but there's no
  // point sending the request. Wraps both places a tile's details open (the search box included).
  const recordOpened = useRecordAchievementOpened(slug);
  const eligibleForOpens = shell?.bingo.stage === "live" && !!shell?.myTeam;
  const openTileTracked = (tileId: string | null) => {
    // A sealed tile doesn't open: the note says when it will.
    if (tileId && sealed) return showSealedNote();
    setOpenTileId(tileId);
    if (tileId && eligibleForOpens) recordOpened.mutate({ kind: "tile", tileId });
  };

  const shellCategories = shell?.categories ?? EMPTY_CATEGORIES;
  const matchTile = useMemo(() => tileSearchMatcher(sealed, shellCategories), [sealed, shellCategories]);
  const search = useTileSearch(tiles, matchTile, openTileTracked);
  const exclusivityRules = shell?.bingo.exclusivityRules;
  const locks = useMemo(() => lockedLeaves(exclusivityRules ?? [], tiles, submissionsData?.submissions ?? EMPTY_SUBMISSIONS), [exclusivityRules, tiles, submissionsData]);

  if (!user) return null;
  if (shellLoading) return renderLoading();
  if (shellError || !shell) return renderError("Bingo not found");

  const { bingo, categories: categoriesRaw, teams, isMod, myTeam } = shell;
  const nodeStates = progressData?.nodeStates ?? EMPTY_NODE_STATES;
  const interests = progressData?.interests ?? EMPTY_INTERESTS;
  const teamSubmissions = submissionsData?.submissions ?? EMPTY_SUBMISSIONS;

  // A Historical Bingo (CONTEXT.md): what it recorded decides what's shown. With no Tasks there are no Team boards.
  const historical = shell.historical;
  // Mods can look at any team's board; once the bingo is Finished, so can everyone (read-only).
  const canPickTeam = (isMod || bingo.stage === "complete") && (!historical || historical.tasks);
  const isViewingOtherTeam = canPickTeam && !!viewingTeamId && viewingTeamId !== myTeam?.id;
  // Mods can submit for the team they are viewing too (naming the player it is for), so this doesn't depend on whose team it is.
  const canSubmit = bingo.stage === "live" && hasStarted && !!viewingTeamId;
  // Hands go up on your own team's board only, from reveal onwards (the
  // board isn't visible to players before that) until the bingo is over,
  // and not by anyone while the Tiles are sealed (the server refuses it).
  const canToggleInterest = !!myTeam && viewingTeamId === myTeam.id && (bingo.stage === "reveal" || bingo.stage === "live") && !areTilesSealed(bingo);
  // Reactions are for teammates: on your own team's submissions, at any stage they're shown.
  const canReact = !!myTeam && viewingTeamId === myTeam.id;
  const canViewStats = canViewStatsOf(shell);

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

  const teamModels = teams.map((t) => toTeamModel(t, myTeam?.id ?? null, user.id, bingo.stage));
  // shell.myTeam is the bare row; the roster lives on the matching entry in shell.teams.
  const myTeamModel = teamModels.find((t) => t.isMine) ?? null;
  // Captains get picked while signups are open (#39), so leads scout ahead; once Signups are closed every Player can
  // look through them too (CONTEXT.md "Scouting").
  const canScout =
    (bingo.stage === "signup" && (isMod || !!myTeamModel?.isLead)) || (bingo.stage === "captains" && (isMod || !!myTeamModel?.isLead || shell.viewer.canSee));
  const viewingTeamModel = teamModels.find((t) => t.id === viewingTeamId) ?? null;

  const openSubmit = (tileId?: string, file?: File, taskId?: string) => {
    setSubmitInitialTileId(tileId);
    setSubmitInitialTaskId(tileId ? taskId : undefined);
    setSubmitInitialFile(file);
    setSubmitInitialKind(undefined);
    setDrawerOpen(false);
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
      rulesComeLater: !isMod && areRulesHidden(bingo),
      startsAt: bingo.effectiveStartsAt ? new Date(bingo.effectiveStartsAt).getTime() : null,
      endsAt: bingo.endsAt ? new Date(bingo.endsAt).getTime() : null,
      boardRows: bingo.boardRows,
      boardCols: bingo.boardCols,
      historical: bingo.historical,
    },
    historical,
    milestone: nextMilestone(bingo),
    user: { displayName: myTeamModel?.members.find((m) => m.id === user.id)?.displayName ?? displayName(user), avatarUrl: avatarUrl(user) },
    isMod,
    myTeam: myTeamModel,
    teams: teamModels,
    categories: categoriesRaw.map(toCategoryModel),
    stageView,
    isCut: shell.viewer.isCut,
    removedFromTeam: shell.viewer.removedFromTeam ?? null,
    canPickTeam,
    canViewStats,
    canRewind: canRewindOf(shell),
    canViewDraft: !!historical?.draft,
    // Wrapped is made at the end of a Bingo, never recorded: not for a Historical one.
    wrapped: { canOpen: bingo.stage === "complete" && !bingo.historical && (shell.wrappedPublished || isMod), preview: !shell.wrappedPublished },
    canScout,
    draft: { state: draftState ?? null, isLoading: draftLoading },
    viewing: {
      team: viewingTeamModel,
      isOtherTeam: isViewingOtherTeam,
      pendingSubmissionCount: teamSubmissions.filter((s) => s.submission.status === "pending").length,
    },
    canSubmit,
    pendingCount: pendingData?.count ?? 0,
    showEndCountdown: bingo.stage === "live" && !!bingo.endsAt,
    submissions: buildSubmissionModels(tiles, teamSubmissions, user.id),
    teamSelector: { teams: teamModels, selectedId: viewingTeamId, select: setViewingTeamId },
    search,
    openTile: { id: openTileId, open: openTileTracked, close: () => setOpenTileId(null) },
    sealed: { forMe: sealed, forPlayers: areTilesSealed(bingo) },
    rules: {
      open: rulesOpen,
      show: () => {
        setRulesOpen(true);
        if (eligibleForOpens) recordOpened.mutate({ kind: "rules" });
      },
      hide: () => setRulesOpen(false),
    },
    teamInfo: { open: teamInfoOpen, show: () => setTeamInfoOpen(true), hide: () => setTeamInfoOpen(false) },
    pointBreakdown: { open: pointBreakdownOpen, show: () => setPointBreakdownOpen(true), hide: () => setPointBreakdownOpen(false) },
    drawer: { open: drawerOpen, show: () => setDrawerOpen(true), hide: () => setDrawerOpen(false) },
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
      toggle: (submissionId, emoji) => {
        if (!canReact) return;
        const reactors = teamSubmissions.find((s) => s.submission.id === submissionId)?.reactions?.find((g) => g.emoji === emoji)?.users ?? [];
        setReaction.mutate({ teamId: myTeam.id, submissionId, emoji, user, reacted: !reactors.some((u) => u.id === user.id) });
      },
    },
  };

  const raw: BingoPageRaw = { slug, bingo, tiles, categories: categoriesRaw, nodeStates, teamSubmissions, viewingTeam: viewingTeamModel, viewerId: user.id, locks };

  return (
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
          searchQuery={search.query}
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
          {children}
        </BoardProvider>
      </BingoPageContext.Provider>
    </BingoPageRawContext.Provider>
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
