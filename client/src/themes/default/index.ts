import type { ThemeDefinition } from "../registry";
import { BugReportButton } from "../../core/ui/BugReportButton";
import { PlainButton } from "../../core/ui/Button";
import { PlainMenu, PlainMenuItem } from "../../core/ui/Menu";
import { PlainNotice } from "../../core/ui/Card";
import { PlainPanel } from "../../core/ui/Panel";
import { PlainTeamRoster } from "../../core/draft/TeamRoster";
import { defaultTokens } from "../tokens";
import { BoardPageLayout } from "./page/BoardPageLayout";
import { DraftPageLayout } from "./page/DraftPageLayout";
import { StatsPageLayout } from "./page/StatsPageLayout";
import { DraftPickBurst } from "./draft/DraftPickBurst";
import { AchievementUnlockCard } from "./achievements/AchievementUnlockCard";
import { PageLoading, PageError } from "./page/PageStates";
import { PageHeader } from "./page/PageHeader";
import { TeamSelector } from "./page/TeamSelector";
import { TeamBadge } from "./page/TeamBadge";
import { TileSearch } from "./page/TileSearch";
import { TeamBanner } from "./page/TeamBanner";
import { PlanningStage } from "./page/PlanningStage";
import { SignupStage } from "./page/SignupStage";
import { ScoutBanner } from "./page/ScoutBanner";
import { OnTheClockBanner } from "./draft/OnTheClockBanner";
import { DraftStage } from "./page/DraftStage";
import { NoTeamStage } from "./page/NoTeamStage";
import { RulesDialog } from "./page/RulesDialog";
import { SubmissionsDrawer } from "./page/SubmissionsDrawer";
import { TeamInfoDialog } from "../../core/teams/TeamInfoDialog";
import { PointBreakdownDialog } from "../../core/teams/PointBreakdownDialog";
import { Dialog, DialogHeader } from "../../core/ui/Dialog";
import { Picker } from "../../core/ui/Picker";
import { BoardGrid } from "./board/BoardGrid";
import { RowLabel } from "./board/RowLabel";
import { EmptyCell } from "./board/EmptyCell";
import { TileCell } from "./board/TileCell";
import { PreStartBanner } from "./board/PreStartBanner";
import { TileModal } from "./board/TileModal";
import { TaskPanel } from "./board/TaskPanel";
import { RequirementTree } from "./board/RequirementTree";
import { TileSubmissions } from "./board/TileSubmissions";
import { SubmissionModal } from "./submission/SubmissionModal";
import { ScreenshotDropzone } from "./submission/ScreenshotDropzone";
import { AnalysisPanel } from "./submission/AnalysisPanel";
import { TilePicker } from "./submission/TilePicker";
import { SubmitterPicker } from "./submission/SubmitterPicker";
import { TaskPicker } from "./submission/TaskPicker";
import { RequirementPicker } from "./submission/RequirementPicker";
import { StagedClaimsList } from "./submission/StagedClaimsList";

// The neutral/fallback theme: eager (it's what every unknown or loading
// theme key falls back to), and the only theme that must define every slot.
export const defaultTheme: ThemeDefinition = {
  key: "default",
  tokens: defaultTokens,
  slots: {
    BoardPage: BoardPageLayout,
    DraftPage: DraftPageLayout,
    StatsPage: StatsPageLayout,
    DraftPickBurst,
    AchievementUnlockCard,
    OnTheClockBanner,
    PageLoading,
    PageError,
    PageHeader,
    TeamSelector,
    TeamBadge,
    TileSearch,
    TeamBanner,
    PlanningStage,
    SignupStage,
    ScoutBanner,
    DraftStage,
    NoTeamStage,
    RulesDialog,
    SubmissionsDrawer,
    TeamInfoDialog,
    PointBreakdownDialog,
    DialogFrame: Dialog,
    DialogHeader,
    PickerFrame: Picker,
    BugReportButton,
    Button: PlainButton,
    Menu: PlainMenu,
    MenuItem: PlainMenuItem,
    Notice: PlainNotice,
    Panel: PlainPanel,
    PageBackdrop: () => null,
    DraftTeamRoster: PlainTeamRoster,
    BoardGrid,
    RowLabel,
    EmptyCell,
    TileCell,
    PreStartBanner,
    TileModal,
    TaskPanel,
    RequirementTree,
    TileSubmissions,
    SubmissionModal,
    ScreenshotDropzone,
    AnalysisPanel,
    SubmitterPicker,
    TilePicker,
    TaskPicker,
    RequirementPicker,
    StagedClaimsList,
  },
};
