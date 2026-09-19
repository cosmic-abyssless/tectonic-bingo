import { AppHeader } from "../../../core/ui/AppHeader";
import { DraftRoom } from "../../../core/draft/DraftRoom";

export function DraftPageLayout({ slug, bingoName }: { slug: string; bingoName: string }) {
  return (
    <div className="min-h-dvh bg-background text-on-surface">
      <AppHeader back={{ to: `/b/${slug}`, label: "Back to bingo" }} title="Draft" subtitle={bingoName} />
      <DraftRoom slug={slug} />
    </div>
  );
}
