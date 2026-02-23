import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { avatarUrl, displayName, type TeamProgressResponse, type TileProgress } from "../types";
import { BingoBoard } from "../components/BingoBoard";

const TEAM_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  "Red Team":    { bg: "bg-red-950/60",    border: "border-red-500",    text: "text-red-400",    dot: "bg-red-500"    },
  "Blue Team":   { bg: "bg-blue-950/60",   border: "border-blue-500",   text: "text-blue-400",   dot: "bg-blue-500"   },
  "Green Team":  { bg: "bg-green-950/60",  border: "border-green-500",  text: "text-green-400",  dot: "bg-green-500"  },
  "Yellow Team": { bg: "bg-yellow-950/60", border: "border-yellow-500", text: "text-yellow-400", dot: "bg-yellow-500" },
  "Orange Team": { bg: "bg-orange-950/60", border: "border-orange-500", text: "text-orange-400", dot: "bg-orange-500" },
  "Pink Team":   { bg: "bg-pink-950/60",   border: "border-pink-500",   text: "text-pink-400",   dot: "bg-pink-500"   },
};

export function Home() {
  const { user, logout } = useAuth();
  const [teamProgress, setTeamProgress] = useState<TeamProgressResponse | null>(null);

  useEffect(() => {
    if (!user?.team) return;
    fetch("/api/team/progress")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setTeamProgress(data); })
      .catch(() => {});
  }, [user?.team]);

  if (!user) return null;

  const teamStyle = user.team ? TEAM_COLORS[user.team] : null;
  const progressMap = new Map<string, TileProgress>(
    teamProgress?.tileProgress.map(p => [p.tileId, p]) ?? []
  );

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-3 bg-slate-800 border-b border-slate-700">
        <span className="font-bold text-lg tracking-tight">Tectonic Bingo</span>
        <div className="flex items-center gap-3">
          {teamStyle && (
            <span className={`hidden sm:flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${teamStyle.bg} ${teamStyle.border} ${teamStyle.text}`}>
              <span className={`w-2 h-2 rounded-full ${teamStyle.dot}`} />
              {user.team}
            </span>
          )}
          <img src={avatarUrl(user)} alt="avatar" className="w-8 h-8 rounded-full border-2 border-indigo-500" />
          <span className="text-sm text-slate-300">{displayName(user)}</span>
          <button
            onClick={logout}
            className="text-sm text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 rounded px-3 py-1 transition-colors cursor-pointer"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="px-3 py-4 sm:px-6 sm:py-6 max-w-7xl mx-auto">
        {user.team ? (
          <>
            {/* Team banner */}
            {teamStyle && (
              <div className={`flex items-center justify-between gap-3 mb-5 px-4 py-3 rounded-lg border ${teamStyle.bg} ${teamStyle.border}`}>
                <div className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full flex-shrink-0 ${teamStyle.dot}`} />
                  <div>
                    <span className={`font-bold ${teamStyle.text}`}>{user.team}</span>
                    <span className="text-slate-400 text-sm ml-2">— your team's board</span>
                  </div>
                </div>
                {teamProgress && (
                  <div className="text-right flex-shrink-0">
                    <span className={`text-xl font-bold ${teamStyle.text}`}>
                      {teamProgress.totalPoints.toLocaleString()} pts
                    </span>
                    {(teamProgress.lineBonus > 0 || teamProgress.adjustments !== 0) && (
                      <div className="text-xs text-slate-400 mt-0.5">
                        {teamProgress.tilePoints} tile
                        {teamProgress.lineBonus > 0 && ` + ${teamProgress.lineBonus} lines`}
                        {teamProgress.adjustments !== 0 && ` ${teamProgress.adjustments > 0 ? "+" : ""}${teamProgress.adjustments} adj`}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <BingoBoard tileProgress={progressMap} />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="text-5xl">🎯</div>
            <h2 className="text-xl font-bold text-white">You're not on a team yet</h2>
            <p className="text-slate-400 max-w-sm">
              You need to be assigned to a team in the Discord server before you can view the board.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
