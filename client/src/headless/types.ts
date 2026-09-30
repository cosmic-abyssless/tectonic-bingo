// View-model types for the themeable player surfaces (board, /b/:slug page
// chrome, submission modal). Slots receive ONLY these shapes + callbacks —
// never a raw Tile, TeamNodeState[], SubmissionDetails[], or LeafClaimMaps.
// See docs/headless-theming-plan.md §2.
import type { ChangeEvent, KeyboardEvent, RefObject } from "react";
import type { AuditCategory, AuditTone, ContributionCount, DraftState, NodeKind, NodeStatus, PickedTitle, SignificanceTier, Stage, StageMilestone, SubmissionDetails, SubmissionReaction, SubmissionStatus, WrappedArtFrames } from "@bingo/shared";
import type { PlaybackSpeed } from "./rewindModel";

export interface ActivityEntryModel {
  id: number;
  label: string;
  tone: AuditTone;
  category: AuditCategory;
  at: number;
  timeAgo: string;
  actorName: string | null;
  /** For linking the name to the player's profile; null for system events. */
  actorId: string | null;
  /** How many log entries this line stands for (more than 1 when the feed condensed a run of them). */
  count: number;
}

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
  /** The viewer is this team's captain or co-captain. */
  isLead: boolean;
  /** Leads only, and only until the bingo goes live (matches the rename endpoint). */
  canRename: boolean;
}

export interface UserModel {
  displayName: string;
  avatarUrl: string;
}

export interface RequirementNodeModel {
  id: string;
  kind: NodeKind;
  /** leafLabel() for leaves, conditionHeading() for composites (a SUM over several items is a composite: "5 in total from"). */
  label: string;
  /** SUM only: the items that count toward it (for a SUM over several items, the group's rows — no checkbox each, since no single item is done on its own) — each with how many the team has had approved (duplicates count), and whether the team has used the item elsewhere (`lockedBy`, e.g. "Used on DT2 ISSUE 1"; see exclusive items). */
  items: { name: string; iconUrl: string | null; count: number; lockedBy: string | null }[];
  /** ITEM leaves only: the item's wiki icon (via our cache), when it has a name to look up. */
  iconUrl: string | null;
  /** ITEM leaves only: set when the team has used this item somewhere else and a rule says it counts in one place only, e.g. "Used on DT2 ISSUE 1". Not `dim`: it isn't done, it is unavailable. */
  lockedBy: string | null;
  isLeaf: boolean;
  status: NodeStatus;
  complete: boolean;
  /** Any non-rejected claim on this leaf (or, for a SUM, any of its children). */
  submitted: boolean;
  /** An enclosing ANY/COUNT is already satisfied by a sibling branch. */
  notNeeded: boolean;
  /** complete || notNeeded — the "no longer needs attention" display flag. */
  dim: boolean;
  /** SUM: items received / the total needed. COUNT: options complete / N. Drawn beside a group's heading ("Complete at least 3 of · 1/3"), or at the end of a single-item SUM's row. Null for ITEM, ALL and ANY (ALL shows progress through its ticked boxes; ANY is done or not). */
  progress: { current: number; target: number } | null;
  /** A single-item SUM's quantity when it's more than 1, drawn after the name ("Twisted ancestral colour kit ×2"). Null otherwise. */
  quantity: number | null;
  /** Whether the composite's own heading is rendered (always, for composites). */
  showHeading: boolean;
  /** ANY only: draw this divider between each pair of its direct children (never before the first or after the last). `dim` once the ANY is satisfied (or an enclosing ANY/COUNT is), along with the options that are no longer needed. */
  divider: { label: "OR"; dim: boolean } | null;
  children: RequirementNodeModel[];
}

export interface TaskModel {
  id: string;
  label: string | null;
  description: string | null;
  notes: string | null;
  points: number;
  /** What this part has actually awarded so far (0 until it's complete). */
  pointsAwarded: number;
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
  /** Teammates who have raised a hand for this part, oldest first. */
  interest: TaskInterestModel;
}

export interface TaskInterestModel {
  people: { id: string; displayName: string }[];
  /** The viewer is one of them. */
  mine: boolean;
  /** Viewer is on the team whose board this is and the part isn't done — page.tileInterest.toggle() works. */
  canToggle: boolean;
}

export interface SubmissionModel {
  id: string;
  status: SubmissionStatus;
  submittedAt: string;
  timeAgo: string;
  /** The first screenshot's original URL — views derive the thumb/full variant they need (api/imageVariants). */
  thumbnailUrl: string | null;
  /** claimsSummary() — e.g. "2× Bruma torch, Vorki". */
  summary: string;
  submittedBy: string | null;
  reviewerNotes: string | null;
  tileId: string | null;
  tileName: string | null;
  taskLabels: string[];
  /** Teammates' emoji reactions, in SUBMISSION_REACTIONS order; only the ones someone has left. */
  reactions: ReactionModel[];
  /** Escape hatch so core SubmissionRow still works — the ONE raw server shape a theme may see. Optional to use. */
  detail: SubmissionDetails;
}

export interface ReactionModel {
  emoji: SubmissionReaction;
  count: number;
  /** Who left it, oldest first. */
  names: string[];
  /** The viewer is one of them. */
  mine: boolean;
}

export interface TileModel {
  id: string;
  name: string;
  imageUrl: string | null;
  row: number;
  col: number;
  /**
   * Sealed for this viewer (CONTEXT.md "Sealed Tiles"): only the name, art, Category and freeze are real. It has no
   * tasks, progress or points to show, and opening it shows a note instead (page.openTile.open).
   */
  sealed: boolean;
  category: CategoryModel | null;
  /** Category colour; the slot falls back to the --tile-accent token when null. */
  accentColor: string | null;
  progress: {
    completedTasks: number;
    totalTasks: number;
    pointsAwarded: number;
    totalPoints: number;
    /** The part of pointsAwarded that came from the tile's own full-completion bonus. */
    bonusAwarded: number;
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
  /**
   * Tile-level rollup of the per-task interest: everyone on any part of this
   * tile (deduped, oldest first). Cells use it for a badge; the per-part truth
   * lives on each TaskModel.interest.
   */
  interest: {
    people: { id: string; displayName: string }[];
    /** The viewer is on at least one part. */
    mine: boolean;
    /** Viewer is on the team whose board this is and the tile isn't done — some part can still be toggled. */
    canToggle: boolean;
  };
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
  /** The Tiles are sealed for this viewer (see TileModel.sealed); lines carry no points. */
  sealed: boolean;
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
  /** The viewed team's manual point changes from the mods, newest first (already counted in totalPoints). */
  adjustments: PointAdjustmentModel[];
}

/** A moderator's manual points change (a bonus, or a penalty when negative). */
export interface PointAdjustmentModel {
  id: string;
  amount: number;
  reason: string;
  timeAgo: string;
}

/**
 * Where a team's points come from: per tile (its parts' points and its full-completion bonus), per line
 * (the line bonus, with the tiles it runs through), and mod adjustments. Everything is derived from what
 * the board already shows, and `unattributed` is whatever the total holds that none of these account for
 * (0 when it all adds up).
 */
export interface PointBreakdownModel {
  total: number;
  /** Tiles that have earned points, biggest first. `points` = the parts plus `bonus`. */
  tiles: { points: number; items: { tileId: string; name: string; points: number; parts: { id: string; label: string; points: number }[]; bonus: number }[] };
  /** Lines that have paid out; `tileNames` are the tiles it runs through, in board order. */
  lines: { points: number; items: { id: string; label: string; points: number; tileNames: string[] }[] };
  adjustments: { points: number; items: PointAdjustmentModel[] };
  /** Parts that are complete but whose points are held back (a points gate that hasn't been completed yet). */
  withheld: { tileId: string; tileName: string; label: string; points: number }[];
  unattributed: number;
}

// Exact branch order: signup -> notPart -> planning|captains -> draft -> !viewingTeamId -> board.
// "notPart": someone who can't see the bingo (not a Player, Moderator or Admin; CONTEXT.md "Player") once signups close.
export type StageView = "signup" | "notPart" | "planning" | "captains" | "draft" | "noTeam" | "board";

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
  /** Rewind only: an "All Teams" choice above the Teams. While it's selected, selectedId is null. */
  allTeams?: { selected: boolean; select(): void };
}

export interface BingoPageModel {
  slug: string;
  themeKey: string;
  bingo: {
    name: string;
    stage: Stage;
    stageLabel: string;
    rulesMarkdown: string | null;
    /** The rules are held back from this viewer for now (Hide rules, during Board revealed): the Rules entry point says they come later. */
    rulesComeLater: boolean;
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
  /** An active signup left out of the draft (from the Draft stage on), for the "not part of this bingo" notice. */
  isCut: boolean;
  /** The Team an Admin took the viewer off (Remove from Team), for the same notice; null otherwise. */
  removedFromTeam: string | null;
  /** Mods, and everyone once the bingo is Finished, can switch between teams' boards. */
  canPickTeam: boolean;
  /** Mods always; players on a team once live (own team only), everyone once complete (matches the stats endpoint). */
  canViewStats: boolean;
  /** Rewind (CONTEXT.md) exists only for a Finished Bingo, for everyone who can view it. */
  canRewind: boolean;
  /**
   * Wrapped (CONTEXT.md), for a Finished Bingo: open to everyone once a Moderator publishes it, and to Moderators before
   * that as a preview (the banner says so).
   */
  wrapped: { canOpen: boolean; preview: boolean };
  /**
   * Scouting (CONTEXT.md): Team leads and mods may browse the draft room before the draft stage, and every Player may
   * once Signups are closed. Only leads rate signups (myTeam.isLead).
   */
  canScout: boolean;
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
  /** Replaces both the old openTileId state and BoardGrid's own `selected` state. While the Tiles are sealed for this viewer, open() shows a note instead. */
  openTile: { id: string | null; open(id: string): void; close(): void };
  /**
   * Sealed Tiles (CONTEXT.md). forMe: this viewer can't open Tiles (see TileModel.sealed). forPlayers: they're sealed
   * for Players and Captains, which a Moderator's board points out.
   */
  sealed: { forMe: boolean; forPlayers: boolean };
  rules: { open: boolean; show(): void; hide(): void };
  /** Roster of `viewing.team` (TeamBadge press for players, roster button beside TeamSelector for mods → TeamInfoDialog). */
  teamInfo: { open: boolean; show(): void; hide(): void };
  /** The point breakdown of `viewing.team` (pressing the point total on the board → PointBreakdownDialog). */
  pointBreakdown: { open: boolean; show(): void; hide(): void };
  drawer: { open: boolean; show(): void; hide(): void };
  /** show() also hides the drawer. initialFile seeds/replaces the flow's screenshot (drag-drop/paste-to-submit) — re-passing a new File while already open feeds it into the still-mounted flow. initialTaskId preselects a part of that tile (per-part Submit buttons). */
  submit: { open: boolean; initialTileId: string | undefined; initialTaskId: string | undefined; initialFile: File | undefined; show(tileId?: string, file?: File, taskId?: string): void; hide(): void };
  /** logout lives in core AppHeader's own user menu, not here. */
  actions: { goHome(): void; goToStats(): void; goToRewind(): void; goToWrapped(): void; goToMod(): void; goToDraft(): void };
  /** Raise/lower the viewer's hand for one part (task) of a tile on their own team. No-op unless task.interest.canToggle. */
  tileInterest: { toggle(tileId: string, taskId: string): void };
  /** Emoji reactions on the viewed team's submissions: canReact when it's the viewer's own team. toggle() puts the viewer's on or takes it off. */
  reactions: { canReact: boolean; toggle(submissionId: string, emoji: SubmissionReaction): void };
}

export interface SubmissionFlowModel {
  /**
   * Who the drop belongs to. A player can post for a teammate (a drop on mobile, posted from a PC); a mod posting
   * to a team they aren't on must pick one of its players. The player picked is credited, the poster is recorded.
   */
  submitter: {
    /** Hidden when there's nobody to choose: a one-player team and you're on it. */
    visible: boolean;
    /** A mod on another team has to choose; on your own team you default to yourself. */
    required: boolean;
    teamName: string;
    selectedId: string;
    /** The poster sorts first, labelled "(me)". */
    options: { id: string; label: string; isMe: boolean }[];
    select(id: string): void;
  };
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
    /** Items of the chosen part left out of `options` because the team already used them elsewhere, with why. */
    locked: { label: string; reason: string }[];
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

// ---------------------------------------------------------------------------
// Rewind (CONTEXT.md "Rewind"): a Finished Bingo played back on its Board. RewindProvider builds these; the Board
// itself is the ordinary BoardModel (useBoardModel), at the moment being viewed.
// ---------------------------------------------------------------------------

/** One Submission as a Rewind popup shows it. */
export interface RewindSubmissionModel {
  id: string;
  /** Submission time, ms. */
  at: number;
  /** "Sat 14:32". */
  timeLabel: string;
  /** "D2 +5h12m" into the Bingo. */
  sinceStartLabel: string;
  tier: SignificanceTier;
  /** Shown greyed out and stamped "Rejected"; it never changed the Board. */
  rejected: boolean;
  /** The Player it's credited to. */
  playerName: string | null;
  team: { id: string; name: string; color: string | null };
  tileId: string | null;
  tileName: string | null;
  /** Main screenshot's thumbnail. */
  thumbnailUrl: string | null;
  /** The full-size screenshot. */
  screenshotUrl: string | null;
  items: { label: string; quantity: number; gpValue: number | null; gpLabel: string; luckLabel: string | null }[];
  /** Total Drop value, or null (shown as "—") when no item has one. */
  gpValue: number | null;
  gpLabel: string;
  /** Visible to every viewer in Rewind. Read-only. */
  reactions: ReactionModel[];
  /** "Completed ZULRAH", "Row 2 complete", "First to complete ZULRAH"… */
  highlights: string[];
  /** What made it stand out: the signal that counted most towards its Significance. Null when it has none. */
  standout: RewindStandoutModel | null;
}

/**
 * The signal that counted most towards a Submission's Significance, and the value to call out with it: the Drop value
 * ("12.5M"), the Luck ("1 in 1,230"), the Reaction count ("7"), the Tile or Line it completed, or none for a first.
 */
export type RewindStandoutModel =
  | { kind: "gp" | "luck" | "reactions" | "tile" | "line"; value: string }
  | { kind: "first"; value: null };

export interface RewindTickModel {
  id: string;
  /** 0 (went Live) to 1 (Finished), in real time. */
  position: number;
  tier: SignificanceTier;
  rejected: boolean;
  /** Made at or before the moment being viewed. */
  past: boolean;
  /** The Submission being shown. */
  current: boolean;
  /** Its Team's colour, in the All Teams view (where ticks are coloured by Team); null otherwise. */
  teamColor: string | null;
}

export interface RewindTimelineModel {
  /** ms: when the Bingo went Live and was Finished. */
  start: number;
  end: number;
  /** The moment being viewed, ms. */
  at: number;
  /** 0–1 along the timeline. */
  position: number;
  /** "D2 +5h12m" and the clock time of `at`. */
  atLabel: string;
  atClockLabel: string;
  startLabel: string;
  endLabel: string;
  /** One per Submission of the viewed Team (of every Team, in the All Teams view), sized by tier. */
  ticks: RewindTickModel[];
  /** Jump to a moment (dragging/clicking the scrubber). Pauses Play and closes any popup. */
  seek(at: number): void;
  /** Jump to a Submission and show it, like stepping. */
  jumpTo(id: string): void;
}

export interface RewindControlsModel {
  playing: boolean;
  togglePlay(): void;
  canPrev: boolean;
  canNext: boolean;
  canPrevNotable: boolean;
  canNextNotable: boolean;
  prev(): void;
  next(): void;
  prevNotable(): void;
  nextNotable(): void;
  /** Rejected Submissions on the timeline (off by default). */
  showRejected: boolean;
  setShowRejected(on: boolean): void;
  /** Play's speed multiplier (1x by default, remembered per viewer). Only Play's pace: stepping and scrubbing ignore it. */
  speed: PlaybackSpeed;
  /** The speeds to choose from, slowest first. From 4x up Play skips minor Submissions. */
  speeds: readonly PlaybackSpeed[];
  setSpeed(speed: PlaybackSpeed): void;
  /** Where Play is, as "12 / 340". */
  positionLabel: string;
}

export interface RewindScoreboardModel {
  /** Every Team at the moment being viewed, most points first. */
  teams: { id: string; name: string; color: string | null; points: number; rank: number; isViewed: boolean; isMine: boolean }[];
  /** Show that Team's Board. */
  select(teamId: string): void;
}

/** One Submission in the log: a compact line, with the detail left to its popup. */
export interface RewindLogEntryModel {
  id: string;
  tier: SignificanceTier;
  rejected: boolean;
  playerName: string | null;
  /** "Tanzanite fang +2 more". */
  itemsLabel: string;
  tileName: string | null;
  /** Its total Drop value, or null when no item has one. */
  gpLabel: string | null;
  /** "D2 +5h12m" into the Bingo, and the clock time. */
  sinceStartLabel: string;
  timeLabel: string;
  /** Its Team, in the All Teams view (where entries are marked by Team); null otherwise. */
  team: { name: string; color: string | null } | null;
}

/**
 * Every Submission up to the moment being viewed, newest first, minor ones included: it grows as Play reaches them
 * (at a fast speed too, where Play skips minor ones) and shrinks on a scrub back, so it never shows what's ahead.
 */
export interface RewindLogModel {
  entries: RewindLogEntryModel[];
  /** The Submission in focus (Play or a step), for highlighting its entry. */
  currentId: string | null;
  /** Jump to a Submission and show its popup, whatever its tier. */
  jumpTo(id: string): void;
}

export interface RewindPopupModel {
  submission: RewindSubmissionModel;
  /** notable: a small popup; huge: a big one that holds longer. */
  size: "small" | "big";
  /** While playing: how long this popup stays before Play moves on, for a countdown. Null when paused or stepping. */
  holdMs: number | null;
  close(): void;
}

/**
 * The closing card at the very end of Rewind: the Bingo's final Titles, picked as the Stats page picks them (its
 * frozen Title settings, its visibility rules) from the viewed Team's Players, or every Player's in the All Teams view.
 */
export interface RewindClosingModel {
  /** Every Title the Stats page would list for the same Team filter, holders and the value behind each included. */
  titles: PickedTitle[];
  /** The Players the Titles are picked from, for their names and avatars. */
  contributions: ContributionCount[];
  /** When Wise Old Man was last read, for the WOM-sourced Titles. */
  womReadAt: string | null;
  /** Whose Titles these are: the viewed Team, or null for the whole Bingo (the All Teams view). */
  team: { name: string; color: string | null } | null;
  close(): void;
}

/** One Tile in the All Teams view: every Team's progress on it at the moment being viewed. */
export interface RewindTileTeamsModel {
  tileId: string;
  tileName: string;
  /** The Teams that have completed it by now, in scoreboard order: the Tile's markers. */
  completedBy: { id: string; name: string; color: string | null }[];
  /** Every Team's progress on it, in the same order. */
  teams: { id: string; name: string; color: string | null; complete: boolean; completedTasks: number; totalTasks: number; pointsAwarded: number; totalPoints: number }[];
  /** "Iron Fists: complete · Dragons: 1/3 parts": for a hover title. */
  summary: string;
}

export interface RewindModel {
  slug: string;
  bingoName: string;
  /** The Team whose Board, timeline and popups are shown. Null in the All Teams view. */
  team: TeamModel | null;
  /**
   * The All Teams view: the Board is the shared layout with no one's progress on it, each Tile marked with every Team
   * that has completed it (tileTeams), and the timeline and popups cover every Team's Submissions.
   */
  allTeams: boolean;
  /** All Teams view only (null otherwise): each Tile's Teams at the moment being viewed, by Tile id. */
  tileTeams: ReadonlyMap<string, RewindTileTeamsModel> | null;
  /** The existing Team selector, open to everyone here: every Team's Board is visible once the Bingo is Finished. It has an All Teams choice. */
  teamSelector: TeamSelectorModel;
  /** The viewed Team's points at the moment being viewed (0 in the All Teams view: the scoreboard has every Team's). */
  teamPoints: number;
  timeline: RewindTimelineModel;
  controls: RewindControlsModel;
  scoreboard: RewindScoreboardModel;
  log: RewindLogModel;
  /** The Submission in focus (Play or a step): its Tile is highlighted. Null after a scrub. */
  current: RewindSubmissionModel | null;
  /** The Tile to highlight: the one the current Submission landed on. */
  highlightedTileId: string | null;
  /** The popup to show: during Play and when stepping, for notable-or-bigger Submissions only; from the log, for any. */
  popup: RewindPopupModel | null;
  /** The closing card: shown once the moment reaches the Bingo's end (Play running out, a scrub or a step there). */
  closing: RewindClosingModel | null;
  /**
   * A Tile's details at the moment being viewed (its Submissions left out: the timeline has those). In the All Teams
   * view `tile` stays null and `teams` has every Team's progress on the opened Tile instead.
   */
  openTile: { tile: TileModel | null; teams: RewindTileTeamsModel | null; open(id: string): void; close(): void };
  exit(): void;
}

// ---------------------------------------------------------------------------
// Wrapped (CONTEXT.md "Wrapped"): a Finished Bingo's story from the viewer's point of view, built from the published
// (stored) data by headless/wrappedModel.ts. Every label is ready to print; a part with nothing to say is null (or an
// empty list), and a section with nothing to say is left out of `sections` altogether.
// ---------------------------------------------------------------------------

/**
 * A section's Category images, each captioned with the name (and optional role) of who it credits (both null for
 * none), and its category's additional credits (ones with no image), in the Admins' order (CONTEXT.md "Credits").
 * Both empty without any.
 */
export interface WrappedSectionArtModel {
  images: { frames: WrappedArtFrames; name: string | null; role: string | null }[];
  credits: { name: string; role: string | null }[];
}

export interface WrappedPersonModel {
  id: string;
  name: string;
  avatarUrl: string;
  /** The viewer. */
  isYou: boolean;
}

/**
 * A drop's Luck the way Players think about it: the Item's drop rate and the kills it took ("A 1/512 drop in 37 kills"),
 * then how rare that is ("Only 1 in 14 get it that fast").
 */
export interface WrappedLuckModel {
  /** "1 in 14": how few Players would have had it within those kills. */
  chanceLabel: string;
  /** "1/512", the per-kill drop rate (over every boss that drops it); null without the kills. */
  rateLabel: string | null;
  /** "37 kills"; null without them. */
  killsLabel: string | null;
  /** One short line for a drop card: "1/512 in 37 kills" (or "1 in 14 luck" without the kills). */
  shortLabel: string;
  /** The full sentence: "A 1/512 drop in 37 kills. Only 1 in 14 get it that fast." */
  sentence: string;
}

export interface WrappedDropModel {
  /** Unique within the story. */
  key: string;
  itemName: string;
  /** "×3" for more than one, else null. */
  quantityLabel: string | null;
  /** "12.3m"; null for an item with no Drop value. */
  gpLabel: string | null;
  /** Its Luck (CONTEXT.md), worded for Players; null when it can't be judged or wasn't lucky at all. */
  luck: WrappedLuckModel | null;
  player: WrappedPersonModel | null;
  team: { name: string; color: string | null } | null;
  /** "Sat 14 Mar, 21:04", in the viewer's time zone. */
  whenLabel: string;
  /** The screenshot's thumbnail and full image; null when the data leaves it out. */
  thumbnailUrl: string | null;
  screenshotUrl: string | null;
}

/** A Team's (or every Team's) points over time, for a chart: ms timestamps, running totals, starting from 0. */
export interface WrappedSeriesModel {
  teamId: string;
  name: string;
  color: string | null;
  isMine: boolean;
  /** `event` is what moved it there (null on the added start and end, and in Wrapped published before it was stored). */
  points: { t: number; points: number; event: WrappedPointsEventModel | null }[];
}

/** An award or Point Adjustment on the chart, worded as the stats chart does: "+50 ZULRAH — Page 1". */
export interface WrappedPointsEventModel {
  deltaLabel: string;
  label: string;
  /** "Sat 14 Mar, 21:04", in the viewer's time zone. */
  whenLabel: string;
}

export interface WrappedChartModel {
  start: number;
  end: number;
  maxPoints: number;
  series: WrappedSeriesModel[];
}

export interface WrappedIntroModel {
  kind: "intro";
  /** This section's Category images, side by side (each its two boil frames); empty without any. */
  art: WrappedSectionArtModel;
  bingoName: string;
  /** The viewer's name when they played; null for anyone else (they get the Bingo-wide story). */
  playerName: string | null;
  /** "3 Jan – 17 Jan 2026"; null without both dates. */
  datesLabel: string | null;
}

export interface WrappedYouModel {
  kind: "you";
  art: WrappedSectionArtModel;
  /**
   * Comparisons are only ever flattering: each is null unless the Player beat it, so a Player below the average (or low
   * on their Team) sees their own numbers and nothing to measure them against.
   */
  submissions: { countLabel: string; comparison: string | null } | null;
  points: { shareLabel: string; comparison: string | null; teamPercentLabel: string | null; rankLabel: string | null; isTop: boolean } | null;
  gp: { gainedLabel: string; buyInLabel: string | null; coveredBuyIn: boolean | null } | null;
  /** Their most valuable drops (Drop value only), highest first. */
  topDrops: WrappedDropModel[];
  luckiestDrop: WrappedDropModel | null;
  /** "191 kills" of a boss without a Board drop; "1/127" the Board drops' combined rate there; "1 in 30" how rare that dry is. */
  driestStreak: { boss: string; killsLabel: string; rateLabel: string; chanceLabel: string } | null;
  /** Their first and last drop (last is null when they had only one). */
  firstLast: { first: WrappedDropModel; last: WrappedDropModel | null } | null;
  mostActiveDay: { dateLabel: string; submissionsLabel: string; drops: WrappedDropModel[] } | null;
  titles: { id: string; name: string; text: string }[];
  /** `description` is how it was earned; null for one no longer in the catalogue. */
  achievements: { key: string; name: string; itemName: string; description: string | null; earnedLabel: string }[];
  wom: { ehbLabel: string; bosses: { name: string; killsLabel: string }[] } | null;
  draft: { pickLabel: string; positionLabel: string } | null;
}

/** Your Duo: only for a Player in a Duo. Worded as friendly teasing, never as a verdict on either half. */
export interface WrappedDuoModel {
  kind: "duo";
  art: WrappedSectionArtModel;
  partner: WrappedPersonModel;
  combinedShareLabel: string;
  /** "1st of 4 Duos"; null when theirs was the only Duo. */
  rankLabel: string | null;
  isTop: boolean;
  /** How the Points share split between them (percentages add up to 100); null when neither scored. */
  split: { myPercent: number; partnerPercent: number; myShareLabel: string; partnerShareLabel: string } | null;
  /** "Who carried whom", as banter; null when neither scored. */
  carried: string | null;
  /** "Pick 7"; null when the Duo wasn't drafted. */
  pickLabel: string | null;
  /** Their best moments together: a Submission each on the same Tile, or on the same day. */
  moments: { key: string; label: string; mine: WrappedDropModel; theirs: WrappedDropModel }[];
}

/** Your Draft: only for Captains (and co-Captains). No pick is ever labelled a bust. */
export interface WrappedCaptainModel {
  kind: "captain";
  art: WrappedSectionArtModel;
  /** Every pick, in pick order: a Duo is one pick with both halves. */
  picks: {
    key: string;
    pickLabel: string;
    people: WrappedPersonModel[];
    /** "Drafted 3rd". */
    positionLabel: string;
    /** "Finished 5th"; null when it can't be ranked. */
    rankLabel: string | null;
    /** Finished above where they were drafted: the only comparison ever highlighted. */
    beat: boolean;
  }[];
  /** Their best Steal (CONTEXT.md); null when no pick beat its draft position. */
  steal: { people: WrappedPersonModel[]; pickLabel: string; positionLabel: string; rankLabel: string; placesBeatenLabel: string } | null;
  /** An overall draft grade, from how the picks did against their draft positions; null with nothing to grade. */
  grade: { letter: string; line: string } | null;
}

export interface WrappedModeratorModel {
  kind: "moderator";
  art: WrappedSectionArtModel;
  /** The Moderator's name as the Bingo shows it (RSN, else Discord name), captioned on their art. */
  name: string;
  /** "32 Submissions" */
  reviewedLabel: string;
  medianLabel: string;
  rejectionLabel: string;
  /** A line of banter about their rejection rate. */
  banter: string;
}

export interface WrappedTeamModel {
  kind: "team";
  art: WrappedSectionArtModel;
  name: string;
  color: string | null;
  placement: number;
  /** "1st of 4" (ties share a placement). */
  placementLabel: string;
  teamCount: number;
  pointsLabel: string;
  tilesCompleted: number;
  linesCompleted: number;
  mvp: { person: WrappedPersonModel; shareLabel: string } | null;
  topGpEarner: { person: WrappedPersonModel; gpLabel: string } | null;
  biggestDrop: WrappedDropModel | null;
  /** Their points over time; null with fewer than two points to draw. */
  chart: WrappedChartModel | null;
  /** Superlative (CONTEXT.md) winners, a category with no votes left out. */
  superlatives: { category: string; winners: WrappedPersonModel[] }[];
}

/** One Team's Superlative winners, for The Bingo section's "every Team's winners" (CONTEXT.md). */
export interface WrappedTeamSuperlativesModel {
  teamId: string;
  teamName: string;
  color: string | null;
  superlatives: { category: string; winners: WrappedPersonModel[] }[];
}

export interface WrappedBingoModel {
  kind: "bingo";
  art: WrappedSectionArtModel;
  totalSubmissions: number;
  totalSubmissionsLabel: string;
  totalGpLabel: string;
  rarestDrop: WrappedDropModel | null;
  mostReacted: { drop: WrappedDropModel; reactionsLabel: string } | null;
  leaderboard: { teamId: string; name: string; color: string | null; placement: number; placementLabel: string; pointsLabel: string; isMine: boolean }[];
  /** Every Team's points over time; null with nothing to draw. */
  race: WrappedChartModel | null;
  /**
   * The draft's biggest Steal (CONTEXT.md); null without one. `positionLabel` counts Players, like `rankLabel`, so a Duo's
   * half reads the same as a single ("8th"): their pick drafted two.
   */
  steal: { person: WrappedPersonModel; teamName: string | null; positionLabel: string; rankLabel: string; placesBeatenLabel: string } | null;
  /** Null when nothing was reviewed. */
  moderation: {
    /** "89 reviews" */
    reviewedLabel: string;
    medianLabel: string | null;
    fastestLabel: string | null;
    withinHourLabel: string | null;
    busiestHourLabel: string | null;
    topReviewer: { person: WrappedPersonModel; reviewedLabel: string } | null;
    /** Highest rejection rate first: "who had to deal with the most nonsense". */
    reviewers: { person: WrappedPersonModel; rejectionLabel: string; reviewedLabel: string }[];
    banter: string | null;
    /** The "moderators" category's art and credits (CONTEXT.md "Credits"): who moderated the Bingo. */
    art: WrappedSectionArtModel;
  } | null;
  /** Every Team's Superlative winners; a Team with none is left out. */
  teamSuperlatives: WrappedTeamSuperlativesModel[];
}

export interface WrappedOutroModel {
  kind: "outro";
  art: WrappedSectionArtModel;
  bingoName: string;
  /**
   * The share cards, before the way out (CONTEXT.md "Wrapped"): a Player gets their Player and Team cards, anyone else
   * none. A card with nothing to show is left out, so this can be empty.
   */
  cards: WrappedShareCardModel[];
}

// Wrapped's share cards: images made in the viewer's browser (never on the server) from these display-ready values,
// through the WrappedShareCard slot. Every card is portrait 4:5, headed by the Bingo's name. Their contents are fixed: a
// Player can't pick what goes on one. A field without data is null (or an empty list).

/** A drop on a share card: shown with its item's wiki icon, never a Submission screenshot. */
export interface WrappedShareCardDropModel {
  key: string;
  itemName: string;
  /** The item's wiki icon (through the site's own cache); not every item has one, so draw it with a fallback. */
  iconUrl: string | null;
  /** "×3" for more than one, else null. */
  quantityLabel: string | null;
  /** "12.3m"; null for an item with no Drop value. Drawn with the Coins icon (`coinsIconUrl`). */
  gpLabel: string | null;
}

interface WrappedShareCardBase {
  /** Unique among the viewer's cards. */
  key: string;
  /** "Player card": the card's name, for its buttons and the image's alt text. */
  label: string;
  /** For the card's header. */
  bingoName: string;
  /** What the downloaded (or shared) PNG is called. */
  fileName: string;
  /** The OSRS Coins icon, for every GP figure on the card; draw the figure without it if it fails to load. */
  coinsIconUrl: string;
  /**
   * A still of the Bingo's Wrapped art (the first frame of a sticker) for a theme that decorates its cards with it:
   * the card's own section's first Category image (You, Team), else a side image. Null when the Bingo has no art.
   */
  artUrl: string | null;
}

/** The viewer's own card, titled with their name. */
export interface WrappedPlayerCardModel extends WrappedShareCardBase {
  kind: "player";
  name: string;
  avatarUrl: string;
  team: { name: string; color: string | null } | null;
  /** "with Zezima", for a Duo; else null. */
  partnerLabel: string | null;
  /** "Pick #7 · Round 2" (a Duo's halves share their pick), "Captain" for a Captain, else null. */
  draftLabel: string | null;
  /**
   * Their Points share, its part of the Team's points ("34% of Team", "<1% of Team"; null at none) and its ranks, as
   * separate badges: "Team #1 of 8" and "Bingo #3 of 42" (tied Players share a rank; the Bingo's is null in Wrapped
   * published before it was stored). Null when they scored nothing.
   */
  pointsShare: { shareLabel: string; teamPercentLabel: string | null; teamRankLabel: string; bingoRankLabel: string | null } | null;
  /** Their Total drop value ("1.2b"), labelled just "Drop value" on the card; null for none. */
  dropValueLabel: string | null;
  /** Approved Submissions ("48") against the Bingo average, above or below it ("2.1× avg", "0.5× avg"). Null at none. */
  submissions: { countLabel: string; comparisonLabel: string | null } | null;
  /** How many Achievements they earned; null for none. */
  achievementsLabel: string | null;
  /** EHB gained ("312.4"), only with Wise Old Man data; else null. */
  ehbLabel: string | null;
  /** The first 3 Titles they held, in Title priority order. */
  titles: { id: string; name: string }[];
  /** Their most valuable drop; `isLuckiest` when it's also their luckiest, then carrying its `luckLabel`. */
  topDrop: (WrappedShareCardDropModel & { isLuckiest: boolean; luckLabel: string | null }) | null;
  /** Their luckiest drop and how rare its luck was ("1 in 5,000"); null when it's the top drop (or they had none). */
  luckiestDrop: (WrappedShareCardDropModel & { luckLabel: string }) | null;
  /** Their driest streak: the first thing left out when the card runs out of room. */
  driestStreak: { boss: string; killsLabel: string; chanceLabel: string } | null;
}

export interface WrappedTeamCardModel extends WrappedShareCardBase {
  kind: "team";
  name: string;
  color: string | null;
  /** 1 = first (ties share one), for a medal colour; "1st of 4". */
  placement: number;
  placementLabel: string;
  pointsLabel: string;
  tilesCompleted: number;
  linesCompleted: number;
  /** Its Players' Drop value added up ("3.4b"); null at none, and in Wrapped published before it was stored. */
  dropValueLabel: string | null;
  /** The computed MVP (never a Superlative), with "34% of Team" (null in Wrapped published before it was stored). */
  mvp: { person: WrappedPersonModel; shareLabel: string; teamPercentLabel: string | null } | null;
  biggestDrop: (WrappedShareCardDropModel & { player: WrappedPersonModel | null }) | null;
  /** Up to 3, in the Bingo's category order, each with its winners (several for a tie); a category with no winner left out. */
  superlatives: { category: string; winners: WrappedPersonModel[] }[];
}

export type WrappedShareCardModel = WrappedPlayerCardModel | WrappedTeamCardModel;

export type WrappedSectionModel = WrappedIntroModel | WrappedYouModel | WrappedDuoModel | WrappedCaptainModel | WrappedModeratorModel | WrappedTeamModel | WrappedBingoModel | WrappedOutroModel;
export type WrappedSectionKind = WrappedSectionModel["kind"];

export interface WrappedModel {
  slug: string;
  bingoName: string;
  /** A Moderator's preview before it's published: computed just now, and nobody else can see it yet. */
  preview: boolean;
  /** "Published 17 Jan"; null for a preview. */
  publishedLabel: string | null;
  /** The side images: shown large beside the story's sections in turn, on wide screens only. */
  sideArt: WrappedArtFrames[];
  /** The story in order, with every section that has nothing to say left out. `label` names it in the progress indicator. */
  sections: { id: WrappedSectionKind; label: string; section: WrappedSectionModel }[];
  /**
   * The viewer reached the Outro on an earlier visit (remembered in their browser, per Bingo), so the page offers a
   * jump straight to the share cards. False on a first visit, and whenever the browser couldn't remember.
   */
  outroReachedBefore: boolean;
  /** `outroReached` remembers, for next time, that the viewer got to the Outro. */
  actions: { goToBoard(): void; goToRewind(): void; outroReached(): void };
}
