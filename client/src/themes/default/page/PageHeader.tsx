import type { BingoPageModel } from "../../../headless/types";
import { useAuth } from "../../../context/AuthContext";
import { AppHeader } from "../../../core/ui/AppHeader";
import { Button } from "../../../core/ui/Button";
import { Badge } from "../../../core/ui/Card";
import { CountdownTimer } from "../../../core/ui/CountdownTimer";
import { UsersIcon } from "../../../core/ui/icons";
import { useSlot } from "../../context";

export function PageHeader({ page }: { page: BingoPageModel }) {
  const { user } = useAuth();
  const TeamSelector = useSlot("TeamSelector");
  const TeamBadge = useSlot("TeamBadge");

  return (
    <AppHeader
      // "/" only shows the bingo list to admins (everyone else gets bounced
      // straight back to their own bingo — see BingoList.tsx), so the back
      // link would just be a dead loop for anyone else.
      back={user?.isAdmin ? { to: "/", label: "All bingos" } : undefined}
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
      {page.canScout && (
        <Button size="sm" variant="ghost" onPress={page.actions.goToDraft}>
          Scout signups
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
