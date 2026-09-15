// Portable export/import format for a bingo's board + settings (issue #36) —
// lets an admin migrate a bingo's setup across environments as a single
// file, without carrying over anything environment-specific (users, teams,
// signups, submissions, WOM state) or any secret.
//
// Versioning contract: bump BINGO_EXPORT_FORMAT_VERSION only for an actual
// breaking change. New fields should be added as optional with a safe
// default so every file this app has ever exported stays importable —
// server/src/services/bingoExportService.ts's importBingo() rejects a
// document whose formatVersion is newer than this build understands, but
// must keep reading every older version forever.
import type { NodeKind, SignupMode, SignupQuestionType } from "./index.ts";

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
  children: ExportNode[];
}

export interface ExportCategory {
  localId: number;
  label: string;
  colorHex: string | null;
  sortOrder: number;
}

export interface ExportTile {
  name: string;
  boardRow: number;
  boardCol: number;
  categoryLocalId: number | null;
  hasFreezePeriod: boolean;
  freezeDurationMinutes: number;
  notes: string | null;
  // The tile's own node is a bare ALL wrapper with no configurable fields —
  // never exported itself; these are that wrapper's children.
  tasks: ExportNode[];
}

export interface ExportLine {
  lineType: "row" | "column" | "diagonal";
  lineIndex: number;
  points: number;
}

export interface ExportSignupQuestion {
  prompt: string;
  type: SignupQuestionType;
  optionsJson: string | null;
  required: boolean;
  sortOrder: number;
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
    buyinAmount: number | null;
    bonusPotAmount: number;
    rulesMarkdown: string | null;
  };
  categories: ExportCategory[];
  tiles: ExportTile[];
  lines: ExportLine[];
  signupQuestions: ExportSignupQuestion[];
}
