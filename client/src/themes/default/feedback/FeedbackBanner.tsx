import { Button } from "../../../core/ui/Button";
import { ArrowRightIcon } from "../../../core/ui/icons";

/**
 * The Board's card inviting a Finished Bingo's Player to give feedback, until they have; after that a link to edit what
 * they said. Says the answers are anonymous, the one thing people ask first.
 */
export function FeedbackBanner({ responded, onOpen }: { responded: boolean; onOpen: () => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-strong bg-surface p-4 sm:p-5">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">{responded ? "Thanks" : "How was it?"}</p>
        <p className="mt-1 text-xl font-black tracking-tight sm:text-2xl">{responded ? "Your feedback is in" : "Tell us how the Bingo went"}</p>
        <p className="mt-1 text-sm text-on-surface-muted">Anonymous: nobody, Moderators and Admins included, can see who gave which answers.</p>
      </div>
      <Button variant={responded ? "secondary" : "primary"} onPress={onOpen}>
        {responded ? "Edit your feedback" : "Give feedback"}
        <ArrowRightIcon />
      </Button>
    </div>
  );
}
