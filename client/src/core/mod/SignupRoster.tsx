import { useCallback, useMemo, useState } from "react";
import type { GridApi } from "ag-grid-community";
import { formatSignupAnswer, type RosterEntry, type SignupQuestionType } from "@bingo/shared";
import {
  useBingo,
  useBingoMods,
  useDeleteAllSignups,
  useMarkBuyin,
  useModPair,
  useModUnpair,
  useModWithdrawSignup,
  useRefreshSignupStats,
  useSeedTestSignups,
  useSignupRoster,
  useSignupQuestions,
  type SeedTestSignupsResponse,
} from "../../api/queries";
import { useAuth } from "../../context/AuthContext";
import { useStatsRefreshingSignupIds } from "../../context/WebSocketContext";
import { discordName, displayName } from "../ui/user";
import { Button } from "../ui/Button";
import { EmptyState, Notice, FilterChip } from "../ui/Card";
import { ColumnPicker } from "../ui/ColumnPicker";
import { Input } from "../ui/Field";
import { AlertIcon, UsersIcon } from "../ui/icons";
import { formatCaTier, formatWomStat } from "../signup/caStats";
import { useDocumentTop } from "../ui/tableChrome";
import { TableSearchInput, useTableSearch } from "../ui/tableSearch";
import { formatTierName } from "../tectonic/profile";
import { SignupRosterGrid, type GridContext, type RosterRow } from "./SignupRosterGrid";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
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
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

// Dev-only — hidden unless AuthContext.devMode is true (the server route
// this calls doesn't even exist outside that same dev gate). Lets a mod
// populate a bunch of fake signups to exercise the draft without manually
// signing up a dozen browser tabs.
function DevSeedPanel({ slug }: { slug: string }) {
  const seedTestSignups = useSeedTestSignups(slug);
  const deleteAllSignups = useDeleteAllSignups(slug);
  const [count, setCount] = useState(8);
  const [error, setError] = useState<string | null>(null);
  const [lastSeed, setLastSeed] = useState<SeedTestSignupsResponse | null>(null);

  async function run(action: () => Promise<void>, fallback: string) {
    setError(null);
    try {
      await action();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : fallback);
    }
  }

  const seed = () => run(async () => setLastSeed(await seedTestSignups.mutateAsync(count)), "Failed to seed test signups");
  const wipe = () =>
    run(async () => {
      if (!confirm("Delete every signup for this bingo?")) return;
      await deleteAllSignups.mutateAsync();
      setLastSeed(null);
    }, "Failed to delete signups");

  const busy = seedTestSignups.isPending || deleteAllSignups.isPending;

  return (
    <Notice tone="warn">
      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide">Dev tools</span>
        <Input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} className="num h-8 w-16" />
        <Button size="sm" onPress={seed} isDisabled={busy}>
          {seedTestSignups.isPending ? "Seeding…" : "Seed test signups"}
        </Button>
        <Button size="sm" variant="danger" onPress={wipe} isDisabled={busy}>
          {deleteAllSignups.isPending ? "Deleting…" : "Delete all signups"}
        </Button>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
      {lastSeed && lastSeed.source !== "tectonic" && (
        <p className="mt-2 text-xs text-on-surface-muted">
          {lastSeed.source === "mixed" ? "Some" : "All"} of the {lastSeed.signups.length} seeded signups are synthetic TestBot users.{" "}
          {lastSeed.tectonicConfigured
            ? "The clan roster ran out of unused members."
            : "Set TECTONIC_API_URL, TECTONIC_API_KEY and TECTONIC_GUILD_ID in server/.env to draw real clan members instead."}
        </p>
      )}
    </Notice>
  );
}

type BuyinFilter = "all" | "paid" | "unpaid";
type PairFilter = "all" | "paired" | "unpaired";

// ~10 rows plus the header before the min-height floor kicks in. A row runs ~2.25rem (py-2 + text-sm) up to ~3rem
// where a cell holds a size="sm" Select (Collected by, Partner) — 2.75rem/row is the rough middle.
const MIN_TABLE_HEIGHT = "30rem";

const BUYIN_FILTERS: { key: BuyinFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "paid", label: "Paid" },
  { key: "unpaid", label: "Unpaid" },
];
const PAIR_FILTERS: { key: PairFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "paired", label: "Paired" },
  { key: "unpaired", label: "Unpaired" },
];

const isPaid = (entry: RosterEntry) => !!entry.signup.buyinReceivedAt;
const isPaired = (entry: RosterEntry) => !!entry.pairing;

function matchesBuyin(entry: RosterEntry, filter: BuyinFilter): boolean {
  return filter === "all" || isPaid(entry) === (filter === "paid");
}
function matchesPair(entry: RosterEntry, filter: PairFilter): boolean {
  return filter === "all" || isPaired(entry) === (filter === "paired");
}

export function SignupRoster({ slug }: { slug: string }) {
  const { data } = useSignupRoster(slug);
  const { data: questionsData } = useSignupQuestions(slug);
  const { data: bingoData } = useBingo(slug);
  // One subscription for the whole table, not one per row — every CollectedByCell used to call this itself, so
  // 63 rows meant 63 separate subscriptions to (and re-renders off) the very same query.
  const { data: modsData } = useBingoMods(slug);
  const { user: me, devMode } = useAuth();
  const statsRefreshing = useStatsRefreshingSignupIds();
  const roster = data?.signups ?? [];
  const questions = questionsData?.questions ?? [];
  const mods = useMemo(() => modsData?.mods ?? [], [modsData]);
  const isDuo = bingoData?.bingo.signupMode === "duo";
  const stage = bingoData?.bingo.stage;
  const canWithdraw = stage === "signup" || stage === "captains";
  // Clan standing column only when tectonic-api knows at least one player.
  const showTier = roster.some((r) => r.tectonicProfile);
  const [copied, setCopied] = useState(false);
  const [buyinFilter, setBuyinFilter] = useState<BuyinFilter>("all");
  const [pairFilter, setPairFilter] = useState<PairFilter>("all");
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
  const leftoverCount = roster.filter((r) => r.leftover).length;
  const teamCount = bingoData?.teams.length ?? 0;
  const leftoverMode = bingoData?.bingo.leftoverMode;
  // Each chip's count reflects the other filter so the numbers show what
  // clicking it would leave on screen.
  const buyinCount = (f: BuyinFilter) => roster.filter((r) => matchesBuyin(r, f) && matchesPair(r, pairFilter)).length;
  const pairCount = (f: PairFilter) => roster.filter((r) => matchesPair(r, f) && matchesBuyin(r, buyinFilter)).length;
  // The buy-in/pair chips, as the grid's external filter (docs/ag-grid-tables-plan.md phase 2) — search itself is
  // the grid's own quickFilterText, bound directly to `search` below.
  const doesRowPassFilters = useCallback((row: RosterRow) => matchesBuyin(row, buyinFilter) && matchesPair(row, pairFilter), [buyinFilter, pairFilter]);
  // Independent of the grid (for the search box's "of N" total) — cheap, and avoids a render round-trip through
  // the grid just to know how many rows the chips alone leave.
  const totalCount = roster.filter((r) => matchesBuyin(r, buyinFilter) && matchesPair(r, pairFilter)).length;
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

  // Interactive grid cells (docs/ag-grid-tables-plan.md phase 3) call these mutations through context rather than
  // each calling its own hook — that alone removes ~380 hook instances from a full 63-row mount.
  const markBuyin = useMarkBuyin(slug);
  const modPair = useModPair(slug);
  const modUnpair = useModUnpair(slug);
  const withdrawSignup = useModWithdrawSignup(slug);
  const refreshStats = useRefreshSignupStats(slug);
  const gridContext = useMemo<GridContext>(
    () => ({ search, partnerRsnMap, canWithdraw, statsRefreshing, markBuyin, modPair, modUnpair, withdrawSignup, refreshStats }),
    [search, partnerRsnMap, canWithdraw, statsRefreshing, markBuyin, modPair, modUnpair, withdrawSignup, refreshStats],
  );

  // ColumnPicker's own option list — every colId the grid can show except RSN, which isn't optional (it's the
  // only thing identifying a row). Community has no column-chooser menu of its own (docs/ag-grid-tables-plan.md),
  // so this stays the UI; what it drives changed from a plain localStorage set to the grid's column-visibility
  // state.
  const columnOptions = useMemo(
    () => [
      { id: "order", label: "#" },
      { id: "discord", label: "Discord" },
      ...(showTier ? [{ id: "tier", label: "Tier" }] : []),
      { id: "signedUp", label: "Signed up" },
      { id: "status", label: "Status" },
      { id: "caCurrent", label: "Current CA" },
      { id: "caPeak", label: "Peak CA" },
      { id: "ehb", label: "EHB" },
      { id: "ehp", label: "EHP" },
      { id: "buyin", label: "Buy-in" },
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
    <div className="space-y-4">
      {devMode && bingoData?.bingo.stage === "signup" && <DevSeedPanel slug={slug} />}
      {leftoverCount > 0 && (
        <Notice tone="warn" icon={<AlertIcon />}>
          <span className="num">{leftoverCount}</span> newest signup{leftoverCount !== 1 ? "s" : ""} {leftoverCount !== 1 ? "don't" : "doesn't"} fit a full round of{" "}
          <span className="num">{teamCount}</span> teams and will be {leftoverMode === "singles" ? "drafted in a singles round" : "cut from the draft"} unless more players sign up or a
          team is added.{bingoData?.bingo.warnLeftovers ? " They can see this warning on their signup page." : " Turn on the warning in Settings to tell them."}
        </Notice>
      )}
      <div className="flex items-center justify-between">
        <p className="text-sm text-on-surface-muted">
          <span className="num text-on-surface">{activeCount}</span> active signup{activeCount !== 1 ? "s" : ""}
          {withdrawnCount > 0 && (
            <>
              , <span className="num">{withdrawnCount}</span> withdrawn
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          {roster.length > 0 && <TableSearchInput value={search} onChange={setSearch} matchCount={displayedCount ?? totalCount} totalCount={totalCount} />}
          {roster.length > 0 && <ColumnPicker columns={columnOptions} hidden={hiddenColumnIds} onHiddenChange={handleHiddenChange} />}
          <Button size="sm" onPress={copyCsv} isDisabled={roster.length === 0}>
            {copied ? "Copied" : "Copy as CSV"}
          </Button>
        </div>
      </div>

      {roster.length === 0 ? (
        <EmptyState icon={<UsersIcon />} title="No signups yet">
          Players who sign up will appear here with their answers and buy-in status.
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by buy-in">
              {BUYIN_FILTERS.map(({ key, label }) => (
                <FilterChip key={key} active={buyinFilter === key} count={buyinCount(key)} onPress={() => setBuyinFilter(key)}>
                  {label}
                </FilterChip>
              ))}
            </div>
            {isDuo && (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by pairing">
                {PAIR_FILTERS.map(({ key, label }) => (
                  <FilterChip key={key} active={pairFilter === key} count={pairCount(key)} onPress={() => setPairFilter(key)}>
                    {label}
                  </FilterChip>
                ))}
              </div>
            )}
          </div>
          <div ref={setTableWrapper} className="overflow-hidden" style={{ height: tableHeight, minHeight: MIN_TABLE_HEIGHT }}>
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
        </>
      )}
    </div>
  );
}
