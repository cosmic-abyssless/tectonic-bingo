// The signup roster's table, built on AG Grid Community (docs/ag-grid-tables-plan.md) rather than hand-rolled —
// see that plan for why (a hand-rolled table with rich per-row cells was slow to mount: profiling put ~270ms of a
// 63-row mount in per-row mutation hooks and react-aria controls, not the table mechanics). Everything not about
// the grid itself — the toolbar, filters, mutations, CSV export — stays in SignupRoster.tsx, which renders this.
//
// Phase 2 (docs/ag-grid-tables-plan.md): search (quickFilterText) and the buy-in/pair chips (an external filter)
// are the grid's own now, replacing the old client-side rosterSearchValues/matchesSearch pipeline. Tooltips show
// only when a cell's text is actually clipped. Question columns are read-only text, same as the rest here.
// Interactive cells (buy-in, collected-by, partner, status) and column-visibility/reorder state are phases 3-4.
import { useCallback, useMemo, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, GetRowIdParams, GridApi, GridReadyEvent, ModelUpdatedEvent } from "ag-grid-community";
import { formatSignupAnswer, type RosterEntry, type SignupQuestion } from "@bingo/shared";
import { gridTheme } from "../ui/agGrid";
import { discordName } from "../ui/user";
import { formatCaTier, formatWomStat } from "../signup/caStats";
import { timeAgo } from "../ui/time";

/** A roster entry plus its 1-based signup position — kept on the row (not derived from `rowIndex`) so sorting by
 * another column doesn't change what "#" shows. */
export interface RosterRow extends RosterEntry {
  order: number;
}

function getRowId(params: GetRowIdParams<RosterRow>): string {
  return params.data.signup.id;
}

// A custom signup question's prompt (the header) and its answers (the cells) are free text a mod writes/players
// fill in — either can run far longer than any other column. 12rem is a starting width, not a cap: a mod can
// still drag it wider to read a long answer in full (same reasoning as the old QUESTION_COLUMN_MAX_WIDTH, but as
// `width` rather than `maxWidth` — a maxWidth here blocked exactly that resize).
const QUESTION_COLUMN_WIDTH = 192;

export function SignupRosterGrid({
  rows,
  questions,
  search,
  doesRowPassFilters,
  onDisplayedCountChange,
}: {
  rows: RosterRow[];
  questions: SignupQuestion[];
  search: string;
  /** The buy-in/pair filter chips, as one predicate — see SignupRoster's matchesBuyin/matchesPair. */
  doesRowPassFilters: (row: RosterRow) => boolean;
  onDisplayedCountChange: (count: number) => void;
}) {
  const gridApiRef = useRef<GridApi<RosterRow> | null>(null);

  const columnDefs = useMemo<ColDef<RosterRow>[]>(() => {
    const staticCols: ColDef<RosterRow>[] = [
      { colId: "order", headerName: "#", valueGetter: (p) => p.data?.order, cellClass: "num", width: 70, sort: "asc", lockPosition: "left", suppressMovable: true },
      { colId: "rsn", headerName: "RSN", valueGetter: (p) => p.data?.signup.rsn, lockPosition: "left", suppressMovable: true },
      { colId: "discord", headerName: "Discord", valueGetter: (p) => (p.data ? discordName(p.data.user) : "") },
      {
        colId: "signedUp",
        headerName: "Signed up",
        valueGetter: (p) => p.data?.signup.createdAt,
        valueFormatter: (p) => (p.value ? timeAgo(p.value) : ""),
      },
      {
        colId: "ehb",
        headerName: "EHB",
        valueGetter: (p) => p.data?.womStats?.ehb ?? null,
        valueFormatter: (p) => formatWomStat(p.value ?? undefined),
        cellClass: "num",
      },
      {
        colId: "ehp",
        headerName: "EHP",
        valueGetter: (p) => p.data?.womStats?.ehp ?? null,
        valueFormatter: (p) => formatWomStat(p.value ?? undefined),
        cellClass: "num",
      },
      {
        colId: "caCurrent",
        headerName: "Current CA",
        // Numeric for sorting (-1 sorts "no data" below every real tier); the formatter still shows the tier name.
        valueGetter: (p) => p.data?.caCurrent?.points ?? -1,
        valueFormatter: (p) => formatCaTier(p.data?.caCurrent),
      },
      {
        colId: "caPeak",
        headerName: "Peak CA",
        valueGetter: (p) => p.data?.caPeak?.points ?? -1,
        valueFormatter: (p) => formatCaTier(p.data?.caPeak),
      },
    ];
    const questionCols: ColDef<RosterRow>[] = questions.map((q) => ({
      colId: q.id,
      headerName: q.prompt,
      width: QUESTION_COLUMN_WIDTH,
      valueGetter: (p) => {
        const answer = p.data?.answers.find((a) => a.questionId === q.id)?.value;
        return formatSignupAnswer(q.type, answer);
      },
    }));
    return [...staticCols, ...questionCols];
  }, [questions]);

  // tooltip/headerTooltip: true shows the cell's own formatted value / the header's own name — tooltipShowMode
  // "whenTruncated" (set on the grid below) means this only actually appears once that text is clipped, so it's
  // safe to turn on for every column rather than picking out "the wide ones".
  const defaultColDef = useMemo<ColDef<RosterRow>>(() => ({ sortable: true, resizable: true, minWidth: 80, tooltip: true, headerTooltip: true }), []);

  const onGridReady = useCallback(
    (e: GridReadyEvent<RosterRow>) => {
      gridApiRef.current = e.api;
      onDisplayedCountChange(e.api.getDisplayedRowCount());
    },
    [onDisplayedCountChange],
  );
  const onModelUpdated = useCallback((e: ModelUpdatedEvent<RosterRow>) => onDisplayedCountChange(e.api.getDisplayedRowCount()), [onDisplayedCountChange]);

  // The buy-in/pair chips: always "present" — doesRowPassFilters is a no-op (returns true for everyone) when both
  // are "all", so there's no need to toggle isExternalFilterPresent on and off. Re-run explicitly: changing which
  // function doesRowPassFilters *is* doesn't by itself make the grid re-evaluate rows against it.
  const isExternalFilterPresent = useCallback(() => true, []);
  const doesExternalFilterPass = useCallback((node: { data?: RosterRow }) => (node.data ? doesRowPassFilters(node.data) : true), [doesRowPassFilters]);
  const prevFilterRef = useRef(doesRowPassFilters);
  if (prevFilterRef.current !== doesRowPassFilters) {
    prevFilterRef.current = doesRowPassFilters;
    gridApiRef.current?.onFilterChanged();
  }

  return (
    <div className="h-full min-h-0">
      <AgGridReact<RosterRow>
        theme={gridTheme}
        rowData={rows}
        getRowId={getRowId}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        animateRows={false}
        onGridReady={onGridReady}
        onModelUpdated={onModelUpdated}
        quickFilterText={search}
        includeHiddenColumnsInQuickFilter
        isExternalFilterPresent={isExternalFilterPresent}
        doesExternalFilterPass={doesExternalFilterPass}
        tooltipShowMode="whenTruncated"
        tooltipShowDelay={200}
        tooltipHideDelay={4000}
        overlayNoRowsTemplate={search ? "No signups match this search." : "No signups match these filters."}
      />
    </div>
  );
}
