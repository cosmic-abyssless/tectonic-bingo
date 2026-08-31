import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useBingo } from "../api/queries";
import { useWebSocketEvent } from "../context/WebSocketContext";
import { ReviewQueue } from "../core/mod/ReviewQueue";
import { StageControls } from "../core/mod/StageControls";
import { SignupRoster } from "../core/mod/SignupRoster";

type Tab = "submissions" | "signups";

// Mod surfaces never theme — always core/, regardless of bingo.theme.
export function ModPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: shell } = useBingo(slug);
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

  if (!shell || !shell.isMod) return null;

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
          <StageControls slug={slug!} bingo={shell.bingo} />
        </div>

        <div className="w-full max-w-6xl px-6 pt-4 flex gap-1 border-b border-slate-700">
          {(["submissions", "signups"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-sm font-medium px-3 py-2 border-b-2 -mb-px transition-colors cursor-pointer capitalize ${
                tab === t ? "border-indigo-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "submissions" ? <ReviewQueue slug={slug!} /> : <SignupRoster slug={slug!} />}
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
