import { useAchievementsEligible, useOpenAchievements } from "../../../core/achievements/AchievementsProvider";
import { AppHeader } from "../../../core/ui/AppHeader";
import { MenuItem } from "../../../core/ui/Menu";
import { StatsView } from "../../../core/stats/StatsView";

export function StatsPageLayout({ slug, bingoName }: { slug: string; bingoName: string }) {
  const achievementsEligible = useAchievementsEligible();
  const openAchievements = useOpenAchievements();
  return (
    <div className="min-h-dvh bg-background text-on-surface">
      <AppHeader
        back={{ to: `/b/${slug}`, label: "Back to bingo" }}
        title="Stats"
        subtitle={bingoName}
        menuItems={achievementsEligible && openAchievements ? <MenuItem id="achievements" onAction={openAchievements}>Achievements</MenuItem> : undefined}
      />
      <StatsView slug={slug} />
    </div>
  );
}
