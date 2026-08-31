import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useBingo } from "../api/queries";
import { StageControls } from "../core/mod/StageControls";
import { BingoSettingsForm } from "../core/admin/BingoSettingsForm";
import { ModsManager } from "../core/admin/ModsManager";
import { BoardEditor } from "../core/admin/BoardEditor";
import { LineEditor } from "../core/admin/LineEditor";
import { QuestionBuilder } from "../core/admin/QuestionBuilder";
import { TeamManager } from "../core/admin/TeamManager";

const TABS = [
  { key: "settings", label: "Settings" },
  { key: "board", label: "Board" },
  { key: "lines", label: "Lines" },
  { key: "questions", label: "Signup Questions" },
  { key: "teams", label: "Teams" },
  { key: "mods", label: "Moderators" },
] as const;
type Tab = (typeof TABS)[number]["key"];

// Admin surfaces never theme — always core/ components, regardless of bingo.theme.
export function AdminPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: shell } = useBingo(slug);
  const [tab, setTab] = useState<Tab>("settings");

  useEffect(() => {
    if (shell && !shell.isMod) navigate(`/b/${slug}`, { replace: true });
  }, [shell, navigate, slug]);

  if (!shell || !shell.isMod || !slug) return null;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="flex items-center justify-between px-6 py-3 bg-slate-800 border-b border-slate-700">
        <span className="font-bold text-lg tracking-tight">Admin — {shell.bingo.name}</span>
        <button
          onClick={() => navigate(`/b/${slug}`)}
          className="text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 rounded px-3 py-1 text-sm transition-colors cursor-pointer"
        >
          Back to board
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        <div className="mb-6">
          <StageControls slug={slug} bingo={shell.bingo} />
        </div>

        <div className="flex gap-1 mb-6 border-b border-slate-700 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 text-sm font-medium px-3 py-2 border-b-2 -mb-px transition-colors cursor-pointer ${
                tab === t.key ? "border-indigo-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "settings" && <BingoSettingsForm slug={slug} bingo={shell.bingo} />}
        {tab === "board" && <BoardEditor slug={slug} bingo={shell.bingo} categories={shell.categories} />}
        {tab === "lines" && <LineEditor slug={slug} />}
        {tab === "questions" && <QuestionBuilder slug={slug} />}
        {tab === "teams" && <TeamManager slug={slug} />}
        {tab === "mods" && <ModsManager slug={slug} />}
      </main>
    </div>
  );
}
