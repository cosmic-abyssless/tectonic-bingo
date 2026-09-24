import { canSeeAnswers, type AnswerViewer, type SignupQuestion } from "@bingo/shared";
import { useBingo } from "../../api/queries";
import { useAuth } from "../../context/AuthContext";

/**
 * The level the viewer sees other players' signup answers from, matching the server's answerViewerFor: a site admin,
 * else a mod of this bingo, else a captain (the only other role that gets answers at all). Pages only use it to hide
 * question columns/rows whose answers the server leaves out anyway.
 */
export function useAnswerViewer(slug: string): AnswerViewer {
  const { user } = useAuth();
  const { data: shell } = useBingo(slug);
  return user?.isAdmin ? "admin" : shell?.isMod ? "mod" : "captain";
}

export function visibleQuestions(questions: SignupQuestion[], viewer: AnswerViewer): SignupQuestion[] {
  return questions.filter((q) => canSeeAnswers(q.visibility, viewer));
}
