// What the generator knows about the board: the tiles, parts and lines as the server serves them, how hard each
// part is, what a team has to submit to finish one, and which claims the server would accept right now.
import type { BoardLine, GraphNode, Tile } from "@bingo/shared";
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

export function buildBoard(tiles: Tile[], boardLines: BoardLine[]): BoardInfo {
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
      const target = node.quantity ?? 1;
      const items = node.children.filter((c) => c.kind === "ITEM");
      if (items.length === 0) return [];
      const units: Claim[][] = [];
      let remaining = target;
      while (remaining > 0) {
        const item = rng.pick(items);
        // Stackables come in bunches now and then.
        const quantity = remaining >= 2 && rng.chance(0.15) ? Math.min(remaining, rng.int(2, 3)) : 1;
        units.push([{ nodeId: item.id, itemName: item.itemName ?? undefined, quantity }]);
        remaining -= quantity;
      }
      return bundle(units, rng);
    }
  }
}

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
