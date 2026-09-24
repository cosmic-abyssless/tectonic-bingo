import { useCallback, useRef, useState } from "react";
import type { GridApi, GridReadyEvent, GridState, StateUpdatedEvent } from "ag-grid-community";

// The signup roster's persistence (core/mod/SignupRosterGrid.tsx) as a hook: column order, visibility, sizing
// and sort survive a reload, in localStorage under pref:gridState:<tableId>. Nothing else of GridState is kept.
//
// Pinned columns are always forced to the front of a saved order, in this order: a stale position for them can
// break the pinned section on load, and AG only restores sizing/sort for columns listed in the order, so they
// are kept in it rather than stripped out (see SignupRosterGrid's PINNED_COL_IDS for the history).

function pinnedFirst(state: GridState | undefined, pinned: readonly string[]): GridState | undefined {
  if (!state?.columnOrder) return state;
  const rest = state.columnOrder.orderedColIds.filter((id) => !pinned.includes(id));
  return { ...state, columnOrder: { orderedColIds: [...pinned, ...rest] } };
}

function readState(key: string, pinned: readonly string[]): GridState | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    const state = pinnedFirst(parsed && typeof parsed === "object" ? (parsed as GridState) : undefined, pinned);
    return state ? { ...state, partialColumnState: true } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Grid props that remember the user's column layout, plus the hidden set and a setter for ColumnPicker. Spread
 * `gridProps` onto the AgGridReact. Visibility lives in grid state only, so a column's colDef must not set `hide`.
 */
export function usePersistedGridState<T>(tableId: string, pinnedColIds: readonly string[]) {
  const key = `pref:gridState:${tableId}`;
  const [initialState] = useState(() => readState(key, pinnedColIds));
  const [hidden, setHiddenState] = useState<Set<string>>(() => new Set(initialState?.columnVisibility?.hiddenColIds ?? []));
  const apiRef = useRef<GridApi<T> | null>(null);

  const onGridReady = useCallback(
    (e: GridReadyEvent<T>) => {
      apiRef.current = e.api;
      e.api.applyColumnState({ state: pinnedColIds.map((colId) => ({ colId, pinned: "left" as const })) });
    },
    [pinnedColIds],
  );

  const onStateUpdated = useCallback(
    (e: StateUpdatedEvent<T>) => {
      const { columnVisibility, columnSizing, sort } = e.state;
      const { columnOrder } = pinnedFirst(e.state, pinnedColIds) ?? {};
      try {
        localStorage.setItem(key, JSON.stringify({ columnOrder, columnVisibility, columnSizing, sort }));
      } catch {
        // Private browsing / storage quota: persistence is a nicety, not required.
      }
      setHiddenState(new Set(columnVisibility?.hiddenColIds ?? []));
    },
    [key, pinnedColIds],
  );

  // ColumnPicker's setter: shows and hides through the grid, and onStateUpdated brings `hidden` back in line.
  const setHidden = useCallback(
    (next: Set<string>) => {
      const api = apiRef.current;
      if (!api) return;
      const toHide = [...next].filter((id) => !hidden.has(id));
      const toShow = [...hidden].filter((id) => !next.has(id));
      if (toHide.length) api.setColumnsVisible(toHide, false);
      if (toShow.length) api.setColumnsVisible(toShow, true);
    },
    [hidden],
  );

  return { gridProps: { initialState, maintainColumnOrder: true, onGridReady, onStateUpdated }, hidden, setHidden, apiRef };
}
