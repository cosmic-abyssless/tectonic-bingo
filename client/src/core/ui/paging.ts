import { useState } from "react";

// Long lists drawn a page at a time, with a Load more under them: the Mod panel's Submissions (issue #383) and the Team
// submissions drawer. Everything is still fetched at once; only the drawing is paged, since drawing hundreds of
// Submissions (each with its screenshot) is what's slow.

export const PAGE_SIZE = 25;

/** The first `shown` rows to draw, and how many are left for Load more. */
export function page<T>(rows: T[], shown: number): { rows: T[]; remaining: number } {
  return { rows: rows.slice(0, shown), remaining: Math.max(0, rows.length - shown) };
}

/** How many to draw so the row with this index is drawn too: whole pages, never fewer than already shown. */
export function shownToInclude(index: number, shown: number): number {
  return index < 0 ? shown : Math.max(shown, Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE);
}

/**
 * `rows` drawn a page at a time: the page's rows, how many are left, and `more` for the Load more. Back to the first
 * page whenever `resetKey` changes, e.g. a filter is picked or the list is opened again.
 */
export function useLoadMore<T>(rows: T[], resetKey: string): { rows: T[]; remaining: number; more: () => void } {
  const [state, setState] = useState({ key: resetKey, shown: PAGE_SIZE });
  const shown = state.key === resetKey ? state.shown : PAGE_SIZE;
  return { ...page(rows, shown), more: () => setState({ key: resetKey, shown: shown + PAGE_SIZE }) };
}
