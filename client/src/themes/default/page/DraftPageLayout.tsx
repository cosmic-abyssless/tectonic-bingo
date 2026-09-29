import { useBingoHeader, useBingoMenuEntries } from "../../../headless";
import { AppHeader } from "../../../core/ui/AppHeader";
import { DraftRoom } from "../../../core/draft/DraftRoom";
import { ModPanelButton } from "./ModPanelButton";

export function DraftPageLayout({ slug, bingoName, isMod }: { slug: string; bingoName: string; isMod: boolean }) {
  const header = useBingoHeader(slug);
  const menuEntries = useBingoMenuEntries(slug, header);
  // During the draft stage the board sends you straight back here, so there's no going "back to bingo" then.
  const back =
    header?.stage === "draft" ? (header.canSeeAllBingos ? { to: "/", label: "All bingos" } : undefined) : { to: `/b/${slug}`, label: "Back to bingo" };
  return (
    <div className="min-h-dvh bg-background text-on-surface">
      <AppHeader back={back} title="Draft" subtitle={bingoName} menuEntries={menuEntries}>
        {isMod && <ModPanelButton slug={slug} pendingCount={header?.pendingCount ?? 0} />}
      </AppHeader>
      <DraftRoom slug={slug} />
    </div>
  );
}
