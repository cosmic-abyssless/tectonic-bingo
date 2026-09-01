import { useState } from "react";
import type { RosterEntry, User } from "@bingo/shared";
import { useBingo, useMarkBuyin, useSeedTestSignups, useSignupRoster, useSignupQuestions } from "../../api/queries";
import { useAuth } from "../../context/AuthContext";
import { displayName } from "../ui/user";
import { UserSearchInput } from "../admin/UserSearchInput";

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
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input type="checkbox" checked={received} onChange={toggle} disabled={markBuyin.isPending} className="w-4 h-4 accent-green-500 cursor-pointer" />
      <span className={`text-xs ${received ? "text-green-400" : "text-slate-500"}`}>{received ? "Received" : "Not received"}</span>
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
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs text-slate-300 truncate">{displayName(entry.collectedByUser)}</span>
          <button onClick={() => setCollector(null)} disabled={!received} className="text-xs text-slate-500 hover:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0">
            ✕
          </button>
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
  const [count, setCount] = useState(8);
  const [error, setError] = useState<string | null>(null);

  async function seed() {
    setError(null);
    try {
      await seedTestSignups.mutateAsync(count);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to seed test signups");
    }
  }

  return (
    <div className="bg-amber-950/30 border border-amber-800/60 rounded-lg px-3 py-2 mb-4 flex items-center gap-2 flex-wrap">
      <span className="text-xs text-amber-400 font-semibold uppercase tracking-wide shrink-0">Dev tools</span>
      <input
        type="number"
        min={1}
        max={50}
        value={count}
        onChange={(e) => setCount(Number(e.target.value) || 1)}
        className="w-16 bg-slate-900 border border-slate-600 text-white rounded-md px-2 py-1 text-sm focus:outline-none focus:border-indigo-500"
      />
      <button
        onClick={seed}
        disabled={seedTestSignups.isPending}
        className="text-sm bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold rounded-md px-3 py-1 transition-colors cursor-pointer"
      >
        {seedTestSignups.isPending ? "Seeding…" : "Seed test signups"}
      </button>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}

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
    <div className="w-full max-w-6xl mx-auto px-6">
      {devMode && bingoData?.bingo.stage === "signup" && <DevSeedPanel slug={slug} />}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-400">{roster.length} signup{roster.length !== 1 ? "s" : ""}</p>
        <button onClick={copyCsv} className="text-sm bg-slate-700 hover:bg-slate-600 text-white rounded px-3 py-1.5 transition-colors cursor-pointer">
          {copied ? "Copied!" : "Copy as CSV"}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 text-xs uppercase border-b border-slate-700">
              <th className="pb-2 pr-4">RSN</th>
              <th className="pb-2 pr-4">Discord</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">Buy-in</th>
              <th className="pb-2 pr-4">Collected by</th>
              {questions.map((q) => (
                <th key={q.id} className="pb-2 pr-4">
                  {q.prompt}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {roster.map((entry) => {
              const answerByQ = new Map(entry.answers.map((a) => [a.questionId, a.value]));
              return (
                <tr key={entry.signup.id}>
                  <td className="py-2 pr-4 text-white font-medium">
                    {entry.signup.rsn}
                    {entry.signup.rsnVerified && (
                      <span title="Verified against the linked clan account" className="ml-1.5 text-emerald-400">
                        ✓
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-slate-300">{displayName(entry.user)}</td>
                  <td className="py-2 pr-4">
                    <span className={`text-xs rounded-full px-2 py-0.5 ${entry.signup.status === "active" ? "bg-green-900/50 text-green-300" : "bg-slate-700 text-slate-400"}`}>
                      {entry.signup.status}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <BuyinCell slug={slug} entry={entry} />
                  </td>
                  <td className="py-2 pr-4">
                    <CollectedByCell slug={slug} entry={entry} />
                  </td>
                  {questions.map((q) => (
                    <td key={q.id} className="py-2 pr-4 text-slate-300">
                      {answerByQ.get(q.id) ?? "—"}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {roster.length === 0 && <p className="text-slate-500 text-sm py-8 text-center">No signups yet.</p>}
      </div>
    </div>
  );
}
