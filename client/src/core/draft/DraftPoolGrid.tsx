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
import { useCallback, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { CustomCellRendererProps } from "ag-grid-react";
import type { ColDef, GetRowIdParams, IRowNode, RowClassParams, RowHeightParams } from "ag-grid-community";
import {
  formatSignupAnswer,
  type DraftPoolEntry,
  type DraftUnit,
  type LeftoverMode,
  type PickRating,
  type SignupQuestion,
} from "@bingo/shared";
import { useStatsRefreshingSignupIds } from "../../context/WebSocketContext";
import { CaCell, WomCell, formatCaTier, formatWomStat } from "../signup/caStats";
import { discordName } from "../ui/user";
import { gridTheme } from "../ui/agGrid";
import { AccountTypeIcon } from "../ui/AccountTypeIcon";
import { Badge } from "../ui/Card";
import { ColumnPicker } from "../ui/ColumnPicker";
import { CellButton, Mark } from "../ui/gridCells";
import { useHiddenColumns } from "../ui/hiddenColumns";
import { LinkIcon } from "../ui/icons";
import { compareSortValues } from "../ui/tableSort";
import { TableSearchInput, matchesSearch, useTableSearch } from "../ui/tableSearch";
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

// A pair sorts by whichever half ranks first (under the *active* sort direction — "first" means smallest
// ascending, largest descending), so the pair sits where its stronger/earlier member would on their own. AG's
// comparator gets isDescending, so this is computed here rather than needing a resorted copy of unit.entries the
// way the old table's sortUnit did — entries stay in their original order for the stack's own display order.
function makeUnitComparator(key: SortKey, ratings: Ratings) {
  return (_a: unknown, _b: unknown, nodeA: IRowNode<DraftUnit>, nodeB: IRowNode<DraftUnit>, isDescending: boolean): number => {
    const bestOf = (unit: DraftUnit | undefined): string | number => {
      if (!unit) return "";
      let best = poolSortValue(unit.entries[0]!, key, ratings);
      for (const e of unit.entries.slice(1)) {
        const v = poolSortValue(e, key, ratings);
        const better = isDescending ? compareSortValues(v, best) > 0 : compareSortValues(v, best) < 0;
        if (better) best = v;
      }
      return best;
    };
    return compareSortValues(bestOf(nodeA.data), bestOf(nodeB.data));
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
const StackedCell = ({ data, context, render }: CustomCellRendererProps<DraftUnit, unknown, PoolGridContext> & { render: LineRender }) => {
  if (!data) return null;
  if (data.entries.length === 1) return <>{render(data.entries[0]!, { dim: false, search: context.search })}</>;
  return (
    <div className="flex flex-col justify-center gap-1 py-1">
      {data.entries.map((e) => (
        <div key={e.signup.id}>{render(e, { dim: !!context.search && !context.entryMatches(e), search: context.search })}</div>
      ))}
    </div>
  );
};

function dimClass(dim: boolean): string | undefined {
  return dim ? "opacity-50" : undefined;
}

const rsnLine: LineRender = (entry, { dim, search }) => (
  <span className={`inline-flex min-w-0 items-center gap-1 ${dimClass(dim) ?? ""}`} title={entry.signup.rsn}>
    <AccountTypeIcon accountType={entry.accountType} />
    <PlayerName userId={entry.user.id} className="min-w-0 truncate">
      <Mark text={entry.signup.rsn} query={search} />
    </PlayerName>
  </span>
);

const discordLine: LineRender = (entry, { dim, search }) => {
  const text = discordName(entry.user);
  return (
    <span className={`block truncate text-on-surface-muted ${dimClass(dim) ?? ""}`} title={text}>
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
      <CaCell stats={entry[field]} loading={statsRefreshing.has(entry.signup.id)} />
    </span>
  );
}

function answerLine(question: SignupQuestion): LineRender {
  return (entry, { dim, search }) => {
    const answer = formatSignupAnswer(question.type, entry.answers?.find((a) => a.questionId === question.id)?.value);
    return answer ? (
      <span className={`block truncate text-on-surface-muted ${dimClass(dim) ?? ""}`} title={answer}>
        <Mark text={answer} query={search} />
      </span>
    ) : (
      <span className="text-on-surface-subtle">—</span>
    );
  };
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

export function DraftPoolGrid({
  pool,
  questions,
  ratings,
  onRate,
  canPick,
  onPick,
  picking,
  leftoverMode,
  maxHeight,
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
  /** The grid's own natural content height is capped at this — see the height/getRowHeight comment below. */
  maxHeight: string;
}) {
  const [hiddenColumns, setHiddenColumns] = useHiddenColumns("draftPool");
  const shown = useCallback((id: string) => !hiddenColumns.has(id), [hiddenColumns]);
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
      hasPairs && { colId: "pairIcon", headerName: "", cellRenderer: PairIconRenderer, width: 36, pinned: "left", sortable: false, resizable: false, suppressMovable: true },
      !!ratings && {
        colId: "rating",
        headerName: "Rating",
        valueGetter: (p) => (p.data ? (ratings[p.data.entries[0]!.signup.id]?.stars ?? 0) : 0),
        comparator: makeUnitComparator("rating", ratings),
        cellRenderer: RatingRenderer,
        width: 140,
        sort: "desc",
      },
      {
        colId: "rsn",
        headerName: "RSN",
        valueGetter: (p) => p.data?.entries[0]?.signup.rsn,
        comparator: makeUnitComparator("rsn", ratings ?? {}),
        cellRenderer: StackedCell,
        cellRendererParams: { render: rsnLine },
        pinned: "left",
        width: 170,
        sort: ratings ? undefined : "asc",
      },
      shown("discord") && {
        colId: "discord",
        headerName: "Discord",
        valueGetter: (p) => (p.data ? discordName(p.data.entries[0]!.user) : ""),
        comparator: makeUnitComparator("discord", ratings ?? {}),
        cellRenderer: StackedCell,
        cellRendererParams: { render: discordLine },
        width: 150,
      },
      hasLeftovers && { colId: "leftover", headerName: "", cellRenderer: LeftoverBadgeRenderer, width: 130, sortable: false, resizable: false },
      showProfiles &&
        shown("tier") && {
          colId: "tier",
          headerName: "Tier",
          valueGetter: (p) => p.data?.entries[0]?.tectonicProfile?.points ?? -1,
          comparator: makeUnitComparator("tier", ratings ?? {}),
          cellRenderer: StackedCell,
          cellRendererParams: { render: tierLine },
          width: 120,
        },
      showProfiles &&
        shown("records") && {
          colId: "records",
          headerName: "Records",
          valueGetter: (p) => (p.data?.entries[0]?.tectonicProfile ? placeScore(recordSummary(p.data.entries[0].tectonicProfile)) : -1),
          comparator: makeUnitComparator("records", ratings ?? {}),
          cellRenderer: StackedCell,
          cellRendererParams: { render: recordsLine },
          cellClass: "num",
          width: 100,
        },
      showProfiles &&
        shown("podiums") && {
          colId: "podiums",
          headerName: "Podiums",
          valueGetter: (p) => (p.data?.entries[0]?.tectonicProfile ? placeScore(podiumSummary(p.data.entries[0].tectonicProfile)) : -1),
          comparator: makeUnitComparator("podiums", ratings ?? {}),
          cellRenderer: StackedCell,
          cellRendererParams: { render: podiumsLine },
          cellClass: "num",
          width: 110,
        },
      showProfiles && shown("achievements") && { colId: "achievements", headerName: "Achievements", cellRenderer: StackedCell, cellRendererParams: { render: achievementsLine }, sortable: false, width: 120 },
      showWomStats &&
        shown("ehb") && {
          colId: "ehb",
          headerName: "EHB",
          valueGetter: (p) => p.data?.entries[0]?.womStats?.ehb ?? -1,
          comparator: makeUnitComparator("ehb", ratings ?? {}),
          cellRenderer: StackedCell,
          cellRendererParams: { render: womLine("ehb", statsRefreshing) },
          cellClass: "num",
          width: 90,
        },
      showWomStats &&
        shown("ehp") && {
          colId: "ehp",
          headerName: "EHP",
          valueGetter: (p) => p.data?.entries[0]?.womStats?.ehp ?? -1,
          comparator: makeUnitComparator("ehp", ratings ?? {}),
          cellRenderer: StackedCell,
          cellRendererParams: { render: womLine("ehp", statsRefreshing) },
          cellClass: "num",
          width: 90,
        },
      showCa &&
        shown("caCurrent") && {
          colId: "caCurrent",
          headerName: "Current CA",
          valueGetter: (p) => p.data?.entries[0]?.caCurrent?.points ?? -1,
          comparator: makeUnitComparator("caCurrent", ratings ?? {}),
          cellRenderer: StackedCell,
          cellRendererParams: { render: caLine("caCurrent", statsRefreshing) },
          width: 120,
        },
      showCa &&
        shown("caPeak") && {
          colId: "caPeak",
          headerName: "Peak CA",
          valueGetter: (p) => p.data?.entries[0]?.caPeak?.points ?? -1,
          comparator: makeUnitComparator("caPeak", ratings ?? {}),
          cellRenderer: StackedCell,
          cellRendererParams: { render: caLine("caPeak", statsRefreshing) },
          width: 120,
        },
      canPick && {
        colId: "draft",
        headerName: "",
        cellRenderer: DraftButtonRenderer,
        pinned: "right",
        width: 130,
        sortable: false,
        resizable: false,
      },
    ];
    const questionCols: ColDef<DraftUnit>[] = showAnswers
      ? questions
          .filter((q) => shown(q.id))
          .map((q) => ({
            colId: q.id,
            headerName: q.prompt,
            valueGetter: (p) => formatSignupAnswer(q.type, p.data?.entries[0]?.answers?.find((a) => a.questionId === q.id)?.value),
            comparator: makeUnitComparator(q.id, ratings ?? {}),
            cellRenderer: StackedCell,
            cellRendererParams: { render: answerLine(q) },
            width: 192,
          }))
      : [];
    // The Draft column must stay last (pinned right, so position among the rest doesn't matter, but keeping it
    // at the end of the array matches how the other columns read left-to-right).
    const draftCol = cols.find((c): c is ColDef<DraftUnit> => c !== false && c.colId === "draft");
    const rest = cols.filter((c): c is ColDef<DraftUnit> => c !== false && c.colId !== "draft");
    return [...rest, ...questionCols, ...(draftCol ? [draftCol] : [])];
  }, [ratings, hasPairs, hasLeftovers, showProfiles, showWomStats, showCa, showAnswers, questions, canPick, shown, statsRefreshing]);

  const defaultColDef = useMemo<ColDef<DraftUnit>>(() => ({ sortable: true, resizable: true, minWidth: 70, headerTooltip: true }), []);

  // A pair's row needs room for two stacked lines; a solo unit needs one. AG Grid Community supports per-row
  // height via this callback (not an Enterprise feature) — the theme's own rowHeight (44) is the solo/fallback.
  const getRowHeight = useCallback((params: RowHeightParams<DraftUnit>) => (params.data && params.data.entries.length > 1 ? 72 : 44), []);
  const getRowId = useCallback((params: GetRowIdParams<DraftUnit>) => params.data.pairingId ?? params.data.entries[0]!.signup.id, []);
  // Waiting for the singles round (or cut, once one is decided) — same muted treatment the old table gave the
  // whole tbody. AG's own row border (the theme's default) is the only cue for where one unit ends and the next
  // begins, which is easy to misread for a duo pair right after a solo unit — this doesn't change that, but the
  // leftover row keeps standing out despite the striping (see below) either way.
  const getRowClass = useCallback((params: RowClassParams<DraftUnit>) => (params.data?.leftover ? "text-on-surface-subtle" : ""), []);

  // No domLayout="autoHeight" (it ignores a height cap entirely) and no fixed height sized to maxHeight (the
  // pool shrinks as the draft goes — a tall empty grid looks broken for the last few picks). Setting both height
  // (the content's own natural size) and maxHeight lets CSS take min(height, maxHeight): the grid sizes itself
  // to its rows normally, but still gets capped and scrolls internally once the pool is bigger than the
  // available space, matching the old table's overflow-auto + max-height behaviour.
  const naturalHeight = 40 + rows.reduce((h, u) => h + (u.entries.length > 1 ? 72 : 44), 0);

  if (pool.length === 0) return <p className="text-sm text-on-surface-subtle">No one left to draft.</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <TableSearchInput value={search} onChange={setSearch} matchCount={matchingEntries.length} totalCount={entries.length} />
        <ColumnPicker columns={columnOptions} hidden={hiddenColumns} onHiddenChange={setHiddenColumns} />
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-on-surface-subtle">No one matches this search.</p>
      ) : (
        <div className="overflow-hidden" style={{ height: naturalHeight, maxHeight }}>
          <AgGridReact<DraftUnit>
            theme={gridTheme}
            rowData={rows}
            getRowId={getRowId}
            getRowHeight={getRowHeight}
            getRowClass={getRowClass}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            context={context}
            animateRows={false}
            enableCellTextSelection
          />
        </div>
      )}
    </div>
  );
}
