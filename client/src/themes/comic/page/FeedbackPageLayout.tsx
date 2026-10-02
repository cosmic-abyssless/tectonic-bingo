import { useBingoHeader, useBingoMenuEntries } from "../../../headless";
import { AppHeader } from "../../../core/ui/AppHeader";
import { FeedbackForm } from "../../../core/feedback/FeedbackForm";
import { ComicPage } from "../fx/ComicPage";
import { comicHeaderProps } from "./headerStyle";
import { ModPanelLink } from "./Masthead";

/** The Feedback form's page, on the comic's paper: the masthead, then the form (core/feedback) in the theme's panels and fields. */
export function FeedbackPageLayout({ slug, bingoName }: { slug: string; bingoName: string }) {
  const header = useBingoHeader(slug);
  const menuEntries = useBingoMenuEntries(slug, header);
  return (
    <ComicPage>
      <AppHeader title="Feedback" subtitle={bingoName} menuEntries={menuEntries} {...comicHeaderProps()}>
        {header?.canModerate && <ModPanelLink slug={slug} pendingCount={header.pendingCount} />}
      </AppHeader>
      <FeedbackForm slug={slug} />
    </ComicPage>
  );
}
