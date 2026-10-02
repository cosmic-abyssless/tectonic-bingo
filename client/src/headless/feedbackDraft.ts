// What a Player has filled in on the Feedback form, and what of it can be sent. No React.
//
// The form has up to two parts: the All Players questions (the Feedback response) and, for a Captain, the Captains-only
// ones (the Captain response, kept apart from it). A part is sent when something in it is answered, and then every
// required question of it has to be (a Captain who only answers their own questions leaves the first part as it was).
import { hasBlankOther, isBlankAnswer, type FeedbackAnswer, type FeedbackSubmission, type SignupQuestion } from "@bingo/shared";

type Answers = Readonly<Record<string, string>>;

/** Whether anything in this part is answered. */
export function isFilled(questions: readonly SignupQuestion[], answers: Answers): boolean {
  return questions.some((q) => !isBlankAnswer(q.type, answers[q.id]));
}

/** Why a part that has something answered can't be sent yet: a required question left blank, or Other ticked with nothing written. */
export function partProblem(questions: readonly SignupQuestion[], answers: Answers): "required" | "other" | null {
  if (questions.some((q) => q.required && isBlankAnswer(q.type, answers[q.id]))) return "required";
  if (questions.some((q) => hasBlankOther(q.type, answers[q.id]))) return "other";
  return null;
}

const toAnswers = (questions: readonly SignupQuestion[], answers: Answers): FeedbackAnswer[] => questions.map((q) => ({ questionId: q.id, value: answers[q.id] ?? "" }));

/**
 * What the form sends, or null when it can't be sent: nothing answered anywhere, or a part with something answered
 * that still has a required question blank (or an Other ticked with no text).
 */
export function feedbackSubmission(general: readonly SignupQuestion[], captain: readonly SignupQuestion[], answers: Answers): FeedbackSubmission | null {
  const sendGeneral = isFilled(general, answers);
  const sendCaptain = isFilled(captain, answers);
  if (!sendGeneral && !sendCaptain) return null;
  if ((sendGeneral && partProblem(general, answers)) || (sendCaptain && partProblem(captain, answers))) return null;
  return { ...(sendGeneral ? { answers: toAnswers(general, answers) } : {}), ...(sendCaptain ? { captainAnswers: toAnswers(captain, answers) } : {}) };
}
