import { memo, useMemo, useState } from "react";
import { formatSignupAnswer, type BingoModerator, type RosterEntry, type SignupQuestionType, type User } from "@bingo/shared";
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
import { discordName, displayName } from "../ui/user";
import { PlayerName } from "../tectonic/PlayerName";
import { Button, IconButton } from "../ui/Button";
import { Badge, EmptyState, FilterChip, Notice } from "../ui/Card";
import { ColumnPicker } from "../ui/ColumnPicker";
import { Input, Select } from "../ui/Field";
import { useHiddenColumns } from "../ui/hiddenColumns";
import { AlertIcon, CheckIcon, RefreshIcon, UsersIcon, XIcon } from "../ui/icons";
import { useStatsRefreshingSignupIds } from "../../context/WebSocketContext";
import { CaCell, WomCell, formatCaTier, formatWomStat } from "../signup/caStats";
import { SortHeader, compareSortValues, useTableSort } from "../ui/tableSort";
import { QUESTION_COLUMN_MAX_WIDTH, STICKY_TOP, STRIPE_ODD, Truncate, useDocumentTop } from "../ui/tableChrome";
import { Highlight, TableSearchInput, matchesSearch, useTableSearch } from "../ui/tableSearch";
import { timeAgo } from "../ui/time";
import { TierBadge } from "../tectonic/ProfileBadges";
import { formatTierName } from "../tectonic/profile";

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

// Each of these four is memo'd: none of them depend on the search box or the
// buy-in/pair filters, but every keystroke re-renders SignupRoster — without
// memo, all ~60+ instances of each would re-render (and CollectedByCell
// would rebuild its mods list) on every character typed, for no reason tied
// to their own props.
const RefreshStatsButton = memo(function RefreshStatsButton({ slug, signupId, rsn, refreshing }: { slug: string; signupId: string; rsn: string; refreshing: boolean }) {
  const refresh = useRefreshSignupStats(slug);
  const busy = refresh.isPending || refreshing;
  return (
    <IconButton label={busy ? `Looking up stats for ${rsn}` : `Refresh stats for ${rsn}`} size="sm" onPress={() => refresh.mutate(signupId)} isDisabled={busy}>
      <RefreshIcon size={12} className={busy ? "animate-spin" : undefined} />
    </IconButton>
  );
});

const BuyinCell = memo(function BuyinCell({ slug, entry }: { slug: string; entry: RosterEntry }) {
  const markBuyin = useMarkBuyin(slug);
  const received = !!entry.signup.buyinReceivedAt;

  function toggle() {
    markBuyin.mutate({ signupId: entry.signup.id, received: !received });
  }

  return (
    <label className="flex cursor-pointer select-none items-center gap-2">
      <input type="checkbox" checked={received} onChange={toggle} disabled={markBuyin.isPending} className="size-4 cursor-pointer accent-accent" />
      <span className={`text-xs ${received ? "text-ok" : "text-on-surface-subtle"}`}>{received ? "Received" : "Not received"}</span>
    </label>
  );
});

// Independent of the buy-in checkbox — a mod can set/change the collector at
// any time while received is true. Disabled once buy-in is unmarked, since
// markBuyin always clears the collector when received goes false.
// `mods` comes from the parent (one useBingoMods call, not one per row —
// every row calling the hook independently meant every row separately
// subscribed to, and re-rendered off, the same query).
const CollectedByCell = memo(function CollectedByCell({ slug, entry, mods }: { slug: string; entry: RosterEntry; mods: BingoModerator[] }) {
  const markBuyin = useMarkBuyin(slug);
  const { user: me } = useAuth();
  const received = !!entry.signup.buyinReceivedAt;

  // Mods of this bingo, plus the viewer (a site admin need not be listed as a
  // mod) and whoever is already recorded, so the current value always has an
  // option to display.
  const options = new Map<string, User>();
  for (const mod of mods) options.set(mod.userId, mod.user);
  if (me) options.set(me.id, me);
  if (entry.collectedByUser) options.set(entry.collectedByUser.id, entry.collectedByUser);

  return (
    <Select
      size="sm"
      value={entry.collectedByUser?.id ?? ""}
      onChange={(e) => markBuyin.mutate({ signupId: entry.signup.id, received: true, collectedByUserId: e.target.value || null })}
      disabled={!received || markBuyin.isPending}
      aria-label={`Collected by for ${entry.signup.rsn}`}
      className="w-auto!"
    >
      <option value="">Nobody yet</option>
      {[...options.values()].map((u) => (
        <option key={u.id} value={u.id}>
          {displayName(u)}
        </option>
      ))}
    </Select>
  );
});

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

// Duo mode only. Paired players show their partner (resolved from the roster
// row sharing the same pairing) with an unpair button; unpaired active
// players get a picker of other unpaired active players so a mod can pair
// them by hand.
// memo: doesn't depend on most of what makes SignupRoster re-render (a
// buy-in filter click, the search box's own state) — only its own entry,
// the shared lookups (stable references unless the roster itself changes)
// and search (for highlighting the partner's name).
const PartnerCell = memo(function PartnerCell({
  slug,
  entry,
  partnerRsnMap,
  unpairedActive,
  search,
}: {
  slug: string;
  entry: RosterEntry;
  partnerRsnMap: Map<string, string>;
  unpairedActive: RosterEntry[];
  search: string;
}) {
  const pair = useModPair(slug);
  const unpair = useModUnpair(slug);
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update pairing");
    }
  }

  if (entry.pairing) {
    const partner = partnerRsn(entry, partnerRsnMap) ?? "";
    return (
      <div className="flex items-center gap-1">
        <Truncate title={partner} className="text-on-surface">
          <Highlight text={partner} query={search} />
        </Truncate>
        <IconButton label="Unpair" size="sm" onPress={() => run(() => unpair.mutateAsync(entry.pairing!.id))} isDisabled={unpair.isPending}>
          <XIcon size={12} />
        </IconButton>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    );
  }

  if (entry.signup.status !== "active") return <span className="text-on-surface-subtle">—</span>;

  const candidates = unpairedActive.filter((r) => r.signup.id !== entry.signup.id);
  return (
    <div className="flex items-center gap-2">
      <Select size="sm" value={target} onChange={(e) => setTarget(e.target.value)} aria-label={`Partner for ${entry.signup.rsn}`} className="w-auto!">
        <option value="">Unpaired</option>
        {candidates.map((c) => (
          <option key={c.user.id} value={c.user.id}>
            {c.signup.rsn}
          </option>
        ))}
      </Select>
      <Button size="sm" isDisabled={!target || pair.isPending} onPress={() => run(() => pair.mutateAsync({ userIdA: entry.user.id, userIdB: target }))}>
        Pair
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
});

// "order" | "rsn" | "discord" | "status" | "buyin" | "collectedBy" | "partner" | a signup question's id.
type SortKey = string;

// Status badge plus, while the roster can still change, a two-step withdraw
// button for removing no-shows on a player's behalf.
const StatusCell = memo(function StatusCell({ slug, entry, canWithdraw }: { slug: string; entry: RosterEntry; canWithdraw: boolean }) {
  const withdraw = useModWithdrawSignup(slug);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = entry.signup.status === "active";

  async function run() {
    setError(null);
    try {
      await withdraw.mutateAsync(entry.signup.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to withdraw signup");
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1 whitespace-nowrap">
        <Button size="sm" variant="danger" onPress={run} isDisabled={withdraw.isPending}>
          Withdraw {entry.signup.rsn}
        </Button>
        <Button size="sm" variant="ghost" onPress={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Badge tone={active ? "ok" : "neutral"}>{entry.signup.status}</Badge>
      {entry.leftover && <Badge tone="warn">at risk</Badge>}
      {active && canWithdraw && (
        <IconButton label={`Withdraw ${entry.signup.rsn}'s signup`} size="sm" onPress={() => setConfirming(true)}>
          <XIcon size={12} />
        </IconButton>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
});

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
  // One subscription for the whole table, not one per row — every
  // CollectedByCell used to call this itself, so 63 rows meant 63 separate
  // subscriptions to (and re-renders off) the very same query.
  const { data: modsData } = useBingoMods(slug);
  const { devMode } = useAuth();
  const statsRefreshing = useStatsRefreshingSignupIds();
  const roster = data?.signups ?? [];
  const questions = questionsData?.questions ?? [];
  const mods = useMemo(() => modsData?.mods ?? [], [modsData]);
  const isDuo = bingoData?.bingo.signupMode === "duo";
  const stage = bingoData?.bingo.stage;
  const canWithdraw = stage === "signup" || stage === "captains";
  const [copied, setCopied] = useState(false);
  const [buyinFilter, setBuyinFilter] = useState<BuyinFilter>("all");
  const [pairFilter, setPairFilter] = useState<PairFilter>("all");
  const [search, setSearch] = useTableSearch();
  const [hiddenColumns, setHiddenColumns] = useHiddenColumns("signupRoster");
  const sort = useTableSort<SortKey>("order");
  const shown = (id: string) => !hiddenColumns.has(id);
  // A sticky <th> only sticks within a genuinely-scrolling ancestor — inside
  // a div that's merely overflow-x-auto (auto-x forces auto-y too, but
  // nothing actually overflows there, so it's not a real scrollport) it's a
  // no-op, since it just tracks the page scroll 1:1 instead of pinning. So,
  // same as the draft pool table: a bounded max-height turns the wrapper
  // into a real scroll box the header can stick inside. useDocumentTop
  // measures exactly where the table sits (site header + mod panel's own
  // chrome + this page's toolbar, whatever they add up to, no guessing at a
  // constant) so the table fills the rest of the viewport and nothing more —
  // one scrollbar, not the page's and the table's both. min-height keeps it
  // from being squeezed to uselessness if that leaves very little room (a
  // short window, a lot of chrome above it): it's then the smaller of the
  // two that loses, and a touch of page scroll is the trade-off.
  const [tableWrapper, setTableWrapper] = useState<HTMLDivElement | null>(null);
  const tableTop = useDocumentTop(tableWrapper);
  const tableMaxHeight = `calc(100dvh - ${tableTop}px - 1.5rem)`;

  const activeCount = roster.filter((r) => r.signup.status === "active").length;
  const withdrawnCount = roster.length - activeCount;
  const leftoverCount = roster.filter((r) => r.leftover).length;
  const teamCount = bingoData?.teams.length ?? 0;
  const leftoverMode = bingoData?.bingo.leftoverMode;
  // Clan standing column only when tectonic-api knows at least one player.
  const showTier = roster.some((r) => r.tectonicProfile);
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
  // Each chip's count reflects the other filter so the numbers show what
  // clicking it would leave on screen.
  const buyinCount = (f: BuyinFilter) => roster.filter((r) => matchesBuyin(r, f) && matchesPair(r, pairFilter)).length;
  const pairCount = (f: PairFilter) => roster.filter((r) => matchesPair(r, f) && matchesBuyin(r, buyinFilter)).length;
  // Both O(n), built once per roster rather than once per row (see
  // buildPartnerRsnMap and the PartnerCell candidates list above) — with
  // this table's search/sort recomputing on every keystroke, an O(n) scan
  // per row made the whole thing O(n²) per keystroke.
  const partnerRsnMap = useMemo(() => buildPartnerRsnMap(roster), [roster]);
  const unpairedActive = useMemo(() => roster.filter((r) => r.signup.status === "active" && !r.pairing), [roster]);
  const searchable = useMemo(
    () => roster.map((entry, i) => ({ order: i + 1, entry })).filter(({ entry }) => matchesBuyin(entry, buyinFilter) && matchesPair(entry, pairFilter)),
    [roster, buyinFilter, pairFilter],
  );
  // sort.order/sort.toggle are fresh closures every render (useTableSort
  // doesn't memoize them) — depend on the primitives (sort.key, sort.dir)
  // that actually decide the output, not the unstable sort object itself.
  const sorted = useMemo(
    () =>
      searchable
        .filter(({ entry }) => matchesSearch(rosterSearchValues(entry, partnerRsnMap, questions), search))
        .sort((a, b) => sort.order(compareSortValues(rosterSortValue(a, sort.key, partnerRsnMap), rosterSortValue(b, sort.key, partnerRsnMap)))),
    [searchable, search, partnerRsnMap, questions, sort.key, sort.dir],
  );

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
          {roster.length > 0 && <ColumnPicker columns={columnOptions} hidden={hiddenColumns} onHiddenChange={setHiddenColumns} />}
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
            <div ref={setTableWrapper} className="overflow-auto" style={{ maxHeight: tableMaxHeight, minHeight: MIN_TABLE_HEIGHT }}>
              <table className="w-max min-w-full text-sm [&_td]:align-middle [&_th]:align-middle">
                <thead>
                  <tr>
                    {shown("order") && <SortHeader label="#" sortKey="order" sort={sort} className={STICKY_TOP} />}
                    <SortHeader label="RSN" sortKey="rsn" sort={sort} className={STICKY_TOP} />
                    {shown("discord") && <SortHeader label="Discord" sortKey="discord" sort={sort} className={STICKY_TOP} />}
                    {showTier && shown("tier") && <SortHeader label="Tier" sortKey="tier" sort={sort} className={STICKY_TOP} />}
                    {shown("signedUp") && <SortHeader label="Signed up" sortKey="order" sort={sort} className={STICKY_TOP} />}
                    {shown("status") && <SortHeader label="Status" sortKey="status" sort={sort} className={STICKY_TOP} />}
                    {shown("caCurrent") && <SortHeader label="Current CA" sortKey="caCurrent" sort={sort} className={STICKY_TOP} />}
                    {shown("caPeak") && <SortHeader label="Peak CA" sortKey="caPeak" sort={sort} className={STICKY_TOP} />}
                    {shown("ehb") && <SortHeader label="EHB" sortKey="ehb" sort={sort} className={STICKY_TOP} />}
                    {shown("ehp") && <SortHeader label="EHP" sortKey="ehp" sort={sort} className={STICKY_TOP} />}
                    {shown("buyin") && <SortHeader label="Buy-in" sortKey="buyin" sort={sort} className={STICKY_TOP} />}
                    {shown("collectedBy") && <SortHeader label="Collected by" sortKey="collectedBy" sort={sort} className={STICKY_TOP} />}
                    {isDuo && shown("partner") && <SortHeader label="Partner" sortKey="partner" sort={sort} className={STICKY_TOP} />}
                    {questions.filter((q) => shown(q.id)).map((q) => (
                      <SortHeader key={q.id} label={q.prompt} sortKey={q.id} sort={sort} className={STICKY_TOP} labelMaxWidth={QUESTION_COLUMN_MAX_WIDTH} />
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline">
                  {sorted.map(({ order, entry }) => {
                    const answerByQ = new Map(entry.answers.map((a) => [a.questionId, a.value]));
                    const statsLoading = statsRefreshing.has(entry.signup.id);
                    return (
                      <tr key={entry.signup.id} className={STRIPE_ODD}>
                        {shown("order") && <td className="num py-2 pr-4 text-on-surface-subtle">{order}</td>}
                        <td className="py-2 pr-4 font-medium text-on-surface">
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            <PlayerName userId={entry.user.id} className="min-w-0">
                              <Truncate title={entry.signup.rsn} maxWidth="12rem">
                                <Highlight text={entry.signup.rsn} query={search} />
                              </Truncate>
                            </PlayerName>
                            {entry.signup.rsnVerified && <CheckIcon size={14} className="shrink-0 text-ok" aria-label="Verified against the linked clan account" />}
                            <RefreshStatsButton slug={slug} signupId={entry.signup.id} rsn={entry.signup.rsn} refreshing={statsLoading} />
                          </span>
                        </td>
                        {shown("discord") && (
                          <td className="py-2 pr-4 text-on-surface-muted">
                            <Truncate title={discordName(entry.user)}>
                              <Highlight text={discordName(entry.user)} query={search} />
                            </Truncate>
                          </td>
                        )}
                        {showTier && shown("tier") && (
                          <td className="whitespace-nowrap py-2 pr-4 text-on-surface-muted">
                            {entry.tectonicProfile ? <TierBadge profile={entry.tectonicProfile} /> : "—"}
                          </td>
                        )}
                        {shown("signedUp") && (
                          <td className="py-2 pr-4 text-on-surface-muted">
                            <time dateTime={entry.signup.createdAt} title={new Date(entry.signup.createdAt).toLocaleString()} className="num whitespace-nowrap">
                              {timeAgo(entry.signup.createdAt)}
                            </time>
                          </td>
                        )}
                        {shown("status") && (
                          <td className="py-2 pr-4">
                            <StatusCell slug={slug} entry={entry} canWithdraw={canWithdraw} />
                          </td>
                        )}
                        {shown("caCurrent") && (
                          <td className="py-2 pr-4 text-on-surface-muted">
                            <CaCell stats={entry.caCurrent} loading={statsLoading} />
                          </td>
                        )}
                        {shown("caPeak") && (
                          <td className="py-2 pr-4 text-on-surface-muted">
                            <CaCell stats={entry.caPeak} loading={statsLoading} />
                          </td>
                        )}
                        {shown("ehb") && (
                          <td className="num py-2 pr-4 text-on-surface-muted">
                            <WomCell stats={entry.womStats} field="ehb" loading={statsLoading} />
                          </td>
                        )}
                        {shown("ehp") && (
                          <td className="num py-2 pr-4 text-on-surface-muted">
                            <WomCell stats={entry.womStats} field="ehp" loading={statsLoading} />
                          </td>
                        )}
                        {shown("buyin") && (
                          <td className="py-2 pr-4">
                            <BuyinCell slug={slug} entry={entry} />
                          </td>
                        )}
                        {shown("collectedBy") && (
                          <td className="py-2 pr-4">
                            <CollectedByCell slug={slug} entry={entry} mods={mods} />
                          </td>
                        )}
                        {isDuo && shown("partner") && (
                          <td className="py-2 pr-4">
                            <PartnerCell slug={slug} entry={entry} partnerRsnMap={partnerRsnMap} unpairedActive={unpairedActive} search={search} />
                          </td>
                        )}
                        {questions.filter((q) => shown(q.id)).map((q) => {
                          const answer = formatSignupAnswer(q.type, answerByQ.get(q.id));
                          return (
                            <td key={q.id} className="py-2 pr-4 text-on-surface-muted">
                              {answer ? (
                                <Truncate title={answer} maxWidth={QUESTION_COLUMN_MAX_WIDTH}>
                                  <Highlight text={answer} query={search} />
                                </Truncate>
                              ) : (
                                "—"
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
