// The Cut review modal's editable plan (CONTEXT.md "Cut review"): one row per proposed change, which the admin can
// re-point (a different partner, a different pair to split), complete (an added Team's Captain, which Team goes) or
// drop, and the change lists that get scored and applied from it. Pure, so it's unit-tested without the modal.
import type { AppliedCutChange, CutChange, CutReviewPool } from "@bingo/shared";

export type CutReviewRow = { id: string; dropped: boolean } & (
  | { kind: "pair"; userIds: [string, string] }
  | { kind: "split"; pairingId: string }
  // Nothing is suggested for a Team change: its pick starts blank (null) whatever the plan says.
  | { kind: "addTeam"; captainUserId: string | null }
  | { kind: "removeTeam"; teamId: string | null }
);

export function rowsFromPlan(changes: CutChange[]): CutReviewRow[] {
  return changes.map((change, i): CutReviewRow => {
    const id = `change-${i}`;
    switch (change.kind) {
      case "pair":
        return { id, dropped: false, kind: "pair", userIds: change.userIds };
      case "split":
        return { id, dropped: false, kind: "split", pairingId: change.pairingId };
      case "addTeam":
        return { id, dropped: false, kind: "addTeam", captainUserId: null };
      case "removeTeam":
        return { id, dropped: false, kind: "removeTeam", teamId: null };
    }
  });
}

const live = (rows: CutReviewRow[]) => rows.filter((r) => !r.dropped);

/** What to score: every row still in, with a Team change's pick when made (the score is then exact). */
export function scoredChanges(rows: CutReviewRow[]): CutChange[] {
  return live(rows).map((row): CutChange => {
    switch (row.kind) {
      case "pair":
        return { kind: "pair", userIds: row.userIds };
      case "split":
        return { kind: "split", pairingId: row.pairingId };
      case "addTeam":
        return row.captainUserId ? { kind: "addTeam", captainUserId: row.captainUserId } : { kind: "addTeam" };
      case "removeTeam":
        return row.teamId ? { kind: "removeTeam", teamId: row.teamId } : { kind: "removeTeam" };
    }
  });
}

/** What to apply, or null while a Team change still needs its pick (Apply stays disabled). Empty = keep these cuts. */
export function appliedChanges(rows: CutReviewRow[]): AppliedCutChange[] | null {
  const applied: AppliedCutChange[] = [];
  for (const row of live(rows)) {
    if (row.kind === "addTeam") {
      if (!row.captainUserId) return null;
      applied.push({ kind: "addTeam", captainUserId: row.captainUserId });
    } else if (row.kind === "removeTeam") {
      if (!row.teamId) return null;
      applied.push({ kind: "removeTeam", teamId: row.teamId });
    } else {
      applied.push(row.kind === "pair" ? { kind: "pair", userIds: row.userIds } : { kind: "split", pairingId: row.pairingId });
    }
  }
  return applied;
}

/**
 * Who can take `slot` of pair row `rowId`: any unpaired single not already in another live pair row, nor in this
 * row's other slot. The row's current choice is always among them. No player is ever in two rows.
 */
export function partnerChoices(rows: CutReviewRow[], rowId: string, slot: 0 | 1, pool: CutReviewPool): CutReviewPool["singles"] {
  const row = rows.find((r) => r.id === rowId);
  if (!row || row.kind !== "pair") return [];
  const taken = new Set(live(rows).flatMap((r) => (r.kind === "pair" && r.id !== rowId ? r.userIds : [])));
  taken.add(row.userIds[slot === 0 ? 1 : 0]);
  return pool.singles.filter((s) => !taken.has(s.userId));
}

/** Which pairs split row `rowId` can split instead: any pair not already split by another live row. */
export function splitChoices(rows: CutReviewRow[], rowId: string, pool: CutReviewPool): CutReviewPool["pairs"] {
  const taken = new Set(live(rows).flatMap((r) => (r.kind === "split" && r.id !== rowId ? [r.pairingId] : [])));
  return pool.pairs.filter((p) => !taken.has(p.pairingId));
}

/** Whether restoring dropped row `rowId` would put a player (or a pair) in two rows — while it would, it can't be. */
export function restoreConflicts(rows: CutReviewRow[], rowId: string): boolean {
  const row = rows.find((r) => r.id === rowId);
  if (!row || !row.dropped) return false;
  const others = live(rows).filter((r) => r.id !== rowId);
  if (row.kind === "pair") return others.some((r) => r.kind === "pair" && r.userIds.some((id) => row.userIds.includes(id)));
  if (row.kind === "split") return others.some((r) => r.kind === "split" && r.pairingId === row.pairingId);
  return false;
}

/** Drops row `rowId`, or restores it. */
export function setDropped(rows: CutReviewRow[], rowId: string, dropped: boolean): CutReviewRow[] {
  return rows.map((r) => (r.id === rowId ? { ...r, dropped } : r));
}

/** Pair row `rowId` with `slot` switched to `userId`. */
export function setPartner(rows: CutReviewRow[], rowId: string, slot: 0 | 1, userId: string): CutReviewRow[] {
  return rows.map((r) => {
    if (r.id !== rowId || r.kind !== "pair") return r;
    const userIds: [string, string] = [...r.userIds];
    userIds[slot] = userId;
    return { ...r, userIds };
  });
}

/** Split row `rowId` re-pointed at `pairingId`. */
export function setSplit(rows: CutReviewRow[], rowId: string, pairingId: string): CutReviewRow[] {
  return rows.map((r) => (r.id === rowId && r.kind === "split" ? { ...r, pairingId } : r));
}

/** A Team change's pick: an added Team's Captain, or which Team to remove. */
export function setTeamPick(rows: CutReviewRow[], rowId: string, id: string): CutReviewRow[] {
  return rows.map((r) => {
    if (r.id !== rowId) return r;
    if (r.kind === "addTeam") return { ...r, captainUserId: id };
    if (r.kind === "removeTeam") return { ...r, teamId: id };
    return r;
  });
}
