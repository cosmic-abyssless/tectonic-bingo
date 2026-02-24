import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  avatarUrl,
  displayName,
  type BingoEvent,
  type BoardTile,
  type TeamInfo,
  type TeamProgressResponse,
  type TileProgress,
  type SubmissionSummary,
} from "../types";
import { BingoBoard } from "../components/BingoBoard";
import { SubmissionModal } from "../components/SubmissionModal";
import { TeamSubmissionsModal } from "../components/TeamSubmissionsModal";
import { RulesModal } from "../components/RulesModal";
import { useWebSocket } from "../hooks/useWebSocket";
import { formatDuration } from "../utils";

const TEAM_COLORS: Record<
  string,
  { bg: string; border: string; text: string; dot: string }
> = {
  "Red Team": {
    bg: "bg-red-950/60",
    border: "border-red-500",
    text: "text-red-400",
    dot: "bg-red-500",
  },
  "Blue Team": {
    bg: "bg-blue-950/60",
    border: "border-blue-500",
    text: "text-blue-400",
    dot: "bg-blue-500",
  },
  "Green Team": {
    bg: "bg-green-950/60",
    border: "border-green-500",
    text: "text-green-400",
    dot: "bg-green-500",
  },
  "Yellow Team": {
    bg: "bg-yellow-950/60",
    border: "border-yellow-500",
    text: "text-yellow-400",
    dot: "bg-yellow-500",
  },
  "Orange Team": {
    bg: "bg-orange-950/60",
    border: "border-orange-500",
    text: "text-orange-400",
    dot: "bg-orange-500",
  },
  "Pink Team": {
    bg: "bg-pink-950/60",
    border: "border-pink-500",
    text: "text-pink-400",
    dot: "bg-pink-500",
  },
};

function EventCountdown({ event }: { event: BingoEvent }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, new Date(event.endsAt).getTime() - Date.now()),
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
      <div className="font-bold text-lg tracking-tight">{event.name}</div>
      <div className="text-xs text-slate-400 tabular-nums">
        {formatDuration(remaining)} remaining
      </div>
    </div>
  );
}

export function Home() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [teamProgress, setTeamProgress] = useState<TeamProgressResponse | null>(
    null,
  );
  const [teamSubmissions, setTeamSubmissions] = useState<SubmissionSummary[]>(
    [],
  );
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitInitialTileId, setSubmitInitialTileId] = useState<
    string | undefined
  >();
  const [showSubmissionsModal, setShowSubmissionsModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [event, setEvent] = useState<BingoEvent | null>(null);
  const [allTeams, setAllTeams] = useState<TeamInfo[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  // Which team's board is currently displayed
  const [viewingTeam, setViewingTeam] = useState<string | null>(
    user?.team ?? null,
  );

  // Search
  const [boardTiles, setBoardTiles] = useState<BoardTile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [openTileId, setOpenTileId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Team dropdown (mod only)
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);
  const teamDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!teamDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        teamDropdownRef.current &&
        !teamDropdownRef.current.contains(e.target as Node)
      ) {
        setTeamDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [teamDropdownOpen]);

  const isViewingOtherTeam =
    !!user?.isModerator && !!viewingTeam && viewingTeam !== user?.team;

  const refreshPendingCount = useCallback(() => {
    if (!user?.isModerator) return;
    fetch("/api/mod/pending-count")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setPendingCount(data.count);
      })
      .catch(() => {});
  }, [user?.isModerator]);

  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  // Fetch team list for mod switcher
  useEffect(() => {
    if (!user?.isModerator) return;
    fetch("/api/teams")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setAllTeams(data.teams);
      })
      .catch(() => {});
  }, [user?.isModerator]);

  const refreshProgress = useCallback(() => {
    if (!viewingTeam) return;
    const search = isViewingOtherTeam
      ? `?viewAsTeam=${encodeURIComponent(viewingTeam)}`
      : "";
    fetch(`/api/team/progress${search}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setTeamProgress(data);
      })
      .catch(() => {});
  }, [viewingTeam, isViewingOtherTeam]);

  const refreshSubmissions = useCallback(() => {
    if (!viewingTeam) return;
    const search = isViewingOtherTeam
      ? `?viewAsTeam=${encodeURIComponent(viewingTeam)}`
      : "";
    fetch(`/api/team/submissions${search}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setTeamSubmissions(data.submissions);
      })
      .catch(() => {});
  }, [viewingTeam, isViewingOtherTeam]);

  useEffect(() => {
    setTeamProgress(null);
    setTeamSubmissions([]);
    refreshProgress();
    refreshSubmissions();
  }, [refreshProgress, refreshSubmissions]);

  useWebSocket(
    useCallback(
      (msg) => {
        if (
          msg.type === "submission_created" ||
          msg.type === "submission_reviewed"
        ) {
          if (msg.teamName === viewingTeam) {
            refreshProgress();
            refreshSubmissions();
          }
          refreshPendingCount();
        }
        if (
          msg.type === "submission_created" &&
          user?.isModerator &&
          "Notification" in window &&
          Notification.permission === "granted" &&
          document.visibilityState !== "visible"
        ) {
          new Notification("New bingo submission", {
            body: msg.teamName
              ? `${msg.teamName} submitted for review`
              : "A new submission is pending review",
          });
        }
      },
      [
        viewingTeam,
        refreshProgress,
        refreshSubmissions,
        refreshPendingCount,
        user?.isModerator,
      ],
    ),
  );

  // Derived before early return so hooks below can reference it
  const canSubmit = !isViewingOtherTeam && !!user?.team;

  // Open submit modal when an image file is dragged over the page
  useEffect(() => {
    if (!canSubmit) return;
    const handler = (e: DragEvent) => {
      if (showSubmitModal) return;
      const items = e.dataTransfer?.items;
      if (!items) return;
      const hasImage = Array.from(items).some(
        (item) => item.kind === "file" && item.type.startsWith("image/"),
      );
      if (hasImage) {
        setSubmitInitialTileId(undefined);
        setShowSubmitModal(true);
      }
    };
    window.addEventListener("dragenter", handler);
    return () => window.removeEventListener("dragenter", handler);
  }, [canSubmit, showSubmitModal]);

  if (!user) return null;

  const teamStyle = viewingTeam ? TEAM_COLORS[viewingTeam] : null;
  const progressMap = new Map<string, TileProgress>(
    teamProgress?.tileProgress.map((p) => [p.tileId, p]) ?? [],
  );

  const submissionsMap = new Map<string, SubmissionSummary[]>();
  for (const sub of teamSubmissions) {
    const list = submissionsMap.get(sub.tileId) ?? [];
    list.push(sub);
    submissionsMap.set(sub.tileId, list);
  }

  // Search
  const SUGGESTION_CAP = 8;
  const sq = searchQuery.trim().toLowerCase();
  const tileMatchesSearch = (tile: BoardTile) => {
    if (tile.name.toLowerCase().includes(sq)) return true;
    for (const side of Object.values(tile.sides)) {
      if (!side) continue;
      if (side.description.toLowerCase().includes(sq)) return true;
      for (const item of side.items) {
        if (item.itemName.toLowerCase().includes(sq)) return true;
      }
    }
    return false;
  };
  const allMatchingTiles = sq ? boardTiles.filter(tileMatchesSearch) : [];
  const matchingTiles = allMatchingTiles.slice(0, SUGGESTION_CAP);
  const totalMatches = allMatchingTiles.length;
  const showDropdown =
    searchFocused && sq.length > 0 && matchingTiles.length > 0;

  const openTileFromSearch = (tile: BoardTile) => {
    setOpenTileId(tile.id);
    setSearchQuery("");
    setSearchFocused(false);
    setHighlightedIndex(0);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, matchingTiles.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const tile = matchingTiles[highlightedIndex];
      if (tile) openTileFromSearch(tile);
    } else if (e.key === "Escape") {
      setSearchFocused(false);
      setHighlightedIndex(0);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-3 bg-slate-800 border-b border-slate-700">
        {event ? (
          <EventCountdown event={event} />
        ) : (
          <span className="font-bold text-lg tracking-tight">
            Tectonic Bingo
          </span>
        )}
        <div className="flex items-center gap-3">
          {/* Mod team switcher dropdown */}
          {user.isModerator &&
            allTeams.length > 0 &&
            (() => {
              const s = viewingTeam ? TEAM_COLORS[viewingTeam] : null;
              return (
                <div ref={teamDropdownRef} className="relative hidden sm:block">
                  <button
                    onClick={() => setTeamDropdownOpen((o) => !o)}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border cursor-pointer transition-colors ${
                      s
                        ? `${s.bg} ${s.border} ${s.text}`
                        : "bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500"
                    }`}
                  >
                    {s && <span className={`w-2 h-2 rounded-full ${s.dot}`} />}
                    {viewingTeam ?? "Select team"}
                    <svg
                      className="w-3 h-3 opacity-70"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                  {teamDropdownOpen && (
                    <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl z-50 overflow-hidden min-w-[150px]">
                      {allTeams.map((team) => {
                        const ts = TEAM_COLORS[team.name];
                        const isActive = viewingTeam === team.name;
                        return (
                          <button
                            key={team.id}
                            onClick={() => {
                              setViewingTeam(team.name);
                              setTeamDropdownOpen(false);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors ${
                              isActive
                                ? "bg-slate-700 text-white"
                                : "text-slate-200 hover:bg-slate-700"
                            }`}
                          >
                            {ts && (
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${ts.dot}`}
                              />
                            )}
                            <span className="truncate">{team.name}</span>
                            {team.name === user.team && (
                              <span className="text-[10px] text-slate-500 ml-auto shrink-0">
                                you
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          {/* Non-mod team badge */}
          {!user.isModerator &&
            user.team &&
            (() => {
              const s = TEAM_COLORS[user.team];
              return s ? (
                <span
                  className={`hidden sm:flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${s.bg} ${s.border} ${s.text}`}
                >
                  <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                  {user.team}
                </span>
              ) : null;
            })()}
          <button
            onClick={() => setShowRulesModal(true)}
            className="text-sm text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 rounded px-3 py-1 transition-colors cursor-pointer"
          >
            Rules
          </button>
          {user.isModerator && (
            <button
              onClick={() => navigate("/mod")}
              className="relative text-sm text-yellow-400 hover:text-yellow-300 border border-yellow-700 hover:border-yellow-500 rounded px-3 py-1 transition-colors cursor-pointer font-semibold"
            >
              Mod Panel
              {pendingCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 leading-none">
                  {pendingCount}
                </span>
              )}
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
              onClick={() => {
                setSubmitInitialTileId(undefined);
                setShowSubmitModal(true);
              }}
              className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded px-3 py-1 transition-colors cursor-pointer"
            >
              Submit
            </button>
          )}
          <img
            src={avatarUrl(user)}
            alt="avatar"
            className="w-8 h-8 rounded-full border-2 border-indigo-500"
          />
          <span className="text-sm text-slate-300">{displayName(user)}</span>
          <button
            onClick={logout}
            className="text-sm text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 rounded px-3 py-1 transition-colors cursor-pointer"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="px-3 py-4 sm:px-6 sm:py-6 max-w-6xl mx-auto">
        {viewingTeam ? (
          <>
            {/* Team banner */}
            <div className="flex justify-between gap-6">
              <div className="relative h-fit min-w-1/2">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"
                  />
                </svg>
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search tiles, items…"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setHighlightedIndex(0);
                  }}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => {
                    setTimeout(() => setSearchFocused(false), 150);
                  }}
                  onKeyDown={handleSearchKeyDown}
                  className="w-full bg-slate-800 border border-slate-600 text-white placeholder-slate-500 rounded-lg pl-9 pr-8 py-2 h-[38px] text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setHighlightedIndex(0);
                      searchRef.current?.focus();
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                  >
                    ✕
                  </button>
                )}
                {showDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl z-30 overflow-hidden">
                    {matchingTiles.map((tile, i) => (
                      <button
                        key={tile.id}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => openTileFromSearch(tile)}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm transition-colors cursor-pointer ${
                          i === highlightedIndex
                            ? "bg-indigo-600 text-white"
                            : "text-slate-200 hover:bg-slate-700"
                        }`}
                      >
                        <span className="font-medium truncate">
                          {tile.name}
                        </span>
                        <span
                          className={`text-xs capitalize shrink-0 ${
                            i === highlightedIndex
                              ? "text-indigo-200"
                              : "text-slate-500"
                          }`}
                        >
                          {tile.badgeCategory.replace("_", " ")}
                        </span>
                      </button>
                    ))}
                    {totalMatches > SUGGESTION_CAP && (
                      <p className="px-3 py-2 text-xs text-slate-500 border-t border-slate-700">
                        {totalMatches - SUGGESTION_CAP} more match
                        {totalMatches - SUGGESTION_CAP !== 1 ? "es" : ""} — keep
                        typing to narrow down
                      </p>
                    )}
                  </div>
                )}
              </div>
              {teamStyle && (
                <div
                  className={`flex items-center justify-between gap-3 h-[38px] mb-5 px-2 py-1 rounded-lg border ${teamStyle.bg} ${teamStyle.border}`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-3 h-3 rounded-full flex-shrink-0 ${teamStyle.dot}`}
                    />
                    <div className="flex gap-2">
                      <span className={`font-bold leading-5 ${teamStyle.text}`}>
                        {viewingTeam}
                      </span>
                      {isViewingOtherTeam ? (
                        <span className="text-slate-400 text-sm">
                          — Viewing as moderator
                        </span>
                      ) : (
                        <span className="text-slate-400 text-sm">
                          — Your team's board
                        </span>
                      )}
                    </div>
                  </div>
                  {teamProgress && (
                    <div className="text-right flex-shrink-0">
                      <span className={`text-xl font-bold ${teamStyle.text}`}>
                        {teamProgress.totalPoints.toLocaleString()} pts
                      </span>
                      {(teamProgress.lineBonus > 0 ||
                        teamProgress.adjustments !== 0) && (
                        <div className="text-xs text-slate-400 mt-0.5">
                          {teamProgress.tilePoints} tile
                          {teamProgress.lineBonus > 0 &&
                            ` + ${teamProgress.lineBonus} lines`}
                          {teamProgress.adjustments !== 0 &&
                            ` ${teamProgress.adjustments > 0 ? "+" : ""}${teamProgress.adjustments} adj`}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <BingoBoard
              tileProgress={progressMap}
              tileSubmissions={submissionsMap}
              onEvent={setEvent}
              onBoardLoaded={setBoardTiles}
              searchQuery={searchQuery}
              openTileId={openTileId}
              onOpenTileHandled={() => setOpenTileId(null)}
              onSubmitTile={
                canSubmit
                  ? (tileId) => {
                      setSubmitInitialTileId(tileId);
                      setShowSubmitModal(true);
                    }
                  : undefined
              }
            />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="text-5xl">🎯</div>
            {user.isModerator ? (
              <>
                <h2 className="text-xl font-bold text-white">
                  Select a team to view
                </h2>
                <p className="text-slate-400 max-w-sm">
                  Use the team dropdown in the header to view any team's board.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-white">
                  You're not on a team yet
                </h2>
                <p className="text-slate-400 max-w-sm">
                  You need to be assigned to a team in the Discord server before
                  you can view the board.
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
          onClose={() => {
            setShowSubmitModal(false);
            setSubmitInitialTileId(undefined);
          }}
          onSuccess={() => {
            refreshProgress();
            refreshSubmissions();
          }}
        />
      )}

      {showRulesModal && <RulesModal onClose={() => setShowRulesModal(false)} />}

      {showSubmissionsModal && (
        <TeamSubmissionsModal
          submissions={teamSubmissions}
          onClose={() => setShowSubmissionsModal(false)}
          onSubmit={
            canSubmit
              ? () => {
                  setSubmitInitialTileId(undefined);
                  setShowSubmissionsModal(false);
                  setShowSubmitModal(true);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
