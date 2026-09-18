import { AppHeader } from "../../../core/ui/AppHeader";
import { StatsView } from "../../../core/stats/StatsView";
import { ComicPage } from "../fx/ComicPage";
import { comicHeaderProps } from "./headerStyle";

export function StatsPageLayout({ slug, bingoName }: { slug: string; bingoName: string }) {
  return (
    <ComicPage>
      <AppHeader back={{ to: `/b/${slug}`, label: "Back to bingo" }} title="Stats" subtitle={bingoName} {...comicHeaderProps()} />
      <StatsView slug={slug} />
    </ComicPage>
  );
}
