import { useEffect, useState } from "react";
import { encodeChoices, isBlankAnswer, parseChoices, type SignupAnswerInput, type SignupQuestion } from "@bingo/shared";
import { useBingo, useCreateSignup, useMySignup, useMyTectonicRsns, useSignupQuestions, useUpdateSignup, useWithdrawSignup } from "../../api/queries";
import { useAuth } from "../../context/AuthContext";
import { PartnerPanel } from "./PartnerPanel";
import { caTitle, formatCaTier } from "./caStats";
import { useStatsRefreshingUserIds } from "../../context/WebSocketContext";
import { Button } from "../ui/Button";
import { EmptyState, HEADING_FONT, Notice } from "../ui/Card";
import { Disclosure } from "../ui/Disclosure";
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

/** A group of radio buttons or checkboxes under one label, for the choice questions. */
function ChoiceGroup({ question, value, onChange, label, hint }: { question: SignupQuestion; value: string; onChange: (v: string) => void; label: React.ReactNode; hint?: string }) {
  const multiple = question.type === "multiselect";
  const options = parseOptions(question);
  const chosen = multiple ? parseChoices(value) : value ? [value] : [];
  // An answer that is no longer one of the options (the options were edited) stays visible so it can be unticked.
  const shown = [...options, ...chosen.filter((c) => !options.includes(c))];

  function toggle(option: string, on: boolean) {
    if (!multiple) return onChange(option);
    const next = on ? [...chosen, option] : chosen.filter((c) => c !== option);
    onChange(next.length === 0 ? "" : encodeChoices(shown.filter((o) => next.includes(o))));
  }

  return (
    <fieldset>
      <legend className="mb-1.5 block text-xs font-medium text-on-surface-muted">{label}</legend>
      <div className="space-y-2">
        {shown.map((option) => (
          <label key={option} className="flex cursor-pointer select-none items-center gap-2.5">
            <input
              type={multiple ? "checkbox" : "radio"}
              name={multiple ? undefined : `question-${question.id}`}
              checked={chosen.includes(option)}
              onChange={(e) => toggle(option, e.target.checked)}
              className="size-4 cursor-pointer accent-accent"
            />
            <span className="text-sm text-on-surface">{option}</span>
          </label>
        ))}
      </div>
      {!multiple && !question.required && value && (
        <button type="button" onClick={() => onChange("")} className="mt-1.5 text-xs text-on-surface-subtle underline underline-offset-2 hover:text-on-surface">
          Clear
        </button>
      )}
      {hint && <p className="mt-1.5 text-xs text-on-surface-subtle">{hint}</p>}
    </fieldset>
  );
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

  const hint = question.helperText || undefined;

  if (question.type === "boolean") {
    return (
      <div>
        <label className="flex cursor-pointer select-none items-center gap-2.5">
          <input type="checkbox" checked={value === "true"} onChange={(e) => onChange(e.target.checked ? "true" : "false")} className="size-4 cursor-pointer accent-accent" />
          <span className="text-sm text-on-surface-muted">{label}</span>
        </label>
        {hint && <p className="mt-1 pl-[1.625rem] text-xs text-on-surface-subtle">{hint}</p>}
      </div>
    );
  }
  if (question.type === "textarea") {
    return (
      <Field label={label} hint={hint}>
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="resize-none" />
      </Field>
    );
  }
  if (question.type === "select" || question.type === "multiselect") {
    return <ChoiceGroup question={question} value={value} onChange={onChange} label={label} hint={hint} />;
  }
  return (
    <Field label={label} hint={hint}>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function SignupForm({ slug }: { slug: string }) {
  const { user } = useAuth();
  const statsRefreshing = useStatsRefreshingUserIds();
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
  // Null until the viewer opens or closes the section (or submits): until then it follows whether they've signed up,
  // which isn't known yet on the first render (the signup is still loading).
  const [expandedChoice, setExpanded] = useState<boolean | null>(null);
  const expanded = expandedChoice ?? !existing;

  // One linked RSN (or a saved signup) should already be chosen — don't wait
  // on the effect, or the select paints as "Select…" for a frame.
  const rsnValue = rsn || existing?.rsn || (rsnOptions.length === 1 ? rsnOptions[0]!.rsn : "");

  useEffect(() => {
    if (existing) setRsn(existing.rsn);
    if (mySignup?.answers) {
      const map: Record<string, string> = {};
      for (const a of mySignup.answers) map[a.questionId] = a.value;
      setAnswers(map);
    }
  }, [existing, mySignup]);

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
  const missingRequired = questions.some((q) => q.required && isBlankAnswer(q.type, answers[q.id]));
  const isValid = !!rsnValue.trim() && !missingRequired;

  async function submit() {
    setError(null);
    setSaved(false);
    // Folds away the moment you submit: the header (now "Edit your signup", with "Saved." under it) says it worked.
    // A failed save opens it again, so the error inside is seen.
    setExpanded(false);
    try {
      if (existing) {
        await updateSignup.mutateAsync({ rsn: rsnValue, answers: answerList });
      } else {
        await createSignup.mutateAsync({ rsn: rsnValue, answers: answerList });
      }
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save signup");
      setExpanded(true);
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
  const caLoading = !!existing && (!mySignup?.statsFetchedAt || (!!user && statsRefreshing.has(user.id)));
  const rsnLabel = (
    <>
      RuneScape name
      <Required />
    </>
  );

  const isDuo = shell?.bingo.signupMode === "duo";

  return (
    <div className="space-y-6">
      {/* Collapsed by default once already signed up — the title/description alone (visible either way) already
          says who's signed up as what; open by default beforehand, since there's nothing to collapse *to* yet.
          Controlled only so submitting can fold it away (see submit); withdrawing leaves it as it is. */}
      <Disclosure
        isExpanded={expanded}
        onExpandedChange={setExpanded}
        className="mx-auto max-w-lg"
        title={
          <h2 className="text-sm font-semibold text-on-surface" style={HEADING_FONT}>
            {/* A duo bingo's two steps are numbered: this, then picking a partner (PartnerPanel). */}
            {isDuo && "1. "}
            {existing ? "Edit your signup" : "Sign up"}
          </h2>
        }
        description={
          existing
            ? `${saved ? "Saved. " : ""}You can update your answers or withdraw while signups are open.`
            : "Fill this out to join the bingo."
        }
      >
        <div className="space-y-5">
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
                tectonicRsns.some((r) => r.rsn === rsnValue) ? (
                  <span className="inline-flex items-center gap-1 text-ok">
                    <CheckIcon size={12} /> Verified against your linked clan account
                  </span>
                ) : (
                  <span className="text-warn">This RSN isn't currently linked to your clan account</span>
                )
              }
            >
              <Select value={rsnValue} onChange={(e) => setRsn(e.target.value)}>
                {rsnOptions.length > 1 && <option value="">Select…</option>}
                {rsnOptions.map((r) => (
                  <option key={r.rsn} value={r.rsn}>
                    {r.rsn}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label={rsnLabel}>
              <Input value={rsnValue} onChange={(e) => setRsn(e.target.value)} maxLength={12} />
            </Field>
          )}

          {questions.map((q) => (
            <QuestionField key={q.id} question={q} value={answers[q.id] ?? ""} onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))} />
          ))}

          {existing && (
            <div className={tectonicRsns.length > 1 ? "grid grid-cols-2 gap-4" : undefined}>
              <Field
                label="Current CA"
                hint={
                  caLoading
                    ? "Looking up RuneProfile…"
                    : mySignup?.caCurrent
                      ? caTitle(mySignup.caCurrent)
                      : "No RuneProfile for this RSN — sync it there, then save again."
                }
              >
                <Input value={caLoading ? "Looking up…" : formatCaTier(mySignup?.caCurrent)} readOnly disabled />
              </Field>
              {tectonicRsns.length > 1 && (
                <Field label="Peak CA" hint={!caLoading && mySignup?.caPeak ? caTitle(mySignup.caPeak) : undefined}>
                  <Input value={caLoading ? "Looking up…" : formatCaTier(mySignup?.caPeak)} readOnly disabled />
                </Field>
              )}
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
      </Disclosure>

      {isDuo && existing && <PartnerPanel slug={slug} />}
    </div>
  );
}
