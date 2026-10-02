import { useEscapeBack } from "../core/ui/useEscapeBack";
import { useParams } from "react-router-dom";
import { useBingo } from "../api/queries";
import { usePageAccess } from "../headless/permissions";
import { PlayerProfileProvider } from "../core/tectonic/PlayerName";
import { PageLoading } from "../themes/default/page/PageStates";
import { useRememberTheme } from "../themes/rememberedTheme";
import { ThemeProvider } from "../themes/ThemeProvider";
import { useSlot } from "../themes/context";

// A Finished Bingo's Feedback form (CONTEXT.md "Feedback form"), at /b/:slug/feedback. Open only while the Bingo is
// Finished (a reopened Bingo closes it, sending a Player on to the Board with a toast saying why); the form itself says
// when it isn't open to this viewer (not a Player of the Bingo).
export function FeedbackPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: shell } = useBingo(slug);

  useEscapeBack(`/b/${slug}`);
  useRememberTheme(slug, shell?.bingo.theme);
  // The form is open to Finished Bingos only; a Historical Bingo was never played here, so has none.
  usePageAccess(slug, (can) => (shell ? !shell.historical && can("answer_feedback").allowed : undefined), "answer_feedback", shell?.bingo.name);

  if (!shell) return null;

  return (
    <ThemeProvider themeKey={shell.bingo.theme} fallback={<PageLoading />}>
      <PlayerProfileProvider slug={slug!}>
        <FeedbackPageSlot slug={slug!} bingoName={shell.bingo.name} />
      </PlayerProfileProvider>
    </ThemeProvider>
  );
}

function FeedbackPageSlot({ slug, bingoName }: { slug: string; bingoName: string }) {
  const FeedbackPage = useSlot("FeedbackPage");
  return <FeedbackPage slug={slug} bingoName={bingoName} />;
}
