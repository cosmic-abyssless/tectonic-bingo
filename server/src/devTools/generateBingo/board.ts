// What the generator knows about the board: the tiles, parts and lines as the server serves them, how hard each
// part is, what a team has to submit to finish one, and which claims the server would accept right now.
import { exclusivityConflicts, normalizeItemName, placeLeaves, type BoardLine, type ExclusivityConflict, type ExclusivityRule, type GraphNode, type PlacedLeaf, type Tile } from "@bingo/shared";
import type { Rng } from "./rng";

export interface Claim {
  nodeId: string;
  itemName?: string;
  quantity?: number;
}

export interface PartModel {
  /** The part's own node id: also the task id hands are raised on and the id in a team's completed nodes. */
  id: string;
  tileId: string;
  tileName: string;
  label: string;
  /** 0 for Page 1, 1 for Page 2. */
  index: number;
  points: number;
  node: GraphNode;
  /** Player-hours a capable player needs to finish it, before a team's own scaling. */
  effort: number;
  /** The share of players who can do it at all. */
  eligible: number;
  /** Every leaf under it. */
  leafIds: string[];
}

export interface TileInfo {
  id: string;
  nodeId: string;
  name: string;
  row: number;
  col: number;
  parts: PartModel[];
  bonus: number;
  freezeMs: number;
}

export interface LineInfo {
  id: string;
  points: number;
  /** The tiles the line runs through. */
  tileIds: string[];
}

export interface BoardInfo {
  tiles: TileInfo[];
  parts: PartModel[];
  lines: LineInfo[];
  tileById: Map<string, TileInfo>;
  partById: Map<string, PartModel>;
  /** Parts no team can ever finish, and why (see deadlockedParts). */
  deadlocked: Map<string, string>;
  /** Whether the server would accept a claim on this leaf, given the nodes a team has completed. */
  claimable(leafId: string, completed: ReadonlySet<string>): boolean;
  /** The claims a team may not make under the bingo's exclusive-item rules, given the nodes it already has live claims on. */
  exclusivityConflicts(existing: Iterable<string>, candidates: string[]): ExclusivityConflict[];
}

/**
 * How long and how widely doable each tile is, by name. `effort` is player-hours for Page 1 (Page 2 takes
 * 2.5x unless `page2Effort` says otherwise) and `eligible` the share of players who can do it (`page2Eligible`
 * for Page 2). Tuned by hand for the Tectonic's Comics board; an unknown tile gets the default.
 */
interface Difficulty {
  effort: number;
  eligible: number;
  page2Effort?: number;
  page2Eligible?: number;
}
const DEFAULT_DIFFICULTY: Difficulty = { effort: 5, eligible: 0.7 };
const EVERYONE: Difficulty = { effort: 3, eligible: 0.95 };
const COMMON: Difficulty = { effort: 5, eligible: 0.8 };
const MEDIUM: Difficulty = { effort: 8, eligible: 0.55 };
const RAID: Difficulty = { effort: 6, eligible: 0.6 };
const HARD: Difficulty = { effort: 10, eligible: 0.4 };

export const DIFFICULTY: Record<string, Difficulty> = {
  "SLAYER BOSSES": EVERYONE,
  "WILDY ISSUE 1": EVERYONE,
  "WILDY ISSUE 2": EVERYONE,
  "BLOOD SHARDS (COMBAT ONLY)": EVERYONE,
  "DAGANNOTH KINGS": EVERYONE,
  ZULRAH: COMMON,
  GAUNTLET: COMMON,
  "GWD ISSUE 1": COMMON,
  "GWD ISSUE 2": COMMON,
  HUEYCOATL: COMMON,
  "DT2 ISSUE 1": COMMON,
  "DT2 ISSUE 2": MEDIUM,
  "DOUBLE FEATURE": MEDIUM,
  YAMA: MEDIUM,
  NIGHTMARE: MEDIUM,
  PETS: { effort: 6, eligible: 0.7 },
  "COX ISSUE 1": RAID,
  "TOA ISSUE 1": RAID,
  "TOB ISSUE 1": RAID,
  "COX ISSUE 2": HARD,
  "TOA ISSUE 2": HARD,
  NEX: HARD,
  "DOOM OF MOKHAIOTL": HARD,
  // Page 2 wants a Scythe or drops from the hard mode few people can do.
  "TOB ISSUE 2": { effort: 10, eligible: 0.4, page2Effort: 40, page2Eligible: 0.12 },
  COLOSSEUM: { effort: 8, eligible: 0.35 },
};

export function difficultyOf(tileName: string, partIndex: number): { effort: number; eligible: number } {
  const d = DIFFICULTY[tileName.toUpperCase()] ?? DEFAULT_DIFFICULTY;
  return partIndex === 0
    ? { effort: d.effort, eligible: d.eligible }
    : { effort: d.page2Effort ?? d.effort * 2.5, eligible: d.page2Eligible ?? d.eligible * 0.6 };
}

function collectLeaves(node: GraphNode, out: string[] = []): string[] {
  if (node.kind === "ITEM" || node.kind === "MANUAL") out.push(node.id);
  for (const child of node.children) collectLeaves(child, out);
  return out;
}

export function buildBoard(tiles: Tile[], boardLines: BoardLine[], rules: readonly ExclusivityRule[] = []): BoardInfo {
  const nodesById = new Map<string, GraphNode>();
  const parents = new Map<string, Set<string>>();
  const visit = (node: GraphNode) => {
    nodesById.set(node.id, node);
    for (const child of node.children) {
      if (!parents.has(child.id)) parents.set(child.id, new Set());
      parents.get(child.id)!.add(node.id);
      visit(child);
    }
  };
  for (const tile of tiles) visit(tile.node);

  // Mirrors the server (graphService.submitGateBlock): a claim is refused only when EVERY route from its item up
  // to the tile passes through a node whose submit gate the team hasn't completed. An item shared by two pages
  // counts toward both, so an ungated page keeps it submittable.
  const claimable = (leafId: string, completed: ReadonlySet<string>): boolean => {
    const memo = new Map<string, boolean>();
    const closed = (nodeId: string): boolean => {
      const known = memo.get(nodeId);
      if (known !== undefined) return known;
      const gate = nodesById.get(nodeId)?.submitGateNodeId;
      const above = [...(parents.get(nodeId) ?? [])];
      const result = (!!gate && !completed.has(gate)) || (above.length > 0 && above.every(closed));
      memo.set(nodeId, result);
      return result;
    };
    return !closed(leafId);
  };

  const tileInfos: TileInfo[] = tiles
    .slice()
    .sort((a, b) => a.boardRow - b.boardRow || a.boardCol - b.boardCol)
    .map((tile) => ({
      id: tile.id,
      nodeId: tile.node.id,
      name: tile.name,
      row: tile.boardRow,
      col: tile.boardCol,
      bonus: tile.node.points,
      freezeMs: tile.hasFreezePeriod ? tile.freezeDurationMinutes * 60_000 : 0,
      parts: tile.node.children.map((part, index): PartModel => {
        const d = difficultyOf(tile.name, index);
        return {
          id: part.id,
          tileId: tile.id,
          tileName: tile.name,
          label: part.label ?? `Part ${index + 1}`,
          index,
          points: part.points,
          node: part,
          effort: d.effort,
          eligible: d.eligible,
          leafIds: collectLeaves(part),
        };
      }),
    }));

  const tileIdByNodeId = new Map(tileInfos.map((t) => [t.nodeId, t.id]));
  const lines: LineInfo[] = boardLines.map((l) => ({
    id: l.id,
    points: l.node.points,
    tileIds: l.node.children.map((c) => tileIdByNodeId.get(c.id)).filter((id): id is string => !!id),
  }));

  const placed = rules.length > 0 ? placeLeaves(tiles) : new Map();
  const parts = tileInfos.flatMap((t) => t.parts);
  const deadlocked = deadlockedParts(parts, claimable);
  return {
    tiles: tileInfos,
    parts,
    lines,
    tileById: new Map(tileInfos.map((t) => [t.id, t])),
    partById: new Map(parts.map((p) => [p.id, p])),
    deadlocked,
    claimable,
    exclusivityConflicts: (existing, candidates) => exclusivityConflicts(rules, placed, existing, candidates),
  };
}

/**
 * Parts that can never be finished because of how the gates are wired. A fixed point: start with nothing
 * complete, and keep marking a part complete while at least one of its leaves is claimable. Whatever never
 * gets marked can't be started. (Two pages that share their items with Page 2 gated behind Page 1, as on
 * PETS and SLAYER BOSSES, are fine: the shared items are claimable through Page 1. That used to be a real
 * dead end on the server, fixed by graphService.submitGateBlock; the check stays as a guard for the board.)
 */
export function deadlockedParts(parts: PartModel[], claimable: (leafId: string, completed: ReadonlySet<string>) => boolean): Map<string, string> {
  const completed = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const part of parts) {
      if (completed.has(part.id)) continue;
      if (part.leafIds.some((leaf) => claimable(leaf, completed))) {
        completed.add(part.id);
        changed = true;
      }
    }
  }
  const stuck = new Map<string, string>();
  for (const part of parts) {
    if (!completed.has(part.id)) stuck.set(part.id, `${part.tileName} ${part.label}: every claim on its items is refused by a submit gate that can never open`);
  }
  return stuck;
}

/**
 * The submissions that would finish `part`, each a list of claims on one tile. Random where the requirement
 * leaves a choice (which item, how many at once), and shaped like real play: mostly one drop per screenshot.
 */
export function planSubmissions(node: GraphNode, rng: Rng): Claim[][] {
  switch (node.kind) {
    case "ITEM":
      return [[{ nodeId: node.id, itemName: node.itemName ?? undefined, quantity: 1 }]];
    case "MANUAL":
      return [[{ nodeId: node.id }]];
    case "ALL":
      return node.children.flatMap((c) => planSubmissions(c, rng));
    case "ANY": {
      const options = node.children;
      return options.length ? planSubmissions(rng.pick(options), rng) : [];
    }
    case "COUNT": {
      const need = Math.min(node.minCount ?? 1, node.children.length);
      const chosen = rng.shuffle(node.children).slice(0, need);
      return bundle(chosen.flatMap((c) => planSubmissions(c, rng)), rng);
    }
    case "SUM": {
      // Counted in the SUM's own units: an Item that counts as N (CONTEXT.md "Counts as") is N of them per drop, so
      // it takes fewer drops; the claim still says how many items were really dropped. An "any one of" group of Items
      // adds 1 at its first piece and is then done, so it isn't drawn again; a second piece of it is posted too, as a
      // Player who got one would, and adds nothing.
      const target = node.quantity ?? 1;
      const options = node.children.filter((c) => c.kind === "ITEM" || (c.kind === "ANY" && c.children.length > 0));
      const units: Claim[][] = [];
      let remaining = target;
      while (remaining > 0) {
        const open = options.filter((c) => c.kind === "ITEM" || !units.some((u) => c.children.some((piece) => piece.id === u[0]!.nodeId)));
        if (open.length === 0) break;
        const item = rng.pick(open);
        if (item.kind === "ANY") {
          for (const piece of rng.shuffle(item.children).slice(0, 2)) units.push([{ nodeId: piece.id, itemName: piece.itemName ?? undefined, quantity: 1 }]);
          remaining -= 1;
          continue;
        }
        const weight = Math.max(1, item.countsAs ?? 1);
        const stillNeeded = Math.ceil(remaining / weight);
        // Stackables come in bunches now and then.
        const quantity = stillNeeded >= 2 && rng.chance(0.15) ? Math.min(stillNeeded, rng.int(2, 3)) : 1;
        units.push([{ nodeId: item.id, itemName: item.itemName ?? undefined, quantity }]);
        remaining -= quantity * weight;
      }
      return bundle(units, rng);
    }
  }
}

/**
 * An Item to give a Counts as (CONTEXT.md), so a generated Bingo shows one even when its board has none: the last Item
 * of the first SUM over two or more Items with a total of at least 3, counting as a quarter of that total (from 2, at
 * most 25). Null when the board already has one, or has no such SUM. `tasks`: every Task on the board, in board order.
 */
export function itemToWeigh(tasks: GraphNode[]): { task: GraphNode; item: GraphNode; countsAs: number } | null {
  const walk = (n: GraphNode): GraphNode[] => [n, ...n.children.flatMap(walk)];
  const nodes = tasks.flatMap((task) => walk(task).map((node) => ({ task, node })));
  if (nodes.some(({ node }) => node.kind === "ITEM" && (node.countsAs ?? 1) !== 1)) return null;
  for (const { task, node } of nodes) {
    const items = node.children.filter((c) => c.kind === "ITEM");
    if (node.kind !== "SUM" || items.length < 2 || (node.quantity ?? 1) < 3) continue;
    return { task, item: items[items.length - 1]!, countsAs: Math.min(25, Math.max(2, Math.floor((node.quantity ?? 1) / 4))) };
  }
  return null;
}

/**
 * Items to put in an "any one of" group inside their SUM (CONTEXT.md "Requirement Tree"), so a generated Bingo shows one
 * even when its board has none, as an Admin capping a set of pieces would ("only 1 Bludgeon piece will be counted"):
 * the first three Items that count as 1 of the first SUM over at least three of them, leaving one or more outside the
 * group. Null when the board already has such a group, or has no such SUM. `tasks`: every Task on the board, in board order.
 */
export function itemsToGroup(tasks: GraphNode[]): { task: GraphNode; sum: GraphNode; items: GraphNode[] } | null {
  const walk = (n: GraphNode): GraphNode[] => [n, ...n.children.flatMap(walk)];
  const nodes = tasks.flatMap((task) => walk(task).map((node) => ({ task, node })));
  if (nodes.some(({ node }) => node.kind === "SUM" && node.children.some((c) => c.kind === "ANY"))) return null;
  for (const { task, node } of nodes) {
    const items = node.children.filter((c) => c.kind === "ITEM" && (c.countsAs ?? 1) === 1);
    if (node.kind !== "SUM" || items.length < 3) continue;
    return { task, sum: node, items: items.slice(0, Math.min(3, node.children.length - 1)) };
  }
  return null;
}

/** The id of the Exclusive Item rule the generator adds (chooseExclusiveGroup). */
export const GENERATED_GROUP_RULE_ID = "testdata-unique-pieces";

/** One Item of the board, as the exclusive group play claims it. */
export interface PlacedItem {
  nodeId: string;
  itemName: string;
  tileName: string;
}

/**
 * An Exclusive Item rule with a group, so a generated Bingo shows one even when its board has none: two Items with
 * different names on two different Tiles, both submittable from the start and on Tiles without a Freeze Period,
 * that no rule names yet, grouped as one "Unique piece" (one Tile). `first` is what the generated play claims and
 * `second` what it is then refused. Null when the board has no such pair.
 */
export function chooseExclusiveGroup(tiles: Tile[], rules: readonly ExclusivityRule[], rng: Rng): { rule: ExclusivityRule; first: PlacedItem; second: PlacedItem } | null {
  const ruled = new Set(rules.flatMap((r) => [...r.itemNames, ...(r.groups ?? []).flatMap((g) => g.itemNames)]).map(normalizeItemName));
  const frozen = new Set(tiles.filter((t) => t.hasFreezePeriod).map((t) => t.id));
  const { claimable, tiles: ordered } = buildBoard(tiles, []);
  // In board order and by name, not by node id (new on every import), so a seed picks the same Items each run.
  const position = new Map(ordered.map((t, i) => [t.id, i]));
  const open = [...placeLeaves(tiles).values()]
    .filter((l): l is PlacedLeaf & { itemName: string } => !!l.itemName?.trim() && !ruled.has(normalizeItemName(l.itemName)) && !frozen.has(l.tileId) && claimable(l.nodeId, new Set()))
    .sort((a, b) => position.get(a.tileId)! - position.get(b.tileId)! || a.itemName.localeCompare(b.itemName) || a.partLabels.join().localeCompare(b.partLabels.join()));
  const shuffled = rng.shuffle(open);
  for (const a of shuffled) {
    const b = shuffled.find((l) => l.tileId !== a.tileId && normalizeItemName(l.itemName) !== normalizeItemName(a.itemName));
    if (!b) continue;
    const itemNames = [a.itemName.trim(), b.itemName.trim()];
    return {
      rule: { id: GENERATED_GROUP_RULE_ID, label: "Unique pieces", itemNames, scope: "tile", groups: [{ label: "Unique piece", itemNames }] },
      first: { nodeId: a.nodeId, itemName: a.itemName, tileName: a.tileName },
      second: { nodeId: b.nodeId, itemName: b.itemName, tileName: b.tileName },
    };
  }
  return null;
}

/** The label a generated "any one of" group gets (see itemsToGroup): what it tells Players about it. */
export const GROUP_LABEL = "Counted once";

/** Sometimes two drops land in one screenshot: merges neighbours on different items into one submission. */
function bundle(units: Claim[][], rng: Rng): Claim[][] {
  const out: Claim[][] = [];
  for (const unit of units) {
    const last = out[out.length - 1];
    if (last && rng.chance(0.25) && !last.some((c) => unit.some((u) => u.nodeId === c.nodeId))) last.push(...unit);
    else out.push([...unit]);
  }
  return out;
}
