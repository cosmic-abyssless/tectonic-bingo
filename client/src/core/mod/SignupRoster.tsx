import { useState } from "react";
import type { RosterEntry, User } from "@bingo/shared";
import { useMarkBuyin, useSignupRoster, useSignupQuestions } from "../../api/queries";
import { displayName } from "../ui/user";
import { UserSearchInput } from "../admin/UserSearchInput";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function buildCsv(roster: RosterEntry[], questionPrompts: { id: string; prompt: string }[]): string {
  const headers = ["RSN", "Discord", "Status", "Buy-in", ...questionPrompts.map((q) => q.prompt)];
  const rows = roster.map((entry) => {
    const answerByQ = new Map(entry.answers.map((a) => [a.questionId, a.value]));
    return [
      entry.signup.rsn,
      displayName(entry.user),
      entry.signup.status,
      entry.signup.buyinReceivedAt ? "received" : "not received",
      ...questionPrompts.map((q) => answerByQ.get(q.id) ?? ""),
    ];
  });
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function BuyinCell({ slug, entry }: { slug: string; entry: RosterEntry }) {
  const markBuyin = useMarkBuyin(slug);
  const [pickingCollector, setPickingCollector] = useState(false);
  const received = !!entry.signup.buyinReceivedAt;

  async function toggle() {
    if (received) {
      await markBuyin.mutateAsync({ signupId: entry.signup.id, received: false });
    } else {
      setPickingCollector(true);
    }
  }

  async function confirmCollector(user: User | null) {
    await markBuyin.mutateAsync({ signupId: entry.signup.id, received: true, collectedByUserId: user?.id ?? null });
    setPickingCollector(false);
  }

  return (
    <div>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" checked={received} onChange={toggle} disabled={markBuyin.isPending} className="w-4 h-4 accent-green-500 cursor-pointer" />
        <span className={`text-xs ${received ? "text-green-400" : "text-slate-500"}`}>{received ? "Received" : "Not received"}</span>
      </label>
      {pickingCollector && (
        <div className="mt-1.5 w-48">
          <UserSearchInput scope={slug} onSelect={confirmCollector} placeholder="Who collected it? (optional)" />
          <button onClick={() => confirmCollector(null)} className="text-xs text-slate-500 hover:text-slate-300 mt-1 cursor-pointer">
            Skip
          </button>
        </div>
      )}
    </div>
  );
}

export function SignupRoster({ slug }: { slug: string }) {
  const { data } = useSignupRoster(slug);
  const { data: questionsData } = useSignupQuestions(slug);
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
                  <td className="py-2 pr-4 text-white font-medium">{entry.signup.rsn}</td>
                  <td className="py-2 pr-4 text-slate-300">{displayName(entry.user)}</td>
                  <td className="py-2 pr-4">
                    <span className={`text-xs rounded-full px-2 py-0.5 ${entry.signup.status === "active" ? "bg-green-900/50 text-green-300" : "bg-slate-700 text-slate-400"}`}>
                      {entry.signup.status}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <BuyinCell slug={slug} entry={entry} />
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
