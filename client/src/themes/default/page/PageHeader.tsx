import { useBingoHeader, useBingoMenuEntries, type BingoPageModel } from "../../../headless";
import { AppHeader } from "../../../core/ui/AppHeader";
import { Button } from "../../../core/ui/Button";
import { Badge } from "../../../core/ui/Card";
import { CountdownTimer } from "../../../core/ui/CountdownTimer";
import { HistoricalBadge } from "../../../core/historical/HistoricalBadge";
import { useSlot } from "../../context";
import { ModPanelButton } from "./ModPanelButton";

export function PageHeader({ page }: { page: BingoPageModel }) {
  const TeamSelector = useSlot("TeamSelector");
  const CodewordBanner = useSlot("CodewordBanner");
  const menuEntries = useBingoMenuEntries(page.slug, useBingoHeader(page.slug), {
    // A Historical Bingo with no Tasks recorded has no Submissions to show.
    submissions: page.teamSelector.selectedId && page.stageView !== "historical"
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
      menuEntries={menuEntries}
      titleAside={page.codeword ? <CodewordBanner codeword={page.codeword} /> : undefined}
      controls={page.canPickTeam && page.teams.length > 0 && <TeamSelector selector={page.teamSelector} />}
    >
      {page.isMod && <ModPanelButton slug={page.slug} pendingCount={page.pendingCount} />}
      {page.canSubmit && (
        <Button size="sm" variant="primary" onPress={() => page.submit.show()} data-tutorial="submit">
          Submit
        </Button>
      )}
    </AppHeader>
  );
}
