import { useEscapeBack } from "../core/ui/useEscapeBack";
import { useParams } from "react-router-dom";
import { useBingo } from "../api/queries";
import { PlayerProfileProvider } from "../core/tectonic/PlayerName";
import { PageLoading } from "../themes/default/page/PageStates";
import { useRememberTheme } from "../themes/rememberedTheme";
import { NotRecordedPage } from "../core/historical/NotRecorded";
import { ThemeProvider } from "../themes/ThemeProvider";
import { useSlot } from "../themes/context";

export function DraftPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: shell } = useBingo(slug);

  // Escape goes back to the board, except during the draft stage, when the board sends you straight back here.
  const inDraftStage = shell?.bingo.stage === "draft";
  useEscapeBack(`/b/${slug}`, !inDraftStage);

  useRememberTheme(slug, shell?.bingo.theme);

  if (!shell) return null;

  return (
    <ThemeProvider themeKey={shell.bingo.theme} fallback={<PageLoading />}>
      <PlayerProfileProvider slug={slug!}>
        {/* A Historical Bingo (CONTEXT.md) without draft picks has no Draft room. */}
        {shell.historical && !shell.historical.draft ? <NotRecordedPage slug={slug!} title="Draft" bingoName={shell.bingo.name} /> : <DraftPageSlot slug={slug!} bingoName={shell.bingo.name} isMod={shell.isMod} />}
      </PlayerProfileProvider>
    </ThemeProvider>
  );
}

function DraftPageSlot({ slug, bingoName, isMod }: { slug: string; bingoName: string; isMod: boolean }) {
  const DraftPage = useSlot("DraftPage");
  return <DraftPage slug={slug} bingoName={bingoName} isMod={isMod} />;
}
