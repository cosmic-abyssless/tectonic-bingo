import { useBingoHeader, type BingoPageModel } from "../../../headless";
import { useAchievementsEligible, useOpenAchievements } from "../../../core/achievements/AchievementsProvider";
import { CountdownTimer } from "../../../core/ui/CountdownTimer";
import { MenuItem } from "../../../core/ui/Menu";
import { Masthead } from "./Masthead";
import { SubmitButton } from "./SubmitButton";

/** The board's masthead: the shared one (Masthead), with the time left while live, Submissions, and Submit. */
export function PageHeader({ page }: { page: BingoPageModel }) {
  const header = useBingoHeader(page.slug);
  const achievementsEligible = useAchievementsEligible();
  const openAchievements = useOpenAchievements();
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
      // (The team — identity, roster, and for mods the switcher — lives in the TeamBanner under the search box, not up here.)
      submissions={page.teamSelector.selectedId && page.stageView !== "historical" ? { pending: page.viewing.pendingSubmissionCount, onShow: page.drawer.show } : undefined}
      menuItems={achievementsEligible && openAchievements ? <MenuItem id="achievements" onAction={openAchievements}>Achievements</MenuItem> : undefined}
      extraMenuEntries={achievementsEligible && openAchievements ? [{ id: "achievements", text: "Achievements", label: "Achievements", onAction: openAchievements }] : []}
    >
      {/* On phones Submit lives beside the team banner instead. */}
      {page.canSubmit && <SubmitButton onPress={() => page.submit.show()} className="max-md:hidden" />}
    </Masthead>
  );
}
