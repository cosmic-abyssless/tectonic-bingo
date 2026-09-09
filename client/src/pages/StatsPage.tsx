import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useBingo } from "../api/queries";
import { StatsView } from "../core/stats/StatsView";
import { AppHeader } from "../core/ui/AppHeader";

// Stats never themes — always core/, regardless of bingo.theme.
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
    <div className="min-h-screen bg-bg text-fg">
      <AppHeader back={{ to: `/b/${slug}`, label: "Back to bingo" }} title="Stats" subtitle={shell.bingo.name} />
      <StatsView slug={slug!} />
    </div>
  );
}
