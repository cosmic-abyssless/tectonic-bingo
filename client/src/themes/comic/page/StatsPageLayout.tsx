import { useAchievementsEligible, useOpenAchievements } from "../../../core/achievements/AchievementsProvider";
import { AppHeader } from "../../../core/ui/AppHeader";
import { MenuItem } from "../../../core/ui/Menu";
import { StatsView } from "../../../core/stats/StatsView";
import { ComicPage } from "../fx/ComicPage";
import { comicHeaderProps } from "./headerStyle";

export function StatsPageLayout({ slug, bingoName }: { slug: string; bingoName: string }) {
  const achievementsEligible = useAchievementsEligible();
  const openAchievements = useOpenAchievements();
  return (
    <ComicPage>
      <AppHeader
        back={{ to: `/b/${slug}`, label: "Back to bingo" }}
        title="Stats"
        subtitle={bingoName}
        menuItems={achievementsEligible && openAchievements ? <MenuItem id="achievements" onAction={openAchievements}>Achievements</MenuItem> : undefined}
        {...comicHeaderProps()}
      />
      <StatsView slug={slug} />
    </ComicPage>
  );
}
