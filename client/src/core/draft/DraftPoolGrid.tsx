// The draft pool table, built on AG Grid Community — see docs/ag-grid-tables-plan.md for the pattern this
// follows (adopted from the signup roster's own AG Grid migration). The plan's own non-goals list called this
// table out as staying hand-rolled, specifically because "its duo units... do not map onto AG's row model" — the
// fix here is exactly that: a row *is* a unit (a solo player or a duo pair), not a player, so nothing needs
// AG's row grouping (which is Enterprise-only, and was ruled out for that reason alone regardless of licensing —
// see the plan's Decision 1). A pair's row is taller (getRowHeight) and each per-player column renders both
// halves stacked inside the one cell (StackedCell) instead of the old rowSpan across two <tr>s.
//
// No react-aria Button/IconButton/Select, no Truncate/Tooltip/Highlight from core/ui inside the grid — same rule
// as SignupRosterGrid, and the same shared helpers (core/ui/gridCells.tsx) for the native <button>s and search
// highlighting. RatingCell is the one exception: it's reused as-is (it does use react-aria, for its note
// popover) because the reason that rule exists — many heavy interactive components × many rows made the signup
// roster's mount slow — doesn't apply here (one rating widget per row, a pool that's typically a few dozen units
// at most, not 60+).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { CustomCellRendererProps } from "ag-grid-react";
import type {
  ColDef,
  GetRowIdParams,
  GridApi,
  GridReadyEvent,
  GridState,
  IRowNode,
  ITooltipParams,
  RowClassParams,
  RowHeightParams,
  StateUpdatedEvent,
  TooltipCallbackParams,
} from "ag-grid-community";
import {
  formatSignupAnswer,
  type DraftPoolEntry,
  type DraftUnit,
  type LeftoverMode,
  type PickRating,
  type SignupQuestion,
} from "@bingo/shared";
import { useStatsRefreshingSignupIds } from "../../context/WebSocketContext";
import { CaCell, WomCell, caTitle, formatCaTier, formatWomStat } from "../signup/caStats";
import { discordName } from "../ui/user";
import { useGridTheme } from "../ui/agGrid";
import { AccountTypeIcon } from "../ui/AccountTypeIcon";
import { Badge } from "../ui/Card";
import { ColumnPicker } from "../ui/ColumnPicker";
import { CellButton, Mark } from "../ui/gridCells";
import { useHiddenColumns } from "../ui/hiddenColumns";
import { LinkIcon } from "../ui/icons";
import { compareSortValues } from "../ui/tableSort";
import { TableSearchInput, matchesSearch, useTableSearch } from "../ui/tableSearch";
import { useDocumentTop } from "../ui/tableChrome";
import { PlayerName } from "../tectonic/PlayerName";
import { AchievementIcons, PlaceBreakdown, TierBadge } from "../tectonic/ProfileBadges";
import { podiumSummary, podiumTitle, recordSummary, recordTitle } from "../tectonic/profile";
import { RatingCell } from "./RatingCell";

// "rating" | "rsn" | "discord" | "tier" | "records" | "podiums" | "ehb" | "ehp" | a signup question's id.
type SortKey = string;
type Ratings = Record<string, PickRating>;

// Golds outrank silvers outrank bronzes, so a single #1 beats three #3s.
const placeScore = (p: { first: number; second: number; third: number }) => p.first * 10_000 + p.second * 100 + p.third;

function poolSortValue(entry: DraftPoolEntry, key: SortKey, ratings: Ratings): string | number {
  if (key === "rating") return ratings[entry.signup.id]?.stars ?? 0;
  if (key === "rsn") return entry.signup.rsn.toLowerCase();
  if (key === "discord") return discordName(entry.user).toLowerCase();
  if (key === "tier") return entry.tectonicProfile?.points ?? -1;
  if (key === "records") return entry.tectonicProfile ? placeScore(recordSummary(entry.tectonicProfile)) : -1;
  if (key === "podiums") return entry.tectonicProfile ? placeScore(podiumSummary(entry.tectonicProfile)) : -1;
  if (key === "ehb") return entry.womStats?.ehb ?? -1;
  if (key === "ehp") return entry.womStats?.ehp ?? -1;
  if (key === "caCurrent") return entry.caCurrent?.points ?? -1;
  if (key === "caPeak") return entry.caPeak?.points ?? -1;
  return (entry.answers?.find((a) => a.questionId === key)?.value ?? "").toLowerCase();
}

// Every column's text, whether or not it's currently shown — search covers all of them (issue #112).
function poolSearchValues(entry: DraftPoolEntry, questions: SignupQuestion[]): string[] {
  return [
    entry.signup.rsn,
    discordName(entry.user),
    entry.tectonicProfile?.tier?.name ?? "",
    formatWomStat(entry.womStats?.ehb),
    formatWomStat(entry.womStats?.ehp),
    formatCaTier(entry.caCurrent),
    formatCaTier(entry.caPeak),
    ...(entry.answers ?? []).map((a) => formatSignupAnswer(questions.find((q) => q.id === a.questionId)?.type ?? "text", a.value)),
  ];
}

// EHB/EHP/CA are additive (a duo's combined grind), unlike a rating or an RSN — a pair sorts on the *sum* of its
// two halves for these rather than best-of. Everything else (rating, rsn, discord, tier, records, podiums, a
// signup question) keeps best-of: there's no meaningful "sum" of two ratings or two names.
const SUM_KEYS: ReadonlySet<SortKey> = new Set(["ehb", "ehp", "caCurrent", "caPeak"]);

// A pair sorts by whichever half ranks first (under the *active* sort direction — "first" means smallest
// ascending, largest descending), so the pair sits where its stronger/earlier member would on their own. AG's
// comparator gets isDescending, so this is computed here rather than needing a resorted copy of unit.entries the
// way the old table's sortUnit did — entries stay in their original order for the stack's own display order.
function makeUnitComparator(key: SortKey, ratings: Ratings) {
  const summable = SUM_KEYS.has(key);
  return (_a: unknown, _b: unknown, nodeA: IRowNode<DraftUnit>, nodeB: IRowNode<DraftUnit>, isDescending: boolean): number => {
    const valueOf = (unit: DraftUnit | undefined): string | number => {
      if (!unit) return "";
      // A solo unit's "sum" is just its one value — poolSortValue as-is, -1 sentinel and all, so a solo row's
      // sort is untouched either way. Only a pair takes this branch, and unlike bestOf, an unmeasured half (-1)
      // contributes nothing to the pair's total rather than dragging it below a fully-measured pair's.
      if (summable && unit.entries.length > 1) {
        return unit.entries.reduce((total, e) => total + Math.max(poolSortValue(e, key, ratings) as number, 0), 0);
      }
      let best = poolSortValue(unit.entries[0]!, key, ratings);
      for (const e of unit.entries.slice(1)) {
        const v = poolSortValue(e, key, ratings);
        const better = isDescending ? compareSortValues(v, best) > 0 : compareSortValues(v, best) < 0;
        if (better) best = v;
      }
      return best;
    };
    return compareSortValues(valueOf(nodeA.data), valueOf(nodeB.data));
  };
}

interface PoolGridContext {
  search: string;
  entryMatches: (entry: DraftPoolEntry) => boolean;
  statsRefreshing: ReadonlySet<string>;
  onPick: (userId: string) => void;
  picking: boolean;
  mainPoolEmpty: boolean;
  leftoverMode: LeftoverMode;
  leftoverTag: string;
}

type LineRender = (entry: DraftPoolEntry, opts: { dim: boolean; search: string }) => React.ReactNode;

// One AG row is a unit (a solo player or a duo pair) — a per-player column's cell shows one line for a solo
// unit, or both entries' lines stacked for a pair. `render` (from cellRendererParams, merged into props) is the
// per-column, per-entry renderer; dim/search come from context so `render` itself doesn't need to close over them.
// leading-tight resets line-height for everything rendered here: AG's theme sets a line-height on .ag-cell-value
// sized for the *row* height (its own single-line-centering trick), and PlayerName's button (like most text
// here) inherits it via [line-height:inherit] — 39px for what should be a ~17px line. Padding/row-height changes
// are invisible against that until this is reset; the real fix is here, once, rather than a leading-* on every
// LineRender's own markup.
const StackedCell = ({ data, context, render }: CustomCellRendererProps<DraftUnit, unknown, PoolGridContext> & { render: LineRender }) => {
  if (!data) return null;
  if (data.entries.length === 1) return <div className="leading-tight">{render(data.entries[0]!, { dim: false, search: context.search })}</div>;
  return (
    <div className="flex flex-col justify-center gap-5 py-2 leading-tight">
      {data.entries.map((e) => (
        <div key={e.signup.id}>{render(e, { dim: !!context.search && !context.entryMatches(e), search: context.search })}</div>
      ))}
    </div>
  );
};

function dimClass(dim: boolean): string | undefined {
  return dim ? "opacity-50" : undefined;
}

// No native title on these two — the column's own AG tooltip (stackedTooltip, below) covers it, same as the
// signup roster. Tier/Records/Podiums keep their native title instead: TierBadge/PlaceBreakdown always set their
// own (no way to suppress it short of forking those components), so those columns opt out of the AG tooltip
// (tooltip: false) rather than show both at once.
const rsnLine: LineRender = (entry, { dim, search }) => (
  <span className={`inline-flex min-w-0 items-center gap-1 ${dimClass(dim) ?? ""}`}>
    <AccountTypeIcon accountType={entry.accountType} />
    <PlayerName userId={entry.user.id} className="min-w-0 truncate">
      <Mark text={entry.signup.rsn} query={search} />
    </PlayerName>
  </span>
);

const discordLine: LineRender = (entry, { dim, search }) => {
  const text = discordName(entry.user);
  return (
    <span className={`block truncate text-on-surface-muted ${dimClass(dim) ?? ""}`}>
      <Mark text={text} query={search} />
    </span>
  );
};

const tierLine: LineRender = (entry, { dim }) =>
  entry.tectonicProfile ? <span className={dimClass(dim)}><TierBadge profile={entry.tectonicProfile} /></span> : <span className="text-on-surface-subtle">—</span>;

const recordsLine: LineRender = (entry, { dim }) =>
  entry.tectonicProfile ? (
    <span className={`num text-on-surface-muted ${dimClass(dim) ?? ""}`} title={recordTitle(entry.tectonicProfile)}>
      <PlaceBreakdown {...recordSummary(entry.tectonicProfile)} />
    </span>
  ) : (
    <span className="text-on-surface-subtle">—</span>
  );

const podiumsLine: LineRender = (entry, { dim }) => {
  if (!entry.tectonicProfile) return <span className="text-on-surface-subtle">—</span>;
  const podiums = podiumSummary(entry.tectonicProfile);
  return (
    <span className={`num text-on-surface-muted ${dimClass(dim) ?? ""}`} title={podiumTitle(entry.tectonicProfile)}>
      <PlaceBreakdown {...podiums} />
      {podiums.bingoWins > 0 && <span className="ml-1 text-xs text-on-surface-subtle">({podiums.bingoWins} bingo)</span>}
    </span>
  );
};

const achievementsLine: LineRender = (entry, { dim }) => (entry.tectonicProfile ? <span className={dimClass(dim)}><AchievementIcons profile={entry.tectonicProfile} /></span> : null);

function womLine(field: "ehb" | "ehp", statsRefreshing: ReadonlySet<string>): LineRender {
  return (entry, { dim }) => (
    <span className={`num text-on-surface-muted ${dimClass(dim) ?? ""}`}>
      <WomCell stats={entry.womStats} field={field} loading={statsRefreshing.has(entry.signup.id)} />
    </span>
  );
}

function caLine(field: "caCurrent" | "caPeak", statsRefreshing: ReadonlySet<string>): LineRender {
  return (entry, { dim }) => (
    <span className={`text-on-surface-muted ${dimClass(dim) ?? ""}`}>
      <CaCell stats={entry[field]} loading={statsRefreshing.has(entry.signup.id)} nativeTitle={false} />
    </span>
  );
}

function answerLine(question: SignupQuestion): LineRender {
  return (entry, { dim, search }) => {
    const answer = formatSignupAnswer(question.type, entry.answers?.find((a) => a.questionId === question.id)?.value);
    return answer ? (
      <span className={`block truncate text-on-surface-muted ${dimClass(dim) ?? ""}`}>
        <Mark text={answer} query={search} />
      </span>
    ) : (
      <span className="text-on-surface-subtle">—</span>
    );
  };
}

// One AG tooltip per cell, not per stacked line (AG has no concept of "which line is hovered" within a custom
// renderer) — for a pair this lists both halves rather than picking one, one per line. AG's default tooltip is
// white-space: normal (a literal "\n" would just collapse to a space), so this pairs with StackedTooltip below,
// a tiny custom tooltipComponent that splits on "\n" and renders each half as its own line.
function stackedTooltip(getText: (entry: DraftPoolEntry) => string) {
  return (p: TooltipCallbackParams<DraftUnit>): string => {
    if (!p.data) return "";
    if (p.data.entries.length === 1) return getText(p.data.entries[0]!);
    return p.data.entries.map((e) => `${e.signup.rsn}: ${getText(e)}`).join("\n");
  };
}

function StackedTooltip({ value }: ITooltipParams<DraftUnit, string, PoolGridContext>) {
  const lines = String(value ?? "").split("\n");
  return (
    <div className="max-w-xs rounded-md border border-outline bg-surface-raised px-2.5 py-1.5 text-xs text-on-surface shadow-pop">
      {lines.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
}

// Pairs are drafted together and rated together — one rating covers the whole unit, stored under its first
// entry's signup id (matching the old table, which only ever rendered/wrote a rating there too).
const RatingRenderer = ({ data, context }: CustomCellRendererProps<DraftUnit, unknown, PoolGridContext & { ratings: Ratings; onRate: (signupId: string, rating: PickRating) => void }>) => {
  if (!data) return null;
  const signupId = data.entries[0]!.signup.id;
  return <RatingCell rating={context.ratings[signupId]} onChange={(r) => context.onRate(signupId, r)} />;
};

const DraftButtonRenderer = ({ data, context }: CustomCellRendererProps<DraftUnit, unknown, PoolGridContext>) => {
  if (!data) return null;
  const isPair = data.entries.length > 1;
  const draftable = !data.leftover || (context.mainPoolEmpty && context.leftoverMode === "singles");
  return (
    <div className="flex h-full items-center justify-end">
      <CellButton variant="primary" onClick={() => context.onPick(data.entries[0]!.user.id)} disabled={context.picking || !draftable}>
        {isPair ? "Draft pair" : "Draft"}
      </CellButton>
    </div>
  );
};

const PairIconRenderer = ({ data }: CustomCellRendererProps<DraftUnit>) => (data && data.entries.length > 1 ? <LinkIcon size={14} aria-label="Duo pair" className="text-on-surface-subtle" /> : null);

const LeftoverBadgeRenderer = ({ data, context }: CustomCellRendererProps<DraftUnit, unknown, PoolGridContext>) => (data?.leftover ? <Badge tone="warn">{context.leftoverTag}</Badge> : null);

// Movable column order, sizing and sort. Visibility stays in pref:hiddenColumns:draftPool (useHiddenColumns) so
// ColumnPicker keeps working. Fixed columns are always forced to their pinned places in the saved order — not
// left out of it: when initialState has a columnOrder, AG only restores sizing/sort for the columns *listed* in
// it, so leaving them out silently dropped their width and sort on every reload (same fix as SignupRosterGrid).
const GRID_STATE_KEY = "pref:gridState:draftPool";
const FIXED_LEFT_COL_IDS = ["pairIcon", "rating", "rsn"];
const FIXED_RIGHT_COL_IDS = ["draft"];
const FIXED_COL_IDS = [...FIXED_LEFT_COL_IDS, ...FIXED_RIGHT_COL_IDS];

function fixedColsInPlace(orderedColIds: string[]): string[] {
  return [...FIXED_LEFT_COL_IDS, ...orderedColIds.filter((id) => !FIXED_COL_IDS.includes(id)), ...FIXED_RIGHT_COL_IDS];
}

// Same floor as SignupRosterGrid's own MIN_TABLE_HEIGHT (core/mod/SignupRoster.tsx), tuned to this grid's own
// fixed row heights rather than shared outright: ~40px header + 10 solo rows (getRowHeight's 44px) lands at the
// same ~30rem.
const MIN_TABLE_HEIGHT = "30rem";

function readDraftColumnState(): Pick<GridState, "columnOrder" | "columnSizing" | "sort"> {
  try {
    const raw = localStorage.getItem(GRID_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as GridState;
    if (!parsed || typeof parsed !== "object") return {};
    const orderedColIds = parsed.columnOrder?.orderedColIds?.filter((id) => typeof id === "string");
    return {
      ...(orderedColIds?.length ? { columnOrder: { orderedColIds: fixedColsInPlace(orderedColIds) } } : {}),
      ...(parsed.columnSizing ? { columnSizing: parsed.columnSizing } : {}),
      ...(parsed.sort ? { sort: parsed.sort } : {}),
    };
  } catch {
    return {};
  }
}

export function DraftPoolGrid({
  pool,
  questions,
  ratings,
  onRate,
  canPick,
  onPick,
  picking,
  leftoverMode,
}: {
  pool: DraftUnit[];
  questions: SignupQuestion[];
  /** Present only for team leads — they see and edit their own team's ratings. */
  ratings: Ratings | null;
  onRate: (signupId: string, rating: PickRating) => void;
  canPick: boolean;
  onPick: (userId: string) => void;
  picking: boolean;
  leftoverMode: LeftoverMode;
}) {
  // hiddenColumns is still the persisted store (pref:hiddenColumns:draftPool in localStorage), but it's no longer
  // the only way a column's visibility changes — AG's own header-drag lets a mod drag a column out of the grid
  // to hide it, bypassing ColumnPicker entirely. initialState/onStateUpdated (below) keep the two in sync the
  // same way SignupRosterGrid's Phase 4 does: read once at grid creation, then follow the grid's own state.
  const [hiddenColumns, setHiddenColumns] = useHiddenColumns("draftPool");
  const gridTheme = useGridTheme();
  const gridApiRef = useRef<GridApi<DraftUnit> | null>(null);
  const [initialState] = useState<GridState>(() => {
    const persisted = readDraftColumnState();
    return {
      // Best-rated-first is the meaningful *default* view for a captain, but it has to come from us rather than
      // a static `sort` on the rating colDef: a restored sort on some other column is a state *restore*, not a
      // live header click, so it doesn't clear a colDef-level default the way clicking a header does — it just
      // lingers as a hidden secondary sort. Falling back to it here, only when nothing was ever persisted, means
      // a persisted sort on another column (or explicitly clearing the sort entirely) is respected as-is.
      sort: { sortModel: [{ colId: "rating", sort: "desc" }] },
      ...persisted,
      columnVisibility: { hiddenColIds: [...hiddenColumns] },
      partialColumnState: true,
    };
  });
  const [search, setSearch] = useTableSearch();
  const statsRefreshing = useStatsRefreshingSignupIds();

  const entries = useMemo(() => pool.flatMap((u) => u.entries), [pool]);
  const entryMatches = useCallback((e: DraftPoolEntry) => matchesSearch(poolSearchValues(e, questions), search), [questions, search]);
  const matchingEntries = useMemo(() => entries.filter(entryMatches), [entries, entryMatches]);
  // Answers are only sent to mods/captains — everyone else's pool entries have answers: null, so skip those
  // columns entirely rather than render a table full of "—". Same reasoning for WOM/CA (unused integration) and
  // profiles (tectonic-api not registered).
  const showAnswers = entries.some((e) => e.answers !== null);
  const showWomStats = entries.some((e) => e.womStats !== null || statsRefreshing.has(e.signup.id));
  const showCa = entries.some((e) => e.caCurrent !== null || e.caPeak !== null || statsRefreshing.has(e.signup.id));
  const showProfiles = entries.some((e) => e.tectonicProfile !== null);
  const hasPairs = pool.some((u) => u.entries.length > 1);
  // Leftovers wait until the main pool is empty (singles round) or are never drafted (cut).
  const hasLeftovers = pool.some((u) => u.leftover);
  const mainPoolEmpty = pool.every((u) => u.leftover);
  const leftoverTag = leftoverMode === "singles" ? "Singles round" : "Cut";

  // A duo pair stays on screen if either half matches — the half that didn't is dimmed, not hidden (StackedCell).
  const rows = useMemo(() => pool.filter((u) => u.entries.some(entryMatches)), [pool, entryMatches]);

  const columnOptions = useMemo(
    () => [
      { id: "discord", label: "Discord" },
      ...(showProfiles ? [{ id: "tier", label: "Tier" }, { id: "records", label: "Records" }, { id: "podiums", label: "Podiums" }, { id: "achievements", label: "Achievements" }] : []),
      ...(showWomStats ? [{ id: "ehb", label: "EHB" }, { id: "ehp", label: "EHP" }] : []),
      ...(showCa ? [{ id: "caCurrent", label: "Current CA" }, { id: "caPeak", label: "Peak CA" }] : []),
      ...(showAnswers ? questions.map((q) => ({ id: q.id, label: q.prompt })) : []),
    ],
    [showProfiles, showWomStats, showCa, showAnswers, questions],
  );

  const context = useMemo<PoolGridContext & { ratings: Ratings; onRate: typeof onRate }>(
    () => ({ search, entryMatches, statsRefreshing, onPick, picking, mainPoolEmpty, leftoverMode, leftoverTag, ratings: ratings ?? {}, onRate }),
    [search, entryMatches, statsRefreshing, onPick, picking, mainPoolEmpty, leftoverMode, leftoverTag, ratings, onRate],
  );

  const columnDefs = useMemo<ColDef<DraftUnit>[]>(() => {
    const cols: (ColDef<DraftUnit> | false)[] = [
      hasPairs && {
        colId: "pairIcon",
        headerName: "",
        cellRenderer: PairIconRenderer,
        width: 36,
        // Below defaultColDef's minWidth: 70 floor — needs its own, smaller one, or AG clamps width back up.
        minWidth: 36,
        pinned: "left",
        lockPosition: "left",
        sortable: false,
        resizable: false,
        suppressMovable: true,
      },
      !!ratings && {
        colId: "rating",
        headerName: "Rating",
        valueGetter: (p) => (p.data ? (ratings[p.data.entries[0]!.signup.id]?.stars ?? 0) : 0),
        comparator: makeUnitComparator("rating", ratings),
        cellRenderer: RatingRenderer,
        width: 140,
        // No static `sort: "desc"` here — the initialState fallback above sets it instead (see the comment
        // there for why a colDef-level default doesn't play well with a restored sort on another column).
        pinned: "left",
        lockPosition: "left",
        suppressMovable: true,
      },
      {
        colId: "rsn",
        headerName: "RSN",
        valueGetter: (p) => p.data?.entries[0]?.signup.rsn,
        comparator: makeUnitComparator("rsn", ratings ?? {}),
        cellRenderer: StackedCell,
        cellRendererParams: { render: rsnLine },
        tooltip: stackedTooltip((e) => e.signup.rsn),
        pinned: "left",
        lockPosition: "left",
        width: 170,
        sort: ratings ? undefined : "asc",
        suppressMovable: true,
      },
      {
        colId: "discord",
        headerName: "Discord",
        valueGetter: (p) => (p.data ? discordName(p.data.entries[0]!.user) : ""),
        comparator: makeUnitComparator("discord", ratings ?? {}),
        cellRenderer: StackedCell,
        cellRendererParams: { render: discordLine },
        tooltip: stackedTooltip((e) => discordName(e.user)),
        width: 150,
      },
      hasLeftovers && { colId: "leftover", headerName: "", cellRenderer: LeftoverBadgeRenderer, width: 130, sortable: false, resizable: false },
      showProfiles && {
        colId: "tier",
        headerName: "Tier",
        valueGetter: (p) => p.data?.entries[0]?.tectonicProfile?.points ?? -1,
        comparator: makeUnitComparator("tier", ratings ?? {}),
        cellRenderer: StackedCell,
        cellRendererParams: { render: tierLine },
        tooltip: false,
        width: 120,
      },
      showProfiles && {
        colId: "records",
        headerName: "Records",
        valueGetter: (p) => (p.data?.entries[0]?.tectonicProfile ? placeScore(recordSummary(p.data.entries[0].tectonicProfile)) : -1),
        comparator: makeUnitComparator("records", ratings ?? {}),
        cellRenderer: StackedCell,
        cellRendererParams: { render: recordsLine },
        tooltip: false,
        cellClass: "num",
        width: 100,
      },
      showProfiles && {
        colId: "podiums",
        headerName: "Podiums",
        valueGetter: (p) => (p.data?.entries[0]?.tectonicProfile ? placeScore(podiumSummary(p.data.entries[0].tectonicProfile)) : -1),
        comparator: makeUnitComparator("podiums", ratings ?? {}),
        cellRenderer: StackedCell,
        cellRendererParams: { render: podiumsLine },
        tooltip: false,
        cellClass: "num",
        width: 110,
      },
      showProfiles && { colId: "achievements", headerName: "Achievements", cellRenderer: StackedCell, cellRendererParams: { render: achievementsLine }, sortable: false, width: 120 },
      showWomStats && {
        colId: "ehb",
        headerName: "EHB",
        valueGetter: (p) => p.data?.entries[0]?.womStats?.ehb ?? -1,
        comparator: makeUnitComparator("ehb", ratings ?? {}),
        cellRenderer: StackedCell,
        cellRendererParams: { render: womLine("ehb", statsRefreshing) },
        tooltip: false,
        cellClass: "num",
        width: 90,
      },
      showWomStats && {
        colId: "ehp",
        headerName: "EHP",
        valueGetter: (p) => p.data?.entries[0]?.womStats?.ehp ?? -1,
        comparator: makeUnitComparator("ehp", ratings ?? {}),
        cellRenderer: StackedCell,
        cellRendererParams: { render: womLine("ehp", statsRefreshing) },
        tooltip: false,
        cellClass: "num",
        width: 90,
      },
      showCa && {
        colId: "caCurrent",
        headerName: "Current CA",
        valueGetter: (p) => p.data?.entries[0]?.caCurrent?.points ?? -1,
        comparator: makeUnitComparator("caCurrent", ratings ?? {}),
        cellRenderer: StackedCell,
        cellRendererParams: { render: caLine("caCurrent", statsRefreshing) },
        tooltip: stackedTooltip((e) => caTitle(e.caCurrent)),
        width: 120,
      },
      showCa && {
        colId: "caPeak",
        headerName: "Peak CA",
        valueGetter: (p) => p.data?.entries[0]?.caPeak?.points ?? -1,
        comparator: makeUnitComparator("caPeak", ratings ?? {}),
        cellRenderer: StackedCell,
        cellRendererParams: { render: caLine("caPeak", statsRefreshing) },
        tooltip: stackedTooltip((e) => caTitle(e.caPeak)),
        width: 120,
      },
      canPick && {
        colId: "draft",
        headerName: "",
        cellRenderer: DraftButtonRenderer,
        pinned: "right",
        lockPosition: "right",
        suppressMovable: true,
        width: 130,
        sortable: false,
        resizable: false,
      },
    ];
    const questionCols: ColDef<DraftUnit>[] = showAnswers
      ? questions.map((q) => ({
            colId: q.id,
            headerName: q.prompt,
            valueGetter: (p) => formatSignupAnswer(q.type, p.data?.entries[0]?.answers?.find((a) => a.questionId === q.id)?.value),
            comparator: makeUnitComparator(q.id, ratings ?? {}),
            cellRenderer: StackedCell,
            cellRendererParams: { render: answerLine(q) },
            tooltip: stackedTooltip((e) => formatSignupAnswer(q.type, e.answers?.find((a) => a.questionId === q.id)?.value)),
            width: 192,
          }))
      : [];
    // The Draft column must stay last (pinned right, so position among the rest doesn't matter, but keeping it
    // at the end of the array matches how the other columns read left-to-right).
    const draftCol = cols.find((c): c is ColDef<DraftUnit> => c !== false && c.colId === "draft");
    const rest = cols.filter((c): c is ColDef<DraftUnit> => c !== false && c.colId !== "draft");
    return [...rest, ...questionCols, ...(draftCol ? [draftCol] : [])];
    // Visibility is grid state now (initialState/onStateUpdated below), not something columnDefs re-imposes —
    // hiddenColumns/shown aren't dependencies here on purpose; a column that structurally exists always does,
    // and only starts hidden via initialState.
  }, [ratings, hasPairs, hasLeftovers, showProfiles, showWomStats, showCa, showAnswers, questions, canPick, statsRefreshing]);

  // lockPinned: a column's pinned state (left/unpinned) is set by the colDef, not by the user — without this, an
  // unpinned column can be dragged past the pinned pairIcon/rating/RSN block into it, which looked like a bug.
  const defaultColDef = useMemo<ColDef<DraftUnit>>(
    () => ({ sortable: true, resizable: true, minWidth: 70, headerTooltip: true, tooltipComponent: StackedTooltip, lockPinned: true }),
    [],
  );

  // A pair's row needs room for two stacked lines; a solo unit needs one. AG Grid Community supports per-row
  // height via this callback (not an Enterprise feature) — the theme's own rowHeight (44) is the solo/fallback.
  const getRowHeight = useCallback((params: RowHeightParams<DraftUnit>) => (params.data && params.data.entries.length > 1 ? 84 : 44), []);
  const getRowId = useCallback((params: GetRowIdParams<DraftUnit>) => params.data.pairingId ?? params.data.entries[0]!.signup.id, []);
  // Waiting for the singles round (or cut, once one is decided) — same muted treatment the old table gave the
  // whole tbody. AG's own row border (the theme's default) is the only cue for where one unit ends and the next
  // begins, which is easy to misread for a duo pair right after a solo unit — this doesn't change that, but the
  // leftover row keeps standing out despite the striping (see below) either way.
  const getRowClass = useCallback((params: RowClassParams<DraftUnit>) => (params.data?.leftover ? "text-on-surface-subtle" : ""), []);

  // Same fixed-height-fills-the-viewport behaviour as SignupRosterGrid, not the pool's own previous
  // shrinks-with-content one (a comment here used to explain deliberately NOT doing this, so the pool wouldn't
  // look like a tall broken grid once most players were drafted — that trade-off was reconsidered in favour of
  // matching the signup roster's table exactly: a stable height, empty space below the last row late in the
  // draft rather than the grid itself resizing under the mod's cursor). domLayout="normal" (unset, AG's own
  // default) needs a real height on its container — useDocumentTop's measured remaining-viewport value becomes
  // that directly, same as the signup roster. minHeight: MIN_TABLE_HEIGHT is the same floor for the same reason.
  const [tableWrapper, setTableWrapper] = useState<HTMLDivElement | null>(null);
  const tableTop = useDocumentTop(tableWrapper);
  // 2.5rem, not SignupRosterGrid's own 1.5rem: 1.5rem is that same page-bottom padding (DraftRoom's page wrapper
  // has it too, confirmed via getComputedStyle — this grid's own useDocumentTop measurement already covers
  // everything ABOVE the wrapper, but not what's below it before the page's actual edge). +1rem on top of that
  // for this grid's own Card (DraftRoom's own p-4), whose bottom padding sits between the wrapper and that page
  // edge — SignupRoster's bare wrapper has no such Card, so it never needed the extra rem. Getting this short
  // by even a few px is exactly what caused a double scrollbar (confirmed live: docScrollHeight 9px taller than
  // the viewport at 2rem) — the page itself scrolling a hair as well as the grid's own internal one.
  const tableHeight = `calc(100dvh - ${tableTop}px - 2.5rem)`;

  const onGridReady = useCallback((e: GridReadyEvent<DraftUnit>) => {
    gridApiRef.current = e.api;
    // Belt-and-suspenders reassertion of the fixed pinned columns, matching the same fix on SignupRosterGrid —
    // whichever of these don't exist in this render (no pairs, not a lead, can't pick) are just ignored.
    e.api.applyColumnState({
      state: [
        { colId: "pairIcon", pinned: "left" },
        { colId: "rating", pinned: "left" },
        { colId: "rsn", pinned: "left" },
        { colId: "draft", pinned: "right" },
      ],
    });
  }, []);
  // The single source of truth for "which columns are hidden" is the grid's own state from here on — this fires
  // for a ColumnPicker toggle (via setColumnsVisible below) and for AG's own header-drag-to-hide alike, so
  // hiddenColumns (and the persisted store behind it) can't drift from what the grid is actually showing.
  const onStateUpdated = useCallback((e: StateUpdatedEvent<DraftUnit>) => {
    setHiddenColumns(new Set(e.state.columnVisibility?.hiddenColIds ?? []));
    const orderedColIds = e.state.columnOrder?.orderedColIds;
    try {
      localStorage.setItem(
        GRID_STATE_KEY,
        JSON.stringify({
          columnOrder: orderedColIds?.length ? { orderedColIds: fixedColsInPlace(orderedColIds) } : undefined,
          columnSizing: e.state.columnSizing,
          sort: e.state.sort,
        }),
      );
    } catch {
      // Private browsing / storage quota — persistence is a nicety, not required.
    }
  }, [setHiddenColumns]);
  const handleHiddenChange = useCallback(
    (next: Set<string>) => {
      const api = gridApiRef.current;
      if (!api) return;
      const toHide = [...next].filter((id) => !hiddenColumns.has(id));
      const toShow = [...hiddenColumns].filter((id) => !next.has(id));
      if (toHide.length > 0) api.setColumnsVisible(toHide, false);
      if (toShow.length > 0) api.setColumnsVisible(toShow, true);
    },
    [hiddenColumns],
  );

  // Every column whose LineRender uses Mark (search-match highlighting) — matches SignupRosterGrid's own
  // refreshCells-on-search effect, for the same reason: `rows` (rowData) filters to the same DraftUnit *objects*
  // as the search narrows, so a unit that already matched keeps the exact same object reference across
  // keystrokes. AG's diffing sees "this row's data didn't change" and skips re-rendering its cells — a custom
  // renderer reading a *prop* like context.search never learns the query grew from "co" to "cosmic" unless told
  // to. Without this, a row picks up whatever the query happened to be the moment it first matched (often just
  // the first character or two) and never updates again, which is exactly the "only highlights the first couple
  // characters" bug this fixes.
  const markColumnIds = useMemo(() => ["rsn", "discord", ...questions.map((q) => q.id)], [questions]);
  useEffect(() => {
    gridApiRef.current?.refreshCells({ force: true, columns: markColumnIds });
  }, [search, markColumnIds]);

  if (pool.length === 0) return <p className="text-sm text-on-surface-subtle">No one left to draft.</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <TableSearchInput value={search} onChange={setSearch} matchCount={matchingEntries.length} totalCount={entries.length} />
        <ColumnPicker columns={columnOptions} hidden={hiddenColumns} onHiddenChange={handleHiddenChange} />
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-on-surface-subtle">No one matches this search.</p>
      ) : (
        <div ref={setTableWrapper} className="overflow-hidden" style={{ height: tableHeight, minHeight: MIN_TABLE_HEIGHT }}>
          <AgGridReact<DraftUnit>
            theme={gridTheme}
            rowData={rows}
            getRowId={getRowId}
            getRowHeight={getRowHeight}
            getRowClass={getRowClass}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            initialState={initialState}
            maintainColumnOrder
            onGridReady={onGridReady}
            onStateUpdated={onStateUpdated}
            context={context}
            animateRows={false}
            tooltipShowDelay={200}
            tooltipHideDelay={4000}
            enableCellTextSelection
          />
        </div>
      )}
    </div>
  );
}
