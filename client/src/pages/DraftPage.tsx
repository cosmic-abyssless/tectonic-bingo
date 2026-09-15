import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useBingo } from "../api/queries";
import { DraftRoom } from "../core/draft/DraftRoom";
import { AppHeader } from "../core/ui/AppHeader";
import { PlayerProfileProvider } from "../core/tectonic/PlayerName";

// Draft room never themes — always core/, regardless of bingo.theme.
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
    <div className="min-h-screen bg-bg text-fg">
      <AppHeader back={{ to: `/b/${slug}`, label: "Back to bingo" }} title="Draft" subtitle={shell.bingo.name} />
      <PlayerProfileProvider slug={slug!}>
        <DraftRoom slug={slug!} />
      </PlayerProfileProvider>
    </div>
  );
}
