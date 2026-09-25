import { useEffect, useRef } from "react";
import { useEscapeBack } from "../core/ui/useEscapeBack";
import { useParams } from "react-router-dom";
import { useBingo, useRecordAchievementOpened } from "../api/queries";
import { PlayerProfileProvider } from "../core/tectonic/PlayerName";
import { AchievementsProvider } from "../core/achievements/AchievementsProvider";
import { PageLoading } from "../themes/default/page/PageStates";
import { useRememberTheme } from "../themes/rememberedTheme";
import { ThemeProvider } from "../themes/ThemeProvider";
import { useSlot } from "../themes/context";
import type { BingoShellResponse } from "@bingo/shared";

export function StatsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: shell } = useBingo(slug);

  useEscapeBack(`/b/${slug}`);

  useRememberTheme(slug, shell?.bingo.theme);
  useRecordStatsOpened(slug, shell);

  if (!shell) return null;

  return (
    <ThemeProvider themeKey={shell.bingo.theme} fallback={<PageLoading />}>
      {/* Outside PlayerProfileProvider — see BingoPage.tsx's ThemedSurface for why. */}
      <AchievementsProvider slug={slug!}>
        <PlayerProfileProvider slug={slug!}>
          <StatsPageSlot slug={slug!} bingoName={shell.bingo.name} />
        </PlayerProfileProvider>
      </AchievementsProvider>
    </ThemeProvider>
  );
}

// "Number cruncher" (CONTEXT.md "Achievement"): fires once per mount, only while the bingo is Live and the viewer
// is a Player on a Team — same eligibility the tile/rules opens use (headless/BingoPageProvider.tsx).
function useRecordStatsOpened(slug: string | undefined, shell: BingoShellResponse | undefined): void {
  const recordOpened = useRecordAchievementOpened(slug ?? "");
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current || !shell) return;
    if (shell.bingo.stage !== "live" || !shell.myTeam) return;
    firedRef.current = true;
    recordOpened.mutate({ kind: "stats" });
    // Fires once, as soon as eligibility is known — not on every recordOpened identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shell]);
}

function StatsPageSlot({ slug, bingoName }: { slug: string; bingoName: string }) {
  const StatsPage = useSlot("StatsPage");
  return <StatsPage slug={slug} bingoName={bingoName} />;
}
