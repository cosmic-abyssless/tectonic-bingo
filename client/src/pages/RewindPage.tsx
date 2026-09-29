import { Navigate, useParams } from "react-router-dom";
import { BingoPageProvider, useBingoPage } from "../headless";
import { RewindProvider } from "../headless/RewindProvider";
import { ThemeProvider } from "../themes/ThemeProvider";
import { useSlot } from "../themes/context";
import { PageLoading, PageError } from "../themes/default/page/PageStates";
import { PlayerProfileProvider } from "../core/tectonic/PlayerName";
import { AchievementsProvider } from "../core/achievements/AchievementsProvider";
import { useEscapeBack } from "../core/ui/useEscapeBack";
import { useRememberTheme } from "../themes/rememberedTheme";
import { NotRecordedPage } from "../core/historical/NotRecorded";

/** Rewind (CONTEXT.md): /b/:slug/rewind?at=<ms>&team=<id>. Only for a Finished Bingo; any other stage goes to its board. */
export function RewindPage() {
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
  // A Historical Bingo (CONTEXT.md) without Submissions has nothing to play back.
  if (page.historical && !page.historical.submissions) {
    return (
      <ThemeProvider themeKey={page.themeKey} fallback={<PageLoading />}>
        <NotRecordedPage slug={slug} title="Rewind" bingoName={page.bingo.name} />
      </ThemeProvider>
    );
  }
  if (!page.canRewind) return <Navigate to={`/b/${slug}`} replace />;
  return (
    <ThemeProvider themeKey={page.themeKey} fallback={<PageLoading />}>
      {/* Outside PlayerProfileProvider — see BingoPage.tsx's ThemedSurface for why. */}
      <AchievementsProvider slug={slug}>
        <PlayerProfileProvider slug={slug}>
          <RewindProvider slug={slug} renderLoading={() => <LoadingSlot />} renderError={(message) => <ErrorSlot message={message} />}>
            <RewindPageSlot />
          </RewindProvider>
        </PlayerProfileProvider>
      </AchievementsProvider>
    </ThemeProvider>
  );
}

function RewindPageSlot() {
  const RewindPage = useSlot("RewindPage");
  return <RewindPage />;
}

function LoadingSlot() {
  const Loading = useSlot("PageLoading");
  return <Loading />;
}

function ErrorSlot({ message }: { message: string }) {
  const Error = useSlot("PageError");
  return <Error message={message} />;
}
