import { useMemo, useState } from "react";
import { AgGridReact, type CustomCellRendererProps } from "ag-grid-react";
import type { ColDef, TooltipCallbackParams } from "ag-grid-community";
import type { Team, TimelineEvent, TimelineEventType } from "@bingo/shared";
import { useGridTheme } from "../ui/agGrid";
import { ColumnPicker } from "../ui/ColumnPicker";
import { applyColumnVisibility } from "../ui/hiddenColumns";
import { usePersistedGridState } from "../ui/gridState";
import { headerTooltip, usefulTooltip } from "../ui/gridTooltips";
import { inclusionFilter } from "../ui/inclusionFilter";
import { MultiSelect } from "../ui/MultiSelect";
import { usePreference } from "../ui/preferences";
import { SingleSelect } from "../ui/SingleSelect";
import { TableSearchInput, matchesSearch } from "../ui/tableSearch";
import { FALLBACK_TEAM_COLOR } from "./PointsChart";
import { TIME_FORMAT_OPTIONS, formatEventTime, type TimeFormat } from "./timeFormat";

const KINDS: { key: TimelineEventType; label: string }[] = [
  { key: "points_earned", label: "Points" },
  { key: "line_completed", label: "Line" },
  { key: "point_adjustment", label: "Adjustment" },
  { key: "first_completion", label: "First" },
  { key: "stage_changed", label: "Stage" },
];
const kindLabel = (type: TimelineEventType) => KINDS.find((k) => k.key === type)?.label ?? type;

const COLUMNS = [
  { id: "at", label: "When" },
  { id: "team", label: "Team" },
  { id: "kind", label: "Kind" },
  { id: "what", label: "What" },
  { id: "points", label: "Points" },
];

type Row = TimelineEvent & { team: Team | null };

// The signup roster's defaults (core/mod/SignupRosterGrid.tsx), the table the others follow.
const DEFAULT_COL_DEF: ColDef<Row> = {
  sortable: true,
  resizable: true,
  minWidth: 80,
  tooltip: (p: TooltipCallbackParams<Row>) => usefulTooltip(p, String(p.valueFormatted ?? p.value ?? "")),
  headerTooltip,
  lockPinned: true,
};
const PINNED = ["at"];

// Tall enough for about ten rows before the table scrolls on its own.
const MAX_HEIGHT = 480;
const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 40;
const SCROLLBAR_HEIGHT = 18;

function TeamCell({ data }: CustomCellRendererProps<Row>) {
  if (!data?.team) return <span className="text-on-surface-subtle">—</span>;
  return (
    <span className="flex items-center gap-1.5 truncate">
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: data.team.color ?? FALLBACK_TEAM_COLOR }} />
      <span className="truncate">{data.team.name}</span>
    </span>
  );
}

function formatPoints(points: number | null): string {
  if (points === null) return "";
  return points > 0 ? `+${points}` : `−${Math.abs(points)}`;
}

/** Every scoring event in the stats, as a filterable table: newest first, one line per event. */
export function TimelineTable({ events, teams, startsAt }: { events: TimelineEvent[]; teams: Team[]; startsAt: string | null }) {
  const gridTheme = useGridTheme();
  const [format, setFormat] = usePreference("statsTimeFormat");
  const { gridProps, hidden, setHidden } = usePersistedGridState<Row>("statsTimeline", PINNED);
  const [excludedKinds, setExcludedKinds] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");

  const presentKinds = useMemo(() => KINDS.filter((k) => events.some((e) => e.type === k.key)), [events]);
  const kinds = inclusionFilter(excludedKinds, presentKinds);

  const rows = useMemo<Row[]>(() => {
    const teamById = new Map(teams.map((t) => [t.id, t]));
    return events
      .filter((e) => !excludedKinds.has(e.type))
      .map((e) => ({ ...e, team: e.teamId ? (teamById.get(e.teamId) ?? null) : null }))
      .filter((r) => matchesSearch([r.what, r.team?.name, kindLabel(r.type)], search));
  }, [events, teams, excludedKinds, search]);

  // Every column but the pinned time shares the width (flex), so hiding one lets the rest take its space.
  const columnDefs = useMemo<ColDef<Row>[]>(
    () => [
      {
        colId: "at",
        headerName: "When",
        field: "at",
        initialSort: "desc",
        pinned: "left",
        suppressMovable: true,
        width: format === "full" ? 190 : 130,
        valueFormatter: (p) => (p.value ? formatEventTime(p.value as string, format as TimeFormat, startsAt) : ""),
        tooltip: (p) => (p.data ? new Date(p.data.at).toLocaleString() : ""),
        cellClass: "num text-on-surface-muted",
      },
      { colId: "team", headerName: "Team", flex: 2, minWidth: 120, valueGetter: (p) => p.data?.team?.name ?? "", cellRenderer: TeamCell },
      { colId: "kind", headerName: "Kind", flex: 1, minWidth: 100, valueGetter: (p) => (p.data ? kindLabel(p.data.type) : "") },
      { colId: "what", headerName: "What", flex: 4, minWidth: 200, field: "what" },
      { colId: "points", headerName: "Points", flex: 1, minWidth: 80, field: "points", valueFormatter: (p) => formatPoints(p.value as number | null), cellClass: "num font-semibold" },
    ],
    [format, startsAt],
  );

  // Sized to the rows, plus room for the sideways scrollbar a phone gets; long tables scroll inside MAX_HEIGHT.
  const height = Math.min(MAX_HEIGHT, HEADER_HEIGHT + Math.max(rows.length, 1) * ROW_HEIGHT + SCROLLBAR_HEIGHT);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SingleSelect label="Time" options={TIME_FORMAT_OPTIONS} selected={format} onChange={(key) => setFormat(key as TimeFormat)} />
        {presentKinds.length > 1 && (
          <MultiSelect
            label="Kind"
            options={presentKinds}
            selected={kinds.checked}
            onChange={(visible) => setExcludedKinds(applyColumnVisibility(excludedKinds, presentKinds.map((k) => k.key), visible))}
          />
        )}
        <ColumnPicker columns={COLUMNS} hidden={hidden} onHiddenChange={setHidden} />
        <TableSearchInput value={search} onChange={setSearch} matchCount={rows.length} totalCount={events.length} />
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-on-surface-subtle">Nothing has happened yet.</p>
      ) : (
        <div style={{ height }}>
          <AgGridReact<Row>
            theme={gridTheme}
            rowData={rows}
            {...gridProps}
            columnDefs={columnDefs}
            defaultColDef={DEFAULT_COL_DEF}
            rowHeight={ROW_HEIGHT}
            animateRows={false}
            tooltipShowDelay={200}
            tooltipHideDelay={4000}
            enableCellTextSelection
            accentedSort
            overlayNoRowsTemplate="Nothing matches the filters."
          />
        </div>
      )}
    </div>
  );
}
