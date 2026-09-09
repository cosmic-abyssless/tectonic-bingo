import { createContext, useContext, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { STAGE_LABEL, nextMilestone, type Bingo, type BoardLine, type SubmissionDetails, type TeamNodeState, type Tile, type TileCategory } from "@bingo/shared";
import { useBingo, useBoard, useDraftState, usePendingCount, useTeamProgress, useTeamSubmissions } from "../api/queries";
import { useAuth } from "../context/AuthContext";
import { displayName, avatarUrl } from "../core/ui/user";
import { toCategoryModel, toTeamModel, buildSubmissionModels } from "./boardModel";
import { useViewingTeam } from "./useViewingTeam";
import { useTileSearch } from "./useTileSearch";
import { usePageEvents } from "./usePageEvents";
import { BoardProvider } from "./BoardProvider";
import type { BingoPageModel, StageView } from "./types";

// Internal escape hatch: only useSubmissionFlow.ts (which needs raw
// tiles/categories/nodeStates/teamSubmissions/bingo for the submission
// flow's claim logic) reads this. No theme should ever import it — themes
// only get the headless barrel's clean models.
interface BingoPageRaw {
  slug: string;
  bingo: Bingo;
  tiles: Tile[];
  categories: TileCategory[];
  nodeStates: TeamNodeState[];
  teamSubmissions: SubmissionDetails[];
}

const BingoPageContext = createContext<BingoPageModel | null>(null);
const BingoPageRawContext = createContext<BingoPageRaw | null>(null);

const EMPTY_TILES: Tile[] = [];
const EMPTY_LINES: BoardLine[] = [];
const EMPTY_NODE_STATES: TeamNodeState[] = [];
const EMPTY_SUBMISSIONS: SubmissionDetails[] = [];

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
  const { data: submissionsData } = useTeamSubmissions(slug, viewingTeamId ?? undefined);
  const { data: pendingData } = usePendingCount(slug, !!shell?.isMod);
  // Only fetches while actually on the draft stage — same net effect as the
  // old DraftStageView only ever mounting (and thus only ever querying)
  // while it was rendered, just expressed via TanStack Query's `enabled`.
  const { data: draftState, isLoading: draftLoading } = useDraftState(shell?.bingo.stage === "draft" ? slug : undefined);

  usePageEvents(shell);

  const [openTileId, setOpenTileId] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitInitialTileId, setSubmitInitialTileId] = useState<string | undefined>(undefined);

  const search = useTileSearch(tiles, (tileId) => setOpenTileId(tileId));

  if (!user) return null;
  if (shellLoading) return renderLoading();
  if (shellError || !shell) return renderError("Bingo not found");

  const { bingo, categories: categoriesRaw, teams, isMod, myTeam } = shell;
  const nodeStates = progressData?.nodeStates ?? EMPTY_NODE_STATES;
  const teamSubmissions = submissionsData?.submissions ?? EMPTY_SUBMISSIONS;

  const viewingTeamRaw = teams.find((t) => t.id === viewingTeamId) ?? null;
  const isViewingOtherTeam = isMod && !!viewingTeamId && viewingTeamId !== myTeam?.id;
  const canSubmit = bingo.stage === "live" && !isViewingOtherTeam && !!viewingTeamId;
  const boardRevealed = bingo.stage === "reveal" || bingo.stage === "live" || bingo.stage === "complete";

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

  const teamModels = teams.map((t) => toTeamModel(t, myTeam?.id ?? null));
  const myTeamModel = myTeam ? toTeamModel(myTeam, myTeam.id) : null;
  const viewingTeamModel = viewingTeamRaw ? toTeamModel(viewingTeamRaw, myTeam?.id ?? null) : null;

  const openSubmit = (tileId?: string) => {
    setSubmitInitialTileId(tileId);
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
      startsAt: bingo.startsAt ? new Date(bingo.startsAt).getTime() : null,
      endsAt: bingo.endsAt ? new Date(bingo.endsAt).getTime() : null,
      boardRows: bingo.boardRows,
      boardCols: bingo.boardCols,
    },
    milestone: nextMilestone(bingo),
    user: { displayName: displayName(user), avatarUrl: avatarUrl(user) },
    isMod,
    myTeam: myTeamModel,
    teams: teamModels,
    categories: categoriesRaw.map(toCategoryModel),
    stageView,
    boardRevealed,
    draft: { state: draftState ?? null, isLoading: draftLoading },
    viewing: { team: viewingTeamModel, isOtherTeam: isViewingOtherTeam, submissionCount: teamSubmissions.length },
    canSubmit,
    pendingCount: pendingData?.count ?? 0,
    showEndCountdown: bingo.stage === "live" && !!bingo.endsAt,
    submissions: buildSubmissionModels(tiles, teamSubmissions),
    teamSelector: { teams: teamModels, selectedId: viewingTeamId, select: setViewingTeamId },
    search,
    openTile: { id: openTileId, open: setOpenTileId, close: () => setOpenTileId(null) },
    rules: { open: rulesOpen, show: () => setRulesOpen(true), hide: () => setRulesOpen(false) },
    drawer: { open: drawerOpen, show: () => setDrawerOpen(true), hide: () => setDrawerOpen(false) },
    submit: {
      open: submitOpen,
      initialTileId: submitInitialTileId,
      show: openSubmit,
      hide: () => {
        setSubmitOpen(false);
        setSubmitInitialTileId(undefined);
      },
    },
    actions: {
      goHome: () => navigate("/"),
      goToStats: () => navigate(`/b/${slug}/stats`),
      goToMod: () => navigate(`/b/${slug}/mod`),
      goToDraft: () => navigate(`/b/${slug}/draft`),
    },
  };

  const raw: BingoPageRaw = { slug, bingo, tiles, categories: categoriesRaw, nodeStates, teamSubmissions };

  return (
    <BingoPageRawContext.Provider value={raw}>
      <BingoPageContext.Provider value={pageModel}>
        <BoardProvider
          tiles={tiles}
          categories={categoriesRaw}
          lines={lines}
          nodeStates={nodeStates}
          teamSubmissions={teamSubmissions}
          bingoStartsAt={bingo.startsAt}
          bingoRows={bingo.boardRows}
          bingoCols={bingo.boardCols}
          searchQuery={search.query}
          canSubmit={canSubmit}
          totalPoints={progressData?.totalPoints ?? null}
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
