import { useEffect, useMemo, useState } from "react";
import { type FeedbackFormResponse, type FeedbackUnavailable } from "@bingo/shared";
import { useFeedbackForm as useFeedbackFormQuery, useFeedbackMembers, useSaveFeedback } from "../api/queries";
import { feedbackSubmission, isFilled, partProblem } from "./feedbackDraft";
import { questionModel, type SignupQuestionModel } from "./useSignupForm";

// A Finished Bingo's Feedback form (CONTEXT.md "Feedback form") as a view model: what core/feedback/FeedbackForm and a
// theme's FeedbackPage need to draw it, with the fetching, validation and saving done here once. Nothing in it says who
// the Player is to anyone else: the server keeps no record of it (docs/adr/0002-anonymous-feedback.md).

export interface FeedbackFormModel {
  /**
   * "closed": it isn't open to this viewer (the Bingo isn't Finished, or they aren't a Player of it). "unavailable": it
   * is, but this server can't take answers right now (`unavailable` says why).
   */
  status: "loading" | "closed" | "unavailable" | "ready";
  unavailable: FeedbackUnavailable | null;
  /** They lead a Team, so they also answer the Captains-only questions. */
  isCaptain: boolean;
  /** The All Players questions (the Feedback response). */
  general: SignupQuestionModel[];
  /** The Captains-only questions (the Captain response): none unless they're a Captain. */
  captain: SignupQuestionModel[];
  /** They've given a Feedback response / a Captain response already, which the form shows and edits. */
  responded: boolean;
  respondedAsCaptain: boolean;
  isValid: boolean;
  /** Something is answered but can't be sent yet, and why. */
  problem: "required" | "other" | null;
  pending: boolean;
  saved: boolean;
  error: string | null;
  submit: () => void;
}

const answersOf = (form: FeedbackFormResponse | undefined): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const a of [...(form?.answers ?? []), ...(form?.captainAnswers ?? [])]) map[a.questionId] = a.value;
  return map;
};

export function useFeedbackForm(slug: string): FeedbackFormModel {
  const { data: form, isLoading } = useFeedbackFormQuery(slug);
  const save = useSaveFeedback(slug);
  const questions = useMemo(() => form?.questions ?? [], [form]);
  const general = useMemo(() => questions.filter((q) => q.audience === "all"), [questions]);
  const captain = useMemo(() => questions.filter((q) => q.audience === "captains"), [questions]);
  const { data: pickable } = useFeedbackMembers(slug, questions.some((q) => q.type === "member"));

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // The viewer's own saved answers come first, then whatever they change: refilled when the saved answers change (after
  // saving). Not when only the questions do (an Admin fixing a typo or reordering, which refetches the form): that must
  // not throw away an answer they are halfway through typing.
  const savedKey = JSON.stringify([form?.answers, form?.captainAnswers]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `form` is read for the answers `savedKey` already stands for
  useEffect(() => setAnswers(answersOf(form)), [savedKey]);

  const send = feedbackSubmission(general, captain, answers);
  const problem = (isFilled(general, answers) ? partProblem(general, answers) : null) ?? (isFilled(captain, answers) ? partProblem(captain, answers) : null);

  async function submit() {
    if (!send) return;
    setError(null);
    setSaved(false);
    try {
      await save.mutateAsync(send);
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save your feedback");
    }
  }

  const model = (q: (typeof questions)[number]) =>
    questionModel(
      q,
      answers[q.id] ?? "",
      (v) => {
        setSaved(false);
        setAnswers((prev) => ({ ...prev, [q.id]: v }));
      },
      pickable?.members,
    );

  return {
    status: isLoading ? "loading" : form?.open ? "ready" : form?.unavailable ? "unavailable" : "closed",
    unavailable: form?.unavailable ?? null,
    isCaptain: form?.isCaptain ?? false,
    general: general.map(model),
    captain: captain.map(model),
    responded: form?.responded ?? false,
    respondedAsCaptain: form?.respondedAsCaptain ?? false,
    isValid: send !== null,
    problem,
    pending: save.isPending,
    saved,
    error,
    submit: () => void submit(),
  };
}
