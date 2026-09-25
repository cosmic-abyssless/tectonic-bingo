import { useMemo } from "react";
import { AgGridReact, type CustomCellRendererProps } from "ag-grid-react";
import type { ColDef, TooltipCallbackParams } from "ag-grid-community";
import { describeValuedAs, type GpDrop, type Team, type TeamGpGained, type ValuedAs } from "@bingo/shared";
import { useGridTheme } from "../ui/agGrid";
import { useIsPhone } from "../ui/useMediaQuery";
import { ColumnPicker } from "../ui/ColumnPicker";
import { usePersistedGridState } from "../ui/gridState";
import { headerTooltip, usefulTooltip } from "../ui/gridTooltips";
import { formatGp, formatGpExact } from "../ui/gp";
import { WikiIcon } from "../ui/ItemIcon";
import { WikiItemLink } from "../ui/WikiItemLink";
import { timeAgo } from "../ui/time";
import { displayName } from "../ui/user";
import { PlayerName } from "../tectonic/PlayerName";
import { FALLBACK_TEAM_COLOR } from "./PointsChart";
import { RepriceGpButton } from "../mod/RepriceGpButton";

type Row = GpDrop & { team: Team | null };

const PINNED = ["rank", "item"];
// ContributorsTable's sizing, so the two tables on the page line up; a long list scrolls inside MAX_HEIGHT.
const MAX_HEIGHT = 480;
const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 40;
const SCROLLBAR_HEIGHT = 18;
const FRAME_HEIGHT = 12;

function TeamDot({ color }: { color: string | null | undefined }) {
  return <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color ?? FALLBACK_TEAM_COLOR }} />;
}

// Where a drop valued as something else came from ("Vardorvis"), or failing that what it's valued as.
const valuedAsNote = (valuedAs: ValuedAs) => valuedAs.source || describeValuedAs(valuedAs);
const dropLabel = (drop: GpDrop) => `${drop.quantity > 1 ? `${drop.quantity}× ` : ""}${drop.itemName}${drop.valuedAs ? ` (${valuedAsNote(drop.valuedAs)})` : ""}`;

function ItemCell({ data }: CustomCellRendererProps<Row>) {
  if (!data) return null;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <WikiIcon name={data.itemName} />
      <span className="truncate text-on-surface">
        {data.quantity > 1 && <span className="num">{data.quantity}× </span>}
        <WikiItemLink name={data.itemName} />
        {/* Why an ordinary item (a DT2 boss's gold ring) is worth this much: its source, with the valuation on hover. */}
        {data.valuedAs && (
          <span className="ml-1 text-xs text-on-surface-subtle" title={`Valued as ${describeValuedAs(data.valuedAs)}`}>
            ({valuedAsNote(data.valuedAs)})
          </span>
        )}
      </span>
    </span>
  );
}

function PlayerCell({ data }: CustomCellRendererProps<Row>) {
  if (!data) return null;
  return (
    <PlayerName userId={data.user.id} badge="reserve" className="min-w-0 truncate text-on-surface">
      {displayName(data.user)}
    </PlayerName>
  );
}

function TeamCell({ data }: CustomCellRendererProps<Row>) {
  if (!data?.team) return null;
  return (
    <span className="flex items-center gap-1.5 truncate">
      <TeamDot color={data.team.color} />
      <span className="truncate">{data.team.name}</span>
    </span>
  );
}

const DEFAULT_COL_DEF: ColDef<Row> = {
  sortable: true,
  resizable: true,
  minWidth: 80,
  tooltip: (p: TooltipCallbackParams<Row>) => usefulTooltip(p, String(p.valueFormatted ?? p.value ?? "")),
  headerTooltip,
  lockPinned: true,
};

/**
 * GP gained (CONTEXT.md): each team's total, and every approved drop with a GP value of the teams shown, most
 * valuable first. For show only: GP never scores.
 */
export function GpGained({
  slug,
  teamGpGained,
  drops,
  teams,
  canReprice,
}: {
  slug: string;
  teamGpGained: TeamGpGained[];
  drops: GpDrop[];
  teams: Team[];
  /** Moderators can re-price a drop's GP value from here, to fix one that's wrong. */
  canReprice: boolean;
}) {
  const gridTheme = useGridTheme();
  const isPhone = useIsPhone();
  const { gridProps, hidden, setHidden, apiRef } = usePersistedGridState<Row>("statsGpDrops", PINNED);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const multiTeam = teams.length > 1;

  const rows = useMemo<Row[]>(() => drops.map((d) => ({ ...d, team: teamById.get(d.teamId) ?? null })), [drops, teamById]);

  const columnDefs = useMemo<ColDef<Row>[]>(() => {
    const cols: ColDef<Row>[] = [
      { colId: "rank", headerName: "#", pinned: "left", suppressMovable: true, width: 56, minWidth: 56, sortable: false, valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1, cellClass: "num text-on-surface-subtle" },
      // The value includes the Valued as note: AG Grid only redraws a cell whose value changed, so a note that
      // arrives later (a Task given a Valued as, or a Source) would otherwise not show until a reload.
      { colId: "item", headerName: "Drop", pinned: "left", suppressMovable: true, initialWidth: 240, valueGetter: (p) => (p.data ? dropLabel(p.data) : ""), cellRenderer: ItemCell },
      { colId: "player", headerName: "Player", flex: 2, minWidth: 120, valueGetter: (p) => (p.data ? displayName(p.data.user) : ""), cellRenderer: PlayerCell },
      { colId: "team", headerName: "Team", flex: 2, minWidth: 120, valueGetter: (p) => p.data?.team?.name ?? "", cellRenderer: TeamCell },
      {
        colId: "at",
        headerName: "When",
        headerTooltip: "When it was submitted",
        field: "at",
        sortingOrder: ["desc", "asc"],
        flex: 1,
        minWidth: 100,
        valueFormatter: (p) => timeAgo(p.value as string),
        tooltip: (p: TooltipCallbackParams<Row>) => new Date(p.value as string).toLocaleString(),
        cellClass: "text-on-surface-muted",
      },
      {
        colId: "gpValue",
        headerName: "GP value",
        headerTooltip: "What the drop was worth when submitted (Grand Exchange price)",
        field: "gpValue",
        initialSort: "desc",
        sortingOrder: ["desc", "asc"],
        flex: 1,
        minWidth: 100,
        valueFormatter: (p) => formatGp(p.value as number),
        tooltip: (p: TooltipCallbackParams<Row>) => formatGpExact(p.value as number),
        cellClass: "num font-semibold",
        ...(canReprice
          ? {
              cellRenderer: (p: CustomCellRendererProps<Row>) =>
                p.data ? (
                  <span className="flex items-center gap-1">
                    {p.valueFormatted}
                    <RepriceGpButton slug={slug} submissionId={p.data.submissionId} />
                  </span>
                ) : null,
            }
          : {}),
      },
    ];
    // One team's table doesn't need to say which team every row is on.
    return multiTeam ? cols : cols.filter((c) => c.colId !== "team");
  }, [multiTeam, canReprice, slug]);

  const pickable = columnDefs.filter((c) => !PINNED.includes(c.colId!)).map((c) => ({ id: c.colId!, label: c.headerName! }));
  const height = Math.min(MAX_HEIGHT, HEADER_HEIGHT + Math.max(rows.length, 1) * ROW_HEIGHT + FRAME_HEIGHT + (isPhone ? SCROLLBAR_HEIGHT : 0));

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
        {teamGpGained.map((t) => (
          <li key={t.teamId} className="flex items-center gap-1.5 text-sm">
            <TeamDot color={teamById.get(t.teamId)?.color} />
            <span className="text-on-surface-muted">{teamById.get(t.teamId)?.name ?? "A team"}</span>
            <span className="num font-semibold text-on-surface" title={formatGpExact(t.gpGained)}>
              {formatGp(t.gpGained)}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <ColumnPicker columns={pickable} hidden={hidden} onHiddenChange={setHidden} />
        <p className="text-xs text-on-surface-subtle">
          {rows.length} approved {rows.length === 1 ? "drop" : "drops"} with a GP value.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-on-surface-subtle">No approved drops with a GP value yet.</p>
      ) : (
        <div style={{ height }}>
          <AgGridReact<Row>
            theme={gridTheme}
            rowData={rows}
            getRowId={(p) => p.data.claimId}
            {...gridProps}
            columnDefs={columnDefs}
            defaultColDef={DEFAULT_COL_DEF}
            rowHeight={ROW_HEIGHT}
            animateRows={false}
            tooltipShowDelay={200}
            tooltipHideDelay={4000}
            enableCellTextSelection
            accentedSort
            // The rank is the row's position, so it has to be redrawn whenever the order changes.
            onSortChanged={() => apiRef.current?.refreshCells({ columns: ["rank"], force: true })}
          />
        </div>
      )}
    </div>
  );
}
