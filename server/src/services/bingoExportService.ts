// Export/import a bingo's board + settings as a single portable document
// (issue #36) — for migrating a bingo's reusable setup across environments.
// Deliberately excludes anything environment-specific or user-identity-
// linked: teams, signups, submissions, moderators, WOM state. Tile images
// are embedded (base64) only when asked for — never as the server-relative
// upload path, which wouldn't resolve elsewhere.
// Import always creates a brand-new bingo — never overwrites an existing one.
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { BINGO_EXPORT_FORMAT_VERSION, CUT_MODES, type BingoExportDocument, type ExportNode } from "@bingo/shared";
import type { GraphNode, GraphNodeInput } from "@bingo/shared";
import * as schema from "../db/schema";
import { bingos, nodeEdges } from "../db/schema";
import { ServiceError } from "./errors";
import * as bingoService from "./bingoService";
import * as boardService from "./boardService";
import * as signupService from "./signupService";
import { setNodeGates } from "./graphService";
import { decodeExportImage, readTileImage, removeFiles, storeTileImage, type DecodedImage } from "./exportImages";
import { log } from "../log";

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
    log.warn("bingo export dropped gate", { realId });
    return null;
  }
  return local;
}

export interface ExportOptions {
  /** Embed each tile's image, read from `<uploadsDir>/tiles`. Without it, no images are exported. */
  uploadsDir?: string;
}

export function exportBingo(db: Db, bingoId: string, options: ExportOptions = {}): BingoExportDocument {
  const bingo = db.select().from(bingos).where(eq(bingos.id, bingoId)).get();
  if (!bingo) throw new ServiceError(404, "Bingo not found");

  const categoryRows = boardService.getCategories(db, bingoId);
  const categoryLocalByReal = new Map(categoryRows.map((c, i) => [c.id, i + 1]));

  const tileRows = boardService.getBoardTiles(db, bingoId);

  let nextLocalId = 1;
  const localIdByRealNodeId = new Map<string, number>();
  const flatNodes: { exportNode: ExportNode; graphNode: GraphNode }[] = [];

  function buildExportNode(node: GraphNode): ExportNode {
    const met = localIdByRealNodeId.get(node.id);
    if (met !== undefined) {
      // A node with more than one parent, met again: refer back to the copy already
      // written (see ExportNode.reuse) rather than exporting it twice.
      return {
        localId: met, kind: node.kind, label: node.label, description: node.description, notes: node.notes, points: node.points,
        minCount: node.minCount, quantity: node.quantity, itemName: node.itemName, pointsGateLocalId: null, submitGateLocalId: null,
        allowsPreLoad: node.allowsPreLoad, reuse: true, children: [],
      };
    }
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
      valuedAs: node.valuedAs,
      children: [],
    };
    flatNodes.push({ exportNode, graphNode: node });
    exportNode.children = node.children.map(buildExportNode);
    return exportNode;
  }

  const imageField = (imageUrl: string | null) => {
    const image = options.uploadsDir && imageUrl ? readTileImage(options.uploadsDir, imageUrl) : null;
    return image ? { image } : {};
  };

  const tiles = tileRows.map((t) => ({
    name: t.name,
    boardRow: t.boardRow,
    boardCol: t.boardCol,
    categoryLocalId: t.categoryId ? (categoryLocalByReal.get(t.categoryId) ?? null) : null,
    hasFreezePeriod: t.hasFreezePeriod,
    freezeDurationMinutes: t.freezeDurationMinutes,
    notes: t.notes,
    // The tile's own node is an ALL wrapper: never exported itself, but its points are the
    // full-completion bonus, and its children are the tasks.
    bonusPoints: t.node.points,
    ...imageField(t.imageUrl),
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
    helperText: q.helperText,
    type: q.type,
    optionsJson: q.optionsJson,
    required: q.required,
    sortOrder: q.sortOrder,
    visibility: q.visibility,
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
      cutMode: bingo.cutMode,
      warnLeftovers: bingo.warnLeftovers,
      buyinAmount: bingo.buyinAmount,
      bonusPotAmount: bingo.bonusPotAmount,
      rulesMarkdown: bingo.rulesMarkdown,
      exclusivityRules: bingoService.parseExclusivityRules(bingo.exclusivityRulesJson),
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
  if (doc.bingo.cutMode !== undefined && !(CUT_MODES as readonly string[]).includes(doc.bingo.cutMode)) {
    throw new ServiceError(400, "Malformed import file: unknown cut mode");
  }
  if (doc.bingo.leftoverMode !== undefined && doc.bingo.leftoverMode !== "cut" && doc.bingo.leftoverMode !== "singles") {
    throw new ServiceError(400, "Malformed import file: unknown leftover mode");
  }
  if (doc.bingo.exclusivityRules !== undefined) bingoService.normalizeExclusivityRules(doc.bingo.exclusivityRules);
  for (const t of doc.tiles) {
    if (t.bonusPoints !== undefined && (!Number.isInteger(t.bonusPoints) || t.bonusPoints < 0)) {
      throw new ServiceError(400, `Malformed import file: tile "${t.name}" has an invalid bonus`);
    }
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
    valuedAs: node.valuedAs ?? null,
    // A `reuse` stub isn't created (it is an already-created node's other parent linking to it,
    // done after creation: see the linking step in importBingo).
    children: node.children.filter((c) => !c.reuse).map(toGraphNodeInput),
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

/**
 * Imports a document that may carry tile images. Files can't be part of the database transaction,
 * so: check every image first (nothing is written for a document with a bad one), write the files,
 * then run the import, and delete what was written if that fails.
 */
export async function importBingoWithImages(db: Db, doc: BingoExportDocument, params: ImportBingoParams, uploadsDir: string) {
  assertValidDocument(doc);
  const decoded: [number, DecodedImage][] = [];
  for (const [i, tile] of doc.tiles.entries()) {
    if (tile.image !== undefined) decoded.push([i, await decodeExportImage(tile.image, tile.name)]);
  }
  if (decoded.length === 0) return importBingo(db, doc, params);

  const written: string[] = [];
  try {
    const imageUrls = new Map<number, string>();
    for (const [i, image] of decoded) {
      const stored = await storeTileImage(uploadsDir, image);
      written.push(...stored.files);
      imageUrls.set(i, stored.url);
    }
    return importBingo(db, doc, params, imageUrls);
  } catch (err) {
    removeFiles(written);
    throw err;
  }
}

/** `imageUrls`: the stored image for a tile, by its index in `doc.tiles` (see importBingoWithImages). */
export function importBingo(db: Db, doc: BingoExportDocument, params: ImportBingoParams, imageUrls?: ReadonlyMap<number, string>) {
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
      // Older files carry leftoverMode instead: "cut" was the remainder cut ("even"), "singles" drafted it last ("none").
      ...(doc.bingo.cutMode !== undefined
        ? { cutMode: doc.bingo.cutMode }
        : doc.bingo.leftoverMode !== undefined
          ? { cutMode: doc.bingo.leftoverMode === "singles" ? ("none" as const) : ("even" as const) }
          : {}),
      ...(doc.bingo.warnLeftovers !== undefined ? { warnLeftovers: doc.bingo.warnLeftovers } : {}),
      buyinAmount: doc.bingo.buyinAmount,
      bonusPotAmount: doc.bingo.bonusPotAmount,
      rulesMarkdown: doc.bingo.rulesMarkdown,
      ...(doc.bingo.exclusivityRules !== undefined ? { exclusivityRules: doc.bingo.exclusivityRules } : {}),
    });

    const categoryIdByLocal = new Map<number, string>();
    for (const c of doc.categories) {
      const category = boardService.createCategory(tx, { bingoId: bingo.id, label: c.label, colorHex: c.colorHex, sortOrder: c.sortOrder });
      categoryIdByLocal.set(c.localId, category.id);
    }

    // Pass 1: create every tile and its task tree, gates stripped (a gate
    // may reference a node in a tile not yet created).
    const nodeIdByLocal = new Map<number, string>();
    // Parents that have a `reuse` child: their full child order, to be rebuilt once every node exists.
    const reordered: { parentId: string; childLocalIds: number[] }[] = [];
    const pendingGates: { realNodeId: string; pointsGateLocalId: number | null; submitGateLocalId: number | null }[] = [];

    function mapCreatedNode(exportNode: ExportNode, createdNode: GraphNode): void {
      nodeIdByLocal.set(exportNode.localId, createdNode.id);
      if (exportNode.pointsGateLocalId !== null || exportNode.submitGateLocalId !== null) {
        pendingGates.push({ realNodeId: createdNode.id, pointsGateLocalId: exportNode.pointsGateLocalId, submitGateLocalId: exportNode.submitGateLocalId });
      }
      // createTask's returned tree preserves input child order (insertSubtree
      // assigns sortOrder by array index; getNodeTree sorts by the same
      // field), so parallel-walking both trees by index is safe: over the
      // children that were created, i.e. without the `reuse` stubs.
      if (exportNode.children.some((c) => c.reuse)) reordered.push({ parentId: createdNode.id, childLocalIds: exportNode.children.map((c) => c.localId) });
      exportNode.children.filter((c) => !c.reuse).forEach((child, i) => mapCreatedNode(child, createdNode.children[i]!));
    }

    for (const [tileIndex, t] of doc.tiles.entries()) {
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
        imageUrl: imageUrls?.get(tileIndex) ?? null,
      });
      if (t.bonusPoints) boardService.updateTileBonusPoints(tx, tile.id, t.bonusPoints);
      if (t.tasks.some((task) => task.reuse)) reordered.push({ parentId: tile.nodeId, childLocalIds: t.tasks.map((task) => task.localId) });
      t.tasks
        .filter((task) => !task.reuse)
        .forEach((task, i) => {
          const created = boardService.createTask(tx, tile.id, toGraphNodeInput(task), i);
          mapCreatedNode(task, created);
        });
    }

    // Link the nodes that have more than one parent: every node exists now, so each parent that
    // had a `reuse` child gets its edges rebuilt in the exported order, the shared node included.
    for (const { parentId, childLocalIds } of reordered) {
      tx.delete(nodeEdges).where(eq(nodeEdges.parentId, parentId)).run();
      childLocalIds.forEach((localId, i) => {
        const childId = nodeIdByLocal.get(localId);
        if (childId === undefined) throw new ServiceError(400, `Malformed import file: reference to unknown node ${localId}`);
        tx.insert(nodeEdges).values({ parentId, childId, sortOrder: i }).run();
      });
    }

    // Pass 2: every node now has a real id — resolve gates.
    for (const gate of pendingGates) {
      setNodeGates(tx, gate.realNodeId, {
        pointsGateNodeId: resolveLocalOrThrow(gate.pointsGateLocalId, nodeIdByLocal),
        submitGateNodeId: resolveLocalOrThrow(gate.submitGateLocalId, nodeIdByLocal),
      });
    }

    // Lines are deterministic from board dimensions + tile positions — regenerate the
    // structure, then apply each line's exact exported points. But a bingo can have any subset
    // of them (none yet, or some deleted one by one), and the import must not add bonuses the
    // source never had: with no lines in the file, don't generate any; otherwise generate them
    // all and drop the ones the file doesn't list.
    if (doc.lines.length > 0) {
      boardService.generateLines(tx, bingo, 15);
      const wanted = new Map(doc.lines.map((l) => [`${l.lineType}:${l.lineIndex}`, l.points]));
      for (const line of boardService.getLines(tx, bingo.id)) {
        const points = wanted.get(`${line.lineType}:${line.lineIndex}`);
        if (points === undefined) boardService.deleteLine(tx, line.id);
        else boardService.updateLinePoints(tx, line.id, points);
      }
    }

    for (const q of doc.signupQuestions) {
      signupService.createQuestion(tx, { bingoId: bingo.id, prompt: q.prompt, helperText: q.helperText ?? null, type: q.type, optionsJson: q.optionsJson, required: q.required, sortOrder: q.sortOrder, visibility: q.visibility ?? "captains" });
    }

    return bingo;
  });
}
