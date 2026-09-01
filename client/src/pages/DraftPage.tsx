import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useBingo } from "../api/queries";
import { DraftRoom } from "../core/draft/DraftRoom";

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
    <div className="fixed inset-0 bg-slate-900 z-50 flex flex-col">
      <header className="flex items-center justify-between px-6 py-3 bg-slate-800 border-b border-slate-700 shrink-0">
        <span className="font-bold text-lg tracking-tight text-white">Draft — {shell.bingo.name}</span>
        <button
          onClick={() => navigate(`/b/${slug}`)}
          className="text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 rounded px-3 py-1 text-sm transition-colors cursor-pointer"
        >
          Back to board
        </button>
      </header>

      <div className="flex-1 w-full overflow-y-auto">
        <DraftRoom slug={slug!} />
      </div>
    </div>
  );
}
