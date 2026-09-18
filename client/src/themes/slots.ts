import type { ComponentType, ReactNode } from "react";
import type { StageMilestone } from "@bingo/shared";
import type {
  BingoPageModel,
  BoardModel,
  CategoryModel,
  RequirementNodeModel,
  SubmissionFlowModel,
  SubmissionModel,
  TaskModel,
  TeamModel,
  TeamSelectorModel,
  TileModel,
  TileSearchModel,
} from "../headless/types";

export interface ThemeSlots {
  // Whole-surface composition — may call headless hooks directly.
  BoardPage: ComponentType<Record<string, never>>;

  // Bingo pages outside the board — whole-page layout like BoardPage, but
  // props-only: DraftRoom/StatsView already encapsulate their own api/*
  // calls as ordinary core/ components, so there's no headless model here.
  DraftPage: ComponentType<{ slug: string; bingoName: string }>;
  StatsPage: ComponentType<{ slug: string; bingoName: string }>;

  // Page chrome — props-only.
  PageLoading: ComponentType<Record<string, never>>;
  PageError: ComponentType<{ message: string }>;
  PageHeader: ComponentType<{ page: BingoPageModel }>;
  // TeamModel.isMine already tells each option whether it's the viewer's own team.
  TeamSelector: ComponentType<{ selector: TeamSelectorModel }>;
  // Pressing the badge opens TeamInfoDialog.
  TeamBadge: ComponentType<{ team: TeamModel; onPress: () => void }>;
  TileSearch: ComponentType<{ search: TileSearchModel }>;
  TeamBanner: ComponentType<{ team: TeamModel; isOtherTeam: boolean; totalPoints: number | null }>;
  PlanningStage: ComponentType<{ stage: "planning" | "captains" }>;
  SignupStage: ComponentType<{ slug: string }>;
  // Shown above the signup/closed stage content to mods and team leads
  // (page.canScout) — the way into the scouting room before the draft.
  ScoutBanner: ComponentType<{ onOpen: () => void }>;
  DraftStage: ComponentType<{ draft: BingoPageModel["draft"]; milestone: StageMilestone | null; onOpenDraft: () => void }>;
  NoTeamStage: ComponentType<{ isMod: boolean }>;
  RulesDialog: ComponentType<{ isOpen: boolean; markdown: string; onClose: () => void }>;
  TeamInfoDialog: ComponentType<{ slug: string; team: TeamModel | null; onClose: () => void }>;
  SubmissionsDrawer: ComponentType<{ isOpen: boolean; submissions: SubmissionModel[]; onClose: () => void; onSubmit?: () => void }>;

  // The frame + header the core dialogs (bug report, player profile) are
  // built from, so a theme can dress them without reimplementing them. Read
  // with useOptionalSlot, not useSlot: those dialogs also mount on pages
  // outside any ThemeProvider (mod panel, site admin), where they fall back
  // to the core Dialog/DialogHeader.
  DialogFrame: ComponentType<{ isOpen: boolean; onClose: () => void; size?: "md" | "lg"; isDismissable?: boolean; children: ReactNode }>;
  DialogHeader: ComponentType<{ title: ReactNode; subtitle?: string; onClose: () => void; action?: ReactNode }>;

  // Board.
  // highlightedTileId is optional and only meaningful to a theme whose
  // TileCell has some "spotlighted" visual state to drive from it (the
  // default theme's BoardGrid/TileCell just ignore it) — it's the id of
  // whichever tile the search dropdown currently has highlighted, if any,
  // so a theme can visually tie the two together.
  BoardGrid: ComponentType<{ board: BoardModel; onOpenTile: (tileId: string) => void; highlightedTileId?: string | null }>;
  RowLabel: ComponentType<{ category: CategoryModel | null }>;
  EmptyCell: ComponentType<{ row: number; col: number }>;
  // onOpen takes the tile id (rather than being pre-bound) so the default
  // theme can pass a reference-stable callback and let React.memo(TileCell)
  // actually skip re-rendering unchanged tiles — see BoardGrid.tsx.
  TileCell: ComponentType<{ tile: TileModel; onOpen: (tileId: string) => void; isSearchHighlighted?: boolean }>;
  PreStartBanner: ComponentType<{ startsAt: number }>;
  // onSubmit opens the submission flow for the open tile, optionally pre-picking
  // one of its parts. onToggleInterest flips the viewer's hand for a part; only
  // wired when some part has interest.canToggle — themes should still check
  // task.interest.canToggle per part before showing the control.
  TileModal: ComponentType<{
    tile: TileModel | null;
    isOpen: boolean;
    onClose: () => void;
    onSubmit?: (taskId?: string) => void;
    onToggleInterest?: (taskId: string) => void;
  }>;
  TaskPanel: ComponentType<{ task: TaskModel }>;
  RequirementTree: ComponentType<{ node: RequirementNodeModel; root?: boolean }>;
  TileSubmissions: ComponentType<{ submissions: SubmissionModel[] }>;

  // Submission flow — mounted only while open (see BoardPageLayout).
  SubmissionModal: ComponentType<{ flow: SubmissionFlowModel }>;
  ScreenshotDropzone: ComponentType<{ screenshot: SubmissionFlowModel["screenshot"] }>;
  AnalysisPanel: ComponentType<{ analysis: SubmissionFlowModel["analysis"] }>;
  TilePicker: ComponentType<{ tile: SubmissionFlowModel["tile"] }>;
  TaskPicker: ComponentType<{ task: SubmissionFlowModel["task"] }>;
  RequirementPicker: ComponentType<{ requirement: SubmissionFlowModel["requirement"]; quantity: SubmissionFlowModel["quantity"] }>;
  StagedClaimsList: ComponentType<{ staged: SubmissionFlowModel["staged"] }>;
}

export type SlotName = keyof ThemeSlots;
