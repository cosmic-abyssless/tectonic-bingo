// The Draft board (CONTEXT.md "Draft board", "Published board", "Publish", #437): the Admins' working copy of a
// Bingo's Board, edited in the Board tab and applied to the Board everyone plays on by a Publish. Shapes of the admin
// draft endpoints (server/src/routes/admin.ts, services/boardDraftService.ts).
import type { ExclusivityRule } from "./exclusivity.ts";
import type { BoardResponse, TileCategory } from "./index.ts";

/** Whether a Bingo has unpublished changes, and who made the last one. Admins only. */
export interface BoardDraftStatus {
  /** True only while the Draft board differs from the Published board. */
  hasChanges: boolean;
  /** Changes with every edit; a Publish names the one it previewed. Null without changes. */
  revision: string | null;
  updatedAt: string | null;
  /** Who changed it last, named as in the Bingo. */
  updatedBy: { id: string; name: string } | null;
}

/** GET .../admin/board-draft: the board the editor shows, which is the Draft board while there is one, else the Published board. */
export interface DraftBoardResponse {
  board: BoardResponse;
  categories: TileCategory[];
  rulesMarkdown: string | null;
  exclusivityRules: ExclusivityRule[];
  status: BoardDraftStatus;
}

export type BoardChangeKind = "added" | "removed" | "changed";

/** One field of something that changed, as text: "Points" 40 → 60. Empty text for a value that wasn't there. */
export interface BoardFieldChange {
  field: string;
  before: string;
  after: string;
}

/**
 * A Part, Task or Item of a Tile that was added, removed or changed. `path` is where it sits in the Tile ("Page 1",
 * "Any of"), its own name excluded. An added or removed one is listed once, at its top: what's inside it comes with it,
 * summed up in `summary` ("Any of 3 Items · 10 pts").
 */
export interface BoardNodeChange {
  nodeId: string;
  change: BoardChangeKind;
  path: string[];
  name: string;
  summary: string | null;
  fields: BoardFieldChange[];
}

export interface BoardTileChange {
  tileId: string;
  change: BoardChangeKind;
  name: string;
  fields: BoardFieldChange[];
  nodes: BoardNodeChange[];
}

export interface BoardLineChange {
  lineId: string;
  change: BoardChangeKind;
  /** "Row 1", "Column 3", "Diagonal 2". */
  name: string;
  fields: BoardFieldChange[];
}

export interface BoardCategoryChange {
  categoryId: string;
  change: BoardChangeKind;
  name: string;
  fields: BoardFieldChange[];
}

/** Everything a Publish would change on the Published board. */
export interface BoardDiff {
  tiles: BoardTileChange[];
  lines: BoardLineChange[];
  categories: BoardCategoryChange[];
  exclusivityRules: { before: ExclusivityRule[]; after: ExclusivityRule[] } | null;
  rulesMarkdown: { before: string | null; after: string | null } | null;
}

/** Claims on Items the draft removes: they stop counting once it's published (their Submissions are kept). */
export interface RemovedClaimsWarning {
  claims: number;
  /** Of `claims`, those on Submissions still waiting for review. */
  pending: number;
  /** The removed Items they're on, by name. */
  items: string[];
}

/** A Tile or Part a Team completes on one board and not the other. */
export interface CompletionChange {
  kind: "tile" | "part";
  id: string;
  name: string;
  /** The Part's Tile; null for a Tile. */
  tileName: string | null;
}

/** One Team's points (Points share isn't previewed) before and after the Publish. */
export interface TeamScorePreview {
  teamId: string;
  teamName: string;
  color: string | null;
  before: number;
  after: number;
  gained: CompletionChange[];
  lost: CompletionChange[];
}

/** GET .../admin/board-draft/preview: what Publish would do. Publish names `revision` and is refused if the draft has changed since. */
export interface PublishPreview {
  revision: string;
  diff: BoardDiff;
  /** One line per kind of change ("2 Tiles changed", "Rules text changed"), for the audit entry and headings. */
  summary: string[];
  removedClaims: RemovedClaimsWarning;
  teams: TeamScorePreview[];
}

/** The ServiceError code of a Publish refused because the draft changed after its preview was made. */
export const STALE_PREVIEW_CODE = "stale_preview";
