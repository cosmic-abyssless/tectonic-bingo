import { useParams } from "react-router-dom";
import { BingoPageProvider, useBingoPage } from "../headless";
import { ThemeProvider } from "../themes/ThemeProvider";
import { useSlot } from "../themes/context";
import { PageLoading, PageError } from "../themes/default/page/PageStates";
import { PlayerProfileProvider } from "../core/tectonic/PlayerName";

export function BingoPage() {
  const { slug } = useParams<{ slug: string }>();
  return (
    <BingoPageProvider slug={slug!} renderLoading={() => <PageLoading />} renderError={(message) => <PageError message={message} />}>
      <PlayerProfileProvider slug={slug!}>
        <ThemedSurface />
      </PlayerProfileProvider>
    </BingoPageProvider>
  );
}

function ThemedSurface() {
  const page = useBingoPage();
  return (
    <ThemeProvider themeKey={page.themeKey}>
      <BoardPageSlot />
    </ThemeProvider>
  );
}

function BoardPageSlot() {
  const BoardPage = useSlot("BoardPage");
  return <BoardPage />;
}
