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
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AgGridReact } from "ag-grid-react";
import type { CustomCellEditorProps, CustomCellRendererProps } from "ag-grid-react";
import type {
  ColDef,
  GetRowIdParams,
  GridApi,
  GridReadyEvent,
  GridState,
  IRowNode,
  ITooltipParams,
  RowHeightParams,
  StateUpdatedEvent,
  TooltipCallbackParams,
} from "ag-grid-community";
import {
  formatSignupAnswer,
  formatTimeZone,
  MAX_RATING_STARS,
  timeZoneOffsetMinutes,
  type DraftPoolEntry,
  type DraftUnit,
  type PickRating,
  type SignupQuestion,
} from "@bingo/shared";
import { useStatsRefreshingSignupIds } from "../../context/WebSocketContext";
import { CaCell, WomCell, caTitle, formatCaTier, formatWomStat } from "../signup/caStats";
import { discordName } from "../ui/user";
import { useGridTheme } from "../ui/agGrid";
import { ColumnPicker } from "../ui/ColumnPicker";
import { MultiSelect } from "../ui/MultiSelect";
import { REGION_OPTIONS, regionOf } from "../ui/timezoneFilter";
import { usePreference } from "../ui/preferences";
import { Switch } from "../ui/Switch";
import { CellButton, Mark } from "../ui/gridCells";
import { useHiddenColumns } from "../ui/hiddenColumns";
import { LinkIcon, PencilIcon, StarIcon } from "../ui/icons";
import { compareSortValues } from "../ui/tableSort";
import { TableSearchInput, matchesSearch, useTableSearch } from "../ui/tableSearch";
import { useDocumentTop, useOffsetWithin } from "../ui/tableChrome";
import { PlayerName } from "../tectonic/PlayerName";
import { ClanHonourIcons, PlaceBreakdown, TierBadge } from "../tectonic/ProfileBadges";
import { podiumSummary, podiumTitle, recordSummary, recordTitle } from "../tectonic/profile";
import { RatingCell } from "./RatingCell";
import { buildPoolCsv } from "./poolCsv";
import { Button } from "../ui/Button";
import { placeScore, poolSearchValues, takesBlock, unitSortValue, type PoolRatings, type PoolSortKey, type Takes } from "./poolData";
import { headerTooltip, usefulTooltip } from "../ui/gridTooltips";

type SortKey = PoolSortKey;
type Ratings = PoolRatings;

// AG hands the comparator isDescending, so a pair ranks by its better half under the active direction (unitSortValue)
// without a resorted copy of unit.entries — entries stay in their original order for the stack's own display order.
function makeUnitComparator(key: SortKey, ratings: Ratings) {
  return (_a: unknown, _b: unknown, nodeA: IRowNode<DraftUnit>, nodeB: IRowNode<DraftUnit>, isDescending: boolean): number => {
    const valueOf = (unit: DraftUnit | undefined): string | number => (unit ? unitSortValue(unit, key, ratings, isDescending) : "");
    return compareSortValues(valueOf(nodeA.data), valueOf(nodeB.data));
  };
}

interface PoolGridContext {
  search: string;
  /** Search or the timezone filter is narrowing the pool: a pair's non-matching half is dimmed, not hidden. */
  filtering: boolean;
  entryMatches: (entry: DraftPoolEntry) => boolean;
  statsRefreshing: ReadonlySet<string>;
  onPick: (userId: string) => void;
  picking: boolean;
  /** What the team on the clock may still draft (a team with its share of pairs can't take another); null: anything. */
  takes: Takes;
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
  // py-1: AG clips the cell to its content, and a solo line's content box ends at the text, above where PlayerName
  // draws its dotted underline (3px below, in borrowed space) — a pair's own padding already leaves that room.
  if (data.entries.length === 1) return <div className="py-1 leading-tight">{render(data.entries[0]!, { dim: false, search: context.search })}</div>;
  return (
    <div className="flex flex-col justify-center gap-5 py-2 leading-tight">
      {data.entries.map((e) => (
        <div key={e.signup.id}>{render(e, { dim: context.filtering && !context.entryMatches(e), search: context.search })}</div>
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
  <span className={`inline-flex max-w-full min-w-0 items-center ${dimClass(dim) ?? ""}`}>
    {/* The badge's slot is kept for a player with none, so the names in the column line up. */}
    <PlayerName userId={entry.user.id} accountType={entry.accountType} badge="reserve" className="min-w-0 truncate">
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

const timezoneLine: LineRender = (entry, { dim }) =>
  entry.signup.timezone ? (
    <span className={`block truncate text-on-surface-muted ${dimClass(dim) ?? ""}`}>{formatTimeZone(entry.signup.timezone)}</span>
  ) : (
    <span className="text-on-surface-subtle">—</span>
  );

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

const achievementsLine: LineRender = (entry, { dim }) => (entry.tectonicProfile ? <span className={dimClass(dim)}><ClanHonourIcons profile={entry.tectonicProfile} /></span> : null);

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
// Only shown when it'd tell you something (gridTooltips.ts): a half cut off, or detail the cell doesn't show.
function stackedTooltip(getText: (entry: DraftPoolEntry) => string) {
  return (p: TooltipCallbackParams<DraftUnit>): string => {
    if (!p.data) return "";
    const texts = p.data.entries.map(getText);
    const text = p.data.entries.length === 1 ? texts[0]! : p.data.entries.map((e, i) => `${e.signup.rsn}: ${texts[i]}`).join("\n");
    return usefulTooltip(p, text, texts);
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
  return <RatingCell rating={context.ratings[signupId]} onChange={(r) => context.onRate(signupId, r)} showNote={false} />;
};

type RatingContext = PoolGridContext & { ratings: Ratings; onRate: (signupId: string, rating: PickRating) => void };

// The Rating cell's editor, for the keyboard (Enter on the cell opens it): ← and → take the stars down and up (0 to 3,
// no wrapping), Enter saves them (the column's valueSetter), Escape cancels. A click on a star still rates at once.
function RatingEditor({ value, onValueChange }: CustomCellEditorProps<DraftUnit, number, RatingContext>) {
  const [stars, setStars] = useState(value ?? 0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const change = (next: number) => {
    setStars(next);
    onValueChange(next);
  };
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="slider"
      aria-label="Rating: left and right to change, Enter to save, Escape to cancel"
      aria-valuemin={0}
      aria-valuemax={MAX_RATING_STARS}
      aria-valuenow={stars}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") change(Math.max(0, stars - 1));
        else if (e.key === "ArrowRight") change(Math.min(MAX_RATING_STARS, stars + 1));
        else return;
        e.preventDefault();
      }}
      // Centred: an editing cell loses its padding, so left-aligned the stars would jump sideways from where they sat.
      className="flex h-full w-full items-center justify-center outline-none"
    >
      {/* The ring says it's being edited; the stars are the pending rating. */}
      <div className="flex rounded-sm ring-1 ring-warn">
        {Array.from({ length: MAX_RATING_STARS }, (_, i) => i + 1).map((n) => (
          <span key={n} className={`flex size-6 items-center justify-center ${n <= stars ? "text-warn" : "text-on-surface-subtle"}`}>
            <StarIcon size={14} fill={n <= stars ? "currentColor" : "none"} />
          </span>
        ))}
      </div>
    </div>
  );
}

// The captain's (and co-captain's) note on a unit, edited in the cell (AG's large text editor, a popup textarea: see the Note column). The
// pencil says it's editable at a glance; an empty one invites a note. A long note wraps to fill the row (2 lines for a
// solo player's row, 4 for a pair's taller one) before it's cut off with an ellipsis.
const NoteRenderer = ({ value, data }: CustomCellRendererProps<DraftUnit, string>) => (
  <span className="flex h-full min-w-0 cursor-text items-center gap-1.5">
    <span
      className={`min-w-0 flex-1 whitespace-normal break-words leading-tight ${data && data.entries.length > 1 ? "line-clamp-4" : "line-clamp-2"} ${
        value ? "text-on-surface" : "text-on-surface-subtle"
      }`}
    >
      {value || "Add a note"}
    </span>
    <PencilIcon size={12} className="shrink-0 text-on-surface-subtle" />
  </span>
);

const DraftButtonRenderer = ({ data, context }: CustomCellRendererProps<DraftUnit, unknown, PoolGridContext>) => {
  if (!data) return null;
  const isPair = data.entries.length > 1;
  const blocked = takesBlock(data, context.takes);
  return (
    // pr-4: the grid's vertical scrollbar overlays the last ~16px of this pinned-right column and would clip the button.
    <div className="flex h-full items-center justify-center pr-4">
      <CellButton variant="primary" className="w-24" onClick={() => context.onPick(data.entries[0]!.user.id)} disabled={context.picking || !!blocked} title={blocked ?? undefined}>
        {isPair ? "Draft pair" : "Draft"}
      </CellButton>
    </div>
  );
};

const PairIconRenderer = ({ data }: CustomCellRendererProps<DraftUnit>) => (data && data.entries.length > 1 ? <LinkIcon size={14} aria-label="Duo pair" className="text-on-surface-subtle" /> : null);


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

const RATING_WIDTH = 96;
// The Rating column was 140px wide while it also held the note's button. Every width gets saved, touched or not, so a
// saved 140 is almost certainly that old default rather than someone's choice: it's dropped, for the new default.
const OLD_RATING_WIDTH = 140;
function withoutOldRatingWidth(sizing: NonNullable<GridState["columnSizing"]>): NonNullable<GridState["columnSizing"]> {
  return { ...sizing, columnSizingModel: sizing.columnSizingModel.filter((c) => !(c.colId === "rating" && c.width === OLD_RATING_WIDTH)) };
}

// An order saved before the Note column existed lacks it, and AG would put a column the saved order doesn't list at
// the end, far from the stars; it goes right after RSN instead, as it does for someone with no saved order.
function withNoteAfterRsn(ids: string[]): string[] {
  if (ids.includes("note")) return ids;
  const at = ids.indexOf("rsn");
  return at === -1 ? ids : [...ids.slice(0, at + 1), "note", ...ids.slice(at + 1)];
}

function readDraftColumnState(): Pick<GridState, "columnOrder" | "columnSizing" | "sort"> {
  try {
    const raw = localStorage.getItem(GRID_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as GridState;
    if (!parsed || typeof parsed !== "object") return {};
    const orderedColIds = parsed.columnOrder?.orderedColIds?.filter((id) => typeof id === "string");
    return {
      ...(orderedColIds?.length ? { columnOrder: { orderedColIds: fixedColsInPlace(withNoteAfterRsn(orderedColIds)) } } : {}),
      ...(parsed.columnSizing ? { columnSizing: withoutOldRatingWidth(parsed.columnSizing) } : {}),
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
  takes,
  heading,
  pinnedTop,
  widthSwitch = true,
}: {
  /** Shown at the left of the toolbar row (DraftRoom's "Available players (n)"). */
  heading: ReactNode;
  /** When the grid's panel is pinned (sticky, in a [data-pinned-pool] block) this far from the top of the window: the
   *  table is sized to the window from there, not from its place in the document, which moves as the page scrolls. */
  pinnedTop?: number;
  /** The "Full width" switch (off where the room lays the table out itself). */
  widthSwitch?: boolean;
  pool: DraftUnit[];
  questions: SignupQuestion[];
  /** Present only for team leads (captain and co-captain): they see and edit their ratings. Never the team's other players. */
  ratings: Ratings | null;
  onRate: (signupId: string, rating: PickRating) => void;
  canPick: boolean;
  onPick: (userId: string) => void;
  picking: boolean;
  /** What the team on the clock may still draft (DraftState.currentPick.takes); null: anything. */
  takes: Takes;
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
  // Unticked regions (MultiSelect), so every region shows by default.
  const [excludedRegions, setExcludedRegions] = useState<string[]>([]);
  // The wrapper that actually changes width is DraftRoom's — this just renders the switch for it in the toolbar.
  const [poolWidth, setPoolWidth] = usePreference("draftPoolWidth");
  const statsRefreshing = useStatsRefreshingSignupIds();
  const [copied, setCopied] = useState(false);

  async function copyCsv() {
    await navigator.clipboard.writeText(buildPoolCsv(pool, questions, ratings));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const entries = useMemo(() => pool.flatMap((u) => u.entries), [pool]);
  const entryMatches = useCallback(
    (e: DraftPoolEntry) => !excludedRegions.includes(regionOf(e.signup.timezone)) && matchesSearch(poolSearchValues(e, questions), search),
    [questions, search, excludedRegions],
  );
  const filtering = !!search || excludedRegions.length > 0;
  const matchingEntries = useMemo(() => entries.filter(entryMatches), [entries, entryMatches]);
  // Answers are only sent to mods/captains — everyone else's pool entries have answers: null, so skip those
  // columns entirely rather than render a table full of "—". Same reasoning for WOM/CA (unused integration) and
  // profiles (tectonic-api not registered).
  const showAnswers = entries.some((e) => e.answers !== null);
  const showWomStats = entries.some((e) => e.womStats !== null || statsRefreshing.has(e.signup.id));
  const showCa = entries.some((e) => e.caCurrent !== null || e.caPeak !== null || statsRefreshing.has(e.signup.id));
  const showProfiles = entries.some((e) => e.tectonicProfile !== null);
  const hasPairs = pool.some((u) => u.entries.length > 1);

  // A duo pair stays on screen if either half matches — the half that didn't is dimmed, not hidden (StackedCell).
  const rows = useMemo(() => pool.filter((u) => u.entries.some(entryMatches)), [pool, entryMatches]);

  const columnOptions = useMemo(
    () => [
      // Rating and Note can be hidden too, say to share your screen without showing your ratings.
      ...(ratings ? [{ id: "rating", label: "Rating" }, { id: "note", label: "Note" }] : []),
      { id: "discord", label: "Discord" },
      ...(showAnswers ? [{ id: "timezone", label: "Timezone" }] : []),
      ...(showProfiles ? [{ id: "tier", label: "Tier" }, { id: "records", label: "Records" }, { id: "podiums", label: "Podiums" }, { id: "achievements", label: "Achievements" }] : []),
      ...(showWomStats ? [{ id: "ehb", label: "EHB" }, { id: "ehp", label: "EHP" }] : []),
      ...(showCa ? [{ id: "caCurrent", label: "Current CA" }, { id: "caPeak", label: "Peak CA" }] : []),
      ...(showAnswers ? questions.map((q) => ({ id: q.id, label: q.prompt })) : []),
    ],
    [showProfiles, showWomStats, showCa, showAnswers, questions],
  );

  const context = useMemo<PoolGridContext & { ratings: Ratings; onRate: typeof onRate }>(
    () => ({ search, filtering, entryMatches, statsRefreshing, onPick, picking, takes, ratings: ratings ?? {}, onRate }),
    [search, filtering, entryMatches, statsRefreshing, onPick, picking, takes, ratings, onRate],
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
        // Keyboard: Enter on the cell opens RatingEditor (← → to change, Enter to save, Escape to cancel). A click on a
        // star rates at once, as ever.
        headerTooltip: "Your stars for this player. From the keyboard: Enter, then ← and → to change them, Enter to save",
        editable: true,
        cellEditor: RatingEditor,
        // While editing, ← and → are the editor's, not AG's move-to-the-next-cell.
        suppressKeyboardEvent: (p) => p.editing && (p.event.key === "ArrowLeft" || p.event.key === "ArrowRight"),
        // Saved through the same rating update as a click (optimistic, keeping the note); the cell reads it back.
        valueSetter: (p) => {
          if (!p.data) return false;
          const context = p.context as RatingContext;
          const signupId = p.data.entries[0]!.signup.id;
          const current = context.ratings[signupId] ?? { stars: 0, note: "" };
          const stars = Number(p.newValue) || 0;
          if (stars !== current.stars) context.onRate(signupId, { ...current, stars });
          return false;
        },
        // Just the three stars (3 x 24px) and the cell's padding; the note has a column of its own. Fixed: nothing in it
        // needs more room.
        width: RATING_WIDTH,
        resizable: false,
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
        width: 210,
        sort: ratings ? undefined : "asc",
        suppressMovable: true,
      },
      !!ratings && {
        colId: "note",
        headerName: "Note",
        headerTooltip: "Your note on this player (only your co-captain sees it). Click to edit.",
        // Pairs are rated (and noted) together, under the first half's signup, as with the stars.
        valueGetter: (p) => (p.data ? (ratings[p.data.entries[0]!.signup.id]?.note ?? "") : ""),
        // Saved through the same rating update as the stars (optimistic); the cell reads it back from the ratings.
        valueSetter: (p) => {
          if (!p.data) return false;
          const signupId = p.data.entries[0]!.signup.id;
          const current = p.context.ratings[signupId] ?? { stars: 0, note: "" };
          const note = String(p.newValue ?? "").trim();
          if (note !== current.note) p.context.onRate(signupId, { ...current, note });
          return false;
        },
        editable: true,
        singleClickEdit: true,
        cellEditor: "agLargeTextCellEditor",
        cellEditorPopup: true,
        cellEditorParams: { maxLength: 200, rows: 4, cols: 40 },
        cellRenderer: NoteRenderer,
        tooltip: false,
        width: 200,
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
      // Same visibility as the answers (the server only sends it to mods and captains), which it replaced one of.
      showAnswers && {
        colId: "timezone",
        headerName: "Timezone",
        valueGetter: (p) => p.data?.entries[0]?.signup.timezone ?? "",
        comparator: makeUnitComparator("timezone", ratings ?? {}),
        cellRenderer: StackedCell,
        cellRendererParams: { render: timezoneLine },
        tooltip: stackedTooltip((e) => e.signup.timezone ?? ""),
        width: 170,
      },
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
  }, [ratings, hasPairs, showProfiles, showWomStats, showCa, showAnswers, questions, canPick, statsRefreshing]);

  // lockPinned: a column's pinned state (left/unpinned) is set by the colDef, not by the user — without this, an
  // unpinned column can be dragged past the pinned pairIcon/rating/RSN block into it, which looked like a bug.
  const defaultColDef = useMemo<ColDef<DraftUnit>>(
    () => ({ sortable: true, resizable: true, minWidth: 70, headerTooltip, tooltipComponent: StackedTooltip, lockPinned: true }),
    [],
  );

  // A pair's row needs room for two stacked lines; a solo unit needs one. AG Grid Community supports per-row
  // height via this callback (not an Enterprise feature) — the theme's own rowHeight (44) is the solo/fallback.
  const getRowHeight = useCallback((params: RowHeightParams<DraftUnit>) => (params.data && params.data.entries.length > 1 ? 84 : 44), []);
  const getRowId = useCallback((params: GetRowIdParams<DraftUnit>) => params.data.pairingId ?? params.data.entries[0]!.signup.id, []);

  // Same fixed-height-fills-the-viewport behaviour as SignupRosterGrid, not the pool's own previous
  // shrinks-with-content one (a comment here used to explain deliberately NOT doing this, so the pool wouldn't
  // look like a tall broken grid once most players were drafted — that trade-off was reconsidered in favour of
  // matching the signup roster's table exactly: a stable height, empty space below the last row late in the
  // draft rather than the grid itself resizing under the mod's cursor). domLayout="normal" (unset, AG's own
  // default) needs a real height on its container — useDocumentTop's measured remaining-viewport value becomes
  // that directly, same as the signup roster. minHeight: MIN_TABLE_HEIGHT is the same floor for the same reason.
  const [tableWrapper, setTableWrapper] = useState<HTMLDivElement | null>(null);
  const documentTop = useDocumentTop(pinnedTop === undefined ? tableWrapper : null);
  const offsetInPin = useOffsetWithin(pinnedTop === undefined ? null : tableWrapper, "[data-pinned-pool]");
  const tableTop = pinnedTop === undefined ? documentTop : pinnedTop + offsetInPin;
  // 2.5rem, not SignupRosterGrid's own 1.5rem: 1.5rem is that same page-bottom padding (DraftRoom's page wrapper
  // has it too, confirmed via getComputedStyle — this grid's own useDocumentTop measurement already covers
  // everything ABOVE the wrapper, but not what's below it before the page's actual edge). +1rem on top of that
  // for this grid's own Card (DraftRoom's own p-4), whose bottom padding sits between the wrapper and that page
  // edge — SignupRoster's bare wrapper has no such Card, so it never needed the extra rem. Getting this short
  // by even a few px is exactly what caused a double scrollbar (confirmed live: docScrollHeight 9px taller than
  // the viewport at 2rem) — the page itself scrolling a hair as well as the grid's own internal one.
  // - 4px more: room for a theme's panel border thicker than the plain 1px (the comic theme's is 3px).
  const tableHeight = `calc(100dvh - ${tableTop}px - 2.5rem - 4px)`;

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

  if (pool.length === 0) {
    return (
      <div className="space-y-3">
        {heading}
        <p className="text-sm text-on-surface-subtle">No one left to draft.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {heading}
        <div className="flex items-center gap-2">
        {/* Timezones only reach mods and captains, the same as the answers (see showAnswers). */}
        {showAnswers && (
          <MultiSelect
            label="Timezone"
            options={REGION_OPTIONS.map((o) => ({ ...o, count: entries.filter((e) => regionOf(e.signup.timezone) === o.key && matchesSearch(poolSearchValues(e, questions), search)).length }))}
            selected={REGION_OPTIONS.map((o) => o.key).filter((k) => !excludedRegions.includes(k))}
            onChange={(visible) => setExcludedRegions(REGION_OPTIONS.map((o) => o.key).filter((k) => !visible.includes(k)))}
          />
        )}
        <TableSearchInput value={search} onChange={setSearch} matchCount={matchingEntries.length} totalCount={entries.length} />
        <ColumnPicker columns={columnOptions} hidden={hiddenColumns} onHiddenChange={handleHiddenChange} />
        {/* Everyone in the pool with every column, hidden or not, and your ratings and notes (poolCsv.ts). */}
        <Button size="sm" onPress={copyCsv}>
          {copied ? "Copied" : "Copy as CSV"}
        </Button>
        {widthSwitch && (
          <Switch isSelected={poolWidth === "full"} onChange={(full) => setPoolWidth(full ? "full" : "narrow")}>
            Full width
          </Switch>
        )}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-on-surface-subtle">{search ? "No one matches this search." : "No one in the pool is in that region."}</p>
      ) : (
        <div ref={setTableWrapper} className="overflow-hidden" style={{ height: tableHeight, minHeight: MIN_TABLE_HEIGHT }}>
          <AgGridReact<DraftUnit>
            theme={gridTheme}
            rowData={rows}
            getRowId={getRowId}
            getRowHeight={getRowHeight}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            initialState={initialState}
            maintainColumnOrder
            onGridReady={onGridReady}
            onStateUpdated={onStateUpdated}
            context={context}
            animateRows={false}
            // A click anywhere outside the table ends a Note edit (saving it), not just a click on another cell.
            stopEditingWhenCellsLoseFocus
            tooltipShowDelay={200}
            tooltipHideDelay={4000}
            enableCellTextSelection
            // Same as the signup roster: any text column without its own comparator sorts case-insensitively.
            accentedSort
          />
        </div>
      )}
    </div>
  );
}
