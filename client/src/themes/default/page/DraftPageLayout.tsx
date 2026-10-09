import { useBingoHeader, useBingoMenuEntries } from "../../../headless";
import { AppHeader } from "../../../core/ui/AppHeader";
import { DraftRoom } from "../../../core/draft/DraftRoom";
import { ModPanelButton } from "./ModPanelButton";

export function DraftPageLayout({ slug, bingoName }: { slug: string; bingoName: string }) {
  const header = useBingoHeader(slug);
  const menuEntries = useBingoMenuEntries(slug, header);
  return (
    <div className="min-h-dvh bg-background text-on-surface">
      <AppHeader title={header?.draftRoom === "rosters" ? "Team rosters" : "Draft"} subtitle={bingoName} menuEntries={menuEntries}>
        {header?.canModerate && <ModPanelButton slug={slug} pendingCount={header?.pendingCount ?? 0} />}
      </AppHeader>
      <DraftRoom slug={slug} />
    </div>
  );
}
