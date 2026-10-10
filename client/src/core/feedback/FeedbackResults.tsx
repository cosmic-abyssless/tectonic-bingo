import { useEffect, useState } from "react";
import { formatSignupAnswer, type FeedbackResultList, type FeedbackResultsResponse, type SignupQuestion } from "@bingo/shared";
import { useFeedbackResults } from "../../api/queries";
import { Button } from "../ui/Button";
import { Card, EmptyState, HEADING_FONT, Notice } from "../ui/Card";
import { ArrowLeftIcon, ArrowRightIcon, ListIcon, LockIcon } from "../ui/icons";
import { SegmentedControl } from "../ui/SegmentedControl";
import { HEADING_LETTERED } from "../../themes/lettering";

type Which = "feedback" | "captain";

/** Per-option totals of one choice (or yes/no) question: each option with how many responses picked it, as a bar. */
function Totals({ question, totals, count }: { question: SignupQuestion; totals: FeedbackResultList["totals"][string]; count: number }) {
  const most = Math.max(1, ...totals.map((t) => t.count));
  return (
    <li className="space-y-1.5">
      <p className="text-sm font-medium text-on-surface">{question.prompt}</p>
      <ul className="space-y-1" aria-label={`Totals for ${question.prompt}`}>
        {totals.map((t) => (
          <li key={t.option} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-2 text-xs sm:grid-cols-[minmax(0,14rem)_1fr_auto]">
            <span className="truncate text-on-surface-muted" title={t.option}>
              {t.option}
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-surface-raised">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${(t.count / most) * 100}%` }} />
            </span>
            <span className="num w-16 text-right text-on-surface">
              {t.count}
              <span className="text-on-surface-subtle"> / {count}</span>
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}

/** One list of responses (Feedback or Captain): its count, the totals, and the responses one at a time with Previous and Next. */
function ResponseList({ questions, list, label }: { questions: SignupQuestion[]; list: FeedbackResultList; label: string }) {
  const [index, setIndex] = useState(0);
  // A list that shrinks or empties (a question deleted with its answers) keeps the position in range.
  useEffect(() => setIndex((i) => Math.min(i, Math.max(0, list.count - 1))), [list.count]);
  const choiceQuestions = questions.filter((q) => list.totals[q.id]);

  if (questions.length === 0) {
    return <p className="text-sm text-on-surface-muted">There are no {label.toLowerCase()} questions.</p>;
  }
  if (list.count === 0) {
    return <EmptyState icon={<ListIcon />} title={`No ${label.toLowerCase()} yet`}>Nobody has answered these questions.</EmptyState>;
  }

  const response = list.responses[Math.min(index, list.count - 1)]!;
  const answerOf = (q: SignupQuestion) => response.answers.find((a) => a.questionId === q.id)?.value;

  return (
    <div className="space-y-5">
      {choiceQuestions.length > 0 && (
        <Card className="space-y-4 p-4">
          <h3 className={`${HEADING_LETTERED} text-sm font-semibold text-on-surface`} style={HEADING_FONT}>
            Totals
          </h3>
          <ul className="space-y-4">
            {choiceQuestions.map((q) => (
              <Totals key={q.id} question={q} totals={list.totals[q.id]!} count={list.count} />
            ))}
          </ul>
        </Card>
      )}

      <Card className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className={`${HEADING_LETTERED} num text-sm font-semibold text-on-surface`} style={HEADING_FONT} aria-live="polite">
            Response {index + 1} of {list.count}
          </h3>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onPress={() => setIndex((i) => Math.max(0, i - 1))} isDisabled={index === 0}>
              <ArrowLeftIcon /> Previous
            </Button>
            <Button size="sm" variant="secondary" onPress={() => setIndex((i) => Math.min(list.count - 1, i + 1))} isDisabled={index >= list.count - 1}>
              Next <ArrowRightIcon />
            </Button>
          </div>
        </div>
        <dl className="space-y-3">
          {questions.map((q) => {
            const value = answerOf(q);
            const shown = value === undefined ? "" : formatSignupAnswer(q.type, value);
            return (
              <div key={q.id}>
                <dt className="text-xs font-medium text-on-surface-muted">{q.prompt}</dt>
                <dd className={`mt-0.5 whitespace-pre-wrap break-words text-sm ${shown ? "text-on-surface" : "text-on-surface-subtle"}`}>{shown || "No answer"}</dd>
              </div>
            );
          })}
        </dl>
        <p className="text-xs text-on-surface-subtle">Responses come in a fixed shuffled order, never the order they were given in, and nothing says who gave one.</p>
      </Card>
    </div>
  );
}

/**
 * The Feedback results of a Bingo (CONTEXT.md "Feedback form"), for Moderators and Admins: how many Players and Captains
 * responded, each response formatted and shown one at a time, and per-option totals for the choice questions. The
 * Captain responses are a separate list with their own count and totals. Never who gave a response: the server doesn't
 * know it (docs/adr/0002-anonymous-feedback.md).
 */
export function FeedbackResults({ slug }: { slug: string }) {
  const { data, error, isLoading } = useFeedbackResults(slug);
  const [which, setWhich] = useState<Which>("feedback");
  if (isLoading) return null;
  if (error || !data) return <Notice tone="danger">{error instanceof Error ? error.message : "Couldn't load the feedback"}</Notice>;
  return <Loaded data={data} which={which} setWhich={setWhich} />;
}

function Loaded({ data, which, setWhich }: { data: FeedbackResultsResponse; which: Which; setWhich: (w: Which) => void }) {
  const general = data.questions.filter((q) => q.audience === "all");
  const captain = data.questions.filter((q) => q.audience === "captains");
  const list = which === "feedback" ? data.feedback : data.captain;
  return (
    <div className="max-w-2xl space-y-4">
      <Notice tone="info" icon={<LockIcon size={14} />}>
        Feedback is anonymous: nobody can see who gave a response, and answering is never in the audit log.
      </Notice>
      {data.unavailable && (
        <Notice tone="warn">
          {data.unavailable === "key_changed" ? (
            <>
              <strong>Players can't answer this form right now.</strong> Its responses were saved with a different <code>FEEDBACK_SECRET</code> than the server has now, so nobody's earlier answers could be found and every Player who answered would be counted twice. Restore the secret they were saved with.
            </>
          ) : (
            <>
              <strong>Players can't answer this form right now.</strong> The server has no <code>FEEDBACK_SECRET</code>, and answers can't be kept anonymous without it. The results below are unaffected.
            </>
          )}
        </Notice>
      )}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2" aria-label="Response counts">
        <p className="text-sm text-on-surface-muted">
          <span className="num text-lg font-semibold text-on-surface">{data.feedback.count}</span> Feedback response{data.feedback.count === 1 ? "" : "s"}
        </p>
        <p className="text-sm text-on-surface-muted">
          <span className="num text-lg font-semibold text-on-surface">{data.captain.count}</span> Captain response{data.captain.count === 1 ? "" : "s"}
        </p>
      </div>
      {data.questions.length === 0 ? (
        <EmptyState icon={<ListIcon />} title="No feedback questions">
          Add them under Questions. Players can answer once the Bingo is Finished.
        </EmptyState>
      ) : (
        <>
          <SegmentedControl
            aria-label="Which responses"
            size="sm"
            value={which}
            onChange={setWhich}
            options={[
              { id: "feedback", label: `Feedback responses (${data.feedback.count})` },
              { id: "captain", label: `Captain responses (${data.captain.count})` },
            ]}
          />
          <ResponseList key={which} questions={which === "feedback" ? general : captain} list={list} label={which === "feedback" ? "Feedback responses" : "Captain responses"} />
        </>
      )}
    </div>
  );
}
