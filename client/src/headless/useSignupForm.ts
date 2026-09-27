import { useEffect, useMemo, useState } from "react";
import { detectTimeZone, encodeChoices, encodeSingleChoice, hasBlankOther, isBlankAnswer, MAX_OTHER_LENGTH, parseChoiceAnswer, parseMemberPicks, timeZoneOptions, type CombatAchievementStats, type PickableMember, type SignupAnswerInput, type SignupQuestion, type TimeZoneOption } from "@bingo/shared";
import { useBingo, useCreateSignup, useMyPairing, useMySignup, useMyTectonicRsns, usePickableMembers, useSignupQuestions, useUpdateSignup, useWithdrawSignup } from "../api/queries";
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

export interface SignupOtherModel {
  checked: boolean;
  set: (on: boolean) => void;
  text: string;
  setText: (text: string) => void;
  maxLength: number;
  /** Picked with nothing written: the form can't be sent like this. */
  missingText: boolean;
}

/** A Member pick question: a search box over the clan's members, and the members picked so far. */
export interface SignupMemberPickModel {
  /** Several members may be picked (shown as removable chips); otherwise one, which a new pick replaces. */
  multiple: boolean;
  picked: { id: string; name: string; remove: () => void }[];
  /**
   * What the search box offers: every pickable member not already picked (with one pick, the current pick too, so
   * the box can show it). Labelled "RSN (Discord name)" when the two differ, so typing either finds them.
   */
  options: { id: string; label: string }[];
  pick: (userId: string) => void;
  /** Several only: the most that may be picked, or null for no limit. */
  max: number | null;
  /** Several only: the maximum is reached, so the box adds no more. */
  full: boolean;
  /** The member list is still loading. */
  loading: boolean;
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
  /**
   * The Other choice, after the options, on a choice question that allows it (or whose saved answer has one, so it
   * can be unticked). Picking it opens a text box; unpicking it throws the text away.
   */
  other: SignupOtherModel | null;
  /** Member pick only. */
  members: SignupMemberPickModel | null;
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
  /**
   * They lead a Team (Captain or co-captain), so they can't withdraw (or, in a duo bingo, unpair) themselves — an admin
   * has to. What to tell them where the form usually says they can withdraw (and the Withdraw button goes); null for
   * everyone else.
   */
  teamLead: string | null;
}

function parseOptions(question: SignupQuestion): string[] {
  try {
    const parsed = JSON.parse(question.optionsJson ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function memberPickModel(question: SignupQuestion, value: string, set: (v: string) => void, members: PickableMember[] | undefined): SignupMemberPickModel {
  const byId = new Map((members ?? []).map((m) => [m.userId, m]));
  // The answer is kept with names on (the server sends it that way, and the chips need them); the server takes it
  // back in that form and stores only the ids.
  const picked = parseMemberPicks(value).map((p) => ({ id: p.id, name: p.name ?? byId.get(p.id)?.name ?? "Unknown member" }));
  const save = (next: { id: string; name: string }[]) => set(next.length === 0 ? "" : JSON.stringify(next.map(({ id, name }) => ({ id, name }))));
  const multiple = question.multiplePicks;
  const max = multiple ? question.maxPicks : 1;
  const label = (m: PickableMember) => (m.discordName && m.discordName.toLowerCase() !== m.name.toLowerCase() ? `${m.name} (${m.discordName})` : m.name);
  const pickedIds = new Set(picked.map((p) => p.id));
  const options = (members ?? []).filter((m) => !multiple || !pickedIds.has(m.userId)).map((m) => ({ id: m.userId, label: label(m) }));
  // A single pick who's no longer in the list (they left the clan) still shows in the box.
  if (!multiple) for (const p of picked) if (!byId.has(p.id)) options.unshift({ id: p.id, label: p.name });
  return {
    multiple,
    picked: picked.map((p) => ({ ...p, remove: () => save(picked.filter((o) => o.id !== p.id)) })),
    options,
    pick: (userId) => {
      const member = byId.get(userId);
      if (!member) return;
      if (!multiple) return save([{ id: userId, name: member.name }]);
      if (pickedIds.has(userId) || (max !== null && picked.length >= max)) return;
      save([...picked, { id: userId, name: member.name }]);
    },
    max: multiple ? max : null,
    full: multiple && max !== null && picked.length >= max,
    loading: members === undefined,
  };
}

function questionModel(question: SignupQuestion, value: string, set: (v: string) => void, members: PickableMember[] | undefined): SignupQuestionModel {
  // A question limited to mods/admins says so, so players know who reads what they write there.
  const privacy = question.visibility === "admins" ? "Only admins see your answer." : question.visibility === "mods" ? "Only mods and admins see your answer." : null;
  const hint = [question.helperText, privacy].filter(Boolean).join(" ") || undefined;

  const isChoice = question.type === "select" || question.type === "multiselect";
  const multiple = question.type === "multiselect";
  const options = isChoice ? parseOptions(question) : [];
  const parsed = isChoice ? parseChoiceAnswer(value) : { choices: [], other: null };
  const other = parsed.other;
  const chosen = multiple ? parsed.choices : value && other === null ? [value] : [];
  // An answer that is no longer one of the options (the options were edited) stays visible so it can be unticked.
  const shown = isChoice ? [...options, ...chosen.filter((c) => !options.includes(c))] : [];

  // The answer as stored, from what's picked: a multiple-choice list in the options' order, or the one single choice.
  function save(picked: string[], otherText: string | null) {
    if (!multiple) return set(encodeSingleChoice({ choices: picked, other: otherText }));
    set(picked.length === 0 && otherText === null ? "" : encodeChoices(shown.filter((o) => picked.includes(o)), otherText));
  }

  function toggle(option: string, on: boolean) {
    if (!multiple) return save([option], null);
    save(on ? [...chosen, option] : chosen.filter((c) => c !== option), other);
  }

  const otherModel: SignupOtherModel | null =
    isChoice && (question.allowOther || other !== null)
      ? {
          checked: other !== null,
          // A single choice is either an option or Other, so picking Other drops the option.
          set: (on) => save(multiple ? chosen : [], on ? (other ?? "") : null),
          text: other ?? "",
          setText: (text) => save(multiple ? chosen : [], text),
          maxLength: MAX_OTHER_LENGTH,
          missingText: other !== null && other.trim() === "",
        }
      : null;

  return {
    id: question.id,
    prompt: question.prompt,
    type: question.type,
    required: question.required,
    value,
    set,
    hint,
    choices: shown.map((option) => ({ label: option, checked: chosen.includes(option), set: (on) => toggle(option, on) })),
    other: otherModel,
    members: question.type === "member" ? memberPickModel(question, value, set, members) : null,
    clear: (question.type === "select" || (question.type === "member" && !question.multiplePicks)) && !question.required && !isBlankAnswer(question.type, value) ? () => set("") : null,
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
  const { data: pickable } = usePickableMembers(slug, questions.some((q) => q.type === "member"));
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
  const blankOther = questions.some((q) => hasBlankOther(q.type, answers[q.id]));
  const isValid = !!rsnValue.trim() && !!timezoneValue && !missingRequired && !blankOther;

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
    questions: questions.map((q) => questionModel(q, answers[q.id] ?? "", (v) => setAnswers((prev) => ({ ...prev, [q.id]: v })), pickable?.members)),
    ca: existing ? { current: caModel(mySignup?.caCurrent), peak: tectonicRsns.length > 1 ? caModel(mySignup?.caPeak) : null } : null,
    isValid,
    pending: createSignup.isPending || updateSignup.isPending,
    saved,
    error,
    submit: () => void submit(),
    teamLead:
      existing && mySignup?.leadsTeam
        ? `You lead ${mySignup.leadsTeam}, so you can't ${shell?.bingo.signupMode === "duo" ? "unpair or withdraw" : "withdraw"} yourself. Contact an admin if you need to.`
        : null,
    withdraw: {
      confirming: confirmingWithdraw,
      ask: () => setConfirmingWithdraw(true),
      cancel: () => setConfirmingWithdraw(false),
      confirm: () => void withdraw(),
      pending: withdrawSignup.isPending,
    },
  };
}
