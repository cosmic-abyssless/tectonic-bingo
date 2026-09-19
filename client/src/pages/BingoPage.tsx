import { useParams } from "react-router-dom";
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
