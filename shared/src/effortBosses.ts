// Effort bosses (CONTEXT.md "Effort"): the Wise Old Man bosses a Part's Effort is counted at. A Part's bosses are
// derived from its Items (the bosses Luck knows drop them), plus any an Admin adds, less any an Admin removes, on the
// Part itself or on its whole Tile. Never shown to Players: only the board editor reads them.

/** "add" adds a boss the Items don't derive; "remove" takes a derived (or Tile-added) boss away. */
export type EffortBossMode = "add" | "remove";

/** An Admin's change to a Tile's or a Part's bosses. Exactly one of tileId and partId is set. */
export interface EffortBoss {
  id: string;
  tileId: string | null;
  /** The Part's node id. */
  partId: string | null;
  /** A Wise Old Man boss metric (WomBossMetric). */
  metric: string;
  mode: EffortBossMode;
}

/** The board editor's Effort bosses: every add/remove row, and each Part's bosses derived from its Items. */
export interface BoardEffortBossesResponse {
  bosses: EffortBoss[];
  derived: { partId: string; metrics: string[] }[];
}

/** What the board editor adds to a Tile or a Part. */
export interface AddEffortBossRequest {
  metric: string;
  mode: EffortBossMode;
}

/**
 * A Part's effective bosses (CONTEXT.md "Effort"): derived ∪ added(Tile) ∪ added(Part) − removed(Tile) − removed(Part).
 * The server counts Effort with it and the board editor shows it, so both read the rule from here.
 */
export function effectiveEffortBosses(derived: readonly string[], tileRows: readonly EffortBoss[], partRows: readonly EffortBoss[]): string[] {
  const rows = [...tileRows, ...partRows];
  const removed = new Set(rows.filter((r) => r.mode === "remove").map((r) => r.metric));
  const metrics = new Set([...derived, ...rows.filter((r) => r.mode === "add").map((r) => r.metric)]);
  return [...metrics].filter((m) => !removed.has(m)).sort();
}
