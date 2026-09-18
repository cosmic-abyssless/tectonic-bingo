import { AppHeader } from "../../../core/ui/AppHeader";
import { DraftRoom } from "../../../core/draft/DraftRoom";
import { ComicPage } from "../fx/ComicPage";
import { comicHeaderProps } from "./headerStyle";

export function DraftPageLayout({ slug, bingoName }: { slug: string; bingoName: string }) {
  return (
    <ComicPage>
      <AppHeader back={{ to: `/b/${slug}`, label: "Back to bingo" }} title="Draft" subtitle={bingoName} {...comicHeaderProps()} />
      <DraftRoom slug={slug} />
    </ComicPage>
  );
}
