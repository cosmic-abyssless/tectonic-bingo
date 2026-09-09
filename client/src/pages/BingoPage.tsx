import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { STAGE_LABEL, type Bingo, type Team, type Tile } from "@bingo/shared";
import { useBingo, useBoard, useDraftState, usePendingCount, useTeamProgress, useTeamSubmissions } from "../api/queries";
import { useAuth } from "../context/AuthContext";
import { useWebSocketEvent } from "../context/WebSocketContext";
import { ThemeRoot } from "../themes/ThemeRoot";
import { BoardGrid } from "../core/board/BoardGrid";
import { SubmissionModal } from "../core/submissions/SubmissionModal";
import { TeamSubmissionsList } from "../core/submissions/TeamSubmissionsList";
import { tileMatchesSearch } from "../core/board/requirementTree";
import { SignupForm } from "../core/signup/SignupForm";
import { TeamRoster } from "../core/draft/TeamRoster";
import { TeamInfoDialog } from "../core/teams/TeamInfoDialog";
import { Markdown } from "../core/ui/Markdown";
import { AppHeader } from "../core/ui/AppHeader";
import { Button } from "../core/ui/Button";
import { Badge, EmptyState, Notice } from "../core/ui/Card";
import { Dialog, DialogHeader } from "../core/ui/Dialog";
import { Input } from "../core/ui/Field";
import { Menu, MenuItem, MenuTrigger } from "../core/ui/Menu";
import { MilestoneCountdown, StageStepper } from "../core/ui/StageStepper";
import { CountdownTimer } from "../core/ui/CountdownTimer";
import { toast } from "../core/ui/Toast";
import { useHasPassed } from "../core/ui/useHasPassed";
import { CheckIcon, ChevronDownIcon, ClockIcon, GridIcon, SearchIcon, UsersIcon, XIcon } from "../core/ui/icons";

const SUGGESTION_CAP = 8;

export function BingoPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: shell, isLoading: shellLoading, error: shellError } = useBingo(slug);
  const { data: boardData } = useBoard(slug);
  const tiles = boardData?.tiles ?? [];

  const [viewingTeamId, setViewingTeamId] = useState<string | null>(null);
  useEffect(() => {
    if (shell?.myTeam) setViewingTeamId(shell.myTeam.id);
  }, [shell?.myTeam]);

  const { data: progressData } = useTeamProgress(slug, viewingTeamId ?? undefined);
  const { data: submissionsData } = useTeamSubmissions(slug, viewingTeamId ?? undefined);
  const { data: pendingData } = usePendingCount(slug, !!shell?.isMod);

  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitInitialTileId, setSubmitInitialTileId] = useState<string | undefined>();
  const [showSubmissionsList, setShowSubmissionsList] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showTeamInfo, setShowTeamInfo] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [openTileId, setOpenTileId] = useState<string | null>(null);
  const hasStarted = useHasPassed(shell?.bingo.startsAt);

  useWebSocketEvent((event) => {
    if (!shell) return;
    if (event.bingoId !== shell.bingo.id) return;
    if (event.type === "stage_changed") {
      toast({ title: "Stage changed", description: STAGE_LABEL[event.payload.stage] });
    }
    if (
      shell.isMod &&
      event.type === "submission_created" &&
      "Notification" in window &&
      Notification.permission === "granted" &&
      document.visibilityState !== "visible"
    ) {
      new Notification("New bingo submission", { body: "A submission is pending review" });
    }
  });

  if (!user) return null;
  if (shellLoading) return <div className="flex min-h-screen items-center justify-center text-fg-muted">Loading…</div>;
  if (shellError || !shell) return <div className="flex min-h-screen items-center justify-center text-danger">Bingo not found</div>;

  const { bingo, categories, teams, isMod, myTeam } = shell;
  const viewingTeam = teams.find((t) => t.id === viewingTeamId) ?? null;
  const isViewingOtherTeam = isMod && !!viewingTeamId && viewingTeamId !== myTeam?.id;
  // Mirrors the server's submission gate: live stage and past startsAt.
  const canSubmit = bingo.stage === "live" && hasStarted && !isViewingOtherTeam && !!viewingTeamId;
  const nodeStates = progressData?.nodeStates ?? [];
  const teamSubmissions = submissionsData?.submissions ?? [];

  const openSubmit = (tileId?: string) => {
    setSubmitInitialTileId(tileId);
    setShowSubmissionsList(false);
    setShowSubmitModal(true);
  };

  const teamBadgeStyle = (team: Team) => (team.color ? { borderColor: `${team.color}99`, color: team.color } : undefined);

  return (
    <ThemeRoot themeKey={bingo.theme}>
      <div className="min-h-screen bg-bg text-fg">
        <AppHeader
          back={{ to: "/", label: "All bingos" }}
          title={bingo.name}
          subtitle={
            bingo.stage === "live" && bingo.endsAt ? (
              <>
                <CountdownTimer target={new Date(bingo.endsAt).getTime()} /> remaining
              </>
            ) : (
              STAGE_LABEL[bingo.stage]
            )
          }
        >
          {isMod && teams.length > 0 && (
            <MenuTrigger>
              <Button size="sm" style={viewingTeam ? teamBadgeStyle(viewingTeam) : undefined}>
                {viewingTeam?.color && <span className="size-2 rounded-full" style={{ backgroundColor: viewingTeam.color }} />}
                {viewingTeam?.name ?? "Select team"}
                <ChevronDownIcon className="text-fg-subtle" />
              </Button>
              <Menu onAction={(key) => setViewingTeamId(String(key))}>
                {teams.map((team) => (
                  <MenuItem key={team.id} id={team.id}>
                    {team.color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: team.color }} />}
                    <span className="truncate">{team.name}</span>
                    {team.id === myTeam?.id && <span className="ml-auto text-[10px] text-fg-subtle">you</span>}
                  </MenuItem>
                ))}
              </Menu>
            </MenuTrigger>
          )}
          {!isMod && myTeam && (
            // Twin of the mod team picker above so the header reads the same for both roles.
            <Button size="sm" style={teamBadgeStyle(myTeam)} onPress={() => setShowTeamInfo(true)}>
              {myTeam.color && <span className="size-2 rounded-full" style={{ backgroundColor: myTeam.color }} />}
              {myTeam.name}
              <UsersIcon className="text-fg-subtle" />
            </Button>
          )}
          {bingo.rulesMarkdown && (
            <Button size="sm" variant="ghost" onPress={() => setShowRules(true)}>
              Rules
            </Button>
          )}
          {(bingo.stage === "complete" || isMod) && (
            <Button size="sm" variant="ghost" onPress={() => navigate(`/b/${slug}/stats`)}>
              Stats
            </Button>
          )}
          {isMod && (
            <Button size="sm" onPress={() => navigate(`/b/${slug}/mod`)}>
              Mod panel
              {!!pendingData?.count && (
                <Badge tone="warn" className="num -my-1">
                  {pendingData.count}
                </Badge>
              )}
            </Button>
          )}
          {viewingTeamId && (
            <Button size="sm" onPress={() => setShowSubmissionsList(true)}>
              Submissions
              {teamSubmissions.length > 0 && <span className="num text-fg-subtle">{teamSubmissions.length}</span>}
            </Button>
          )}
          {canSubmit && (
            <Button size="sm" variant="primary" onPress={() => openSubmit()}>
              Submit
            </Button>
          )}
        </AppHeader>

        <main className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
          {/* The full stage list only means something to whoever drives it (#14). */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            {isMod && <StageStepper stage={bingo.stage} />}
            <MilestoneCountdown bingo={bingo} />
          </div>

          {bingo.stage === "signup" ? (
            <SignupForm slug={slug!} />
          ) : bingo.stage === "planning" || bingo.stage === "captains" ? (
            <EmptyState icon={<ClockIcon size={20} />} title={bingo.stage === "planning" ? "Signups haven't opened yet" : "Signups are closed"}>
              {bingo.stage === "planning" ? "Check back once the mods open signups." : "Mods are picking team captains. The draft comes next."}
            </EmptyState>
          ) : bingo.stage === "draft" ? (
            <DraftStageView slug={slug!} bingo={bingo} onOpenDraft={() => navigate(`/b/${slug}/draft`)} />
          ) : !viewingTeamId ? (
            isMod ? (
              <EmptyState icon={<GridIcon size={20} />} title="Select a team to view">
                Use the team menu in the header to open any team's board.
              </EmptyState>
            ) : (
              <EmptyState icon={<UsersIcon size={20} />} title="You're not on a team">
                You weren't drafted for this bingo. You can still follow along on the stats page once it's live.
              </EmptyState>
            )
          ) : (
            <>
              <div className="mb-4 flex flex-wrap justify-between gap-4">
                <TileSearch tiles={tiles} query={searchQuery} onQueryChange={setSearchQuery} onOpenTile={(tile) => setOpenTileId(tile.id)} />
                {viewingTeam && (
                  <div
                    className="flex h-10 items-center justify-between gap-4 rounded-md border border-line bg-surface px-3"
                    style={viewingTeam.color ? { borderColor: `${viewingTeam.color}99` } : undefined}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      {viewingTeam.color && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: viewingTeam.color }} />}
                      <span className="font-semibold text-fg">{viewingTeam.name}</span>
                      <span className="text-fg-subtle">{isViewingOtherTeam ? "Viewing as moderator" : "Your team's board"}</span>
                    </div>
                    {progressData && (
                      <span className="num text-sm font-semibold text-fg">
                        {progressData.totalPoints.toLocaleString()} <span className="font-normal text-fg-subtle">pts</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              <BoardGrid
                bingo={bingo}
                tiles={tiles}
                categories={categories}
                nodeStates={nodeStates}
                teamSubmissions={teamSubmissions}
                searchQuery={searchQuery}
                openTileId={openTileId}
                onOpenTileHandled={() => setOpenTileId(null)}
                onSubmitTile={canSubmit ? openSubmit : undefined}
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
            nodeStates={nodeStates}
            teamSubmissions={teamSubmissions}
            initialTileId={submitInitialTileId}
            onClose={() => {
              setShowSubmitModal(false);
              setSubmitInitialTileId(undefined);
            }}
            onSuccess={() => {}}
          />
        )}

        <Dialog isOpen={showRules && !!bingo.rulesMarkdown} onClose={() => setShowRules(false)} size="lg">
          <DialogHeader title="Rules" onClose={() => setShowRules(false)} />
          <div className="px-5 pb-5">
            <Markdown>{bingo.rulesMarkdown ?? ""}</Markdown>
          </div>
        </Dialog>

        <TeamInfoDialog
          slug={slug!}
          team={showTeamInfo ? (teams.find((t) => t.id === myTeam?.id) ?? null) : null}
          isCaptain={myTeam?.captainUserId === user.id}
          onClose={() => setShowTeamInfo(false)}
        />

        <TeamSubmissionsList
          isOpen={showSubmissionsList}
          tiles={tiles}
          submissions={teamSubmissions}
          onClose={() => setShowSubmissionsList(false)}
          onSubmit={canSubmit ? () => openSubmit() : undefined}
        />
      </div>
    </ThemeRoot>
  );
}

/**
 * Draft stage: before it starts, a countdown; while it runs, a pointer into
 * the draft room; once done, the team reveal. The draft endpoint is 403 for
 * people who didn't sign up, so the error case just shows the generic copy.
 */
function DraftStageView({ slug, bingo, onOpenDraft }: { slug: string; bingo: Bingo; onOpenDraft: () => void }) {
  const { data: draft, isLoading } = useDraftState(slug);
  if (isLoading) return null;

  // `draft` is only present for people allowed in the room (mods, captains,
  // signed-up players), so its presence doubles as the gate for the button.
  const openDraft = draft && (
    <Button variant="primary" onPress={onOpenDraft}>
      Open draft room
    </Button>
  );

  if (!draft || !draft.draftStarted) {
    return (
      <EmptyState icon={<UsersIcon size={20} />} title="The draft hasn't started yet" action={openDraft}>
        <MilestoneCountdown bingo={bingo} className="justify-center" />
      </EmptyState>
    );
  }

  if (draft.currentPick) {
    return (
      <EmptyState icon={<UsersIcon size={20} />} title="Draft in progress" action={openDraft}>
        <span className="num">
          Round {draft.currentPick.round}, pick {draft.currentPick.pickNumber}
        </span>
        . Teams are revealed here once the draft is complete.
      </EmptyState>
    );
  }

  return (
    <section className="space-y-4">
      <Notice tone="ok" icon={<CheckIcon />}>
        Draft complete. The board is revealed next.
      </Notice>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {draft.teams.map((team) => (
          <TeamRoster key={team.id} team={team} picks={draft.picks.filter((p) => p.teamId === team.id)} />
        ))}
      </div>
    </section>
  );
}

function TileSearch({ tiles, query, onQueryChange, onOpenTile }: { tiles: Tile[]; query: string; onQueryChange: (q: string) => void; onOpenTile: (tile: Tile) => void }) {
  const [focused, setFocused] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const sq = query.trim().toLowerCase();
  const allMatching = sq ? tiles.filter((t) => tileMatchesSearch(t, sq)) : [];
  const matching = allMatching.slice(0, SUGGESTION_CAP);
  const showDropdown = focused && sq.length > 0 && matching.length > 0;

  const pick = (tile: Tile) => {
    onOpenTile(tile);
    onQueryChange("");
    setFocused(false);
    setHighlighted(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, matching.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const tile = matching[highlighted];
      if (tile) pick(tile);
    } else if (e.key === "Escape") {
      setFocused(false);
      setHighlighted(0);
    }
  };

  return (
    <div className="relative h-fit min-w-1/2 flex-1">
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
      <Input
        ref={inputRef}
        type="text"
        placeholder="Search tiles, items…"
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setHighlighted(0);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={handleKeyDown}
        className="pl-9 pr-10"
      />
      {query && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onQueryChange("");
            setHighlighted(0);
            inputRef.current?.focus();
          }}
          className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <XIcon />
        </button>
      )}
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-line bg-surface-raised shadow-pop">
          {matching.map((tile, i) => (
            <button
              key={tile.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(tile)}
              className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors ${i === highlighted ? "bg-surface-hover text-fg" : "text-fg-muted hover:bg-surface-hover"}`}
            >
              <span className="truncate font-medium">{tile.name}</span>
            </button>
          ))}
          {allMatching.length > SUGGESTION_CAP && (
            <p className="border-t border-line px-3 py-2 text-xs text-fg-subtle">{allMatching.length - SUGGESTION_CAP} more — keep typing to narrow down</p>
          )}
        </div>
      )}
    </div>
  );
}
