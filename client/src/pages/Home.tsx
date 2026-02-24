import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  avatarUrl,
  displayName,
  type BingoEvent,
  type TeamInfo,
  type TeamProgressResponse,
  type TileProgress,
  type SubmissionSummary,
} from "../types";
import { BingoBoard } from "../components/BingoBoard";
import { SubmissionModal } from "../components/SubmissionModal";
import { TeamSubmissionsModal } from "../components/TeamSubmissionsModal";
import { useWebSocket } from "../hooks/useWebSocket";
import { formatDuration } from "../utils";

const TEAM_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  "Red Team":    { bg: "bg-red-950/60",    border: "border-red-500",    text: "text-red-400",    dot: "bg-red-500"    },
  "Blue Team":   { bg: "bg-blue-950/60",   border: "border-blue-500",   text: "text-blue-400",   dot: "bg-blue-500"   },
  "Green Team":  { bg: "bg-green-950/60",  border: "border-green-500",  text: "text-green-400",  dot: "bg-green-500"  },
  "Yellow Team": { bg: "bg-yellow-950/60", border: "border-yellow-500", text: "text-yellow-400", dot: "bg-yellow-500" },
  "Orange Team": { bg: "bg-orange-950/60", border: "border-orange-500", text: "text-orange-400", dot: "bg-orange-500" },
  "Pink Team":   { bg: "bg-pink-950/60",   border: "border-pink-500",   text: "text-pink-400",   dot: "bg-pink-500"   },
};

function EventCountdown({ event }: { event: BingoEvent }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, new Date(event.endsAt).getTime() - Date.now())
  );

  useEffect(() => {
    const endsAt = new Date(event.endsAt).getTime();
    const tick = () => setRemaining(Math.max(0, endsAt - Date.now()));
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [event.endsAt]);

  if (remaining <= 0) return null;

  return (
    <div className="leading-tight">
      <div className="font-bold text-lg tracking-tight">Tectonic Bingo</div>
      <div className="text-xs text-slate-400 tabular-nums">
        {formatDuration(remaining)} remaining
      </div>
    </div>
  );
}

export function Home() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [teamProgress, setTeamProgress] = useState<TeamProgressResponse | null>(null);
  const [teamSubmissions, setTeamSubmissions] = useState<SubmissionSummary[]>([]);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitInitialTileId, setSubmitInitialTileId] = useState<string | undefined>();
  const [showSubmissionsModal, setShowSubmissionsModal] = useState(false);
  const [event, setEvent] = useState<BingoEvent | null>(null);
  const [allTeams, setAllTeams] = useState<TeamInfo[]>([]);
  // Which team's board is currently displayed
  const [viewingTeam, setViewingTeam] = useState<string | null>(user?.team ?? null);

  const isViewingOtherTeam =
    !!user?.isModerator && !!viewingTeam && viewingTeam !== user?.team;

  // Fetch team list for mod switcher
  useEffect(() => {
    if (!user?.isModerator) return;
    fetch("/api/teams")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setAllTeams(data.teams); })
      .catch(() => {});
  }, [user?.isModerator]);

  const refreshProgress = useCallback(() => {
    if (!viewingTeam) return;
    const search = isViewingOtherTeam
      ? `?viewAsTeam=${encodeURIComponent(viewingTeam)}`
      : "";
    fetch(`/api/team/progress${search}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setTeamProgress(data); })
      .catch(() => {});
  }, [viewingTeam, isViewingOtherTeam]);

  const refreshSubmissions = useCallback(() => {
    if (!viewingTeam) return;
    const search = isViewingOtherTeam
      ? `?viewAsTeam=${encodeURIComponent(viewingTeam)}`
      : "";
    fetch(`/api/team/submissions${search}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setTeamSubmissions(data.submissions); })
      .catch(() => {});
  }, [viewingTeam, isViewingOtherTeam]);

  useEffect(() => {
    setTeamProgress(null);
    setTeamSubmissions([]);
    refreshProgress();
    refreshSubmissions();
  }, [refreshProgress, refreshSubmissions]);

  useWebSocket(useCallback((msg) => {
    if (
      (msg.type === "submission_created" || msg.type === "submission_reviewed") &&
      msg.teamName === viewingTeam
    ) {
      refreshProgress();
      refreshSubmissions();
    }
  }, [viewingTeam, refreshProgress, refreshSubmissions]));

  if (!user) return null;

  const teamStyle = viewingTeam ? TEAM_COLORS[viewingTeam] : null;
  const progressMap = new Map<string, TileProgress>(
    teamProgress?.tileProgress.map(p => [p.tileId, p]) ?? []
  );

  const submissionsMap = new Map<string, SubmissionSummary[]>();
  for (const sub of teamSubmissions) {
    const list = submissionsMap.get(sub.tileId) ?? [];
    list.push(sub);
    submissionsMap.set(sub.tileId, list);
  }

  const canSubmit = !isViewingOtherTeam && !!user.team;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-3 bg-slate-800 border-b border-slate-700">
        {event ? (
          <EventCountdown event={event} />
        ) : (
          <span className="font-bold text-lg tracking-tight">Tectonic Bingo</span>
        )}
        <div className="flex items-center gap-3">
          {/* Show own team badge only when viewing own board */}
          {user.team && !isViewingOtherTeam && (() => {
            const s = TEAM_COLORS[user.team];
            return s ? (
              <span className={`hidden sm:flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${s.bg} ${s.border} ${s.text}`}>
                <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                {user.team}
              </span>
            ) : null;
          })()}
          {user.isModerator && (
            <button
              onClick={() => navigate("/mod")}
              className="text-sm text-yellow-400 hover:text-yellow-300 border border-yellow-700 hover:border-yellow-500 rounded px-3 py-1 transition-colors cursor-pointer font-semibold"
            >
              Mod Panel
            </button>
          )}
          {viewingTeam && (
            <button
              onClick={() => setShowSubmissionsModal(true)}
              className="text-sm text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 rounded px-3 py-1 transition-colors cursor-pointer"
            >
              Submissions
              {teamSubmissions.length > 0 && (
                <span className="ml-1.5 text-xs bg-slate-600 text-slate-300 rounded-full px-1.5 py-0.5">
                  {teamSubmissions.length}
                </span>
              )}
            </button>
          )}
          {canSubmit && (
            <button
              onClick={() => { setSubmitInitialTileId(undefined); setShowSubmitModal(true); }}
              className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded px-3 py-1 transition-colors cursor-pointer"
            >
              Submit
            </button>
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
        {/* Mod team switcher */}
        {user.isModerator && allTeams.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {allTeams.map(team => {
              const s = TEAM_COLORS[team.name];
              const isActive = viewingTeam === team.name;
              return (
                <button
                  key={team.id}
                  onClick={() => setViewingTeam(team.name)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                    isActive && s
                      ? `${s.bg} ${s.border} ${s.text}`
                      : "bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300"
                  }`}
                >
                  {team.name}
                  {team.name === user.team && (
                    <span className="ml-1.5 text-[10px] opacity-60">you</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {viewingTeam ? (
          <>
            {/* Team banner */}
            {teamStyle && (
              <div className={`flex items-center justify-between gap-3 mb-5 px-4 py-3 rounded-lg border ${teamStyle.bg} ${teamStyle.border}`}>
                <div className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full flex-shrink-0 ${teamStyle.dot}`} />
                  <div>
                    <span className={`font-bold ${teamStyle.text}`}>{viewingTeam}</span>
                    {isViewingOtherTeam ? (
                      <span className="text-slate-400 text-sm ml-2">
                        — viewing as moderator{user.team ? " (not your team)" : ""}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-sm ml-2">— your team's board</span>
                    )}
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
            <BingoBoard
              tileProgress={progressMap}
              tileSubmissions={submissionsMap}
              onEvent={setEvent}
              onSubmitTile={canSubmit ? (tileId) => {
                setSubmitInitialTileId(tileId);
                setShowSubmitModal(true);
              } : undefined}
            />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="text-5xl">🎯</div>
            {user.isModerator ? (
              <>
                <h2 className="text-xl font-bold text-white">Select a team to view</h2>
                <p className="text-slate-400 max-w-sm">
                  Use the team switcher above to view any team's board.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-white">You're not on a team yet</h2>
                <p className="text-slate-400 max-w-sm">
                  You need to be assigned to a team in the Discord server before you can view the board.
                </p>
              </>
            )}
          </div>
        )}
      </main>

      {showSubmitModal && (
        <SubmissionModal
          initialTileId={submitInitialTileId}
          progressMap={progressMap}
          submissions={teamSubmissions}
          onClose={() => { setShowSubmitModal(false); setSubmitInitialTileId(undefined); }}
          onSuccess={() => { refreshProgress(); refreshSubmissions(); }}
        />
      )}

      {showSubmissionsModal && (
        <TeamSubmissionsModal
          submissions={teamSubmissions}
          onClose={() => setShowSubmissionsModal(false)}
          onSubmit={canSubmit ? () => {
            setSubmitInitialTileId(undefined);
            setShowSubmissionsModal(false);
            setShowSubmitModal(true);
          } : undefined}
        />
      )}
    </div>
  );
}
