import type { ComponentType } from "react";
import type { Stage, StageMilestone } from "@bingo/shared";
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

  // Page chrome — props-only.
  PageLoading: ComponentType<Record<string, never>>;
  PageError: ComponentType<{ message: string }>;
  PageHeader: ComponentType<{ page: BingoPageModel }>;
  // TeamModel.isMine already tells each option whether it's the viewer's own team.
  TeamSelector: ComponentType<{ selector: TeamSelectorModel }>;
  TeamBadge: ComponentType<{ team: TeamModel }>;
  StageRow: ComponentType<{ stage: Stage; milestone: StageMilestone | null }>;
  TileSearch: ComponentType<{ search: TileSearchModel }>;
  TeamBanner: ComponentType<{ team: TeamModel; isOtherTeam: boolean; totalPoints: number | null }>;
  PlanningStage: ComponentType<{ stage: "planning" | "captains" }>;
  SignupStage: ComponentType<{ slug: string }>;
  DraftStage: ComponentType<{ draft: BingoPageModel["draft"]; milestone: StageMilestone | null; onOpenDraft: () => void }>;
  NoTeamStage: ComponentType<{ isMod: boolean }>;
  RulesDialog: ComponentType<{ isOpen: boolean; markdown: string; onClose: () => void }>;
  SubmissionsDrawer: ComponentType<{ isOpen: boolean; submissions: SubmissionModel[]; onClose: () => void; onSubmit?: () => void }>;

  // Board.
  BoardGrid: ComponentType<{ board: BoardModel; onOpenTile: (tileId: string) => void }>;
  RowLabel: ComponentType<{ category: CategoryModel | null }>;
  EmptyCell: ComponentType<{ row: number; col: number }>;
  // onOpen takes the tile id (rather than being pre-bound) so the default
  // theme can pass a reference-stable callback and let React.memo(TileCell)
  // actually skip re-rendering unchanged tiles — see BoardGrid.tsx.
  TileCell: ComponentType<{ tile: TileModel; onOpen: (tileId: string) => void }>;
  PreStartBanner: ComponentType<{ startsAt: number }>;
  TileModal: ComponentType<{ tile: TileModel | null; isOpen: boolean; onClose: () => void; onSubmit?: () => void }>;
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
