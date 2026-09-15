import { AppHeader } from "../../../core/ui/AppHeader";
import { DraftRoom } from "../../../core/draft/DraftRoom";
import { useDotGridStyle } from "../dotGrid";

export function DraftPageLayout({ slug, bingoName }: { slug: string; bingoName: string }) {
  const dotGridStyle = useDotGridStyle();
  return (
    <div className="min-h-screen text-on-surface" style={dotGridStyle}>
      <AppHeader back={{ to: `/b/${slug}`, label: "Back to bingo" }} title="Draft" subtitle={bingoName} />
      <DraftRoom slug={slug} />
    </div>
  );
}
