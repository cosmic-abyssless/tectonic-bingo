// Portable export/import format for a bingo's board + settings (issue #36) —
// lets an admin migrate a bingo's setup across environments as a single
// file, without carrying over anything environment-specific (users, teams,
// signups, submissions, WOM state) or any secret.
//
// What is deliberately NOT in a document: teams, signups, submissions, moderators, the
// stage, every schedule date (they belong to one event), the Wise Old Man integration
// (its ids and verification code), and the global item groups (not scoped to a bingo).
// Tile images are in only when the export asked for them (ExportTile.image), never as
// the server-relative upload path. Everything else a bingo's admin can
// configure is; if you add a setting or a board field, add it here too, and to the
// round-trip test in bingoExportService.test.ts.
//
// Versioning contract: bump BINGO_EXPORT_FORMAT_VERSION only for an actual
// breaking change. New fields should be added as optional with a safe
// default so every file this app has ever exported stays importable —
// server/src/services/bingoExportService.ts's importBingo() rejects a
// document whose formatVersion is newer than this build understands, but
// must keep reading every older version forever.
import type { CutMode, LeftoverMode, NodeKind, QuestionVisibility, SignupMode, SignupQuestionType } from "./index.ts";
import type { ExclusivityRule } from "./exclusivity.ts";

export const BINGO_EXPORT_FORMAT_VERSION = 1;

// A node's real id is meaningless across a re-import (fresh rows, fresh
// UUIDs), but pointsGateNodeId/submitGateNodeId reference another node
// anywhere in the same bingo's graph — not necessarily a same-tile sibling.
// Every node in the document gets a synthetic, document-scoped localId so
// gates can be re-resolved after import assigns real ids. See
// bingoExportService.ts for the two-pass export/import algorithm.
export interface ExportNode {
  localId: number;
  kind: NodeKind;
  label: string | null;
  description: string | null;
  notes: string | null;
  points: number;
  minCount: number | null;
  quantity: number | null;
  itemName: string | null;
  pointsGateLocalId: number | null;
  submitGateLocalId: number | null;
  allowsPreLoad: boolean;
  /** Absent in files exported before Valued as existed. */
  valuedAs?: { itemName: string; divisor: number; source?: string | null } | null;
  /**
   * A node can have several parents (one requirement counting toward two tasks). It is
   * written out in full at the first place it is met, and everywhere else as a stub with
   * the same localId and `reuse: true` (its other fields and children are ignored): import
   * links the existing node in rather than making a copy that would count separately.
   * Absent in files exported before this existed, where every node is its own copy.
   */
  reuse?: boolean;
  children: ExportNode[];
}

export interface ExportCategory {
  localId: number;
  label: string;
  colorHex: string | null;
  sortOrder: number;
}

/**
 * A tile's artwork, embedded in the document: the original uploaded file, base64 encoded (the
 * display variants are rebuilt on import). `contentType` is informational: import checks what the
 * bytes really are, and accepts only PNG, JPEG, WebP and GIF, at most 5 MB each.
 */
export interface ExportImage {
  contentType: string;
  data: string;
}

export interface ExportTile {
  name: string;
  boardRow: number;
  boardCol: number;
  categoryLocalId: number | null;
  hasFreezePeriod: boolean;
  freezeDurationMinutes: number;
  notes: string | null;
  /**
   * Points for completing every task on the tile: stored as the `points` of the tile's own
   * node, an ALL wrapper otherwise never exported (its children are `tasks`). Absent in
   * older files, meaning no bonus.
   */
  bonusPoints?: number;
  /** Present only when the export included images and this tile has one. */
  image?: ExportImage;
  tasks: ExportNode[];
}

export interface ExportLine {
  lineType: "row" | "column" | "diagonal";
  lineIndex: number;
  points: number;
}

export interface ExportSignupQuestion {
  prompt: string;
  /** Absent in files exported before questions had helper text. */
  helperText?: string | null;
  type: SignupQuestionType;
  optionsJson: string | null;
  required: boolean;
  sortOrder: number;
  /** Absent in files exported before answers could be limited to mods/admins; imports as "captains". */
  visibility?: QuestionVisibility;
}

export interface BingoExportDocument {
  formatVersion: number;
  exportedAt: string; // ISO
  bingo: {
    name: string;
    description: string | null;
    theme: string;
    boardRows: number;
    boardCols: number;
    signupMode: SignupMode;
    /** Absent in older files: the app's defaults (even / off). */
    cutMode?: CutMode;
    /** Older files only, in place of cutMode: "cut" reads as "even", "singles" as "none". */
    leftoverMode?: LeftoverMode;
    warnLeftovers?: boolean;
    buyinAmount: number | null;
    bonusPotAmount: number;
    rulesMarkdown: string | null;
    /** Absent in older files: no exclusivity rules. */
    exclusivityRules?: ExclusivityRule[];
  };
  categories: ExportCategory[];
  tiles: ExportTile[];
  lines: ExportLine[];
  signupQuestions: ExportSignupQuestion[];
}
