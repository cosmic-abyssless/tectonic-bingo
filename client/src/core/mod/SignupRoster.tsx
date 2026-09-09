import { useState } from "react";
import type { RosterEntry, User } from "@bingo/shared";
import { useBingo, useDeleteAllSignups, useMarkBuyin, useSeedTestSignups, useSignupRoster, useSignupQuestions, type SeedTestSignupsResponse } from "../../api/queries";
import { useAuth } from "../../context/AuthContext";
import { displayName } from "../ui/user";
import { UserSearchInput } from "../admin/UserSearchInput";
import { Button, IconButton } from "../ui/Button";
import { Badge, EmptyState, Notice } from "../ui/Card";
import { Input } from "../ui/Field";
import { CheckIcon, UsersIcon, XIcon } from "../ui/icons";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function buildCsv(roster: RosterEntry[], questionPrompts: { id: string; prompt: string }[]): string {
  const headers = ["RSN", "Discord", "Status", "Buy-in", "Collected by", ...questionPrompts.map((q) => q.prompt)];
  const rows = roster.map((entry) => {
    const answerByQ = new Map(entry.answers.map((a) => [a.questionId, a.value]));
    return [
      entry.signup.rsn,
      displayName(entry.user),
      entry.signup.status,
      entry.signup.buyinReceivedAt ? "received" : "not received",
      entry.collectedByUser ? displayName(entry.collectedByUser) : "",
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
// any time while received is true. Disabled (via fieldset, so both the input
// and its dropdown buttons are inert) once buy-in is unmarked, since
// markBuyin always clears the collector when received goes false.
function CollectedByCell({ slug, entry }: { slug: string; entry: RosterEntry }) {
  const markBuyin = useMarkBuyin(slug);
  const received = !!entry.signup.buyinReceivedAt;

  function setCollector(user: User | null) {
    markBuyin.mutate({ signupId: entry.signup.id, received: true, collectedByUserId: user?.id ?? null });
  }

  return (
    <div className="w-48">
      {entry.collectedByUser && (
        <div className="mb-1 flex items-center gap-1">
          <span className="truncate text-xs text-fg">{displayName(entry.collectedByUser)}</span>
          <IconButton label="Clear collector" size="sm" onPress={() => setCollector(null)} isDisabled={!received}>
            <XIcon size={12} />
          </IconButton>
        </div>
      )}
      <fieldset disabled={!received}>
        <UserSearchInput scope={slug} onSelect={setCollector} placeholder="Who collected it?" />
      </fieldset>
    </div>
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

const TH = "pb-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-fg-subtle";

export function SignupRoster({ slug }: { slug: string }) {
  const { data } = useSignupRoster(slug);
  const { data: questionsData } = useSignupQuestions(slug);
  const { data: bingoData } = useBingo(slug);
  const { devMode } = useAuth();
  const roster = data?.signups ?? [];
  const questions = questionsData?.questions ?? [];
  const [copied, setCopied] = useState(false);

  async function copyCsv() {
    const csv = buildCsv(roster, questions);
    await navigator.clipboard.writeText(csv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      {devMode && bingoData?.bingo.stage === "signup" && <DevSeedPanel slug={slug} />}
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-muted">
          <span className="num text-fg">{roster.length}</span> signup{roster.length !== 1 ? "s" : ""}
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
                <th className={TH}>RSN</th>
                <th className={TH}>Discord</th>
                <th className={TH}>Status</th>
                <th className={TH}>Buy-in</th>
                <th className={TH}>Collected by</th>
                {questions.map((q) => (
                  <th key={q.id} className={TH}>
                    {q.prompt}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {roster.map((entry) => {
                const answerByQ = new Map(entry.answers.map((a) => [a.questionId, a.value]));
                return (
                  <tr key={entry.signup.id}>
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
