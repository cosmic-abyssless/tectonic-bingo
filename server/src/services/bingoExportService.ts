// Export/import a bingo's board + settings as a single portable document
// (issue #36) — for migrating a bingo's reusable setup across environments.
// Deliberately excludes anything environment-specific or user-identity-
// linked: teams, signups, submissions, moderators, WOM state, tile images
// (server-relative upload paths that wouldn't resolve elsewhere anyway).
// Import always creates a brand-new bingo — never overwrites an existing one.
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { BINGO_EXPORT_FORMAT_VERSION, type BingoExportDocument, type ExportNode } from "@bingo/shared";
import type { GraphNode, GraphNodeInput } from "@bingo/shared";
import * as schema from "../db/schema";
import { bingos } from "../db/schema";
import { ServiceError } from "./errors";
import * as bingoService from "./bingoService";
import * as boardService from "./boardService";
import * as signupService from "./signupService";
import { setNodeGates } from "./graphService";

type Db = BetterSQLite3Database<typeof schema>;

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function resolveGateLocal(realId: string | null, localIdByRealNodeId: Map<string, number>): number | null {
  if (!realId) return null;
  const local = localIdByRealNodeId.get(realId);
  if (local === undefined) {
    // Not expected in practice — the admin UI's only gate picker offers a
    // same-bingo sibling task — but a gate can technically reference any
    // node, including one outside the exported set (e.g. a line). Dropping
    // it is safer than exporting a reference nothing can resolve.
    console.warn(`[bingoExport] gate reference ${realId} points outside the exported node set — dropping it`);
    return null;
  }
  return local;
}

export function exportBingo(db: Db, bingoId: string): BingoExportDocument {
  const bingo = db.select().from(bingos).where(eq(bingos.id, bingoId)).get();
  if (!bingo) throw new ServiceError(404, "Bingo not found");

  const categoryRows = boardService.getCategories(db, bingoId);
  const categoryLocalByReal = new Map(categoryRows.map((c, i) => [c.id, i + 1]));

  const tileRows = boardService.getBoardTiles(db, bingoId);

  let nextLocalId = 1;
  const localIdByRealNodeId = new Map<string, number>();
  const flatNodes: { exportNode: ExportNode; graphNode: GraphNode }[] = [];

  function buildExportNode(node: GraphNode): ExportNode {
    const localId = nextLocalId++;
    localIdByRealNodeId.set(node.id, localId);
    const exportNode: ExportNode = {
      localId,
      kind: node.kind,
      label: node.label,
      description: node.description,
      notes: node.notes,
      points: node.points,
      minCount: node.minCount,
      quantity: node.quantity,
      itemName: node.itemName,
      pointsGateLocalId: null,
      submitGateLocalId: null,
      allowsPreLoad: node.allowsPreLoad,
      children: [],
    };
    flatNodes.push({ exportNode, graphNode: node });
    exportNode.children = node.children.map(buildExportNode);
    return exportNode;
  }

  const tiles = tileRows.map((t) => ({
    name: t.name,
    boardRow: t.boardRow,
    boardCol: t.boardCol,
    categoryLocalId: t.categoryId ? (categoryLocalByReal.get(t.categoryId) ?? null) : null,
    hasFreezePeriod: t.hasFreezePeriod,
    freezeDurationMinutes: t.freezeDurationMinutes,
    notes: t.notes,
    // The tile's own node is a bare ALL wrapper with no configurable fields — never exported itself.
    tasks: t.node.children.map(buildExportNode),
  }));

  // Pass 2: every node is now assigned a localId, so gate references
  // (which can point anywhere in the bingo, not just a same-tile sibling)
  // can be resolved.
  for (const { exportNode, graphNode } of flatNodes) {
    exportNode.pointsGateLocalId = resolveGateLocal(graphNode.pointsGateNodeId, localIdByRealNodeId);
    exportNode.submitGateLocalId = resolveGateLocal(graphNode.submitGateNodeId, localIdByRealNodeId);
  }

  const lines = boardService
    .getBoardLines(db, bingoId)
    .filter((l): l is typeof l & { lineType: "row" | "column" | "diagonal" } => l.lineType !== "custom") // "custom" has no creation path anywhere today
    .map((l) => ({ lineType: l.lineType, lineIndex: l.lineIndex, points: l.node.points }));

  const signupQuestions = signupService.getQuestions(db, bingoId).map((q) => ({
    prompt: q.prompt,
    type: q.type,
    optionsJson: q.optionsJson,
    required: q.required,
    sortOrder: q.sortOrder,
  }));

  return {
    formatVersion: BINGO_EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    bingo: {
      name: bingo.name,
      description: bingo.description,
      theme: bingo.theme,
      boardRows: bingo.boardRows,
      boardCols: bingo.boardCols,
      signupMode: bingo.signupMode,
      buyinAmount: bingo.buyinAmount,
      bonusPotAmount: bingo.bonusPotAmount,
      rulesMarkdown: bingo.rulesMarkdown,
    },
    categories: categoryRows.map((c) => ({ localId: categoryLocalByReal.get(c.id)!, label: c.label, colorHex: c.colorHex, sortOrder: c.sortOrder })),
    tiles,
    lines,
    signupQuestions,
  };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

function assertValidDocument(doc: BingoExportDocument): void {
  if (doc.formatVersion > BINGO_EXPORT_FORMAT_VERSION) {
    throw new ServiceError(400, `This file was exported from a newer version of tectonic-bingo (format v${doc.formatVersion}) — update the app before importing it.`);
  }
  if (!doc.bingo || typeof doc.bingo.boardRows !== "number" || typeof doc.bingo.boardCols !== "number") {
    throw new ServiceError(400, "Malformed import file: missing bingo settings");
  }
  if (!Array.isArray(doc.categories) || !Array.isArray(doc.tiles) || !Array.isArray(doc.lines) || !Array.isArray(doc.signupQuestions)) {
    throw new ServiceError(400, "Malformed import file: expected categories/tiles/lines/signupQuestions arrays");
  }
  for (const t of doc.tiles) {
    if (t.boardRow < 0 || t.boardRow >= doc.bingo.boardRows || t.boardCol < 0 || t.boardCol >= doc.bingo.boardCols) {
      throw new ServiceError(400, `Malformed import file: tile "${t.name}" is positioned outside the declared board dimensions`);
    }
  }
}

function toGraphNodeInput(node: ExportNode): GraphNodeInput {
  return {
    kind: node.kind,
    label: node.label,
    description: node.description,
    notes: node.notes,
    points: node.points,
    minCount: node.minCount ?? undefined,
    quantity: node.quantity ?? undefined,
    itemName: node.itemName,
    allowsPreLoad: node.allowsPreLoad,
    children: node.children.map(toGraphNodeInput),
    // Gates are deliberately omitted — a gate can reference a node created
    // later (anywhere in the bingo), so they're resolved in a second pass
    // once every node has a real id. See setNodeGates below.
  };
}

function resolveLocalOrThrow(localId: number | null, nodeIdByLocal: Map<number, string>): string | null {
  if (localId === null) return null;
  const real = nodeIdByLocal.get(localId);
  if (real === undefined) throw new ServiceError(400, `Malformed import file: gate reference to unknown node ${localId}`);
  return real;
}

export interface ImportBingoParams {
  slug: string;
  name?: string;
  createdByUserId: string;
}

export function importBingo(db: Db, doc: BingoExportDocument, params: ImportBingoParams) {
  assertValidDocument(doc);

  return db.transaction((tx) => {
    const bingo = bingoService.createBingo(tx, {
      slug: params.slug,
      name: params.name?.trim() || doc.bingo.name,
      description: doc.bingo.description ?? undefined,
      theme: doc.bingo.theme,
      boardRows: doc.bingo.boardRows,
      boardCols: doc.bingo.boardCols,
      createdByUserId: params.createdByUserId,
      source: "import",
    });
    bingoService.updateBingoSettings(tx, bingo.id, {
      signupMode: doc.bingo.signupMode,
      buyinAmount: doc.bingo.buyinAmount,
      bonusPotAmount: doc.bingo.bonusPotAmount,
      rulesMarkdown: doc.bingo.rulesMarkdown,
    });

    const categoryIdByLocal = new Map<number, string>();
    for (const c of doc.categories) {
      const category = boardService.createCategory(tx, { bingoId: bingo.id, label: c.label, colorHex: c.colorHex, sortOrder: c.sortOrder });
      categoryIdByLocal.set(c.localId, category.id);
    }

    // Pass 1: create every tile and its task tree, gates stripped (a gate
    // may reference a node in a tile not yet created).
    const nodeIdByLocal = new Map<number, string>();
    const pendingGates: { realNodeId: string; pointsGateLocalId: number | null; submitGateLocalId: number | null }[] = [];

    function mapCreatedNode(exportNode: ExportNode, createdNode: GraphNode): void {
      nodeIdByLocal.set(exportNode.localId, createdNode.id);
      if (exportNode.pointsGateLocalId !== null || exportNode.submitGateLocalId !== null) {
        pendingGates.push({ realNodeId: createdNode.id, pointsGateLocalId: exportNode.pointsGateLocalId, submitGateLocalId: exportNode.submitGateLocalId });
      }
      // createTask's returned tree preserves input child order (insertSubtree
      // assigns sortOrder by array index; getNodeTree sorts by the same
      // field), so parallel-walking both trees by index is safe.
      exportNode.children.forEach((child, i) => mapCreatedNode(child, createdNode.children[i]!));
    }

    for (const t of doc.tiles) {
      if (t.categoryLocalId !== null && !categoryIdByLocal.has(t.categoryLocalId)) {
        throw new ServiceError(400, `Malformed import file: tile "${t.name}" references an unknown category`);
      }
      const tile = boardService.createTile(tx, {
        bingoId: bingo.id,
        name: t.name,
        boardRow: t.boardRow,
        boardCol: t.boardCol,
        categoryId: t.categoryLocalId !== null ? categoryIdByLocal.get(t.categoryLocalId)! : null,
        hasFreezePeriod: t.hasFreezePeriod,
        freezeDurationMinutes: t.freezeDurationMinutes,
        notes: t.notes,
      });
      t.tasks.forEach((task, i) => {
        const created = boardService.createTask(tx, tile.id, toGraphNodeInput(task), i);
        mapCreatedNode(task, created);
      });
    }

    // Pass 2: every node now has a real id — resolve gates.
    for (const gate of pendingGates) {
      setNodeGates(tx, gate.realNodeId, {
        pointsGateNodeId: resolveLocalOrThrow(gate.pointsGateLocalId, nodeIdByLocal),
        submitGateNodeId: resolveLocalOrThrow(gate.submitGateLocalId, nodeIdByLocal),
      });
    }

    // Lines are deterministic from board dimensions + tile positions —
    // regenerate the structure, then apply each line's exact exported points.
    boardService.generateLines(tx, bingo, 15);
    const createdLines = boardService.getLines(tx, bingo.id);
    const lineIdByKey = new Map(createdLines.map((l) => [`${l.lineType}:${l.lineIndex}`, l.id]));
    for (const line of doc.lines) {
      const lineId = lineIdByKey.get(`${line.lineType}:${line.lineIndex}`);
      if (lineId) boardService.updateLinePoints(tx, lineId, line.points);
    }

    for (const q of doc.signupQuestions) {
      signupService.createQuestion(tx, { bingoId: bingo.id, prompt: q.prompt, type: q.type, optionsJson: q.optionsJson, required: q.required, sortOrder: q.sortOrder });
    }

    return bingo;
  });
}
