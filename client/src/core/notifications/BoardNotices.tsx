import { useSyncExternalStore } from "react";
import { useBingo } from "../../api/queries";
import { CatchUpCard } from "./CatchUpCard";
import { NotificationOffer } from "./NotificationOffer";

// The Bingos this tab has just made a Submission in: the Submit flow closes on success, so the Board says what comes
// next (the first Submission's offer to hear when it's reviewed).
const submittedIn = new Set<string>();
const listeners = new Set<() => void>();

/** Called by the Submit flow once a Submission has gone in. */
export function markSubmitted(slug: string): void {
  if (submittedIn.has(slug)) return;
  submittedIn.add(slug);
  for (const listener of listeners) listener();
}

function useSubmitted(slug: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => submittedIn.has(slug),
  );
}

/**
 * What the Board shows above itself for the viewer alone, in either theme: their Catch-up, and
 * after their first Submission in this Bingo the offer to hear when it's reviewed.
 */
export function BoardNotices({ slug }: { slug: string }) {
  const { data: shell } = useBingo(slug);
  const submitted = useSubmitted(slug);
  if (!shell || shell.historical) return null;
  return (
    <div className="mb-4 space-y-2 empty:hidden">
      <CatchUpCard slug={slug} />
      <NotificationOffer bingoId={shell.bingo.id} offer="first_submission" when={submitted}>
        Submitted. Want to hear when it's reviewed?
      </NotificationOffer>
    </div>
  );
}
