// View-model types for the themeable player surfaces (board, /b/:slug page
// chrome, submission modal). Slots receive ONLY these shapes + callbacks —
// never a raw Tile, TeamNodeState[], SubmissionDetails[], or LeafClaimMaps.
// See docs/headless-theming-plan.md §2.
import type { ChangeEvent, KeyboardEvent, RefObject } from "react";
import type { DraftState, NodeKind, NodeStatus, Stage, StageMilestone, SubmissionDetails, SubmissionStatus } from "@bingo/shared";

export interface CategoryModel {
  id: string;
  label: string;
  color: string | null;
  sortOrder: number;
}

export interface TeamMemberModel {
  id: string;
  displayName: string;
  avatarUrl: string;
  isCaptain: boolean;
  isCoCaptain: boolean;
}

export interface TeamModel {
  id: string;
  name: string;
  color: string | null;
  isMine: boolean;
  /** Captain first, then co-captain. */
  members: TeamMemberModel[];
  /** The viewer leads this team (captain or co-captain; the rename endpoint is lead-only). */
  canRename: boolean;
}

export interface UserModel {
  displayName: string;
  avatarUrl: string;
}

export interface RequirementNodeModel {
  id: string;
  kind: NodeKind;
  /** leafLabel() for leaves, conditionHeading() for composites. */
  label: string;
  isLeaf: boolean;
  status: NodeStatus;
  complete: boolean;
  /** Any non-rejected claim on this leaf (or, for a SUM, any of its children). */
  submitted: boolean;
  /** An enclosing ANY/COUNT is already satisfied by a sibling branch. */
  notNeeded: boolean;
  /** complete || notNeeded — the "no longer needs attention" display flag. */
  dim: boolean;
  /** SUM only. */
  progress: { current: number; target: number } | null;
  /** Whether the composite's own heading is rendered (always, for composites). */
  showHeading: boolean;
  children: RequirementNodeModel[];
}

export interface TaskModel {
  id: string;
  label: string | null;
  description: string | null;
  notes: string | null;
  points: number;
  kind: NodeKind;
  isManual: boolean;
  allowsPreLoad: boolean;
  status: NodeStatus;
  complete: boolean;
  locked: boolean;
  lockedReason: string | null;
  /** Not complete and not locked — getAvailableTasks semantics. */
  available: boolean;
  /** null for a MANUAL task. */
  tree: RequirementNodeModel | null;
}

export interface SubmissionModel {
  id: string;
  status: SubmissionStatus;
  submittedAt: string;
  timeAgo: string;
  thumbnailUrl: string | null;
  /** claimsSummary() — e.g. "2× Bruma torch, Vorki". */
  summary: string;
  submittedBy: string | null;
  reviewerNotes: string | null;
  tileId: string | null;
  tileName: string | null;
  taskLabels: string[];
  /** Escape hatch so core SubmissionRow still works — the ONE raw server shape a theme may see. Optional to use. */
  detail: SubmissionDetails;
}

export interface TileModel {
  id: string;
  name: string;
  imageUrl: string | null;
  row: number;
  col: number;
  category: CategoryModel | null;
  /** Category colour; the slot falls back to the --tile-accent token when null. */
  accentColor: string | null;
  progress: {
    completedTasks: number;
    totalTasks: number;
    pointsAwarded: number;
    totalPoints: number;
    allComplete: boolean;
  };
  /** TileCell's per-task dot row. */
  taskStatuses: { id: string; index: number; label: string; status: NodeStatus }[];
  freeze: {
    hasFreezePeriod: boolean;
    durationMinutes: number;
    unlocksAt: number | null;
    isFrozen: boolean;
    remainingMs: number;
  };
  tasks: TaskModel[];
  /** groupSubmissionsByTile() output for this tile, newest first. */
  submissions: SubmissionModel[];
  /** Search miss. */
  dimmed: boolean;
  /** page.canSubmit && !allComplete && !isFrozen — TileModal's submitDisabled, inverted. */
  canSubmit: boolean;
}

// Not rendered by the default theme; exposed for a theme that wants line
// overlays. BoardLine.node.children are the tile root nodes (server
// boardService.ts:210); complete = the line's own node id is in nodeStates.
export interface LineModel {
  id: string;
  lineType: "row" | "column" | "diagonal" | "custom";
  lineIndex: number;
  tileIds: string[];
  points: number;
  complete: boolean;
  pointsAwarded: number;
}

export interface BoardModel {
  rows: number;
  cols: number;
  /** [row][col]. */
  grid: (TileModel | null)[][];
  tiles: TileModel[];
  tileById: ReadonlyMap<string, TileModel>;
  rowCategories: (CategoryModel | null)[];
  showRowLabels: boolean;
  lines: LineModel[];
  now: number;
  /** The board stays interactive pre-start; the default theme shows a banner, not an overlay. */
  preStart: { isPreStart: boolean; startsAt: number | null };
  /** progressData.totalPoints. */
  totalPoints: number | null;
}

// Exact branch order: signup -> planning|captains -> draft -> !viewingTeamId -> board.
export type StageView = "signup" | "planning" | "captains" | "draft" | "noTeam" | "board";

export interface TileSearchModel {
  query: string;
  setQuery(q: string): void;
  clear(): void;
  focused: boolean;
  setFocused(f: boolean): void;
  /** Owns the 150ms blur-close timeout. */
  blur(): void;
  results: { id: string; name: string }[];
  overflowCount: number;
  showDropdown: boolean;
  highlightedIndex: number;
  onKeyDown(e: KeyboardEvent<HTMLInputElement>): void;
  choose(tileId: string): void;
  inputRef: RefObject<HTMLInputElement | null>;
}

// Open/close belongs to the slot (a RAC MenuTrigger in the default theme).
export interface TeamSelectorModel {
  teams: TeamModel[];
  selectedId: string | null;
  select(id: string): void;
}

export interface BingoPageModel {
  slug: string;
  themeKey: string;
  bingo: {
    name: string;
    stage: Stage;
    stageLabel: string;
    rulesMarkdown: string | null;
    startsAt: number | null;
    endsAt: number | null;
    boardRows: number;
    boardCols: number;
  };
  milestone: StageMilestone | null;
  user: UserModel;
  isMod: boolean;
  myTeam: TeamModel | null;
  teams: TeamModel[];
  categories: CategoryModel[];
  stageView: StageView;
  /** Mods always; players only once the bingo is complete (matches the stats endpoint). */
  canViewStats: boolean;
  /** For the draft-stage slot; DraftState is the shared draft response type. */
  draft: { state: DraftState | null; isLoading: boolean };
  /** pendingSubmissionCount: the viewed team's submissions still awaiting review (header badge). */
  viewing: { team: TeamModel | null; isOtherTeam: boolean; pendingSubmissionCount: number };
  canSubmit: boolean;
  pendingCount: number;
  /** endsAt && stage === "live". */
  showEndCountdown: boolean;
  /** Whole team, newest first (drawer). */
  submissions: SubmissionModel[];
  teamSelector: TeamSelectorModel;
  search: TileSearchModel;
  /** Replaces both the old openTileId state and BoardGrid's own `selected` state. */
  openTile: { id: string | null; open(id: string): void; close(): void };
  rules: { open: boolean; show(): void; hide(): void };
  /** Roster of `viewing.team` (TeamBadge press for players, roster button beside TeamSelector for mods → TeamInfoDialog). */
  teamInfo: { open: boolean; show(): void; hide(): void };
  drawer: { open: boolean; show(): void; hide(): void };
  /** show() also hides the drawer. initialFile seeds/replaces the flow's screenshot (drag-drop/paste-to-submit) — re-passing a new File while already open feeds it into the still-mounted flow. */
  submit: { open: boolean; initialTileId: string | undefined; initialFile: File | undefined; show(tileId?: string, file?: File): void; hide(): void };
  /** logout lives in core AppHeader's own user menu, not here. */
  actions: { goHome(): void; goToStats(): void; goToMod(): void; goToDraft(): void };
}

export interface SubmissionFlowModel {
  screenshot: {
    file: File | null;
    previewUrl: string | null;
    dragOver: boolean;
    error: string | null;
    pick(file: File): void;
    openFilePicker(): void;
    inputProps: {
      ref: RefObject<HTMLInputElement | null>;
      type: "file";
      accept: "image/*";
      onChange(e: ChangeEvent<HTMLInputElement>): void;
    };
  };
  analysis: {
    status: "idle" | "analyzing" | "done" | "failed";
    result: {
      codewordFound: boolean;
      codeword: string;
      warnings: string[];
      detected: { itemName: string; tileName: string } | null;
    } | null;
  };
  tile: { selectedId: string; options: { id: string; label: string; group?: string }[]; select(id: string): void };
  task: {
    selectedId: string;
    options: { id: string; label: string }[];
    select(id: string): void;
    current: { id: string; label: string; isManual: boolean } | null;
    /** true when options.length === 1 (the picker auto-selected it). */
    autoSelected: boolean;
  };
  requirement: {
    visible: boolean;
    selectedId: string;
    options: { id: string; label: string }[];
    readOnly: boolean;
    select(id: string): void;
    /** `${tileId}-${taskId}` — the SearchableSelect remount key. */
    pickerKey: string;
  };
  quantity: { visible: boolean; value: number; max: number; needed: number; set(n: number): void };
  staged: { items: { label: string }[]; remove(index: number): void; canStageCurrent: boolean; stageCurrent(): void };
  submit: { isValid: boolean; isSubmitting: boolean; isAnalyzing: boolean; error: string | null; run(): Promise<void> };
  close(): void;
}
