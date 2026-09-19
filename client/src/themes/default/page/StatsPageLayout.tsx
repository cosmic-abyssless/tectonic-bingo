import { AppHeader } from "../../../core/ui/AppHeader";
import { StatsView } from "../../../core/stats/StatsView";

export function StatsPageLayout({ slug, bingoName }: { slug: string; bingoName: string }) {
  return (
    <div className="min-h-dvh bg-background text-on-surface">
      <AppHeader back={{ to: `/b/${slug}`, label: "Back to bingo" }} title="Stats" subtitle={bingoName} />
      <StatsView slug={slug} />
    </div>
  );
}
