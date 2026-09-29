import { useBingoHeader, useBingoMenuEntries, type BingoPageModel } from "../../../headless";
import { useAuth } from "../../../context/AuthContext";
import { AppHeader } from "../../../core/ui/AppHeader";
import { Button } from "../../../core/ui/Button";
import { Badge } from "../../../core/ui/Card";
import { CountdownTimer } from "../../../core/ui/CountdownTimer";
import { useSlot } from "../../context";
import { ModPanelButton } from "./ModPanelButton";

export function PageHeader({ page }: { page: BingoPageModel }) {
  const { user, devMode } = useAuth();
  const TeamSelector = useSlot("TeamSelector");
  const menuEntries = useBingoMenuEntries(page.slug, useBingoHeader(page.slug), {
    submissions: page.teamSelector.selectedId
      ? {
          badge:
            page.viewing.pendingSubmissionCount > 0 ? (
              <Badge tone="warn" className="num -my-1">
                {page.viewing.pendingSubmissionCount}
              </Badge>
            ) : undefined,
          onShow: page.drawer.show,
        }
      : undefined,
    team: page.viewing.team ? { onShow: page.teamInfo.show } : undefined,
    onShowRules: page.rules.show,
  });

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
      menuEntries={menuEntries}
      controls={page.canPickTeam && page.teams.length > 0 && <TeamSelector selector={page.teamSelector} />}
    >
      {page.isMod && <ModPanelButton slug={page.slug} pendingCount={page.pendingCount} />}
      {page.canSubmit && (
        <Button size="sm" variant="primary" onPress={() => page.submit.show()}>
          Submit
        </Button>
      )}
    </AppHeader>
  );
}
