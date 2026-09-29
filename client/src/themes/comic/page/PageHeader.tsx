import { useBingoHeader, type BingoPageModel } from "../../../headless";
import { CountdownTimer } from "../../../core/ui/CountdownTimer";
import { Masthead } from "./Masthead";
import { SubmitButton } from "./SubmitButton";

/** The board's masthead: the shared one (Masthead), with the time left while live, Submissions and the team in its ☰ menu, and Submit. */
export function PageHeader({ page }: { page: BingoPageModel }) {
  const header = useBingoHeader(page.slug);
  if (!header) return null;
  return (
    <Masthead
      slug={page.slug}
      header={header}
      status={
        page.showEndCountdown && page.bingo.endsAt ? (
          <>
            {/* On a phone the caption box has room for "6d 23h", not "6 days 23 hours 55 minutes". */}
            <CountdownTimer target={page.bingo.endsAt} className="max-md:hidden" />
            <CountdownTimer target={page.bingo.endsAt} format="short" className="md:hidden" />
            &nbsp;left
          </>
        ) : undefined
      }
      onShowRules={page.rules.show}
      // (The team — identity, roster, and for mods the switcher — lives in the TeamBanner under the search box; the ☰
      // menu opens the same summary.)
      submissions={page.teamSelector.selectedId ? { pending: page.viewing.pendingSubmissionCount, onShow: page.drawer.show } : undefined}
      team={page.viewing.team ? { onShow: page.teamInfo.show } : undefined}
    >
      {/* On phones Submit lives beside the team banner instead. */}
      {page.canSubmit && <SubmitButton onPress={() => page.submit.show()} className="max-md:hidden" />}
    </Masthead>
  );
}
