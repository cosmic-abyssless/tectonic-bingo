import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Tile } from "@bingo/shared";
import { useBingo, useBoard, usePendingCount, useTeamProgress, useTeamSubmissions } from "../api/queries";
import { useAuth } from "../context/AuthContext";
import { useWebSocketEvent } from "../context/WebSocketContext";
import { ThemeRoot } from "../themes/ThemeRoot";
import { BoardGrid } from "../core/board/BoardGrid";
import { SubmissionModal } from "../core/submissions/SubmissionModal";
import { TeamSubmissionsList } from "../core/submissions/TeamSubmissionsList";
import { Markdown } from "../core/ui/Markdown";
import { displayName, avatarUrl } from "../core/ui/user";
import { CountdownTimer } from "../core/ui/CountdownTimer";

function tileMatchesSearch(tile: Tile, q: string): boolean {
  if (tile.name.toLowerCase().includes(q)) return true;
  for (const task of tile.tasks) {
    if (task.description.toLowerCase().includes(q)) return true;
    for (const item of task.items) if (item.itemName.toLowerCase().includes(q)) return true;
  }
  return false;
}

export function BingoPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const { data: shell, isLoading: shellLoading, error: shellError } = useBingo(slug);
  const { data: boardData } = useBoard(slug);
  const tiles = boardData?.tiles ?? [];

  const [viewingTeamId, setViewingTeamId] = useState<string | null>(null);
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);
  const teamDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shell?.myTeam) setViewingTeamId(shell.myTeam.id);
  }, [shell?.myTeam]);

  useEffect(() => {
    if (!teamDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (teamDropdownRef.current && !teamDropdownRef.current.contains(e.target as Node)) setTeamDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [teamDropdownOpen]);

  const { data: progressData } = useTeamProgress(slug, viewingTeamId ?? undefined);
  const { data: submissionsData } = useTeamSubmissions(slug, viewingTeamId ?? undefined);
  const { data: pendingData } = usePendingCount(slug, !!shell?.isMod);

  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitInitialTileId, setSubmitInitialTileId] = useState<string | undefined>();
  const [showSubmissionsList, setShowSubmissionsList] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [openTileId, setOpenTileId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useWebSocketEvent((event) => {
    if (
      shell?.isMod &&
      event.type === "submission_created" &&
      "Notification" in window &&
      Notification.permission === "granted" &&
      document.visibilityState !== "visible"
    ) {
      new Notification("New bingo submission", { body: "A submission is pending review" });
    }
  });

  if (!user) return null;
  if (shellLoading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400">Loading…</div>;
  if (shellError || !shell) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-red-400">Bingo not found</div>;

  const { bingo, categories, teams, isMod, myTeam } = shell;
  const viewingTeam = teams.find((t) => t.id === viewingTeamId) ?? null;
  const isViewingOtherTeam = isMod && !!viewingTeamId && viewingTeamId !== myTeam?.id;
  const canSubmit = bingo.stage === "live" && !isViewingOtherTeam && !!viewingTeamId;
  const progress = progressData?.tasks ?? [];
  const teamSubmissions = submissionsData?.submissions ?? [];

  const boardRevealed = isMod || bingo.stage === "reveal" || bingo.stage === "live" || bingo.stage === "complete";

  const SUGGESTION_CAP = 8;
  const sq = searchQuery.trim().toLowerCase();
  const allMatchingTiles = sq ? tiles.filter((t) => tileMatchesSearch(t, sq)) : [];
  const matchingTiles = allMatchingTiles.slice(0, SUGGESTION_CAP);
  const showDropdown = searchFocused && sq.length > 0 && matchingTiles.length > 0;

  const openTileFromSearch = (tile: Tile) => {
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
    <ThemeRoot themeKey={bingo.theme}>
      <div className="min-h-screen bg-slate-900 text-white">
        <header className="flex items-center justify-between px-6 py-3 bg-slate-800 border-b border-slate-700 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-slate-400 hover:text-white transition-colors" title="All bingos">
              ←
            </Link>
            <div className="leading-tight">
              <div className="font-bold text-lg tracking-tight">{bingo.name}</div>
              {bingo.endsAt && bingo.stage === "live" && (
                <div className="text-xs text-slate-400 tabular-nums">
                  <CountdownTimer target={new Date(bingo.endsAt).getTime()} /> remaining
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {isMod && teams.length > 0 && (
              <div ref={teamDropdownRef} className="relative">
                <button
                  onClick={() => setTeamDropdownOpen((o) => !o)}
                  className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border cursor-pointer transition-colors bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-500"
                  style={viewingTeam?.color ? { borderColor: viewingTeam.color, color: viewingTeam.color, backgroundColor: `${viewingTeam.color}1a` } : undefined}
                >
                  {viewingTeam?.color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: viewingTeam.color }} />}
                  {viewingTeam?.name ?? "Select team"}
                </button>
                {teamDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl z-50 overflow-hidden min-w-[150px]">
                    {teams.map((team) => (
                      <button
                        key={team.id}
                        onClick={() => {
                          setViewingTeamId(team.id);
                          setTeamDropdownOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors ${
                          viewingTeamId === team.id ? "bg-slate-700 text-white" : "text-slate-200 hover:bg-slate-700"
                        }`}
                      >
                        {team.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: team.color }} />}
                        <span className="truncate">{team.name}</span>
                        {team.id === myTeam?.id && <span className="text-[10px] text-slate-500 ml-auto shrink-0">you</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {!isMod && myTeam && (
              <span
                className="hidden sm:flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border"
                style={myTeam.color ? { borderColor: myTeam.color, color: myTeam.color, backgroundColor: `${myTeam.color}1a` } : { borderColor: "#475569", color: "#94a3b8" }}
              >
                {myTeam.color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: myTeam.color }} />}
                {myTeam.name}
              </span>
            )}

            {bingo.rulesMarkdown && (
              <button
                onClick={() => setShowRules(true)}
                className="text-sm text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 rounded px-3 py-1 transition-colors cursor-pointer"
              >
                Rules
              </button>
            )}
            {isMod && (
              <button
                onClick={() => navigate(`/b/${slug}/admin`)}
                className="text-sm text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 rounded px-3 py-1 transition-colors cursor-pointer"
              >
                Admin
              </button>
            )}
            {isMod && (
              <button
                onClick={() => navigate(`/b/${slug}/mod`)}
                className="relative text-sm text-yellow-400 hover:text-yellow-300 border border-yellow-700 hover:border-yellow-500 rounded px-3 py-1 transition-colors cursor-pointer font-semibold"
              >
                Mod Panel
                {!!pendingData?.count && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 leading-none">
                    {pendingData.count}
                  </span>
                )}
              </button>
            )}
            {viewingTeamId && (
              <button
                onClick={() => setShowSubmissionsList(true)}
                className="text-sm text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 rounded px-3 py-1 transition-colors cursor-pointer"
              >
                Submissions
                {teamSubmissions.length > 0 && (
                  <span className="ml-1.5 text-xs bg-slate-600 text-slate-300 rounded-full px-1.5 py-0.5">{teamSubmissions.length}</span>
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
            <img src={avatarUrl(user)} alt="avatar" className="w-8 h-8 rounded-full border-2 border-indigo-500" />
            <span className="text-sm text-slate-300 hidden sm:inline">{displayName(user)}</span>
            <button onClick={logout} className="text-sm text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 rounded px-3 py-1 transition-colors cursor-pointer">
              Log out
            </button>
          </div>
        </header>

        <main className="px-3 py-4 sm:px-6 sm:py-6 max-w-6xl mx-auto">
          {!boardRevealed ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
              <div className="text-5xl">🎯</div>
              <h2 className="text-xl font-bold text-white capitalize">{bingo.stage} stage</h2>
              <p className="text-slate-400 max-w-sm">The board hasn't been revealed yet — check back once the mods advance this bingo to the reveal stage.</p>
              {bingo.revealScheduledAt && (
                <p className="text-slate-500 text-sm">
                  Scheduled for {new Date(bingo.revealScheduledAt).toLocaleString()}
                </p>
              )}
            </div>
          ) : !viewingTeamId ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
              <div className="text-5xl">🎯</div>
              {isMod ? (
                <>
                  <h2 className="text-xl font-bold text-white">Select a team to view</h2>
                  <p className="text-slate-400 max-w-sm">Use the team dropdown in the header to view any team's board.</p>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-white">You're not on a team yet</h2>
                  <p className="text-slate-400 max-w-sm">You'll be assigned a team during the draft.</p>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="flex justify-between gap-6 flex-wrap">
                <div className="relative h-fit min-w-1/2 flex-1">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
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
                    onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
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
                            i === highlightedIndex ? "bg-indigo-600 text-white" : "text-slate-200 hover:bg-slate-700"
                          }`}
                        >
                          <span className="font-medium truncate">{tile.name}</span>
                        </button>
                      ))}
                      {allMatchingTiles.length > SUGGESTION_CAP && (
                        <p className="px-3 py-2 text-xs text-slate-500 border-t border-slate-700">
                          {allMatchingTiles.length - SUGGESTION_CAP} more — keep typing to narrow down
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {viewingTeam && (
                  <div
                    className="flex items-center justify-between gap-3 h-[38px] mb-5 px-2 py-1 rounded-lg border"
                    style={viewingTeam.color ? { borderColor: viewingTeam.color, backgroundColor: `${viewingTeam.color}1a` } : { borderColor: "#475569" }}
                  >
                    <div className="flex items-center gap-3">
                      {viewingTeam.color && <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: viewingTeam.color }} />}
                      <div className="flex gap-2">
                        <span className="font-bold leading-5" style={viewingTeam.color ? { color: viewingTeam.color } : undefined}>
                          {viewingTeam.name}
                        </span>
                        <span className="text-slate-400 text-sm">{isViewingOtherTeam ? "— Viewing as moderator" : "— Your team's board"}</span>
                      </div>
                    </div>
                    {progressData && (
                      <span className="text-xl font-bold text-yellow-400">{progressData.totalPoints.toLocaleString()} pts</span>
                    )}
                  </div>
                )}
              </div>

              <BoardGrid
                bingo={bingo}
                tiles={tiles}
                categories={categories}
                progress={progress}
                teamSubmissions={teamSubmissions}
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
          )}
        </main>

        {showSubmitModal && slug && (
          <SubmissionModal
            slug={slug}
            bingo={bingo}
            tiles={tiles}
            categories={categories}
            progress={progress}
            teamSubmissions={teamSubmissions}
            initialTileId={submitInitialTileId}
            onClose={() => {
              setShowSubmitModal(false);
              setSubmitInitialTileId(undefined);
            }}
            onSuccess={() => {}}
          />
        )}

        {showRules && bingo.rulesMarkdown && (
          <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4" onClick={() => setShowRules(false)}>
            <div className="bg-slate-800 rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-bold text-lg">Rules</h2>
                <button onClick={() => setShowRules(false)} className="text-slate-400 hover:text-white text-lg leading-none p-1 cursor-pointer">
                  ✕
                </button>
              </div>
              <Markdown>{bingo.rulesMarkdown}</Markdown>
            </div>
          </div>
        )}

        {showSubmissionsList && (
          <TeamSubmissionsList
            tiles={tiles}
            submissions={teamSubmissions}
            onClose={() => setShowSubmissionsList(false)}
            onSubmit={
              canSubmit
                ? () => {
                    setSubmitInitialTileId(undefined);
                    setShowSubmissionsList(false);
                    setShowSubmitModal(true);
                  }
                : undefined
            }
          />
        )}
      </div>
    </ThemeRoot>
  );
}
