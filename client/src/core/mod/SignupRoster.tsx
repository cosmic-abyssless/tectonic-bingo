import { useState } from "react";
import type { RosterEntry, User } from "@bingo/shared";
import {
  useBingo,
  useBingoMods,
  useDeleteAllSignups,
  useMarkBuyin,
  useModPair,
  useModUnpair,
  useSeedTestSignups,
  useSignupRoster,
  useSignupQuestions,
  type SeedTestSignupsResponse,
} from "../../api/queries";
import { useAuth } from "../../context/AuthContext";
import { displayName } from "../ui/user";
import { Button, IconButton } from "../ui/Button";
import { Badge, EmptyState, Notice } from "../ui/Card";
import { Input, Select } from "../ui/Field";
import { CheckIcon, UsersIcon, XIcon } from "../ui/icons";
import { SortHeader, compareSortValues, useTableSort } from "../ui/tableSort";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function partnerRsn(entry: RosterEntry, roster: RosterEntry[]): string | null {
  if (!entry.pairing) return null;
  return roster.find((r) => r.pairing?.id === entry.pairing!.id && r.signup.id !== entry.signup.id)?.signup.rsn ?? "Not signed up yet";
}

function buildCsv(roster: RosterEntry[], questionPrompts: { id: string; prompt: string }[], isDuo: boolean): string {
  const headers = ["#", "RSN", "Discord", "Status", "Buy-in", "Collected by", ...(isDuo ? ["Partner"] : []), ...questionPrompts.map((q) => q.prompt)];
  const rows = roster.map((entry, i) => {
    const answerByQ = new Map(entry.answers.map((a) => [a.questionId, a.value]));
    return [
      String(i + 1),
      entry.signup.rsn,
      displayName(entry.user),
      entry.signup.status,
      entry.signup.buyinReceivedAt ? "received" : "not received",
      entry.collectedByUser ? displayName(entry.collectedByUser) : "",
      ...(isDuo ? [partnerRsn(entry, roster) ?? ""] : []),
      ...questionPrompts.map((q) => answerByQ.get(q.id) ?? ""),
    ];
  });
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function BuyinCell({ slug, entry }: { slug: string; entry: RosterEntry }) {
  const markBuyin = useMarkBuyin(slug);
  const received = !!entry.signup.buyinReceivedAt;

  function toggle() {
    markBuyin.mutate({ signupId: entry.signup.id, received: !received });
  }

  return (
    <label className="flex cursor-pointer select-none items-center gap-2">
      <input type="checkbox" checked={received} onChange={toggle} disabled={markBuyin.isPending} className="size-4 cursor-pointer accent-accent" />
      <span className={`text-xs ${received ? "text-ok" : "text-fg-subtle"}`}>{received ? "Received" : "Not received"}</span>
    </label>
  );
}

// Independent of the buy-in checkbox — a mod can set/change the collector at
// any time while received is true. Disabled once buy-in is unmarked, since
// markBuyin always clears the collector when received goes false.
function CollectedByCell({ slug, entry }: { slug: string; entry: RosterEntry }) {
  const markBuyin = useMarkBuyin(slug);
  const { user: me } = useAuth();
  const { data } = useBingoMods(slug);
  const received = !!entry.signup.buyinReceivedAt;

  // Mods of this bingo, plus the viewer (a site admin need not be listed as a
  // mod) and whoever is already recorded, so the current value always has an
  // option to display.
  const options = new Map<string, User>();
  for (const mod of data?.mods ?? []) options.set(mod.userId, mod.user);
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
        <p className="mt-2 text-xs text-fg-muted">
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
function PartnerCell({ slug, entry, roster }: { slug: string; entry: RosterEntry; roster: RosterEntry[] }) {
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
    return (
      <div className="flex items-center gap-1">
        <span className="text-fg">{partnerRsn(entry, roster)}</span>
        <IconButton label="Unpair" size="sm" onPress={() => run(() => unpair.mutateAsync(entry.pairing!.id))} isDisabled={unpair.isPending}>
          <XIcon size={12} />
        </IconButton>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    );
  }

  if (entry.signup.status !== "active") return <span className="text-fg-subtle">—</span>;

  const candidates = roster.filter((r) => r.signup.status === "active" && !r.pairing && r.signup.id !== entry.signup.id);
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
}

// "order" | "rsn" | "discord" | "status" | "buyin" | "collectedBy" | "partner" | a signup question's id.
type SortKey = string;

// `order` is the 1-based signup position (the server returns the roster in
// createdAt order), kept alongside the entry so sorting by another column
// doesn't lose it.
interface NumberedEntry {
  order: number;
  entry: RosterEntry;
}

function rosterSortValue({ order, entry }: NumberedEntry, key: SortKey, roster: RosterEntry[]): string | number {
  if (key === "order") return order;
  if (key === "rsn") return entry.signup.rsn.toLowerCase();
  if (key === "discord") return displayName(entry.user).toLowerCase();
  if (key === "status") return entry.signup.status;
  if (key === "buyin") return entry.signup.buyinReceivedAt ? 1 : 0;
  if (key === "collectedBy") return entry.collectedByUser ? displayName(entry.collectedByUser).toLowerCase() : "";
  if (key === "partner") return (partnerRsn(entry, roster) ?? "").toLowerCase();
  return (entry.answers.find((a) => a.questionId === key)?.value ?? "").toLowerCase();
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
  const sort = useTableSort<SortKey>("order");

  const activeCount = roster.filter((r) => r.signup.status === "active").length;
  const withdrawnCount = roster.length - activeCount;
  const sorted = roster
    .map((entry, i) => ({ order: i + 1, entry }))
    .sort((a, b) => sort.order(compareSortValues(rosterSortValue(a, sort.key, roster), rosterSortValue(b, sort.key, roster))));

  async function copyCsv() {
    const csv = buildCsv(roster, questions, isDuo);
    await navigator.clipboard.writeText(csv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      {devMode && bingoData?.bingo.stage === "signup" && <DevSeedPanel slug={slug} />}
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-muted">
          <span className="num text-fg">{activeCount}</span> active signup{activeCount !== 1 ? "s" : ""}
          {withdrawnCount > 0 && (
            <>
              , <span className="num">{withdrawnCount}</span> withdrawn
            </>
          )}
        </p>
        <Button size="sm" onPress={copyCsv} isDisabled={roster.length === 0}>
          {copied ? "Copied" : "Copy as CSV"}
        </Button>
      </div>

      {roster.length === 0 ? (
        <EmptyState icon={<UsersIcon />} title="No signups yet">
          Players who sign up will appear here with their answers and buy-in status.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <SortHeader label="#" sortKey="order" sort={sort} />
                <SortHeader label="RSN" sortKey="rsn" sort={sort} />
                <SortHeader label="Discord" sortKey="discord" sort={sort} />
                <SortHeader label="Status" sortKey="status" sort={sort} />
                <SortHeader label="Buy-in" sortKey="buyin" sort={sort} />
                <SortHeader label="Collected by" sortKey="collectedBy" sort={sort} />
                {isDuo && <SortHeader label="Partner" sortKey="partner" sort={sort} />}
                {questions.map((q) => (
                  <SortHeader key={q.id} label={q.prompt} sortKey={q.id} sort={sort} />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sorted.map(({ order, entry }) => {
                const answerByQ = new Map(entry.answers.map((a) => [a.questionId, a.value]));
                return (
                  <tr key={entry.signup.id}>
                    <td className="num py-2 pr-4 text-fg-subtle">{order}</td>
                    <td className="py-2 pr-4 font-medium text-fg">
                      <span className="inline-flex items-center gap-1.5">
                        {entry.signup.rsn}
                        {entry.signup.rsnVerified && <CheckIcon size={14} className="text-ok" aria-label="Verified against the linked clan account" />}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-fg-muted">{displayName(entry.user)}</td>
                    <td className="py-2 pr-4">
                      <Badge tone={entry.signup.status === "active" ? "ok" : "neutral"}>{entry.signup.status}</Badge>
                    </td>
                    <td className="py-2 pr-4">
                      <BuyinCell slug={slug} entry={entry} />
                    </td>
                    <td className="py-2 pr-4">
                      <CollectedByCell slug={slug} entry={entry} />
                    </td>
                    {isDuo && (
                      <td className="py-2 pr-4">
                        <PartnerCell slug={slug} entry={entry} roster={roster} />
                      </td>
                    )}
                    {questions.map((q) => (
                      <td key={q.id} className="py-2 pr-4 text-fg-muted">
                        {answerByQ.get(q.id) ?? "—"}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
