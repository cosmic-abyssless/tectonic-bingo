import { useEscapeBack } from "../core/ui/useEscapeBack";
import { useParams } from "react-router-dom";
import { useBingo } from "../api/queries";
import { PlayerProfileProvider } from "../core/tectonic/PlayerName";
import { PageLoading } from "../themes/default/page/PageStates";
import { useRememberTheme } from "../themes/rememberedTheme";
import { ThemeProvider } from "../themes/ThemeProvider";
import { useSlot } from "../themes/context";

export function StatsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: shell } = useBingo(slug);

  useEscapeBack(`/b/${slug}`);

  useRememberTheme(slug, shell?.bingo.theme);

  if (!shell) return null;

  return (
    <ThemeProvider themeKey={shell.bingo.theme} fallback={<PageLoading />}>
      <PlayerProfileProvider slug={slug!}>
        <StatsPageSlot slug={slug!} bingoName={shell.bingo.name} />
      </PlayerProfileProvider>
    </ThemeProvider>
  );
}

function StatsPageSlot({ slug, bingoName }: { slug: string; bingoName: string }) {
  const StatsPage = useSlot("StatsPage");
  return <StatsPage slug={slug} bingoName={bingoName} />;
}
