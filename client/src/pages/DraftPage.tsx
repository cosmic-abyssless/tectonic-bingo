import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useBingo } from "../api/queries";
import { PlayerProfileProvider } from "../core/tectonic/PlayerName";
import { ThemeProvider } from "../themes/ThemeProvider";
import { useSlot } from "../themes/context";

export function DraftPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: shell } = useBingo(slug);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") navigate(`/b/${slug}`);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, slug]);

  if (!shell) return null;

  return (
    <ThemeProvider themeKey={shell.bingo.theme}>
      <PlayerProfileProvider slug={slug!}>
        <DraftPageSlot slug={slug!} bingoName={shell.bingo.name} />
      </PlayerProfileProvider>
    </ThemeProvider>
  );
}

function DraftPageSlot({ slug, bingoName }: { slug: string; bingoName: string }) {
  const DraftPage = useSlot("DraftPage");
  return <DraftPage slug={slug} bingoName={bingoName} />;
}
