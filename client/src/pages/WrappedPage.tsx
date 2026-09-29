import { Navigate, useParams } from "react-router-dom";
import { BingoPageProvider, useBingoPage } from "../headless";
import { WrappedProvider } from "../headless/WrappedProvider";
import { ThemeProvider } from "../themes/ThemeProvider";
import { useSlot } from "../themes/context";
import { PageLoading, PageError } from "../themes/default/page/PageStates";
import { PlayerProfileProvider } from "../core/tectonic/PlayerName";
import { AchievementsProvider } from "../core/achievements/AchievementsProvider";
import { useEscapeBack } from "../core/ui/useEscapeBack";
import { useRememberTheme } from "../themes/rememberedTheme";
import { NotRecordedPage } from "../core/historical/NotRecorded";

/** Wrapped (CONTEXT.md): /b/:slug/wrapped. Once it's published, or as a Moderator's preview before that; anyone else goes to the board. */
export function WrappedPage() {
  const { slug } = useParams<{ slug: string }>();
  useEscapeBack(`/b/${slug}`);
  return (
    <BingoPageProvider slug={slug!} renderLoading={() => <PageLoading />} renderError={(message) => <PageError message={message} />}>
      <ThemedSurface slug={slug!} />
    </BingoPageProvider>
  );
}

function ThemedSurface({ slug }: { slug: string }) {
  const page = useBingoPage();
  useRememberTheme(slug, page.themeKey);
  // A Historical Bingo (CONTEXT.md) never has a Wrapped: it's made at the end of a Bingo, not recorded.
  if (page.bingo.historical) {
    return (
      <ThemeProvider themeKey={page.themeKey} fallback={<PageLoading />}>
        <NotRecordedPage slug={slug} title="Wrapped" bingoName={page.bingo.name} />
      </ThemeProvider>
    );
  }
  if (!page.wrapped.canOpen) return <Navigate to={`/b/${slug}`} replace />;
  return (
    <ThemeProvider themeKey={page.themeKey} fallback={<PageLoading />}>
      {/* Outside PlayerProfileProvider — see BingoPage.tsx's ThemedSurface for why. */}
      <AchievementsProvider slug={slug}>
        <PlayerProfileProvider slug={slug}>
          <WrappedProvider slug={slug} renderLoading={() => <LoadingSlot />} renderError={(message) => <ErrorSlot message={message} />}>
            <WrappedPageSlot />
          </WrappedProvider>
        </PlayerProfileProvider>
      </AchievementsProvider>
    </ThemeProvider>
  );
}

function WrappedPageSlot() {
  const WrappedPage = useSlot("WrappedPage");
  return <WrappedPage />;
}

function LoadingSlot() {
  const Loading = useSlot("PageLoading");
  return <Loading />;
}

function ErrorSlot({ message }: { message: string }) {
  const Error = useSlot("PageError");
  return <Error message={message} />;
}
