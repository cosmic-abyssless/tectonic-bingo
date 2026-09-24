import { useCallback, useMemo, useState } from "react";
import type { GridApi } from "ag-grid-community";
import { formatSignupAnswer, type RosterEntry, type SignupQuestionType } from "@bingo/shared";
import {
  useBingo,
  useBingoMods,
  useDraftCuts,
  useMarkBuyin,
  useModPair,
  useModUnpair,
  useModWithdrawSignup,
  useRefreshSignupStats,
  useSetSignupTimezone,
  useSignupRoster,
  useSignupQuestions,
} from "../../api/queries";
import { useAuth } from "../../context/AuthContext";
import { useStatsRefreshingSignupIds } from "../../context/WebSocketContext";
import { discordName, displayName } from "../ui/user";
import { Button } from "../ui/Button";
import { EmptyState, Notice } from "../ui/Card";
import { MultiSelect } from "../ui/MultiSelect";
import { useAnswerViewer, visibleQuestions } from "../ui/answerVisibility";
import { REGION_OPTIONS, regionOf } from "../ui/timezoneFilter";
import { ColumnPicker } from "../ui/ColumnPicker";
import { usePreference } from "../ui/preferences";
import { Switch } from "../ui/Switch";
import { AlertIcon, UsersIcon } from "../ui/icons";
import { formatCaTier, formatWomStat } from "../signup/caStats";
import { useDocumentTop } from "../ui/tableChrome";
import { TableSearchInput, useTableSearch } from "../ui/tableSearch";
import { formatTierName } from "../tectonic/profile";
import { toCsv } from "../ui/csv";
import { cutModeLabel, describeShares } from "../draft/cutModes";
import { SignupRosterGrid, type GridContext, type RosterRow } from "./SignupRosterGrid";

// GP totals here are buy-in multiples, always in the millions for this event — "30M GP" reads faster than
// "30,000,000 GP". Decimals only show up if the amount isn't a clean multiple of a million.
function formatGp(amount: number): string {
  return `${(amount / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}M GP`;
}

// signup.id -> the other half's RSN, or "Not signed up yet" if a pairing
// exists but nothing else in the roster shares its id. Built once per roster
// (O(n): a pairing links exactly two people, so each group is tiny,
// regardless of how large the roster is) rather than the O(n) scan a naive
// "find the other row with this pairing.id" does — which, called once per
// row (as it was, from both search and sort), made the whole table O(n²) on
// every keystroke.
export function buildPartnerRsnMap(roster: RosterEntry[]): Map<string, string> {
  const byPairing = new Map<string, RosterEntry[]>();
  for (const r of roster) {
    if (!r.pairing) continue;
    const group = byPairing.get(r.pairing.id);
    if (group) group.push(r);
    else byPairing.set(r.pairing.id, [r]);
  }
  const result = new Map<string, string>();
  for (const group of byPairing.values()) {
    for (const entry of group) {
      const partner = group.find((o) => o.signup.id !== entry.signup.id);
      result.set(entry.signup.id, partner ? partner.signup.rsn : "Not signed up yet");
    }
  }
  return result;
}

function partnerRsn(entry: RosterEntry, partnerRsnMap: Map<string, string>): string | null {
  if (!entry.pairing) return null;
  return partnerRsnMap.get(entry.signup.id) ?? "Not signed up yet";
}

function buildCsv(roster: RosterEntry[], questionPrompts: { id: string; prompt: string; type: SignupQuestionType }[], isDuo: boolean): string {
  const partnerRsnMap = buildPartnerRsnMap(roster);
  const headers = [
    "#",
    "RSN",
    "Discord",
    "Timezone",
    "Tier",
    "Points",
    "Status",
    "Current CA",
    "Peak CA",
    "EHB",
    "EHP",
    "Buy-in",
    "Collected by",
    ...(isDuo ? ["Partner"] : []),
    ...questionPrompts.map((q) => q.prompt),
  ];
  const rows = roster.map((entry, i) => {
    const answerByQ = new Map(entry.answers.map((a) => [a.questionId, a.value]));
    return [
      String(i + 1),
      entry.signup.rsn,
      discordName(entry.user),
      entry.signup.timezone ?? "",
      entry.tectonicProfile?.tier ? formatTierName(entry.tectonicProfile.tier.name) : "",
      entry.tectonicProfile ? String(entry.tectonicProfile.points) : "",
      entry.signup.status,
      formatCaTier(entry.caCurrent),
      formatCaTier(entry.caPeak),
      formatWomStat(entry.womStats?.ehb),
      formatWomStat(entry.womStats?.ehp),
      entry.signup.buyinReceivedAt ? "received" : "not received",
      entry.collectedByUser ? displayName(entry.collectedByUser) : "",
      ...(isDuo ? [partnerRsn(entry, partnerRsnMap) ?? ""] : []),
      ...questionPrompts.map((q) => formatSignupAnswer(q.type, answerByQ.get(q.id))),
    ];
  });
  return toCsv([headers, ...rows]);
}

// The filters above the grid, each a MultiSelect checklist. What's stored is what's *un*ticked (like the audit log),
// so a new option shows by default. The one default that isn't "everything": withdrawn signups start hidden.
type FilterKey = "status" | "buyin" | "pair" | "region" | "draft";
type Excluded = Record<FilterKey, string[]>;
const DEFAULT_EXCLUDED: Excluded = { status: ["withdrawn"], buyin: [], pair: [], region: [], draft: [] };

function isDefaultFilters(excluded: Excluded): boolean {
  return (Object.keys(DEFAULT_EXCLUDED) as FilterKey[]).every((key) => [...excluded[key]].sort().join() === [...DEFAULT_EXCLUDED[key]].sort().join());
}

// ~10 rows plus the header before the min-height floor kicks in. A row runs ~2.25rem (py-2 + text-sm) up to ~3rem
// where a cell holds a size="sm" Select (Collected by, Partner) — 2.75rem/row is the rough middle.
const MIN_TABLE_HEIGHT = "30rem";

const FILTER_OPTIONS: Record<FilterKey, { key: string; label: string }[]> = {
  status: [
    { key: "active", label: "Active" },
    { key: "withdrawn", label: "Withdrawn" },
  ],
  buyin: [
    { key: "paid", label: "Paid" },
    { key: "unpaid", label: "Unpaid" },
  ],
  // Each signup is exactly one of these: in a pair, waiting on a request (sent or received), or neither.
  pair: [
    { key: "paired", label: "Paired" },
    { key: "requested", label: "Requested" },
    { key: "unpaired", label: "Unpaired" },
  ],
  region: REGION_OPTIONS,
  // Who will be cut from the draft as things stand (see the bingo's draft cuts setting).
  draft: [
    { key: "in", label: "Will be drafted" },
    { key: "cut", label: "Will be cut" },
  ],
};

// `pending`: the Discord ids with a pending pairing request either way. The roster only carries each player's own
// outgoing request, so who's been asked comes from everyone else's.
function filterValue(entry: RosterEntry, key: FilterKey, pending: ReadonlySet<string>): string {
  switch (key) {
    case "status":
      return entry.signup.status;
    case "buyin":
      return entry.signup.buyinReceivedAt ? "paid" : "unpaid";
    case "pair":
      return entry.pairing ? "paired" : pending.has(entry.user.discordId) ? "requested" : "unpaired";
    case "region":
      return regionOf(entry.signup.timezone);
    case "draft":
      return entry.cut ? "cut" : "in";
  }
}

/** Whether `entry` passes every filter (but `skip`, for counting that filter's own options). */
function matchesFilters(entry: RosterEntry, excluded: Excluded, pending: ReadonlySet<string>, skip?: FilterKey): boolean {
  return (Object.keys(excluded) as FilterKey[]).every((key) => key === skip || !excluded[key].includes(filterValue(entry, key, pending)));
}

export function SignupRoster({ slug }: { slug: string }) {
  const { data } = useSignupRoster(slug);
  const { data: questionsData } = useSignupQuestions(slug);
  const { data: bingoData } = useBingo(slug);
  // One subscription for the whole table, not one per row — every CollectedByCell used to call this itself, so
  // 63 rows meant 63 separate subscriptions to (and re-renders off) the very same query.
  const { data: modsData } = useBingoMods(slug);
  const { user: me } = useAuth();
  const statsRefreshing = useStatsRefreshingSignupIds();
  const roster = data?.signups ?? [];
  // Only the questions whose answers this viewer gets (a mod doesn't see admins-only ones). Memoized: the grid's
  // columnDefs depend on this array's identity, and a new one each render would reset every column's width.
  const answerViewer = useAnswerViewer(slug);
  const questions = useMemo(() => visibleQuestions(questionsData?.questions ?? [], answerViewer), [questionsData, answerViewer]);
  const mods = useMemo(() => modsData?.mods ?? [], [modsData]);
  const isDuo = bingoData?.bingo.signupMode === "duo";
  const stage = bingoData?.bingo.stage;
  const canWithdraw = stage === "signup" || stage === "captains";
  // Clan standing column only when tectonic-api knows at least one player.
  const showTier = roster.some((r) => r.tectonicProfile);
  const [copied, setCopied] = useState(false);
  const [excluded, setExcluded] = useState<Excluded>(DEFAULT_EXCLUDED);
  const [search, setSearch] = useTableSearch();
  // AG Grid (docs/ag-grid-tables-plan.md) replaces the hand-rolled <table> —
  // sticky header, striping, virtualisation and column sort/resize/reorder
  // are the grid's own. This wrapper still owns the table's on-page height:
  // domLayout="normal" needs a real height (not a max-height the way a plain
  // scrollable <table> could get away with), so useDocumentTop's measured
  // remaining-viewport value becomes that height directly. min-height keeps
  // it from being squeezed to uselessness if that leaves very little room (a
  // short window, a lot of chrome above it): it's then the smaller of the
  // two that loses, and a touch of page scroll is the trade-off.
  const [tableWrapper, setTableWrapper] = useState<HTMLDivElement | null>(null);
  const tableTop = useDocumentTop(tableWrapper);
  const tableHeight = `calc(100dvh - ${tableTop}px - 1.5rem)`;
  const [rosterWidth, setRosterWidth] = usePreference("signupRosterWidth");
  // Set by the grid itself (onGridReady/onModelUpdated) — how many rows its search + filters currently leave
  // visible. Starts null (grid not mounted yet) so the search box shows totalCount rather than flashing "0 of N".
  const [displayedCount, setDisplayedCount] = useState<number | null>(null);
  // The live GridApi (docs/ag-grid-tables-plan.md phase 4) — handed up by SignupRosterGrid via onApiReady so
  // ColumnPicker, rendered here in the toolbar rather than inside the grid, can call setColumnsVisible. hidden
  // mirrors the grid's own column-visibility state (updated from the same onStateUpdated that persists it), so a
  // header-drag hide and a ColumnPicker toggle never disagree with each other.
  const [gridApi, setGridApi] = useState<GridApi<RosterRow> | null>(null);
  const [hiddenColumnIds, setHiddenColumnIds] = useState<Set<string>>(new Set());

  const activeCount = roster.filter((r) => r.signup.status === "active").length;
  const withdrawnCount = roster.length - activeCount;
  const cutCount = roster.filter((r) => r.cut).length;
  const cutMode = bingoData?.bingo.cutMode;
  // Who's cut only means something once there are two teams to split the players across.
  const cutsApply = !!cutMode && cutMode !== "none" && (bingoData?.teams.length ?? 0) >= 2;
  const { data: cuts } = useDraftCuts(slug, cutsApply);
  const pendingPairIds = useMemo(
    () => new Set(roster.flatMap((r) => (r.outgoingPairingRequest ? [r.user.discordId, r.outgoingPairingRequest.target.discordId] : []))),
    [roster],
  );
  // One MultiSelect per filter. Each option's count reflects the other filters, so it shows how many rows ticking it
  // brings in.
  const filterSelect = (key: FilterKey, label: string) => {
    const options = FILTER_OPTIONS[key];
    return (
      <MultiSelect
        label={label}
        options={options.map((o) => ({
          ...o,
          count: roster.filter((r) => filterValue(r, key, pendingPairIds) === o.key && matchesFilters(r, excluded, pendingPairIds, key)).length,
        }))}
        selected={options.map((o) => o.key).filter((k) => !excluded[key].includes(k))}
        onChange={(visible) => setExcluded((e) => ({ ...e, [key]: options.map((o) => o.key).filter((k) => !visible.includes(k)) }))}
      />
    );
  };
  // The dropdowns, as the grid's external filter (docs/ag-grid-tables-plan.md phase 2) — search itself is the grid's
  // own quickFilterText, bound directly to `search` below.
  const doesRowPassFilters = useCallback((row: RosterRow) => matchesFilters(row, excluded, pendingPairIds), [excluded, pendingPairIds]);
  // Independent of the grid (for the search box's "of N" total) — cheap, and avoids a render round-trip through
  // the grid just to know how many rows the filters alone leave.
  const totalCount = roster.filter((r) => matchesFilters(r, excluded, pendingPairIds)).length;
  const rows = useMemo<RosterRow[]>(() => roster.map((entry, i) => ({ ...entry, order: i + 1 })), [roster]);

  // O(n), built once per roster rather than once per row — see buildPartnerRsnMap's own comment.
  const partnerRsnMap = useMemo(() => buildPartnerRsnMap(roster), [roster]);

  // Mods of this bingo, plus the viewer (a site admin need not be listed as a mod) and whoever is already
  // recorded as a collector — so a row whose collector isn't a *current* mod still has an option to display.
  const collectedByOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const mod of mods) byId.set(mod.userId, displayName(mod.user));
    if (me) byId.set(me.id, displayName(me));
    for (const r of roster) if (r.collectedByUser) byId.set(r.collectedByUser.id, displayName(r.collectedByUser));
    return [...byId.entries()].map(([id, label]) => ({ id, label }));
  }, [mods, me, roster]);

  // Who's physically holding collected GP right now — a paid signup's buy-in isn't "safe" until a mod has both
  // marked it received *and* recorded themselves as the collector; received-but-uncollected is still just as
  // much a place the GP could go missing from, so it gets its own bucket rather than being silently excluded.
  const buyinAmount = bingoData?.bingo.buyinAmount ?? null;
  const collectorBreakdown = useMemo(() => {
    const byId = new Map<string, { label: string; count: number }>();
    let uncollected = 0;
    for (const r of roster) {
      if (!r.signup.buyinReceivedAt) continue;
      if (r.collectedByUser) {
        const existing = byId.get(r.collectedByUser.id);
        if (existing) existing.count++;
        else byId.set(r.collectedByUser.id, { label: displayName(r.collectedByUser), count: 1 });
      } else {
        uncollected++;
      }
    }
    return { byMod: [...byId.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.count - a.count), uncollected };
  }, [roster]);

  // Interactive grid cells (docs/ag-grid-tables-plan.md phase 3) call these mutations through context rather than
  // each calling its own hook — that alone removes ~380 hook instances from a full 63-row mount.
  const markBuyin = useMarkBuyin(slug);
  const modPair = useModPair(slug);
  const modUnpair = useModUnpair(slug);
  const withdrawSignup = useModWithdrawSignup(slug);
  const refreshStats = useRefreshSignupStats(slug);
  const setTimezone = useSetSignupTimezone(slug);
  const gridContext = useMemo<GridContext>(
    () => ({ search, partnerRsnMap, canWithdraw, statsRefreshing, currentUserId: me?.id ?? null, markBuyin, modPair, modUnpair, withdrawSignup, refreshStats, setTimezone }),
    [search, partnerRsnMap, canWithdraw, statsRefreshing, me, markBuyin, modPair, modUnpair, withdrawSignup, refreshStats, setTimezone],
  );

  // ColumnPicker's own option list — every colId the grid can show except # and RSN, neither of which is
  // optional (both are pinned left in the grid itself, and RSN is the only thing identifying a row). Community
  // has no column-chooser menu of its own (docs/ag-grid-tables-plan.md), so this stays the UI; what it drives
  // changed from a plain localStorage set to the grid's column-visibility state.
  const columnOptions = useMemo(
    () => [
      { id: "discord", label: "Discord" },
      { id: "timezone", label: "Timezone" },
      ...(showTier ? [{ id: "tier", label: "Tier" }] : []),
      { id: "signedUp", label: "Signed up" },
      { id: "status", label: "Status" },
      { id: "caCurrent", label: "Current CA" },
      { id: "caPeak", label: "Peak CA" },
      { id: "ehb", label: "EHB" },
      { id: "ehp", label: "EHP" },
      { id: "buyin", label: "Buy-in received" },
      { id: "collectedBy", label: "Collected by" },
      ...(isDuo ? [{ id: "partner", label: "Partner" }] : []),
      ...questions.map((q) => ({ id: q.id, label: q.prompt })),
    ],
    [showTier, isDuo, questions],
  );
  function handleHiddenChange(next: Set<string>) {
    if (!gridApi) return;
    const toHide = [...next].filter((id) => !hiddenColumnIds.has(id));
    const toShow = [...hiddenColumnIds].filter((id) => !next.has(id));
    if (toHide.length > 0) gridApi.setColumnsVisible(toHide, false);
    if (toShow.length > 0) gridApi.setColumnsVisible(toShow, true);
  }

  async function copyCsv() {
    const csv = buildCsv(roster, questions, isDuo);
    await navigator.clipboard.writeText(csv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    // Only the grid itself goes full width, and only while the "Full width" switch is on (ModPage's <main> is
    // unconstrained for this one tab, see ModPage.tsx's own NARROW comment) — everything above it here (buy-ins
    // held, the filter/search/Columns row) stays at the
    // same reading width every other mod tab uses. A Fragment root, not one div, so the grid can sit as a
    // full-width sibling instead of being capped by the narrow block's own max-width.
    <>
      <div className="mx-auto w-full max-w-6xl space-y-4">
        {(collectorBreakdown.byMod.length > 0 || collectorBreakdown.uncollected > 0) && (
          <div className="rounded-lg border border-outline p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-muted">Buy-ins held</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-on-surface-muted">
              {collectorBreakdown.byMod.map((m) => (
                <span key={m.id}>
                  {m.label} <span className="num text-on-surface">{m.count}</span>
                  {buyinAmount != null && (
                    <>
                      {" "}
                      · <span className="num text-on-surface">{formatGp(m.count * buyinAmount)}</span>
                    </>
                  )}
                </span>
              ))}
              {collectorBreakdown.uncollected > 0 && (
                <span className="text-warn">
                  Not yet collected <span className="num">{collectorBreakdown.uncollected}</span>
                  {buyinAmount != null && (
                    <>
                      {" "}
                      · <span className="num">{formatGp(collectorBreakdown.uncollected * buyinAmount)}</span>
                    </>
                  )}
                </span>
              )}
            </div>
          </div>
        )}
        {cutsApply && cutCount > 0 && cuts?.shares && bingoData && (
          <Notice tone="warn" icon={<AlertIcon />}>
            As things stand, <span className="num">{cutCount}</span> signup{cutCount !== 1 ? "s" : ""} will be cut when the draft starts (
            {cutModeLabel(bingoData.bingo.cutMode, bingoData.bingo.signupMode)}: each of the <span className="num">{cuts.teamCount}</span> teams will draft{" "}
            {describeShares(cuts.shares, bingoData.bingo.signupMode)}). The newest signups are the ones cut. There's still time to change that: pair players up, get
            more players to sign up, or add a team.
            {bingoData.bingo.warnLeftovers ? " They can see this warning on their signup page." : " Turn on the warning in Settings to tell them."} Filter by
            Draft to see who:{" "}
            {/* Sets the Draft filter to just "Will be cut" (the other filters stay as they are). */}
            <button
              type="button"
              onClick={() => setExcluded((e) => ({ ...e, draft: ["in"] }))}
              className="cursor-pointer font-medium text-on-surface underline underline-offset-2 hover:opacity-70"
            >
              Show me
            </button>
          </Notice>
        )}
        <p className="text-sm text-on-surface-muted">
          <span className="num text-on-surface">{activeCount}</span> active signup{activeCount !== 1 ? "s" : ""}
          {withdrawnCount > 0 && (
            <>
              , <span className="num">{withdrawnCount}</span> withdrawn
            </>
          )}
        </p>

        {roster.length === 0 ? (
          <EmptyState icon={<UsersIcon />} title="No signups yet">
            Players who sign up will appear here with their answers and buy-in status.
          </EmptyState>
        ) : (
          // The filters (MultiSelect checklists), aligned opposite search/Columns/CSV on the same row rather than a row of
          // their own.
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {filterSelect("status", "Status")}
              {filterSelect("buyin", "Buy-in")}
              {isDuo && filterSelect("pair", "Pairing")}
              {filterSelect("region", "Timezone")}
              {cutsApply && filterSelect("draft", "Draft")}
              {!isDefaultFilters(excluded) && (
                <Button size="sm" variant="ghost" onPress={() => setExcluded(DEFAULT_EXCLUDED)}>
                  Reset filters
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <TableSearchInput value={search} onChange={setSearch} matchCount={displayedCount ?? totalCount} totalCount={totalCount} />
              <ColumnPicker columns={columnOptions} hidden={hiddenColumnIds} onHiddenChange={handleHiddenChange} />
              <Button size="sm" onPress={copyCsv}>
                {copied ? "Copied" : "Copy as CSV"}
              </Button>
              <Switch isSelected={rosterWidth === "full"} onChange={(full) => setRosterWidth(full ? "full" : "narrow")}>
                Full width
              </Switch>
            </div>
          </div>
        )}
      </div>

      {roster.length > 0 && (
        <div ref={setTableWrapper} className={`mt-4 w-full overflow-hidden ${rosterWidth === "narrow" ? "mx-auto max-w-6xl" : ""}`} style={{ height: tableHeight, minHeight: MIN_TABLE_HEIGHT }}>
          <SignupRosterGrid
            rows={rows}
            questions={questions}
            isDuo={isDuo}
            showTier={showTier}
            collectedByOptions={collectedByOptions}
            doesRowPassFilters={doesRowPassFilters}
            onDisplayedCountChange={setDisplayedCount}
            onApiReady={setGridApi}
            onHiddenColumnsChange={setHiddenColumnIds}
            context={gridContext}
          />
        </div>
      )}
    </>
  );
}
