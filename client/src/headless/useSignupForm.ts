import { useEffect, useMemo, useState } from "react";
import { detectTimeZone, encodeChoices, isBlankAnswer, parseChoices, timeZoneOptions, type CombatAchievementStats, type SignupAnswerInput, type SignupQuestion, type TimeZoneOption } from "@bingo/shared";
import { useBingo, useCreateSignup, useMyPairing, useMySignup, useMyTectonicRsns, useSignupQuestions, useUpdateSignup, useWithdrawSignup } from "../api/queries";
import { useAuth } from "../context/AuthContext";
import { useStatsRefreshingUserIds } from "../context/WebSocketContext";
import { caTitle, formatCaTier } from "../core/signup/caStats";

// The signup stage's form as a view model: everything core/signup/SignupForm (the default look) and a theme's own
// SignupStage need to draw it, with the fetching, validation and saving done here once.

/** One option of a select/multiselect question. */
export interface SignupChoiceModel {
  label: string;
  checked: boolean;
  /** Ticks or unticks it (a single-choice question just picks it). */
  set: (on: boolean) => void;
}

export interface SignupQuestionModel {
  id: string;
  prompt: string;
  type: SignupQuestion["type"];
  required: boolean;
  value: string;
  set: (value: string) => void;
  /** The question's helper text, then who can read the answer when that's limited to mods or admins. */
  hint?: string;
  /** Select and multiselect only: the options, plus a saved answer that's no longer one (so it can be unticked). */
  choices: SignupChoiceModel[];
  /** A single-choice question that's optional and answered can be cleared. */
  clear: (() => void) | null;
}

export interface SignupCaModel {
  loading: boolean;
  /** "Medium", or "Unknown" with no RuneProfile data. */
  tier: string;
  /** "170 points", or how to get the data there. */
  title: string;
  found: boolean;
}

export type SignupBlock =
  /** tectonic-api is unreachable: a new signup would fail, so the form isn't shown. */
  | { reason: "unavailable"; message: string }
  | { reason: "notInGuild" }
  | { reason: "notMember" };

export interface SignupFormModel {
  status: "loading" | "blocked" | "ready";
  block: SignupBlock | null;
  /** Signed up already (an active signup): the form edits it. */
  signedUp: boolean;
  /** A duo bingo: this form is step 1, choosing a partner (usePartnerPanel) is step 2. */
  isDuo: boolean;
  /** The form's section is open. Follows whether they've signed up until they open or close it themselves. */
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
  /**
   * Cut from the draft as things stand: "pairs_only", an unpaired player in a bingo that drafts only pairs; "uneven",
   * among the newest signups that don't split evenly across the teams.
   */
  atRisk: { reason: "pairs_only" | "uneven" } | null;
  rsn: {
    value: string;
    set: (rsn: string) => void;
    /** The linked clan RSNs to choose from, or null when there are none (then it's typed in). */
    options: string[] | null;
    /** The chosen RSN is one of the linked clan accounts. */
    verified: boolean;
  };
  timezone: {
    value: string;
    set: (timezone: string) => void;
    options: TimeZoneOption[];
    /** It's the browser's own guess, not yet saved: say so, in case it's not where they play from. */
    fromBrowser: boolean;
  };
  questions: SignupQuestionModel[];
  /** Signed up only: their combat achievements, as looked up from RuneProfile; peak only with more than one RSN. */
  ca: { current: SignupCaModel; peak: SignupCaModel | null } | null;
  isValid: boolean;
  pending: boolean;
  saved: boolean;
  error: string | null;
  submit: () => void;
  withdraw: { confirming: boolean; ask: () => void; cancel: () => void; confirm: () => void; pending: boolean };
}

function parseOptions(question: SignupQuestion): string[] {
  try {
    const parsed = JSON.parse(question.optionsJson ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function questionModel(question: SignupQuestion, value: string, set: (v: string) => void): SignupQuestionModel {
  // A question limited to mods/admins says so, so players know who reads what they write there.
  const privacy = question.visibility === "admins" ? "Only admins see your answer." : question.visibility === "mods" ? "Only mods and admins see your answer." : null;
  const hint = [question.helperText, privacy].filter(Boolean).join(" ") || undefined;

  const isChoice = question.type === "select" || question.type === "multiselect";
  const multiple = question.type === "multiselect";
  const options = isChoice ? parseOptions(question) : [];
  const chosen = multiple ? parseChoices(value) : value ? [value] : [];
  // An answer that is no longer one of the options (the options were edited) stays visible so it can be unticked.
  const shown = isChoice ? [...options, ...chosen.filter((c) => !options.includes(c))] : [];

  function toggle(option: string, on: boolean) {
    if (!multiple) return set(option);
    const next = on ? [...chosen, option] : chosen.filter((c) => c !== option);
    set(next.length === 0 ? "" : encodeChoices(shown.filter((o) => next.includes(o))));
  }

  return {
    id: question.id,
    prompt: question.prompt,
    type: question.type,
    required: question.required,
    value,
    set,
    hint,
    choices: shown.map((option) => ({ label: option, checked: chosen.includes(option), set: (on) => toggle(option, on) })),
    clear: question.type === "select" && !question.required && value ? () => set("") : null,
  };
}

export function useSignupForm(slug: string): SignupFormModel {
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
  // Whether an at-risk player is unpaired (the partner panel shares this query).
  const { data: pairing } = useMyPairing(slug, shell?.bingo.signupMode === "duo" && !!existing && !!mySignup?.atRisk);
  const tectonicRsns = tectonicRsnsData?.rsns ?? [];
  // If the currently-saved RSN isn't (or is no longer) one of the signer's
  // linked RSNs, keep it selectable rather than silently dropping it.
  const rsnOptions =
    existing && !tectonicRsns.some((r) => r.rsn.toLowerCase() === existing.rsn.toLowerCase())
      ? [{ rsn: existing.rsn, womId: "" }, ...tectonicRsns]
      : tectonicRsns;

  const [rsn, setRsn] = useState("");
  const [timezone, setTimezone] = useState("");
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

  // Pre-filled from the browser: a new signup starts on it, and so does an older signup that predates the question
  // (no saved timezone yet) — the player only has to confirm it with a save.
  const detectedTimezone = useMemo(() => detectTimeZone(), []);
  const timezoneValue = timezone || existing?.timezone || detectedTimezone || "";
  const timezoneChoices = useMemo(() => timeZoneOptions([existing?.timezone, detectedTimezone]), [existing?.timezone, detectedTimezone]);

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
  const loading = isLoading || (!existing && tectonicLoading);
  // Server answers 503 when tectonic-api is unreachable. Don't let the user
  // fill in the form only to have the submit fail with the same message.
  const block: SignupBlock | null = loading || existing
    ? null
    : tectonicError
      ? { reason: "unavailable", message: tectonicError.message }
      : user && !user.inGuild
        ? { reason: "notInGuild" }
        : tectonicRsnsData?.enabled && !tectonicRsnsData.isMember
          ? { reason: "notMember" }
          : null;

  const answerList: SignupAnswerInput[] = questions.map((q) => ({ questionId: q.id, value: answers[q.id] ?? "" }));
  const missingRequired = questions.some((q) => q.required && isBlankAnswer(q.type, answers[q.id]));
  const isValid = !!rsnValue.trim() && !!timezoneValue && !missingRequired;

  async function submit() {
    setError(null);
    setSaved(false);
    // Folds away the moment you submit: the header (now "Edit your signup", with "Saved." under it) says it worked.
    // A failed save opens it again, so the error inside is seen.
    setExpanded(false);
    try {
      if (existing) {
        await updateSignup.mutateAsync({ rsn: rsnValue, timezone: timezoneValue, answers: answerList });
      } else {
        await createSignup.mutateAsync({ rsn: rsnValue, timezone: timezoneValue, answers: answerList });
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

  const caLoading = !!existing && (!mySignup?.statsFetchedAt || (!!user && statsRefreshing.has(user.id)));
  const caModel = (stats: CombatAchievementStats | null | undefined): SignupCaModel => ({
    loading: caLoading,
    tier: formatCaTier(stats),
    title: stats ? caTitle(stats) : "No RuneProfile for this RSN — sync it there, then save again.",
    found: !!stats,
  });

  return {
    status: loading ? "loading" : block ? "blocked" : "ready",
    block,
    signedUp: !!existing,
    isDuo: shell?.bingo.signupMode === "duo",
    expanded,
    setExpanded,
    atRisk: existing && mySignup?.atRisk ? { reason: shell?.bingo.cutMode === "pairs_only" && !pairing?.partner ? "pairs_only" : "uneven" } : null,
    rsn: {
      value: rsnValue,
      set: setRsn,
      options: rsnOptions.length > 0 ? rsnOptions.map((r) => r.rsn) : null,
      verified: tectonicRsns.some((r) => r.rsn === rsnValue),
    },
    timezone: {
      value: timezoneValue,
      set: setTimezone,
      options: timezoneChoices,
      fromBrowser: !!timezoneValue && timezoneValue === detectedTimezone && timezoneValue !== existing?.timezone,
    },
    questions: questions.map((q) => questionModel(q, answers[q.id] ?? "", (v) => setAnswers((prev) => ({ ...prev, [q.id]: v })))),
    ca: existing ? { current: caModel(mySignup?.caCurrent), peak: tectonicRsns.length > 1 ? caModel(mySignup?.caPeak) : null } : null,
    isValid,
    pending: createSignup.isPending || updateSignup.isPending,
    saved,
    error,
    submit: () => void submit(),
    withdraw: {
      confirming: confirmingWithdraw,
      ask: () => setConfirmingWithdraw(true),
      cancel: () => setConfirmingWithdraw(false),
      confirm: () => void withdraw(),
      pending: withdrawSignup.isPending,
    },
  };
}
