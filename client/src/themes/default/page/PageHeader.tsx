import type { BingoPageModel } from "../../../headless/types";
import { useAuth } from "../../../context/AuthContext";
import { useAchievementsEligible, useOpenAchievements } from "../../../core/achievements/AchievementsProvider";
import { AppHeader } from "../../../core/ui/AppHeader";
import { Button } from "../../../core/ui/Button";
import { Badge } from "../../../core/ui/Card";
import { CountdownTimer } from "../../../core/ui/CountdownTimer";
import { MenuItem } from "../../../core/ui/Menu";
import { UsersIcon } from "../../../core/ui/icons";
import { useSlot } from "../../context";

export function PageHeader({ page }: { page: BingoPageModel }) {
  const { user, devMode } = useAuth();
  const TeamSelector = useSlot("TeamSelector");
  const TeamBadge = useSlot("TeamBadge");
  const achievementsEligible = useAchievementsEligible();
  const openAchievements = useOpenAchievements();

  return (
    <AppHeader
      // "/" only shows the bingo list to admins and dev-login (everyone else
      // gets bounced to the latest bingo — see BingoList.tsx), so the back
      // link would just be a dead loop for anyone else.
      back={user?.isAdmin || devMode ? { to: "/", label: "All bingos" } : undefined}
      title={page.bingo.name}
      subtitle={
        page.showEndCountdown && page.bingo.endsAt ? (
          <>
            <CountdownTimer target={page.bingo.endsAt} /> remaining
          </>
        ) : (
          page.bingo.stageLabel
        )
      }
      menuItems={achievementsEligible && openAchievements ? <MenuItem id="achievements" onAction={openAchievements}>Achievements</MenuItem> : undefined}
    >
      {page.isMod && page.teams.length > 0 && (
        <>
          <TeamSelector selector={page.teamSelector} />
          {page.viewing.team && (
            <Button size="sm" aria-label={`${page.viewing.team.name} roster`} className="px-2" onPress={page.teamInfo.show}>
              <UsersIcon />
            </Button>
          )}
        </>
      )}
      {!page.isMod && page.myTeam && <TeamBadge team={page.myTeam} onPress={page.teamInfo.show} />}
      {page.bingo.rulesMarkdown && (
        <Button size="sm" variant="ghost" onPress={page.rules.show}>
          Rules
        </Button>
      )}
      {page.canViewStats && (
        <Button size="sm" variant="ghost" onPress={page.actions.goToStats}>
          Stats
        </Button>
      )}
      {page.isMod && (
        <Button size="sm" onPress={page.actions.goToMod}>
          Mod panel
          {page.pendingCount > 0 && (
            <Badge tone="warn" className="num -my-1">
              {page.pendingCount}
            </Badge>
          )}
        </Button>
      )}
      {page.teamSelector.selectedId && (
        <Button size="sm" onPress={page.drawer.show}>
          Submissions
          {page.viewing.pendingSubmissionCount > 0 && (
            <Badge tone="warn" className="num -my-1">
              {page.viewing.pendingSubmissionCount}
            </Badge>
          )}
        </Button>
      )}
      {page.canSubmit && (
        <Button size="sm" variant="primary" onPress={() => page.submit.show()}>
          Submit
        </Button>
      )}
    </AppHeader>
  );
}
