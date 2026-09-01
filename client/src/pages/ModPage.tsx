import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useBingo } from "../api/queries";
import { useAuth } from "../context/AuthContext";
import { useWebSocketEvent } from "../context/WebSocketContext";
import { ReviewQueue } from "../core/mod/ReviewQueue";
import { StageControls } from "../core/mod/StageControls";
import { SignupRoster } from "../core/mod/SignupRoster";
import { BingoSettingsForm } from "../core/admin/BingoSettingsForm";
import { ModsManager } from "../core/admin/ModsManager";
import { BoardEditor } from "../core/admin/BoardEditor";
import { LineEditor } from "../core/admin/LineEditor";
import { QuestionBuilder } from "../core/admin/QuestionBuilder";
import { TeamManager } from "../core/admin/TeamManager";

// adminOnly tabs are hidden from — and their content never rendered for — a
// mod who isn't a site admin. The server enforces the same split on the
// underlying routes (requireAdmin on admin.ts vs requireBingoMod on mod.ts),
// so this is UX decluttering on top of a real boundary, not the boundary
// itself.
const TABS = [
  { key: "submissions", label: "Submissions", adminOnly: false },
  { key: "signups", label: "Signups", adminOnly: false },
  { key: "settings", label: "Settings", adminOnly: true },
  { key: "board", label: "Board", adminOnly: true },
  { key: "lines", label: "Lines", adminOnly: true },
  { key: "questions", label: "Signup Questions", adminOnly: true },
  { key: "teams", label: "Teams", adminOnly: true },
  { key: "mods", label: "Moderators", adminOnly: true },
] as const;
type Tab = (typeof TABS)[number]["key"];

// Mod surfaces never theme — always core/, regardless of bingo.theme.
export function ModPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: shell } = useBingo(slug);
  const { user } = useAuth();
  const isAdmin = !!user?.isAdmin;
  const [tab, setTab] = useState<Tab>("submissions");

  const [showNotifPrompt, setShowNotifPrompt] = useState(
    () => "Notification" in window && Notification.permission === "default" && !localStorage.getItem("mod_notif_prompted"),
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") navigate(`/b/${slug}`);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, slug]);

  useWebSocketEvent((event) => {
    if (event.type === "submission_created" && "Notification" in window && Notification.permission === "granted") {
      new Notification("New bingo submission", { body: "A new submission is pending review" });
    }
  });

  useEffect(() => {
    // isMod is per-bingo and only known once the shell loads — redirect once we know for sure.
    if (shell && !shell.isMod) navigate(`/b/${slug}`, { replace: true });
  }, [shell, navigate, slug]);

  // A tab the user can no longer see (e.g. isAdmin resolved to false after
  // mount) shouldn't leave stale admin-only content selected.
  useEffect(() => {
    const current = TABS.find((t) => t.key === tab);
    if (current?.adminOnly && !isAdmin) setTab("submissions");
  }, [isAdmin, tab]);

  if (!shell || !shell.isMod || !slug) return null;

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="fixed inset-0 bg-slate-900 z-50 flex flex-col">
      <header className="flex items-center justify-between px-6 py-3 bg-slate-800 border-b border-slate-700 shrink-0">
        <span className="font-bold text-lg tracking-tight text-white">Mod Panel — {shell.bingo.name}</span>
        <button
          onClick={() => navigate(`/b/${slug}`)}
          className="text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 rounded px-3 py-1 text-sm transition-colors cursor-pointer"
        >
          Back to board
        </button>
      </header>

      <div className="flex-1 w-full flex flex-col items-center overflow-y-auto">
        <div className="w-full max-w-6xl px-6 pt-4">
          <StageControls slug={slug} bingo={shell.bingo} />
        </div>

        <div className="w-full max-w-6xl px-6 pt-4 flex gap-1 border-b border-slate-700 overflow-x-auto">
          {visibleTabs.map((t) => (
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

        {/* Submissions/Signups already carry their own max-w-6xl + padding —
            an outer wrapper here would double up and squeeze them. The
            admin-only panels don't self-pad, so they get one. */}
        {tab === "submissions" && <ReviewQueue slug={slug} />}
        {tab === "signups" && <SignupRoster slug={slug} />}
        {isAdmin && tab !== "submissions" && tab !== "signups" && (
          <div className="w-full max-w-6xl px-6 py-4">
            {tab === "settings" && (
              <BingoSettingsForm slug={slug} bingo={shell.bingo} paidSignupCount={shell.paidSignupCount} potTotal={shell.potTotal} />
            )}
            {tab === "board" && <BoardEditor slug={slug} bingo={shell.bingo} categories={shell.categories} />}
            {tab === "lines" && <LineEditor slug={slug} />}
            {tab === "questions" && <QuestionBuilder slug={slug} />}
            {tab === "teams" && <TeamManager slug={slug} />}
            {tab === "mods" && <ModsManager slug={slug} />}
          </div>
        )}
      </div>

      {showNotifPrompt && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <h2 className="text-white font-bold text-lg">Enable notifications?</h2>
            <p className="text-slate-300 text-sm leading-relaxed">
              Get a browser notification whenever a new submission arrives for review, even if this tab is in the background.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  localStorage.setItem("mod_notif_prompted", "true");
                  setShowNotifPrompt(false);
                }}
                className="text-sm text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 rounded px-3 py-1.5 transition-colors cursor-pointer"
              >
                No thanks
              </button>
              <button
                onClick={async () => {
                  localStorage.setItem("mod_notif_prompted", "true");
                  setShowNotifPrompt(false);
                  await Notification.requestPermission();
                }}
                className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded px-3 py-1.5 transition-colors cursor-pointer"
              >
                Enable
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
