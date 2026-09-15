import { AppHeader } from "../../../core/ui/AppHeader";
import { StatsView } from "../../../core/stats/StatsView";
import { useDotGridStyle } from "../dotGrid";

export function StatsPageLayout({ slug, bingoName }: { slug: string; bingoName: string }) {
  const dotGridStyle = useDotGridStyle();
  return (
    <div className="min-h-screen text-on-surface" style={dotGridStyle}>
      <AppHeader back={{ to: `/b/${slug}`, label: "Back to bingo" }} title="Stats" subtitle={bingoName} />
      <StatsView slug={slug} />
    </div>
  );
}
