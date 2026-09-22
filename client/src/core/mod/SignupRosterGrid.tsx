// The signup roster's table, built on AG Grid Community (docs/ag-grid-tables-plan.md) rather than hand-rolled —
// see that plan for why (a hand-rolled table with rich per-row cells was slow to mount: profiling put ~270ms of a
// 63-row mount in per-row mutation hooks and react-aria controls, not the table mechanics). Everything not about
// the grid itself — the toolbar, filters, mutations, CSV export — stays in SignupRoster.tsx, which renders this.
//
// Phase 3 (docs/ag-grid-tables-plan.md): the interactive columns (buy-in, collected-by, partner, status, rsn)
// adopt AG's own editing model instead of porting the old react-aria cells. A cell is text unless it must be
// interactive; interactive cells use AG's provided editors (checkbox, select) or a small renderer with a native
// <button>. `readOnlyEdit` means editors never touch grid data — edits raise `cellEditRequest`, one handler maps
// each to a mutation, and the refetched query data flows back in as `rowData`. No react-aria Button/IconButton/
// Select, no Truncate/Tooltip/Highlight from core/ui in here — AG does its own truncation and tooltips, and
// Highlight's *logic* (not the component) lives in core/ui/gridCells.tsx as `Mark`, shared with DraftPoolGrid.
//
// Phase 4: column order/visibility/sizing are grid state (initialState/onStateUpdated), persisted to
// localStorage, instead of the old useHiddenColumns. ColumnPicker stays the UI (Community has no column chooser
// of its own) but now drives api.setColumnsVisible; the grid's own header drag handles reorder.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { CustomCellRendererProps } from "ag-grid-react";
import type {
  CellEditRequestEvent,
  ColDef,
  GetRowIdParams,
  GridApi,
  GridReadyEvent,
  GridState,
  ModelUpdatedEvent,
  StateUpdatedEvent,
  TooltipCallbackParams,
} from "ag-grid-community";
import { formatSignupAnswer, type RosterEntry, type SignupQuestion } from "@bingo/shared";
import type { useMarkBuyin, useModPair, useModUnpair, useModWithdrawSignup, useRefreshSignupStats } from "../../api/queries";
import { gridTheme } from "../ui/agGrid";
import { discordName, displayName } from "../ui/user";
import { PlayerName } from "../tectonic/PlayerName";
import { Badge } from "../ui/Card";
import { CellButton, CellIconButton, Mark } from "../ui/gridCells";
import { CheckIcon, RefreshIcon, XIcon } from "../ui/icons";
import { CaCell, WomCell, caTitle, formatCaTier, formatWomStat } from "../signup/caStats";
import { TierBadge } from "../tectonic/ProfileBadges";
import { timeAgo } from "../ui/time";

/** A roster entry plus its 1-based signup position — kept on the row (not derived from `rowIndex`) so sorting by
 * another column doesn't change what "#" shows. */
export interface RosterRow extends RosterEntry {
  order: number;
}

function getRowId(params: GetRowIdParams<RosterRow>): string {
  return params.data.signup.id;
}

// Read-lookup data and the five mutations, built/called once in SignupRoster and handed to every renderer this
// way — the thing that made the old table slow was each of ~60 rows calling these hooks (and the mod list query)
// itself. See docs/ag-grid-tables-plan.md "Edits → mutations (one handler)".
export interface GridContext {
  search: string;
  partnerRsnMap: Map<string, string>;
  canWithdraw: boolean;
  statsRefreshing: ReadonlySet<string>;
  markBuyin: ReturnType<typeof useMarkBuyin>;
  modPair: ReturnType<typeof useModPair>;
  modUnpair: ReturnType<typeof useModUnpair>;
  withdrawSignup: ReturnType<typeof useModWithdrawSignup>;
  refreshStats: ReturnType<typeof useRefreshSignupStats>;
}

// ---------------------------------------------------------------------------
// Renderers. Each reads its mutation(s) from context (called once, not per row) and is memo'd so a re-render of
// SignupRoster (a keystroke in the search box, a filter chip) doesn't re-render every cell — AG only actually
// re-invokes a renderer when its own props change or `api.refreshCells` targets it.

const RsnCell = memo(function RsnCell({ data, context }: CustomCellRendererProps<RosterRow, string, GridContext>) {
  if (!data) return null;
  const refreshing = context.statsRefreshing.has(data.signup.id) || (context.refreshStats.isPending && context.refreshStats.variables === data.signup.id);
  const label = refreshing ? `Looking up stats for ${data.signup.rsn}` : `Refresh stats for ${data.signup.rsn}`;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <PlayerName userId={data.user.id} className="min-w-0 truncate">
        <Mark text={data.signup.rsn} query={context.search} />
      </PlayerName>
      {data.signup.rsnVerified && <CheckIcon size={14} className="shrink-0 text-ok" aria-label="Verified against the linked clan account" />}
      <CellIconButton label={label} disabled={refreshing} onClick={() => context.refreshStats.mutate(data.signup.id)}>
        <RefreshIcon size={12} className={refreshing ? "animate-spin" : undefined} />
      </CellIconButton>
    </span>
  );
});

const TierCell = memo(function TierCell({ data }: CustomCellRendererProps<RosterRow>) {
  if (!data?.tectonicProfile) return <span className="text-on-surface-subtle">—</span>;
  return <TierBadge profile={data.tectonicProfile} />;
});

const CaCurrentCell = memo(function CaCurrentCell({ data, context }: CustomCellRendererProps<RosterRow, number, GridContext>) {
  if (!data) return null;
  return <CaCell stats={data.caCurrent} loading={context.statsRefreshing.has(data.signup.id)} nativeTitle={false} />;
});
const CaPeakCell = memo(function CaPeakCell({ data, context }: CustomCellRendererProps<RosterRow, number, GridContext>) {
  if (!data) return null;
  return <CaCell stats={data.caPeak} loading={context.statsRefreshing.has(data.signup.id)} nativeTitle={false} />;
});
const EhbCell = memo(function EhbCell({ data, context }: CustomCellRendererProps<RosterRow, number, GridContext>) {
  if (!data) return null;
  return <WomCell stats={data.womStats} field="ehb" loading={context.statsRefreshing.has(data.signup.id)} />;
});
const EhpCell = memo(function EhpCell({ data, context }: CustomCellRendererProps<RosterRow, number, GridContext>) {
  if (!data) return null;
  return <WomCell stats={data.womStats} field="ehp" loading={context.statsRefreshing.has(data.signup.id)} />;
});

// Badge + at-risk badge + (while the roster can still change) a two-step withdraw button for removing a no-show
// on a player's behalf. `confirming`/`error` are local — each rendered instance is a real React component in the
// grid's own tree (no portal), so this is the same pattern the old per-row StatusCell used.
const StatusCell = memo(function StatusCell({ data, context }: CustomCellRendererProps<RosterRow, string, GridContext>) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!data) return null;
  const active = data.signup.status === "active";
  const busy = context.withdrawSignup.isPending && context.withdrawSignup.variables === data.signup.id;
  const signupId = data.signup.id;

  async function withdraw() {
    setError(null);
    try {
      await context.withdrawSignup.mutateAsync(signupId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to withdraw signup");
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex h-full items-center gap-1 whitespace-nowrap">
        <CellButton variant="danger" onClick={withdraw} disabled={busy}>
          Withdraw {data.signup.rsn}
        </CellButton>
        <CellButton variant="ghost" onClick={() => setConfirming(false)}>
          Cancel
        </CellButton>
      </div>
    );
  }
  return (
    <div className="flex h-full items-center gap-1">
      <Badge tone={active ? "ok" : "neutral"}>{data.signup.status}</Badge>
      {data.leftover && <Badge tone="warn">at risk</Badge>}
      {active && context.canWithdraw && (
        <CellIconButton label={`Withdraw ${data.signup.rsn}'s signup`} onClick={() => setConfirming(true)}>
          <XIcon size={12} />
        </CellIconButton>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
});

// Duo mode only. Paired rows show the partner's name (highlighted) + an unpair button. Unpaired active rows show
// a hint; picking a partner happens through AG's own edit gesture (double-click → agSelectCellEditor), which is
// why there is no "Pair" button here the way the old table had one.
const PartnerCell = memo(function PartnerCell({ data, context }: CustomCellRendererProps<RosterRow, string, GridContext>) {
  const [error, setError] = useState<string | null>(null);
  if (!data) return null;

  if (data.pairing) {
    const pairingId = data.pairing.id;
    const partner = context.partnerRsnMap.get(data.signup.id) ?? "Not signed up yet";
    const busy = context.modUnpair.isPending && context.modUnpair.variables === pairingId;
    return (
      <div className="flex min-w-0 items-center gap-1">
        <span className="min-w-0 truncate text-on-surface">
          <Mark text={partner} query={context.search} />
        </span>
        <CellIconButton
          label="Unpair"
          disabled={busy}
          onClick={async () => {
            setError(null);
            try {
              await context.modUnpair.mutateAsync(pairingId);
            } catch (e: unknown) {
              setError(e instanceof Error ? e.message : "Failed to unpair");
            }
          }}
        >
          <XIcon size={12} />
        </CellIconButton>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    );
  }

  if (data.signup.status !== "active") return <span className="text-on-surface-subtle">—</span>;
  return <span className="text-on-surface-subtle">Double-click to pair</span>;
});

// ---------------------------------------------------------------------------

// A custom signup question's prompt (the header) and its answers (the cells) are free text a mod writes/players
// fill in — either can run far longer than any other column. 12rem is a starting width, not a cap: a mod can
// still drag it wider to read a long answer in full (same reasoning as the old QUESTION_COLUMN_MAX_WIDTH, but as
// `width` rather than `maxWidth` — a maxWidth here blocked exactly that resize).
const QUESTION_COLUMN_WIDTH = 192;

// Column order/visibility/sizing only — not the rest of GridState (filter model, scroll position, …), which this
// table doesn't want remembered across visits. Parsed defensively: a corrupt or pre-migration value (the old
// table's pref:hiddenColumns:signupRoster is a different key and is left alone) just means no initial state.
const GRID_STATE_KEY = "pref:gridState:signupRoster";

function readInitialGridState(): GridState | undefined {
  try {
    const raw = localStorage.getItem(GRID_STATE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as GridState) : undefined;
  } catch {
    return undefined;
  }
}

export function SignupRosterGrid({
  rows,
  questions,
  isDuo,
  showTier,
  collectedByOptions,
  doesRowPassFilters,
  onDisplayedCountChange,
  onApiReady,
  onHiddenColumnsChange,
  context,
}: {
  rows: RosterRow[];
  questions: SignupQuestion[];
  isDuo: boolean;
  showTier: boolean;
  collectedByOptions: { id: string; label: string }[];
  /** The buy-in/pair filter chips, as one predicate — see SignupRoster's matchesBuyin/matchesPair. */
  doesRowPassFilters: (row: RosterRow) => boolean;
  onDisplayedCountChange: (count: number) => void;
  /** Hands the live GridApi up to SignupRoster so ColumnPicker (rendered in its toolbar, not in here) can call
   * `setColumnsVisible` — null on unmount. */
  onApiReady: (api: GridApi<RosterRow> | null) => void;
  onHiddenColumnsChange: (hidden: Set<string>) => void;
  context: GridContext;
}) {
  const gridApiRef = useRef<GridApi<RosterRow> | null>(null);
  const [initialState] = useState(readInitialGridState);

  const unpairedActive = useMemo(() => rows.filter((r) => r.signup.status === "active" && !r.pairing), [rows]);
  const unpairedRefData = useMemo(() => {
    const refData: Record<string, string> = { "": "Unpaired" };
    for (const r of unpairedActive) refData[r.user.id] = r.signup.rsn;
    return refData;
  }, [unpairedActive]);
  const collectedByRefData = useMemo(() => {
    const refData: Record<string, string> = { "": "Nobody yet" };
    for (const o of collectedByOptions) refData[o.id] = o.label;
    return refData;
  }, [collectedByOptions]);
  const collectedByValues = useMemo(() => ["", ...collectedByOptions.map((o) => o.id)], [collectedByOptions]);

  const columnDefs = useMemo<ColDef<RosterRow>[]>(() => {
    // Each `width` below is a starting size sized to its typical content (an RSN, a tier name, a checkbox), not
    // a cap — `resizable: true` (defaultColDef) plus Phase 4's column-state persistence mean a mod can still
    // drag any of them wider and it'll stick.
    const cols: (ColDef<RosterRow> | false)[] = [
      {
        colId: "order",
        headerName: "#",
        valueGetter: (p) => p.data?.order,
        cellClass: "num",
        width: 56,
        // Below defaultColDef's minWidth: 80 floor — needs its own, smaller one, or AG clamps width back up to 80.
        minWidth: 56,
        sort: "asc",
        lockPosition: "left",
        suppressMovable: true,
        pinned: "left",
      },
      {
        colId: "rsn",
        headerName: "RSN",
        valueGetter: (p) => p.data?.signup.rsn,
        cellRenderer: RsnCell,
        lockPosition: "left",
        suppressMovable: true,
        width: 150,
        pinned: "left",
      },
      { colId: "discord", headerName: "Discord", valueGetter: (p) => (p.data ? discordName(p.data.user) : ""), width: 150 },
      showTier && {
        colId: "tier",
        headerName: "Tier",
        valueGetter: (p) => p.data?.tectonicProfile?.points ?? -1,
        cellRenderer: TierCell,
        tooltip: false,
        width: 120,
      },
      {
        colId: "signedUp",
        headerName: "Signed up",
        valueGetter: (p) => p.data?.signup.createdAt,
        valueFormatter: (p) => (p.value ? timeAgo(p.value) : ""),
        // Reads p.data rather than p.value: the CA columns' tooltips (below) do the same and work, this one
        // read from the resolved cell value and didn't fire — data is also just more direct here regardless.
        tooltip: (p: TooltipCallbackParams<RosterRow, string>) => (p.data?.signup.createdAt ? new Date(p.data.signup.createdAt).toLocaleString() : ""),
        width: 110,
      },
      {
        colId: "status",
        headerName: "Status",
        valueGetter: (p) => p.data?.signup.status,
        cellRenderer: StatusCell,
        width: 150,
      },
      {
        colId: "caCurrent",
        headerName: "Current CA",
        valueGetter: (p) => p.data?.caCurrent?.points ?? -1,
        cellRenderer: CaCurrentCell,
        tooltip: (p: TooltipCallbackParams<RosterRow, number>) => caTitle(p.data?.caCurrent),
        width: 120,
      },
      {
        colId: "caPeak",
        headerName: "Peak CA",
        valueGetter: (p) => p.data?.caPeak?.points ?? -1,
        cellRenderer: CaPeakCell,
        tooltip: (p: TooltipCallbackParams<RosterRow, number>) => caTitle(p.data?.caPeak),
        width: 120,
      },
      { colId: "ehb", headerName: "EHB", valueGetter: (p) => p.data?.womStats?.ehb ?? -1, cellRenderer: EhbCell, cellClass: "num", tooltip: false, width: 90 },
      { colId: "ehp", headerName: "EHP", valueGetter: (p) => p.data?.womStats?.ehp ?? -1, cellRenderer: EhpCell, cellClass: "num", tooltip: false, width: 90 },
      {
        colId: "buyin",
        headerName: "Buy-in received",
        cellDataType: "boolean",
        editable: true,
        valueGetter: (p) => !!p.data?.signup.buyinReceivedAt,
        width: 130,
      },
      {
        colId: "collectedBy",
        headerName: "Collected by",
        valueGetter: (p) => p.data?.collectedByUser?.id ?? "",
        refData: collectedByRefData,
        editable: (p) => !!p.data?.signup.buyinReceivedAt,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: collectedByValues },
        width: 150,
      },
      isDuo && {
        colId: "partner",
        headerName: "Partner",
        valueGetter: (p) => (p.data?.pairing ? (p.context.partnerRsnMap.get(p.data.signup.id) ?? "") : ""),
        cellRenderer: PartnerCell,
        editable: (p) => !p.data?.pairing && p.data?.signup.status === "active",
        cellEditor: "agSelectCellEditor",
        cellEditorParams: (p: { data?: RosterRow }) => ({
          values: ["", ...unpairedActive.filter((r) => r.signup.id !== p.data?.signup.id).map((r) => r.user.id)],
        }),
        refData: unpairedRefData,
        width: 180,
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
    return [...cols.filter((c): c is ColDef<RosterRow> => c !== false), ...questionCols];
  }, [questions, isDuo, showTier, collectedByRefData, collectedByValues, unpairedActive, unpairedRefData]);

  // tooltip/headerTooltip: true shows the cell's own formatted value / the header's own name. tooltipShowMode
  // ("whenTruncated") is grid-wide only, not per column (no way to opt individual columns in/out), and several
  // columns carry supplementary info that isn't just "the same text, cut off" — the exact signup timestamp, the
  // CA point total behind a tier name — so it stays at AG's default "standard" (always on hover), not truncated-
  // only. `tier` opts out with `tooltip: false` since TierBadge already has its own native `title`.
  const defaultColDef = useMemo<ColDef<RosterRow>>(() => ({ sortable: true, resizable: true, minWidth: 80, tooltip: true, headerTooltip: true }), []);

  const onGridReady = useCallback(
    (e: GridReadyEvent<RosterRow>) => {
      gridApiRef.current = e.api;
      onDisplayedCountChange(e.api.getDisplayedRowCount());
      onApiReady(e.api);
    },
    [onDisplayedCountChange, onApiReady],
  );
  // ColumnPicker (SignupRoster's toolbar) needs the api for setColumnsVisible, and needs to know it's gone once
  // this unmounts (a bingo switch, a tab change) so it doesn't call a stale one.
  useEffect(() => () => onApiReady(null), [onApiReady]);
  const onModelUpdated = useCallback((e: ModelUpdatedEvent<RosterRow>) => onDisplayedCountChange(e.api.getDisplayedRowCount()), [onDisplayedCountChange]);

  // Column order/visibility/sizing survive a reload; ColumnPicker's `hidden` set comes from the same event so a
  // header-drag hide/show and a ColumnPicker toggle stay in sync with each other.
  const onStateUpdated = useCallback(
    (e: StateUpdatedEvent<RosterRow>) => {
      const { columnOrder, columnVisibility, columnSizing } = e.state;
      try {
        localStorage.setItem(GRID_STATE_KEY, JSON.stringify({ columnOrder, columnVisibility, columnSizing }));
      } catch {
        // Private browsing / storage quota — persistence is a nicety, not required.
      }
      onHiddenColumnsChange(new Set(columnVisibility?.hiddenColIds ?? []));
    },
    [onHiddenColumnsChange],
  );

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

  // The search box highlights matches inside rsn/partner (see Mark above) — the cell *value* doesn't change when
  // the query changes, so those renderers need to be told to re-render explicitly.
  useEffect(() => {
    gridApiRef.current?.refreshCells({ force: true, columns: ["rsn", "partner"] });
  }, [context.search]);

  const onCellEditRequest = useCallback((e: CellEditRequestEvent<RosterRow>) => {
    const { colDef, data, newValue } = e;
    switch (colDef.colId) {
      case "buyin":
        context.markBuyin.mutate({ signupId: data.signup.id, received: !!newValue });
        break;
      case "collectedBy":
        context.markBuyin.mutate({ signupId: data.signup.id, received: true, collectedByUserId: (newValue as string) || null });
        break;
      case "partner":
        if (newValue) context.modPair.mutate({ userIdA: data.user.id, userIdB: newValue as string });
        break;
    }
  }, [context.markBuyin, context.modPair]);

  return (
    <div className="h-full min-h-0">
      <AgGridReact<RosterRow>
        theme={gridTheme}
        rowData={rows}
        getRowId={getRowId}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        context={context}
        animateRows={false}
        initialState={initialState}
        onStateUpdated={onStateUpdated}
        onGridReady={onGridReady}
        onModelUpdated={onModelUpdated}
        quickFilterText={context.search}
        includeHiddenColumnsInQuickFilter
        isExternalFilterPresent={isExternalFilterPresent}
        doesExternalFilterPass={doesExternalFilterPass}
        tooltipShowDelay={200}
        tooltipHideDelay={4000}
        overlayNoRowsTemplate={context.search ? "No signups match this search." : "No signups match these filters."}
        readOnlyEdit
        singleClickEdit
        stopEditingWhenCellsLoseFocus
        onCellEditRequest={onCellEditRequest}
        enableCellTextSelection
      />
    </div>
  );
}
