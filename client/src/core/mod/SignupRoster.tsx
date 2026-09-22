import { useMemo, useState } from "react";
import { formatSignupAnswer, type RosterEntry, type SignupQuestionType } from "@bingo/shared";
import { useBingo, useDeleteAllSignups, useSeedTestSignups, useSignupRoster, useSignupQuestions, type SeedTestSignupsResponse } from "../../api/queries";
import { useAuth } from "../../context/AuthContext";
import { discordName, displayName } from "../ui/user";
import { Button } from "../ui/Button";
import { EmptyState, Notice, FilterChip } from "../ui/Card";
import { Input } from "../ui/Field";
import { AlertIcon, UsersIcon } from "../ui/icons";
import { formatCaTier, formatWomStat } from "../signup/caStats";
import { compareSortValues, useTableSort } from "../ui/tableSort";
import { useDocumentTop } from "../ui/tableChrome";
import { TableSearchInput, matchesSearch, useTableSearch } from "../ui/tableSearch";
import { formatTierName } from "../tectonic/profile";
import { SignupRosterGrid, type RosterRow } from "./SignupRosterGrid";

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

// "order" | "rsn" | "discord" | "status" | "buyin" | "collectedBy" | "partner" | a signup question's id.
type SortKey = string;

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

// `order` is the 1-based signup position (the server returns the roster in
// createdAt order), kept alongside the entry so sorting by another column
// doesn't lose it.
interface NumberedEntry {
  order: number;
  entry: RosterEntry;
}

function rosterSortValue({ order, entry }: NumberedEntry, key: SortKey, partnerRsnMap: Map<string, string>): string | number {
  if (key === "order") return order;
  if (key === "rsn") return entry.signup.rsn.toLowerCase();
  if (key === "discord") return discordName(entry.user).toLowerCase();
  if (key === "tier") return entry.tectonicProfile?.points ?? -1;
  if (key === "status") return entry.signup.status;
  if (key === "caCurrent") return entry.caCurrent?.points ?? -1;
  if (key === "caPeak") return entry.caPeak?.points ?? -1;
  if (key === "ehb") return entry.womStats?.ehb ?? -1;
  if (key === "ehp") return entry.womStats?.ehp ?? -1;
  if (key === "buyin") return isPaid(entry) ? 1 : 0;
  if (key === "collectedBy") return entry.collectedByUser ? displayName(entry.collectedByUser).toLowerCase() : "";
  // Paired rows first (sorted by partner), unpaired rows after — so the
  // column doubles as a paired/unpaired grouping.
  if (key === "partner") return isPaired(entry) ? `0 ${(partnerRsn(entry, partnerRsnMap) ?? "").toLowerCase()}` : "1";
  return (entry.answers.find((a) => a.questionId === key)?.value ?? "").toLowerCase();
}

// Every column's text, whether or not it's currently shown — search covers
// all of them (issue #112), not just what's visible.
function rosterSearchValues(entry: RosterEntry, partnerRsnMap: Map<string, string>, questions: { id: string; type: SignupQuestionType }[]): string[] {
  return [
    entry.signup.rsn,
    discordName(entry.user),
    entry.tectonicProfile?.tier ? formatTierName(entry.tectonicProfile.tier.name) : "",
    entry.signup.status,
    formatCaTier(entry.caCurrent),
    formatCaTier(entry.caPeak),
    entry.collectedByUser ? displayName(entry.collectedByUser) : "",
    partnerRsn(entry, partnerRsnMap) ?? "",
    ...entry.answers.map((a) => formatSignupAnswer(questions.find((q) => q.id === a.questionId)?.type ?? "text", a.value)),
  ];
}

export function SignupRoster({ slug }: { slug: string }) {
  const { data } = useSignupRoster(slug);
  const { data: questionsData } = useSignupQuestions(slug);
  const { data: bingoData } = useBingo(slug);
  const { devMode } = useAuth();
  const roster = data?.signups ?? [];
  const questions = questionsData?.questions ?? [];
  const isDuo = bingoData?.bingo.signupMode === "duo";
  const [copied, setCopied] = useState(false);
  const [buyinFilter, setBuyinFilter] = useState<BuyinFilter>("all");
  const [pairFilter, setPairFilter] = useState<PairFilter>("all");
  const [search, setSearch] = useTableSearch();
  const sort = useTableSort<SortKey>("order");
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

  const activeCount = roster.filter((r) => r.signup.status === "active").length;
  const withdrawnCount = roster.length - activeCount;
  const leftoverCount = roster.filter((r) => r.leftover).length;
  const teamCount = bingoData?.teams.length ?? 0;
  const leftoverMode = bingoData?.bingo.leftoverMode;
  // Each chip's count reflects the other filter so the numbers show what
  // clicking it would leave on screen.
  const buyinCount = (f: BuyinFilter) => roster.filter((r) => matchesBuyin(r, f) && matchesPair(r, pairFilter)).length;
  const pairCount = (f: PairFilter) => roster.filter((r) => matchesPair(r, f) && matchesBuyin(r, buyinFilter)).length;
  // O(n), built once per roster rather than once per row — see
  // buildPartnerRsnMap's own comment.
  const partnerRsnMap = useMemo(() => buildPartnerRsnMap(roster), [roster]);
  const searchable = useMemo(
    () => roster.map((entry, i) => ({ order: i + 1, entry })).filter(({ entry }) => matchesBuyin(entry, buyinFilter) && matchesPair(entry, pairFilter)),
    [roster, buyinFilter, pairFilter],
  );
  // sort.order/sort.toggle are fresh closures every render (useTableSort
  // doesn't memoize them) — depend on the primitives (sort.key, sort.dir)
  // that actually decide the output, not the unstable sort object itself.
  // TODO(phase 2 of the AG Grid plan): quickFilterText/external filter move
  // this filtering into the grid itself; this whole computation goes away.
  const sorted = useMemo(
    () =>
      searchable
        .filter(({ entry }) => matchesSearch(rosterSearchValues(entry, partnerRsnMap, questions), search))
        .sort((a, b) => sort.order(compareSortValues(rosterSortValue(a, sort.key, partnerRsnMap), rosterSortValue(b, sort.key, partnerRsnMap)))),
    [searchable, search, partnerRsnMap, questions, sort.key, sort.dir],
  );
  const rows = useMemo<RosterRow[]>(() => sorted.map(({ order, entry }) => ({ ...entry, order })), [sorted]);

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
          {roster.length > 0 && <TableSearchInput value={search} onChange={setSearch} matchCount={sorted.length} totalCount={searchable.length} />}
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
          {sorted.length === 0 ? (
            <p className="text-sm text-on-surface-muted">No signups match {search ? "this search" : "these filters"}.</p>
          ) : (
            <div ref={setTableWrapper} className="overflow-hidden" style={{ height: tableHeight, minHeight: MIN_TABLE_HEIGHT }}>
              <SignupRosterGrid rows={rows} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
