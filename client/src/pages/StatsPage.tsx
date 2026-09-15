import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useBingo } from "../api/queries";
import { ThemeProvider } from "../themes/ThemeProvider";
import { useSlot } from "../themes/context";

export function StatsPage() {
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
      <StatsPageSlot slug={slug!} bingoName={shell.bingo.name} />
    </ThemeProvider>
  );
}

function StatsPageSlot({ slug, bingoName }: { slug: string; bingoName: string }) {
  const StatsPage = useSlot("StatsPage");
  return <StatsPage slug={slug} bingoName={bingoName} />;
}
