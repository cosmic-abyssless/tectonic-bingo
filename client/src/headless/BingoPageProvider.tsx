import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { STAGE_LABEL, nextMilestone, type BingoShellResponse, type BoardLine, type PointAdjustment, type SubmissionDetails, type TeamNodeState, type Tile, type TileCategory, type TileInterest } from "@bingo/shared";
import { useBingo, useBoard, useDraftState, usePendingCount, useSetSubmissionReaction, useSetTileInterest, useTeamProgress, useTeamSubmissions } from "../api/queries";
import { useAuth } from "../context/AuthContext";
import { displayName, avatarUrl } from "../core/ui/user";
import { useHasPassed } from "../core/ui/useHasPassed";
import { toCategoryModel, toTeamModel, buildSubmissionModels } from "./boardModel";
import { lockedLeaves, type ExclusiveLocks } from "../core/board/exclusivity";
import { useViewingTeam } from "./useViewingTeam";
import { canViewStats as canViewStatsOf } from "./useBingoHeader";
import { useTileSearch } from "./useTileSearch";
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
  const { data: boardData } = useBoard(slug);
  const tiles = boardData?.tiles ?? EMPTY_TILES;
  const lines = boardData?.lines ?? EMPTY_LINES;

  const { viewingTeamId, setViewingTeamId } = useViewingTeam(shell?.myTeam ?? null);
  const { data: progressData } = useTeamProgress(slug, viewingTeamId ?? undefined);
  const setTileInterest = useSetTileInterest(slug);
  const setReaction = useSetSubmissionReaction(slug);
  const { data: submissionsData } = useTeamSubmissions(slug, viewingTeamId ?? undefined);
  const { data: pendingData } = usePendingCount(slug, !!shell?.isMod);
  // Only fetches while actually on the draft stage — same net effect as the
  // old DraftStageView only ever mounting (and thus only ever querying)
  // while it was rendered, just expressed via TanStack Query's `enabled`.
  const { data: draftState, isLoading: draftLoading } = useDraftState(shell?.bingo.stage === "draft" ? slug : undefined);

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

  const search = useTileSearch(tiles, (tileId) => setOpenTileId(tileId));
  const exclusivityRules = shell?.bingo.exclusivityRules;
  const locks = useMemo(() => lockedLeaves(exclusivityRules ?? [], tiles, submissionsData?.submissions ?? EMPTY_SUBMISSIONS), [exclusivityRules, tiles, submissionsData]);

  if (!user) return null;
  if (shellLoading) return renderLoading();
  if (shellError || !shell) return renderError("Bingo not found");

  const { bingo, categories: categoriesRaw, teams, isMod, myTeam } = shell;
  const nodeStates = progressData?.nodeStates ?? EMPTY_NODE_STATES;
  const interests = progressData?.interests ?? EMPTY_INTERESTS;
  const teamSubmissions = submissionsData?.submissions ?? EMPTY_SUBMISSIONS;

  const isViewingOtherTeam = isMod && !!viewingTeamId && viewingTeamId !== myTeam?.id;
  // Mods can submit for the team they are viewing too (naming the player it is for), so this doesn't depend on whose team it is.
  const canSubmit = bingo.stage === "live" && hasStarted && !!viewingTeamId;
  // Hands go up on your own team's board only, from reveal onwards (the
  // board isn't visible to players before that) until the bingo is over.
  const canToggleInterest = !!myTeam && viewingTeamId === myTeam.id && (bingo.stage === "reveal" || bingo.stage === "live");
  // Reactions are for teammates: on your own team's submissions, at any stage they're shown.
  const canReact = !!myTeam && viewingTeamId === myTeam.id;
  const canViewStats = canViewStatsOf(shell);

  // Exact branch order as the old BingoPage.tsx: signup -> planning|captains
  // -> draft -> !viewingTeamId -> board.
  const stageView: StageView =
    bingo.stage === "signup"
      ? "signup"
      : bingo.stage === "planning" || bingo.stage === "captains"
        ? bingo.stage
        : bingo.stage === "draft"
          ? "draft"
          : !viewingTeamId
            ? "noTeam"
            : "board";

  const teamModels = teams.map((t) => toTeamModel(t, myTeam?.id ?? null, user.id, bingo.stage));
  // shell.myTeam is the bare row; the roster lives on the matching entry in shell.teams.
  const myTeamModel = teamModels.find((t) => t.isMine) ?? null;
  // Captains get picked while signups are open (#39), so leads scout ahead.
  const canScout = (bingo.stage === "signup" || bingo.stage === "captains") && (isMod || !!myTeamModel?.isLead);
  const viewingTeamModel = teamModels.find((t) => t.id === viewingTeamId) ?? null;

  const openSubmit = (tileId?: string, file?: File, taskId?: string) => {
    setSubmitInitialTileId(tileId);
    setSubmitInitialTaskId(tileId ? taskId : undefined);
    setSubmitInitialFile(file);
    setDrawerOpen(false);
    setSubmitOpen(true);
  };

  const pageModel: BingoPageModel = {
    slug,
    themeKey: bingo.theme,
    bingo: {
      name: bingo.name,
      stage: bingo.stage,
      stageLabel: STAGE_LABEL[bingo.stage],
      rulesMarkdown: bingo.rulesMarkdown,
      startsAt: bingo.effectiveStartsAt ? new Date(bingo.effectiveStartsAt).getTime() : null,
      endsAt: bingo.endsAt ? new Date(bingo.endsAt).getTime() : null,
      boardRows: bingo.boardRows,
      boardCols: bingo.boardCols,
    },
    milestone: nextMilestone(bingo),
    user: { displayName: myTeamModel?.members.find((m) => m.id === user.id)?.displayName ?? displayName(user), avatarUrl: avatarUrl(user) },
    isMod,
    myTeam: myTeamModel,
    teams: teamModels,
    categories: categoriesRaw.map(toCategoryModel),
    stageView,
    canViewStats,
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
    openTile: { id: openTileId, open: setOpenTileId, close: () => setOpenTileId(null) },
    rules: { open: rulesOpen, show: () => setRulesOpen(true), hide: () => setRulesOpen(false) },
    teamInfo: { open: teamInfoOpen, show: () => setTeamInfoOpen(true), hide: () => setTeamInfoOpen(false) },
    pointBreakdown: { open: pointBreakdownOpen, show: () => setPointBreakdownOpen(true), hide: () => setPointBreakdownOpen(false) },
    drawer: { open: drawerOpen, show: () => setDrawerOpen(true), hide: () => setDrawerOpen(false) },
    submit: {
      open: submitOpen,
      initialTileId: submitInitialTileId,
      initialTaskId: submitInitialTaskId,
      initialFile: submitInitialFile,
      show: openSubmit,
      hide: () => {
        setSubmitOpen(false);
        setSubmitInitialTileId(undefined);
        setSubmitInitialTaskId(undefined);
        setSubmitInitialFile(undefined);
      },
    },
    actions: {
      goHome: () => navigate("/"),
      goToStats: () => navigate(`/b/${slug}/stats`),
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
          totalPoints={progressData?.totalPoints ?? null}
          adjustments={progressData?.adjustments ?? EMPTY_ADJUSTMENTS}
          locks={locks}
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
