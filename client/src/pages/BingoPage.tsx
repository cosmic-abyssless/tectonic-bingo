import { Navigate, useParams } from "react-router-dom";
import { BingoPageProvider, useBingoPage } from "../headless";
import { ThemeProvider } from "../themes/ThemeProvider";
import { useSlot } from "../themes/context";
import { PageLoading, PageError } from "../themes/default/page/PageStates";
import { PlayerProfileProvider } from "../core/tectonic/PlayerName";
import { useRememberTheme } from "../themes/rememberedTheme";

export function BingoPage() {
  const { slug } = useParams<{ slug: string }>();
  return (
    <BingoPageProvider slug={slug!} renderLoading={() => <PageLoading />} renderError={(message) => <PageError message={message} />}>
      <ThemedSurface slug={slug!} />
    </BingoPageProvider>
  );
}

// The profile provider sits INSIDE the theme so the player-profile dialog it
// renders can pick up the theme's dialog frame (Draft/Stats already do it
// this way).
function ThemedSurface({ slug }: { slug: string }) {
  const page = useBingoPage();
  useRememberTheme(slug, page.themeKey);
  // While the draft runs, the bingo *is* the draft room: whoever the room lets in goes straight there (replacing this
  // entry, so Back doesn't bounce), rather than to a page whose only content is a button into it. Anyone it keeps
  // out (the draft endpoint 403s people who didn't sign up) stays here, on the draft stage's own copy.
  if (page.stageView === "draft") {
    if (page.draft.isLoading) return <PageLoading />;
    if (page.draft.state) return <Navigate to={`/b/${slug}/draft`} replace />;
  }
  return (
    <ThemeProvider themeKey={page.themeKey} fallback={<PageLoading />}>
      <PlayerProfileProvider slug={slug}>
        <BoardPageSlot />
      </PlayerProfileProvider>
    </ThemeProvider>
  );
}

function BoardPageSlot() {
  const BoardPage = useSlot("BoardPage");
  return <BoardPage />;
}
