import { useBingoHeader, useBingoMenuEntries } from "../../../headless";
import { AppHeader } from "../../../core/ui/AppHeader";
import { StatsView } from "../../../core/stats/StatsView";
import { ComicPage } from "../fx/ComicPage";
import { comicHeaderProps } from "./headerStyle";
import { ModPanelLink } from "./Masthead";

export function StatsPageLayout({ slug, bingoName }: { slug: string; bingoName: string }) {
  const header = useBingoHeader(slug);
  const menuEntries = useBingoMenuEntries(slug, header);
  return (
    <ComicPage>
      <AppHeader title="Stats" subtitle={bingoName} menuEntries={menuEntries} {...comicHeaderProps()}>
        {header?.canModerate && <ModPanelLink slug={slug} pendingCount={header.pendingCount} />}
      </AppHeader>
      <StatsView slug={slug} />
    </ComicPage>
  );
}
