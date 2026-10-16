import * as z from "zod";
import { NOT_RECORDED_HISTORICAL, type GraphNode } from "@bingo/shared";
import { getBoardLines, getBoardTiles, getCategories } from "../../services/boardService";
import { parseExclusivityRules } from "../../services/bingoService";
import { loadPieceValueRules, type PieceValueRule } from "../../services/gpValueService";
import { recordedFor } from "../../services/historicalService";
import { labelNodes } from "../../services/statsService";
import { defineTool } from "../tool";
import { bingoBySlug, bingoIdForSlug, fitList, LIST_BUDGET, round2, slugInput } from "./common";

/** The most characters of the Bingo's rules text an answer carries: one Bingo's rules have run to megabytes. */
const RULES_BUDGET = 40_000;

const LINE_ORDER = ["row", "column", "diagonal", "custom"];

/** How a Part or Task is completed, in the words the board uses (CONTEXT.md "Requirement Tree"). */
export function ruleOf(node: Pick<GraphNode, "kind" | "minCount" | "quantity">): string {
  switch (node.kind) {
    case "ALL":
      return "all of";
    case "ANY":
      return "any one of";
    case "COUNT":
      return `at least ${node.minCount ?? 1} of`;
    case "SUM":
      return `collect ${node.quantity ?? 1} in total (duplicates count)`;
    case "ITEM":
      return "item";
    case "MANUAL":
      return "manual (judged by a Moderator)";
  }
}

/** A Piece value as the rule reads, e.g. "Abyssal bludgeon ÷ 3" or "(Ultor ring − Berserker ring − 3× Chromium ingot) ÷ 1". */
function pieceFormula(rule: PieceValueRule): string {
  const times = (quantity: number, name: string) => (quantity > 1 ? `${quantity}× ${name}` : name);
  const whole = [times(rule.wholeQuantity, rule.wholeItemName), ...rule.otherPieces.map((o) => times(o.quantity, o.itemName))].join(" − ");
  if (rule.divisor === 1 && rule.otherPieces.length === 0) return whole;
  return `${rule.otherPieces.length ? `(${whole})` : whole} ÷ ${rule.divisor}`;
}

export const bingoBoard = defineTool({
  name: "bingo_board",
  title: "Bingo board",
  description:
    "One Bingo's published Board and what each Tile takes, for comparing Boards when planning. Each Tile, in board order (row and column count from 1): " +
    "its Category; freezeHours (its Freeze Period: no Team may submit to it for this many hours from the Bingo's start; absent when it has none); " +
    "proofScreenshot when every Player needs an approved Proof screenshot before their drops on the Tile count (note: what it must show); " +
    "rules, a Historical Bingo's own text for the Tile (a Historical Bingo that recorded no Parts gives the Tile's points as points, when the old site recorded them); bonusPoints for completing the whole Tile (absent when 0) and completesWhen, the rule over its Parts. " +
    "parts: the Tile's Parts (its pages or sections), each a tree of Tasks. Every Part and Task has rule (how it's completed: 'all of', 'any one of', " +
    "'at least N of' its Tasks, 'collect N in total (duplicates count)' adding up its Items' quantities, 'item' (one drop of the named Item) or 'manual (judged by a Moderator)'), " +
    "label, description, points (awarded when it completes), and when set: minCount, quantity (the total to collect), item, countsAs (what one of the Item adds to a 'collect N in total'), " +
    "pointsOnlyAfter (its points are withheld until that Part or Task is complete too, though it can complete earlier), submitOnlyAfter (Submissions to it are refused until that one is complete), " +
    "allowsPreLoad (Players may prepare it before the Bingo is Live, e.g. pre-load a chest), proofScreenshot (a Proof screenshot needed for this Part), notes (shown to Players on the Part), " +
    "valuedAs (its drops are priced as that item ÷ divisor; source says where they come from) and pieceValue (the site-wide rule pricing this item as a share of a whole one). " +
    "An Item under two Parts is listed under each, and a Submission counts toward both. " +
    "lines: every Line, its Tiles and its bonus. exclusiveItems: Exclusive Item rules (a Team may use each listed Item in one place only, a Tile or a Part per scope; " +
    "a group's items share one lock). rules: the Bingo's rules text (markdown), only with includeRules.",
  input: z.object({
    slug: slugInput,
    tile: z.string().optional().describe("Only Tiles whose name contains this text (any case). Lines and Exclusive Item rules are always whole."),
    includeRules: z.boolean().optional().describe("Also return the Bingo's rules text (markdown). Off by default: it is long."),
    limit: z.number().int().positive().optional().describe("At most this many Tiles."),
  }),
  bingoIdFor: bingoIdForSlug,
  run: ({ slug, tile: nameFilter, includeRules, limit }, { db, scope }) => {
    const bingo = bingoBySlug(db, slug, scope);
    const recorded = recordedFor(db, bingo);
    const tasksRecorded = !recorded || recorded.tasks;
    const boardTiles = getBoardTiles(db, bingo.id);
    const boardLines = getBoardLines(db, bingo.id);
    const categoryOf = new Map(getCategories(db, bingo.id).map((c) => [c.id, c.label]));
    const pieces = loadPieceValueRules(db);
    const tileNameByNodeId = new Map(boardTiles.map((t) => [t.nodeId, t.name]));

    // Gates can point anywhere on the board, so they're named as the Stats page names a Task: "ZULRAH — Page 1".
    const gateIds = new Set<string>();
    const collectGates = (node: GraphNode) => {
      if (node.pointsGateNodeId) gateIds.add(node.pointsGateNodeId);
      if (node.submitGateNodeId) gateIds.add(node.submitGateNodeId);
      node.children.forEach(collectGates);
    };
    boardTiles.forEach((t) => collectGates(t.node));
    const gateLabels = labelNodes(db, bingo.id, [...gateIds]);
    const gateLabel = (id: string) => gateLabels.get(id)?.label ?? "another Part";

    // Only what's set, so a big Board stays readable: false flags, nulls and counts-as 1 are left out.
    const requirement = (node: GraphNode, isPart: boolean): Record<string, unknown> => {
      const piece = node.kind === "ITEM" && node.itemName ? pieces.get(node.itemName.trim().toLowerCase()) : undefined;
      return {
        rule: ruleOf(node),
        ...(node.label ? { label: node.label } : {}),
        ...(node.description ? { description: node.description } : {}),
        ...(isPart && node.notes ? { notes: node.notes } : {}),
        points: node.points,
        ...(node.kind === "COUNT" ? { minCount: node.minCount ?? 1 } : {}),
        ...(node.kind === "SUM" ? { quantity: node.quantity ?? 1 } : {}),
        ...(node.itemName ? { item: node.itemName } : {}),
        ...(node.kind === "ITEM" && node.countsAs !== 1 ? { countsAs: node.countsAs } : {}),
        ...(node.pointsGateNodeId ? { pointsOnlyAfter: gateLabel(node.pointsGateNodeId) } : {}),
        ...(node.submitGateNodeId ? { submitOnlyAfter: gateLabel(node.submitGateNodeId) } : {}),
        ...(node.allowsPreLoad ? { allowsPreLoad: true } : {}),
        ...(node.requiresProof ? { proofScreenshot: { note: node.proofNote || null } } : {}),
        ...(node.valuedAs ? { valuedAs: node.valuedAs } : {}),
        ...(piece ? { pieceValue: pieceFormula(piece) } : {}),
        ...(node.children.length ? { tasks: node.children.map((c) => requirement(c, false)) } : {}),
      };
    };

    const out = boardTiles
      .filter((t) => !nameFilter || t.name.toLowerCase().includes(nameFilter.toLowerCase()))
      .sort((a, b) => a.boardRow - b.boardRow || a.boardCol - b.boardCol)
      .map((t) => ({
        tile: t.name,
        row: t.boardRow + 1,
        column: t.boardCol + 1,
        category: t.categoryId ? (categoryOf.get(t.categoryId) ?? null) : null,
        ...(t.hasFreezePeriod ? { freezeHours: round2(t.freezeDurationMinutes / 60) } : {}),
        ...(t.requiresProof ? { proofScreenshot: { note: t.proofNote || null } } : {}),
        ...(t.rulesText ? { rules: t.rulesText } : {}),
        ...(tasksRecorded
          ? { ...(t.node.points ? { bonusPoints: t.node.points } : {}), completesWhen: ruleOf(t.node), parts: t.node.children.map((c) => requirement(c, true)) }
          : // With no Parts recorded, the Tile's own points are all the old site gave (0 when it gave none).
            t.node.points
            ? { points: t.node.points }
            : {}),
      }));

    const lines = boardLines
      .sort((a, b) => LINE_ORDER.indexOf(a.lineType) - LINE_ORDER.indexOf(b.lineType) || a.lineIndex - b.lineIndex)
      .map((l) => ({
        line: `${l.lineType[0]!.toUpperCase()}${l.lineType.slice(1)} ${l.lineIndex + 1}`,
        bonus: l.node.points,
        tiles: l.node.children.map((c) => tileNameByNodeId.get(c.id) ?? c.label ?? "Tile"),
      }));
    const exclusive = parseExclusivityRules(bingo.exclusivityRulesJson).map((r) => ({
      label: r.label,
      scope: r.scope === "tile" ? "one Tile" : "one Part",
      items: r.itemNames,
      ...(r.groups?.length ? { groups: r.groups.map((g) => ({ label: g.label, items: g.itemNames })) } : {}),
    }));

    // The rules text, the Lines and the Exclusive Item rules come out of the one answer budget first; the Tiles get the rest.
    let rules: string | null = null;
    let rulesTruncated: string | null = null;
    if (includeRules && bingo.rulesMarkdown) {
      rules = bingo.rulesMarkdown.slice(0, RULES_BUDGET);
      if (rules.length < bingo.rulesMarkdown.length)
        rulesTruncated = `The rules text is cut at ${RULES_BUDGET} of its ${bingo.rulesMarkdown.length} characters.`;
    }
    const fittedLines = fitList(lines, undefined, "Every Line couldn't fit.", 20_000);
    const fittedExclusive = fitList(exclusive, undefined, "Every Exclusive Item rule couldn't fit.", 20_000);
    const used = (rules?.length ?? 0) + JSON.stringify(fittedLines.items).length + JSON.stringify(fittedExclusive.items).length;
    const fittedTiles = fitList(out, limit, "Pass `tile` to pick Tiles by name, or a smaller `limit`.", Math.max(10_000, LIST_BUDGET - used));
    const truncated = [
      fittedTiles.truncated,
      fittedLines.truncated && `Lines: ${fittedLines.truncated}`,
      fittedExclusive.truncated && `Exclusive Item rules: ${fittedExclusive.truncated}`,
      rulesTruncated,
    ].filter(Boolean);

    return {
      bingo: { slug: bingo.slug, name: bingo.name, stage: bingo.stage, historical: bingo.historical, rows: bingo.boardRows, columns: bingo.boardCols },
      ...(tasksRecorded
        ? {}
        : {
            parts: `${NOT_RECORDED_HISTORICAL}: this Bingo ran on another website, which recorded only each Tile's picture, points and rules text, not its Parts.`,
          }),
      tiles: fittedTiles.items,
      lines: fittedLines.items,
      exclusiveItems: fittedExclusive.items,
      ...(includeRules ? { rules } : {}),
      ...(truncated.length ? { truncated: truncated.join(" ") } : {}),
    };
  },
});
