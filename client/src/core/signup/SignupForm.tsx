import { useEffect, useState } from "react";
import type { SignupAnswerInput, SignupQuestion } from "@bingo/shared";
import { useBingo, useCreateSignup, useMySignup, useMyTectonicRsns, useSignupQuestions, useUpdateSignup, useWithdrawSignup } from "../../api/queries";
import { useAuth } from "../../context/AuthContext";
import { PartnerPanel } from "./PartnerPanel";
import { caTitle, formatCaTier } from "./caStats";
import { Button } from "../ui/Button";
import { Card, CardHeader, EmptyState, Notice } from "../ui/Card";
import { Field, Input, Select, Textarea } from "../ui/Field";
import { AlertIcon, CheckIcon, LockIcon } from "../ui/icons";

function parseOptions(question: SignupQuestion): string[] {
  try {
    const parsed = JSON.parse(question.optionsJson ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function Required() {
  return <span className="ml-1 text-danger">*</span>;
}

function QuestionField({ question, value, onChange }: { question: SignupQuestion; value: string; onChange: (v: string) => void }) {
  const label = (
    <>
      {question.prompt}
      {question.required && <Required />}
    </>
  );

  if (question.type === "boolean") {
    return (
      <label className="flex cursor-pointer select-none items-center gap-2.5">
        <input type="checkbox" checked={value === "true"} onChange={(e) => onChange(e.target.checked ? "true" : "false")} className="size-4 cursor-pointer accent-accent" />
        <span className="text-sm text-on-surface-muted">{label}</span>
      </label>
    );
  }
  if (question.type === "textarea") {
    return (
      <Field label={label}>
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="resize-none" />
      </Field>
    );
  }
  if (question.type === "select") {
    return (
      <Field label={label}>
        <Select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {parseOptions(question).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </Select>
      </Field>
    );
  }
  return (
    <Field label={label}>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function SignupForm({ slug }: { slug: string }) {
  const { user } = useAuth();
  const { data: shell } = useBingo(slug);
  const { data: questionsData } = useSignupQuestions(slug);
  const { data: mySignup, isLoading } = useMySignup(slug);
  const { data: tectonicRsnsData, isLoading: tectonicLoading, error: tectonicError } = useMyTectonicRsns(slug);
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

  // Server answers 503 when tectonic-api is unreachable. Don't let the user
  // fill in the form only to have the submit fail with the same message.
  if (!existing && tectonicError) {
    return (
      <EmptyState icon={<AlertIcon size={20} />} title="Signups temporarily unavailable">
        {tectonicError.message}
      </EmptyState>
    );
  }

  if (!existing && user && !user.inGuild) {
    return (
      <EmptyState icon={<LockIcon size={20} />} title="Not in the clan's Discord">
        Your Discord account isn't in the Tectonic Discord server, so you can't sign up. Join the server, then log out and back in.
      </EmptyState>
    );
  }

  if (!existing && tectonicRsnsData?.enabled && !tectonicRsnsData.isMember) {
    return (
      <EmptyState icon={<LockIcon size={20} />} title="Clan members only">
        You're in the Discord server, but the clan bot doesn't have you registered as a member. Ask a moderator to check your clan registration.
      </EmptyState>
    );
  }

  const answerList: SignupAnswerInput[] = questions.map((q) => ({ questionId: q.id, value: answers[q.id] ?? "" }));
  const missingRequired = questions.some((q) => q.required && !(answers[q.id] ?? "").trim());
  const isValid = !!rsn.trim() && !missingRequired;

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
  const rsnLabel = (
    <>
      RuneScape name
      <Required />
    </>
  );

  const isDuo = shell?.bingo.signupMode === "duo";

  return (
    <div className="space-y-6">
      <Card className="mx-auto max-w-lg">
        <CardHeader
          title={existing ? "Edit your signup" : "Sign up"}
          description={existing ? "You can update your answers or withdraw while signups are open." : "Fill this out to join the bingo."}
        />
        <div className="space-y-5 p-5">
          {existing && mySignup?.atRisk && (
            <Notice tone="warn" icon={<AlertIcon />}>
              Teams get an equal number of picks, and you're among the newest signups that don't fit a full round right now. You'll be{" "}
              {shell?.bingo.leftoverMode === "singles" ? "drafted in a final singles round" : "left out of the draft"} unless more players sign up or another team is added.
            </Notice>
          )}
          {rsnOptions.length > 0 ? (
            <Field
              label={rsnLabel}
              hint={
                tectonicRsns.some((r) => r.rsn === rsn) ? (
                  <span className="inline-flex items-center gap-1 text-ok">
                    <CheckIcon size={12} /> Verified against your linked clan account
                  </span>
                ) : (
                  <span className="text-warn">This RSN isn't currently linked to your clan account</span>
                )
              }
            >
              <Select value={rsn} onChange={(e) => setRsn(e.target.value)}>
                <option value="">Select…</option>
                {rsnOptions.map((r) => (
                  <option key={r.rsn} value={r.rsn}>
                    {r.rsn}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label={rsnLabel}>
              <Input value={rsn} onChange={(e) => setRsn(e.target.value)} maxLength={12} />
            </Field>
          )}

          {questions.map((q) => (
            <QuestionField key={q.id} question={q} value={answers[q.id] ?? ""} onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))} />
          ))}

          {existing && (
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Current CA"
                hint={
                  mySignup?.statsFetchedAt
                    ? mySignup.caCurrent
                      ? caTitle(mySignup.caCurrent)
                      : "No RuneProfile for this RSN — sync it there, then save again."
                    : "Looking up RuneProfile…"
                }
              >
                <Input value={mySignup?.statsFetchedAt ? formatCaTier(mySignup.caCurrent) : "Looking up…"} readOnly disabled />
              </Field>
              <Field label="Peak CA" hint={mySignup?.caPeak && mySignup.caPeak.tier !== mySignup.caCurrent?.tier ? "Highest among your linked RSNs. Alts are not named." : undefined}>
                <Input value={mySignup?.statsFetchedAt ? formatCaTier(mySignup.caPeak) : "Looking up…"} readOnly disabled />
              </Field>
            </div>
          )}

          {error && <Notice tone="danger">{error}</Notice>}
          {saved && <Notice tone="ok">Saved.</Notice>}

          <div className="flex gap-3">
            <Button variant="primary" className="flex-1" onPress={submit} isDisabled={!isValid || pending}>
              {pending ? "Saving…" : existing ? "Save changes" : "Sign up"}
            </Button>
            {existing && !confirmingWithdraw && (
              <Button variant="danger" onPress={() => setConfirmingWithdraw(true)}>
                Withdraw
              </Button>
            )}
          </div>

          {confirmingWithdraw && (
            <Notice tone="danger">
              <div className="flex items-center gap-3">
                <span className="flex-1">Withdraw your signup?</span>
                <Button size="sm" variant="ghost" onPress={() => setConfirmingWithdraw(false)}>
                  Cancel
                </Button>
                <Button size="sm" variant="danger" onPress={withdraw} isDisabled={withdrawSignup.isPending}>
                  Confirm
                </Button>
              </div>
            </Notice>
          )}
        </div>
      </Card>

      {isDuo && existing && <PartnerPanel slug={slug} />}
    </div>
  );
}
