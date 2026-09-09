import type { BingoPageModel } from "../../../headless/types";
import { AppHeader } from "../../../core/ui/AppHeader";
import { Button } from "../../../core/ui/Button";
import { Badge } from "../../../core/ui/Card";
import { CountdownTimer } from "../../../core/ui/CountdownTimer";
import { useSlot } from "../../context";

export function PageHeader({ page }: { page: BingoPageModel }) {
  const TeamSelector = useSlot("TeamSelector");
  const TeamBadge = useSlot("TeamBadge");

  return (
    <AppHeader
      back={{ to: "/", label: "All bingos" }}
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
      {page.isMod && page.teams.length > 0 && <TeamSelector selector={page.teamSelector} />}
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
          {page.viewing.submissionCount > 0 && <span className="num text-fg-subtle">{page.viewing.submissionCount}</span>}
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
