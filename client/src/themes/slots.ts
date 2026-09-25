import type { ComponentType, ReactNode } from "react";
import type { ButtonProps } from "../core/ui/Button";
import type { MenuFrameProps, MenuRowProps } from "../core/ui/Menu";
import type { NoticeProps } from "../core/ui/Card";
import type { PanelProps } from "../core/ui/Panel";
import type { TeamRosterProps } from "../core/draft/TeamRoster";
import type { ReactionBarProps } from "../core/submissions/ReactionBar";
import type { MyAchievement, StageMilestone } from "@bingo/shared";
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

export interface OnTheClockProps {
  teamName: string;
  teamColor: string | null;
  captains: string[]; // RSNs: the captain, then the co-captain in a duo bingo
  pickLabel: string; // "Round 2 · Pick 7" / "Singles round · Pick 31"
  isMyTurn: boolean; // the viewer leads this team
  // Drawn as the top strip of the draft room's Teams panel (full width, no frame of its own), not a card of its own.
  embedded?: boolean;
  // With embedded: the phone's pinned header, where nothing can hang outside the strip and height is precious.
  compact?: boolean;
}

export interface ThemeSlots {
  // Whole-surface composition — may call headless hooks directly.
  BoardPage: ComponentType<Record<string, never>>;

  // Bingo pages outside the board — whole-page layout like BoardPage, but
  // props-only: DraftRoom/StatsView already encapsulate their own api/*
  // calls as ordinary core/ components, so there's no headless model here.
  DraftPage: ComponentType<{ slug: string; bingoName: string; isMod: boolean }>;
  StatsPage: ComponentType<{ slug: string; bingoName: string }>;
  // The shape that pops up for everyone watching when a player is drafted (core/draft/DraftPickReveal). The theme
  // draws only the shape — a fixed-size card or burst, no positioning; core handles the pop, the hold and the flight
  // to the roster. One name per drafted player (two for a duo pair). teamColor is null for a team with none.
  DraftPickBurst: ComponentType<{ names: string[]; teamName: string; teamColor: string | null }>;
  // One Achievement's unlock popup (core/achievements/AchievementUnlockReveal). The theme draws only the card: its own
  // width, no positioning, motion or button; core reveals it OSRS-style (a dot on the card's top edge fanning out into
  // a line, then scanning down), holds it, takes it away and makes it open the Achievements modal. The card's top
  // edge must be a solid line at least 3px thick, since that edge is what the dot and the line show.
  AchievementUnlockCard: ComponentType<{ achievement: MyAchievement }>;
  // One team's column in the draft room (core/draft/TeamRoster): its card, then its picks. Read with useOptionalSlot.
  // Each pick's element must carry data-team-id and data-pick-number (the pick reveal flies to it) and stay invisible
  // while its number is in hiddenPickNumbers.
  DraftTeamRoster: ComponentType<TeamRosterProps>;
  // The banner pinned above the draft room while a pick is on the clock: whose turn, in the team's colour. Core
  // remounts it on every pick, so its entrance animation plays on each turn change.
  OnTheClockBanner: ComponentType<OnTheClockProps>;

  // Page chrome — props-only.
  PageLoading: ComponentType<Record<string, never>>;
  PageError: ComponentType<{ message: string }>;
  PageHeader: ComponentType<{ page: BingoPageModel }>;
  // TeamModel.isMine already tells each option whether it's the viewer's own team.
  TeamSelector: ComponentType<{ selector: TeamSelectorModel }>;
  // Pressing the badge opens TeamInfoDialog.
  TeamBadge: ComponentType<{ team: TeamModel; onPress: () => void }>;
  TileSearch: ComponentType<{ search: TileSearchModel }>;
  // Pressing the point total opens PointBreakdownDialog (onOpenPoints).
  TeamBanner: ComponentType<{ team: TeamModel; isOtherTeam: boolean; totalPoints: number | null; onOpenPoints?: () => void }>;
  PlanningStage: ComponentType<{ stage: "planning" | "captains" }>;
  SignupStage: ComponentType<{ slug: string }>;
  // Shown above the signup/closed stage content to mods and team leads
  // (page.canScout) — the way into the scouting room before the draft.
  ScoutBanner: ComponentType<{ onOpen: () => void }>;
  DraftStage: ComponentType<{ draft: BingoPageModel["draft"]; milestone: StageMilestone | null; onOpenDraft: () => void }>;
  // `selector` (mods only) lets a theme list the teams right on this screen
  // instead of pointing at a menu.
  NoTeamStage: ComponentType<{ isMod: boolean; selector?: TeamSelectorModel }>;
  RulesDialog: ComponentType<{ isOpen: boolean; markdown: string; onClose: () => void }>;
  TeamInfoDialog: ComponentType<{ slug: string; team: TeamModel | null; onClose: () => void }>;
  // Where the team's points come from, opened from the point total on the banner. Open while `team` is set; reads its data with usePointBreakdown().
  PointBreakdownDialog: ComponentType<{ team: TeamModel | null; onClose: () => void }>;
  SubmissionsDrawer: ComponentType<{ isOpen: boolean; submissions: SubmissionModel[]; onClose: () => void; onSubmit?: () => void }>;

  // The frame + header the core dialogs (bug report, player profile) are
  // built from, so a theme can dress them without reimplementing them. Read
  // with useOptionalSlot, not useSlot: those dialogs also mount on pages
  // outside any ThemeProvider (mod panel, site admin), where they fall back
  // to the core Dialog/DialogHeader.
  DialogFrame: ComponentType<{ isOpen: boolean; onClose: () => void; size?: "md" | "lg"; isDismissable?: boolean; children: ReactNode }>;
  DialogHeader: ComponentType<{ title: ReactNode; subtitle?: ReactNode; onClose: () => void; action?: ReactNode }>;

  // Every core Button (core/ui/Button): the same props, variants (primary, secondary, ghost, danger) and sizes, drawn
  // the theme's way. Read with useOptionalSlot: outside a theme, Button is core's PlainButton.
  Button: ComponentType<ButtonProps>;

  // Every core Menu and MenuItem (core/ui/Menu): the account menu, the pickers' menus. Same props (MenuItem's variant:
  // "option", or "action" for a row that acts on the list). Read with useOptionalSlot: outside a theme they're core's.
  Menu: ComponentType<MenuFrameProps>;
  MenuItem: ComponentType<MenuRowProps>;

  // Every core Notice (core/ui/Card) and Panel (core/ui/Panel): a status line in a tone, and a raised section of a
  // page. Read with useOptionalSlot: outside a theme they're core's.
  Notice: ComponentType<NoticeProps>;
  Panel: ComponentType<PanelProps>;

  // The emoji reactions under a submission (core/submissions/ReactionBar), in the theme's own colours: a theme whose
  // cards aren't the page's surface (the comic's paper, even in dark mode) needs its own. Read with useOptionalSlot.
  ReactionBar: ComponentType<ReactionBarProps>;

  // The page's backdrop, the layers the theme draws behind every page (the comic's halftone), for a PinnedGap to show
  // the page through. Fixed, full-window layers; nothing (the page colour alone) in a theme without one.
  PageBackdrop: ComponentType;

  // The header's report-a-bug button (AppHeader). Read with useOptionalSlot: the header also shows on pages outside
  // any ThemeProvider, which fall back to core's BugReportButton.
  BugReportButton: ComponentType<{ onPress: () => void; hasUnseen: boolean }>;

  // Menu chrome for ColumnPicker / MultiSelect / SingleSelect. Props are
  // inlined so this file does not import Picker (that would cycle through
  // themes/context). Read with useOptionalSlot: mod and admin have no
  // ThemeProvider and fall back to the core Picker.
  PickerFrame: ComponentType<{
    options: { key: string; label: string; count?: number }[];
    selectedKeys: Set<string>;
    onSelectionChange: (keys: string[]) => void;
    selectionMode: "multiple" | "single";
    active?: boolean;
    children: ReactNode;
  }>;

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
  SubmitterPicker: ComponentType<{ submitter: SubmissionFlowModel["submitter"] }>;
  TilePicker: ComponentType<{ tile: SubmissionFlowModel["tile"] }>;
  TaskPicker: ComponentType<{ task: SubmissionFlowModel["task"] }>;
  RequirementPicker: ComponentType<{ requirement: SubmissionFlowModel["requirement"]; quantity: SubmissionFlowModel["quantity"] }>;
  StagedClaimsList: ComponentType<{ staged: SubmissionFlowModel["staged"] }>;
}

export type SlotName = keyof ThemeSlots;
