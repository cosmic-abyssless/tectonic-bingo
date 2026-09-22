// The signup roster's table, built on AG Grid Community (docs/ag-grid-tables-plan.md) rather than hand-rolled —
// see that plan for why (a hand-rolled table with rich per-row cells was slow to mount: profiling put ~270ms of a
// 63-row mount in per-row mutation hooks and react-aria controls, not the table mechanics). Everything not about
// the grid itself — the toolbar, filters, mutations, CSV export — stays in SignupRoster.tsx, which renders this.
//
// Phase 1 (this file, for now): read-only columns only. Search, filters, tooltips, interactive cells (buy-in,
// collected-by, partner, status) and state persistence land in later phases of the same plan.
import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, GetRowIdParams } from "ag-grid-community";
import type { RosterEntry } from "@bingo/shared";
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

// Fills its parent — the caller gives that parent a real height (AG's domLayout="normal" needs one; it isn't
// optional the way a plain <table>'s overflow-auto wrapper could get away with just a max-height).
export function SignupRosterGrid({ rows }: { rows: RosterRow[] }) {
  const columnDefs = useMemo<ColDef<RosterRow>[]>(
    () => [
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
    ],
    [],
  );

  const defaultColDef = useMemo<ColDef<RosterRow>>(() => ({ sortable: true, resizable: true, minWidth: 80 }), []);

  return (
    <div className="h-full min-h-0">
      <AgGridReact<RosterRow> theme={gridTheme} rowData={rows} getRowId={getRowId} columnDefs={columnDefs} defaultColDef={defaultColDef} animateRows={false} />
    </div>
  );
}
