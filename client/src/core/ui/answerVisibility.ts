import { canSeeAnswers, type AnswerViewer, type SignupQuestion } from "@bingo/shared";
import { useBingoCan } from "../../headless/permissions";

/**
 * The level the viewer sees other players' signup answers from, matching the server's answerViewerFor: whoever sees
 * Admins-only questions (a site admin), else Moderators-only ones (a mod of this bingo), else a captain (the only other
 * role that gets answers at all). Pages only use it to hide question columns/rows whose answers the server leaves out
 * anyway.
 */
export function useAnswerViewer(slug: string): AnswerViewer {
  const can = useBingoCan(slug);
  return can("view_admin_questions").allowed ? "admin" : can("view_mod_questions").allowed ? "mod" : "captain";
}

export function visibleQuestions(questions: SignupQuestion[], viewer: AnswerViewer): SignupQuestion[] {
  return questions.filter((q) => canSeeAnswers(q.visibility, viewer));
}
