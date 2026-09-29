import type { BingoPageModel } from "../../../headless/types";
import { useAuth } from "../../../context/AuthContext";
import { useAchievementsEligible, useOpenAchievements } from "../../../core/achievements/AchievementsProvider";
import { AppHeader } from "../../../core/ui/AppHeader";
import { Button } from "../../../core/ui/Button";
import { Badge } from "../../../core/ui/Card";
import { CountdownTimer } from "../../../core/ui/CountdownTimer";
import { HistoricalBadge } from "../../../core/historical/HistoricalBadge";
import { MenuItem } from "../../../core/ui/Menu";
import { RewindIcon, UsersIcon } from "../../../core/ui/icons";
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
        ) : page.bingo.historical ? (
          <span className="inline-flex items-center gap-1.5">
            {page.bingo.stageLabel}
            <HistoricalBadge />
          </span>
        ) : (
          page.bingo.stageLabel
        )
      }
      menuItems={achievementsEligible && openAchievements ? <MenuItem id="achievements" onAction={openAchievements}>Achievements</MenuItem> : undefined}
    >
      {page.canPickTeam && page.teams.length > 0 && (
        <>
          <TeamSelector selector={page.teamSelector} />
          {page.viewing.team && (
            <Button size="sm" aria-label={`${page.viewing.team.name} roster`} className="px-2" onPress={page.teamInfo.show}>
              <UsersIcon />
            </Button>
          )}
        </>
      )}
      {!page.canPickTeam && page.myTeam && <TeamBadge team={page.myTeam} onPress={page.teamInfo.show} />}
      {(page.bingo.rulesMarkdown || page.bingo.rulesComeLater) && (
        <Button size="sm" variant="ghost" onPress={page.rules.show}>
          Rules
        </Button>
      )}
      {page.canViewStats && (
        <Button size="sm" variant="ghost" onPress={page.actions.goToStats}>
          Stats
        </Button>
      )}
      {page.canRewind && (
        <Button size="sm" variant="ghost" onPress={page.actions.goToRewind}>
          <RewindIcon />
          Rewind
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
      {page.teamSelector.selectedId && page.stageView !== "historical" && (
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
