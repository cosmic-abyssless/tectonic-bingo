import { useFeedbackForm } from "../../headless/useFeedbackForm";
import { QuestionField } from "../signup/SignupForm";
import { Button } from "../ui/Button";
import { EmptyState, Notice } from "../ui/Card";
import { Panel } from "../ui/Panel";
import { AlertIcon, CheckIcon, LockIcon } from "../ui/icons";

/**
 * A Finished Bingo's Feedback form (CONTEXT.md "Feedback form"), for a Player: every All Players question, and for a
 * Captain a separate section of Captains-only ones, which are saved as their Captain response. Says, up top and again at
 * the Captains-only section, how anonymous it is: nobody, Moderators and Admins included, can see who gave an answer,
 * and the Captains' may be recognisable anyway, with so few of them. Drawn with the page's tokens, so every theme's
 * FeedbackPage can hold it.
 */
export function FeedbackForm({ slug }: { slug: string }) {
  const form = useFeedbackForm(slug);
  if (form.status === "loading") return null;

  if (form.status === "closed") {
    return (
      <div className="mx-auto max-w-lg px-3 py-6 sm:px-6">
        <EmptyState icon={<LockIcon size={20} />} title="The feedback form isn't open to you">
          Feedback opens once the Bingo is Finished, for the Players who took part. If the Bingo is reopened it closes again, and what was answered is kept.
        </EmptyState>
      </div>
    );
  }

  // Open to them, but this server can't take answers: no form that would only fail. Their earlier answers are safe.
  if (form.status === "unavailable") {
    return (
      <div className="mx-auto max-w-lg px-3 py-6 sm:px-6">
        <EmptyState icon={<AlertIcon size={20} />} title="Feedback can't be answered right now">
          {form.unavailable === "key_changed"
            ? "Something changed on the server since answers were given, so it can't take new ones yet. Nothing you answered is lost. Try again later, or let an Admin know."
            : "This server isn't set up to keep Feedback anonymous yet, so it can't take answers. Try again later, or let an Admin know."}
        </EmptyState>
      </div>
    );
  }

  const answered = form.responded || form.respondedAsCaptain;
  const nothingToAsk = form.general.length === 0 && form.captain.length === 0;

  return (
    <div className="mx-auto max-w-lg space-y-5 px-3 py-6 sm:px-6">
      <Notice tone="info" icon={<LockIcon size={14} />}>
        <strong>Your answers are anonymous.</strong> Nobody, Moderators and Admins included, can see who gave them. You can come back and change them any time while the form is open.
      </Notice>

      {nothingToAsk && (
        <EmptyState title="No questions yet">The Admins haven't set up any feedback questions for this Bingo.</EmptyState>
      )}

      {form.general.length > 0 && (
        <Panel title={answered ? "Edit your feedback" : "Feedback"}>
          <div className="space-y-5">
            {form.general.map((q) => (
              <QuestionField key={q.id} question={q} />
            ))}
          </div>
        </Panel>
      )}

      {form.isCaptain && form.captain.length > 0 && (
        <Panel title="For Captains">
          <div className="space-y-5">
            <Notice tone="warn" icon={<AlertIcon size={14} />}>
              <strong>These answers may be recognisable.</strong> There are only a few Captains, so even without your name someone could guess whose they are. They're saved apart from your answers above and aren't linked to them.
            </Notice>
            {form.captain.map((q) => (
              <QuestionField key={q.id} question={q} />
            ))}
          </div>
        </Panel>
      )}

      {!nothingToAsk && (
        <div className="space-y-3">
          {form.problem === "required" && <p className="text-xs text-on-surface-subtle">Answer every question marked * in a part you fill in.</p>}
          {form.error && <Notice tone="danger">{form.error}</Notice>}
          {form.saved && (
            <Notice tone="ok" icon={<CheckIcon size={14} />}>
              Thank you, your feedback is saved. You can change it here any time while the form is open.
            </Notice>
          )}
          <Button variant="primary" className="w-full" onPress={form.submit} isDisabled={!form.isValid || form.pending}>
            {form.pending ? "Saving…" : answered ? "Save changes" : "Send feedback"}
          </Button>
        </div>
      )}
    </div>
  );
}
