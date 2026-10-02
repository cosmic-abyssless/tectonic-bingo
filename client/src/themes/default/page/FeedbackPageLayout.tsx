import { useBingoHeader, useBingoMenuEntries } from "../../../headless";
import { AppHeader } from "../../../core/ui/AppHeader";
import { FeedbackForm } from "../../../core/feedback/FeedbackForm";
import { ModPanelButton } from "./ModPanelButton";

/** The Feedback form's page: the header, then the form (core/feedback), which draws with the page's tokens. */
export function FeedbackPageLayout({ slug, bingoName }: { slug: string; bingoName: string }) {
  const header = useBingoHeader(slug);
  const menuEntries = useBingoMenuEntries(slug, header);
  return (
    <div className="min-h-dvh bg-background text-on-surface">
      <AppHeader title="Feedback" subtitle={bingoName} menuEntries={menuEntries}>
        {header?.canModerate && <ModPanelButton slug={slug} pendingCount={header.pendingCount} />}
      </AppHeader>
      <FeedbackForm slug={slug} />
    </div>
  );
}
