import { useBingoHeader, useBingoMenuEntries } from "../../../headless";
import { AppHeader } from "../../../core/ui/AppHeader";
import { StatsView } from "../../../core/stats/StatsView";
import { ModPanelButton } from "./ModPanelButton";

export function StatsPageLayout({ slug, bingoName }: { slug: string; bingoName: string }) {
  const header = useBingoHeader(slug);
  const menuEntries = useBingoMenuEntries(slug, header);
  return (
    <div className="min-h-dvh bg-background text-on-surface">
      <AppHeader back={{ to: `/b/${slug}`, label: "Back to bingo" }} title="Stats" subtitle={bingoName} menuEntries={menuEntries}>
        {header?.isMod && <ModPanelButton slug={slug} pendingCount={header.pendingCount} />}
      </AppHeader>
      <StatsView slug={slug} />
    </div>
  );
}
