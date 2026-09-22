import { AppHeader } from "../../../core/ui/AppHeader";
import { ShieldIcon } from "../../../core/ui/icons";
import { DraftRoom } from "../../../core/draft/DraftRoom";
import { ComicPage } from "../fx/ComicPage";
import { comicHeaderProps } from "./headerStyle";
import { ComicButton } from "../ui/ComicButton";

export function DraftPageLayout({ slug, bingoName, isMod }: { slug: string; bingoName: string; isMod: boolean }) {
  return (
    <ComicPage>
      <AppHeader back={{ to: `/b/${slug}`, label: "Back to bingo" }} title="Draft" subtitle={bingoName} {...comicHeaderProps()}>
        {isMod && (
          <ComicButton size="sm" href={`/b/${slug}/mod`}>
            <ShieldIcon />
            Mod panel
          </ComicButton>
        )}
      </AppHeader>
      <DraftRoom slug={slug} />
    </ComicPage>
  );
}
