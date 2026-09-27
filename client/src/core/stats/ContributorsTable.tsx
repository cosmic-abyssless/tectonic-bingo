import { useCallback, useMemo } from "react";
import { AgGridReact, type CustomCellRendererProps } from "ag-grid-react";
import type { CellClickedEvent, ColDef, TooltipCallbackParams } from "ag-grid-community";
import type { ContributionCount, Team, TitleDefinition } from "@bingo/shared";
import { useGridTheme } from "../ui/agGrid";
import { useIsPhone } from "../ui/useMediaQuery";
import { ColumnPicker } from "../ui/ColumnPicker";
import { usePersistedGridState } from "../ui/gridState";
import { headerTooltip, usefulTooltip } from "../ui/gridTooltips";
import { displayName } from "../ui/user";
import { PlayerName, useOpenProfile } from "../tectonic/PlayerName";
import { FALLBACK_TEAM_COLOR } from "./PointsChart";
import { TitleChip } from "./TitleChrome";
import { formatShare } from "./PointsShareBreakdown";
import { formatGp, formatGpExact } from "../ui/gp";

type Row = ContributionCount & { team: Team | null; titles: TitleDefinition[] };

const PINNED = ["rank", "player"];
const MAX_HEIGHT = 480;
const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 40;
const SCROLLBAR_HEIGHT = 18;
// A theme's table frame: the comic panel's 3px ink border top and bottom, and its 3px header rule.
const FRAME_HEIGHT = 12;

function PlayerCell({ data }: CustomCellRendererProps<Row>) {
  if (!data) return null;
  return (
    <PlayerName userId={data.userId} badge="reserve" className="min-w-0 truncate text-on-surface">
      {displayName(data.user)}
    </PlayerName>
  );
}

// Every Title the Player holds, in priority order. The cell's tooltip names them all when some are cut off.
function TitlesCell({ data }: CustomCellRendererProps<Row>) {
  if (!data?.titles.length) return null;
  return (
    <span className="flex min-w-0 items-center gap-1 overflow-hidden">
      {data.titles.map((t) => (
        <TitleChip key={t.id} title={t} />
      ))}
    </span>
  );
}

function TeamCell({ data }: CustomCellRendererProps<Row>) {
  if (!data?.team) return null;
  return (
    <span className="flex items-center gap-1.5 truncate">
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: data.team.color ?? FALLBACK_TEAM_COLOR }} />
      <span className="truncate">{data.team.name}</span>
    </span>
  );
}

// The signup roster's defaults (core/mod/SignupRosterGrid.tsx), the table the others follow.
const DEFAULT_COL_DEF: ColDef<Row> = {
  sortable: true,
  resizable: true,
  minWidth: 80,
  tooltip: (p: TooltipCallbackParams<Row>) => usefulTooltip(p, String(p.valueFormatted ?? p.value ?? "")),
  headerTooltip,
  lockPinned: true,
};

/**
 * Every player of the visible teams, ranked by Points share (CONTEXT.md) or by approved submissions: click a
 * heading to sort. Clicking a row opens the player's profile, whose "This bingo" section shows where their
 * share came from.
 */
export function ContributorsTable({ contributions, teams, titles }: { contributions: ContributionCount[]; teams: Team[]; titles: Map<string, TitleDefinition[]> }) {
  const gridTheme = useGridTheme();
  const isPhone = useIsPhone();
  const openProfile = useOpenProfile();
  const { gridProps, hidden, setHidden, apiRef } = usePersistedGridState<Row>("statsContributors", PINNED);

  const rows = useMemo<Row[]>(() => {
    const teamById = new Map(teams.map((t) => [t.id, t]));
    return contributions.map((c) => ({ ...c, team: teamById.get(c.teamId) ?? null, titles: titles.get(c.userId) ?? [] }));
  }, [contributions, teams, titles]);
  const multiTeam = teams.length > 1;

  // Unpinned columns share the width (flex), so hiding one lets the rest take its space.
  const columnDefs = useMemo<ColDef<Row>[]>(() => {
    const cols: ColDef<Row>[] = [
      { colId: "rank", headerName: "#", pinned: "left", suppressMovable: true, width: 56, minWidth: 56, sortable: false, valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1, cellClass: "num text-on-surface-subtle" },
      { colId: "player", headerName: "Player", pinned: "left", suppressMovable: true, initialWidth: 210, valueGetter: (p) => (p.data ? displayName(p.data.user) : ""), cellRenderer: PlayerCell },
      {
        colId: "titles",
        headerName: "Titles",
        headerTooltip: "Every title the player holds, most important first",
        flex: 3,
        minWidth: 120,
        sortingOrder: ["desc", "asc"],
        valueGetter: (p) => p.data?.titles.length ?? 0,
        tooltip: (p: TooltipCallbackParams<Row>) => {
          const names = p.data?.titles.map((t) => t.name) ?? [];
          return usefulTooltip(p, names.join(", "), names);
        },
        cellRenderer: TitlesCell,
      },
      { colId: "team", headerName: "Team", flex: 2, minWidth: 120, valueGetter: (p) => p.data?.team?.name ?? "", cellRenderer: TeamCell },
      {
        colId: "pointsShare",
        headerName: "Points share",
        headerTooltip: "The team's points credited to the players whose claims completed each task, tile and line",
        field: "pointsShare",
        initialSort: "desc",
        sortingOrder: ["desc", "asc"],
        flex: 1,
        minWidth: 110,
        valueFormatter: (p) => formatShare(p.value as number),
        cellClass: "num font-semibold",
      },
      { colId: "approvedSubmissions", headerName: "Submissions", headerTooltip: "Approved submissions", field: "approvedSubmissions", sortingOrder: ["desc", "asc"], flex: 1, minWidth: 110, cellClass: "num" },
      {
        colId: "gpGained",
        headerName: "GP gained",
        headerTooltip: "What the player's approved drops were worth when submitted (Grand Exchange prices)",
        field: "gpGained",
        sortingOrder: ["desc", "asc"],
        flex: 1,
        minWidth: 110,
        valueFormatter: (p) => formatGp(p.value as number),
        tooltip: (p: TooltipCallbackParams<Row>) => formatGpExact(p.value as number),
        cellClass: "num",
      },
    ];
    // One team's table doesn't need to say which team every row is on.
    return multiTeam ? cols : cols.filter((c) => c.colId !== "team");
  }, [multiTeam]);

  // The name itself is a button that opens the profile; the rest of the row does the same.
  const onCellClicked = useCallback(
    (e: CellClickedEvent<Row>) => {
      if ((e.event?.target as HTMLElement | null)?.closest("button")) return;
      if (e.data) openProfile?.(e.data.userId);
    },
    [openProfile],
  );

  const pickable = columnDefs.filter((c) => !PINNED.includes(c.colId!)).map((c) => ({ id: c.colId!, label: c.headerName! }));
  // Sized to the rows, plus room for the sideways scrollbar only a phone gets; long tables scroll inside MAX_HEIGHT.
  const height = Math.min(MAX_HEIGHT, HEADER_HEIGHT + Math.max(rows.length, 1) * ROW_HEIGHT + FRAME_HEIGHT + (isPhone ? SCROLLBAR_HEIGHT : 0));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ColumnPicker columns={pickable} hidden={hidden} onHiddenChange={setHidden} />
        {openProfile && <p className="text-xs text-on-surface-subtle">Click a player to see where their points share came from.</p>}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-on-surface-subtle">No players yet.</p>
      ) : (
        <div style={{ height }}>
          <AgGridReact<Row>
            theme={gridTheme}
            rowData={rows}
            getRowId={(p) => p.data.userId}
            {...gridProps}
            columnDefs={columnDefs}
            defaultColDef={DEFAULT_COL_DEF}
            rowHeight={ROW_HEIGHT}
            rowClass={openProfile ? "cursor-pointer" : undefined}
            animateRows={false}
            tooltipShowDelay={200}
            tooltipHideDelay={4000}
            enableCellTextSelection
            accentedSort
            // The rank is the row's position, so it has to be redrawn whenever the order changes.
            onSortChanged={() => apiRef.current?.refreshCells({ columns: ["rank"], force: true })}
            onCellClicked={onCellClicked}
          />
        </div>
      )}
    </div>
  );
}
