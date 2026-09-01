import { useEffect, useState } from "react";
import type { SignupAnswerInput, SignupQuestion } from "@bingo/shared";
import { useCreateSignup, useMySignup, useMyTectonicRsns, useSignupQuestions, useUpdateSignup, useWithdrawSignup } from "../../api/queries";

function parseOptions(question: SignupQuestion): string[] {
  try {
    const parsed = JSON.parse(question.optionsJson ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function QuestionField({ question, value, onChange }: { question: SignupQuestion; value: string; onChange: (v: string) => void }) {
  const label = (
    <label className="block text-sm font-medium text-slate-300 mb-1.5">
      {question.prompt}
      {question.required && <span className="text-red-400 ml-1">*</span>}
    </label>
  );

  if (question.type === "textarea") {
    return (
      <div>
        {label}
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="w-full bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none" />
      </div>
    );
  }
  if (question.type === "boolean") {
    return (
      <label className="flex items-center gap-2.5 cursor-pointer select-none">
        <input type="checkbox" checked={value === "true"} onChange={(e) => onChange(e.target.checked ? "true" : "false")} className="w-4 h-4 accent-indigo-500 cursor-pointer" />
        <span className="text-sm text-slate-300">
          {question.prompt}
          {question.required && <span className="text-red-400 ml-1">*</span>}
        </span>
      </label>
    );
  }
  if (question.type === "select") {
    const options = parseOptions(question);
    return (
      <div>
        {label}
        <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
          <option value="">Select…</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }
  return (
    <div>
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
    </div>
  );
}

export function SignupForm({ slug }: { slug: string }) {
  const { data: questionsData } = useSignupQuestions(slug);
  const { data: mySignup, isLoading } = useMySignup(slug);
  const { data: tectonicRsnsData, isLoading: tectonicLoading } = useMyTectonicRsns(slug);
  const createSignup = useCreateSignup(slug);
  const updateSignup = useUpdateSignup(slug);
  const withdrawSignup = useWithdrawSignup(slug);

  const questions = questionsData?.questions ?? [];
  const existing = mySignup?.signup && mySignup.signup.status === "active" ? mySignup.signup : null;
  const tectonicRsns = tectonicRsnsData?.rsns ?? [];
  // If the currently-saved RSN isn't (or is no longer) one of the signer's
  // linked RSNs, keep it selectable rather than silently dropping it.
  const rsnOptions =
    existing && !tectonicRsns.some((r) => r.rsn.toLowerCase() === existing.rsn.toLowerCase())
      ? [{ rsn: existing.rsn, womId: "" }, ...tectonicRsns]
      : tectonicRsns;

  const [rsn, setRsn] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (existing) setRsn(existing.rsn);
    else if (tectonicRsns.length === 1) setRsn(tectonicRsns[0].rsn);
    if (mySignup?.answers) {
      const map: Record<string, string> = {};
      for (const a of mySignup.answers) map[a.questionId] = a.value;
      setAnswers(map);
    }
  }, [existing, mySignup, tectonicRsns]);

  // Only gate NEW signups — someone who signed up before the integration
  // was turned on (or before they were registered) keeps their spot, so
  // wait for the membership check only when there's no existing signup.
  if (isLoading || (!existing && tectonicLoading)) return null;

  if (!existing && tectonicRsnsData?.enabled && !tectonicRsnsData.isMember) {
    return (
      <div className="max-w-lg mx-auto bg-slate-800 border border-slate-700 rounded-xl p-6 text-center space-y-2">
        <h2 className="text-xl font-bold text-white">Clan members only</h2>
        <p className="text-slate-400 text-sm">
          This bingo is only open to registered members of the clan. If you believe this is a mistake, ask a moderator to check your clan registration.
        </p>
      </div>
    );
  }

  const answerList: SignupAnswerInput[] = questions.map((q) => ({ questionId: q.id, value: answers[q.id] ?? "" }));
  const missingRequired = questions.some((q) => q.required && !(answers[q.id] ?? "").trim());
  const isValid = rsn.trim() && !missingRequired;

  async function submit() {
    setError(null);
    setSaved(false);
    try {
      if (existing) {
        await updateSignup.mutateAsync({ rsn, answers: answerList });
      } else {
        await createSignup.mutateAsync({ rsn, answers: answerList });
      }
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save signup");
    }
  }

  async function withdraw() {
    setError(null);
    try {
      await withdrawSignup.mutateAsync();
      setConfirmingWithdraw(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to withdraw");
    }
  }

  const pending = createSignup.isPending || updateSignup.isPending;

  return (
    <div className="max-w-lg mx-auto bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">{existing ? "Edit your signup" : "Sign up"}</h2>
        <p className="text-slate-400 text-sm mt-1">{existing ? "You can update your answers or withdraw while signups are open." : "Fill this out to join the bingo."}</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">
          RuneScape name <span className="text-red-400">*</span>
        </label>
        {rsnOptions.length > 0 ? (
          <>
            <select value={rsn} onChange={(e) => setRsn(e.target.value)} className="w-full bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
              <option value="">Select…</option>
              {rsnOptions.map((r) => (
                <option key={r.rsn} value={r.rsn}>
                  {r.rsn}
                </option>
              ))}
            </select>
            {tectonicRsns.some((r) => r.rsn === rsn) ? (
              <p className="text-xs text-emerald-400 mt-1">✓ Verified against your linked clan account</p>
            ) : (
              <p className="text-xs text-amber-400 mt-1">This RSN isn't currently linked to your clan account</p>
            )}
          </>
        ) : (
          <input value={rsn} onChange={(e) => setRsn(e.target.value)} maxLength={12} className="w-full bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
        )}
      </div>

      {questions.map((q) => (
        <QuestionField key={q.id} question={q} value={answers[q.id] ?? ""} onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))} />
      ))}

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {saved && <p className="text-green-400 text-sm">Saved!</p>}

      <div className="flex gap-3">
        <button
          onClick={submit}
          disabled={!isValid || pending}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {pending ? "Saving…" : existing ? "Save changes" : "Sign up"}
        </button>
        {existing && (
          <button
            onClick={() => setConfirmingWithdraw(true)}
            className="text-sm text-red-400 hover:text-red-300 border border-red-900 hover:border-red-700 rounded-lg px-4 transition-colors cursor-pointer"
          >
            Withdraw
          </button>
        )}
      </div>

      {confirmingWithdraw && (
        <div className="flex items-center gap-3 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2.5">
          <p className="text-sm text-red-200 flex-1">Withdraw your signup?</p>
          <button onClick={() => setConfirmingWithdraw(false)} className="text-sm text-slate-400 hover:text-white cursor-pointer">
            Cancel
          </button>
          <button onClick={withdraw} className="text-sm bg-red-700 hover:bg-red-600 text-white font-semibold rounded px-3 py-1 transition-colors cursor-pointer">
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}
