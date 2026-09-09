import { useParams } from "react-router-dom";
import type { Bingo } from "@bingo/shared";
import { BingoPageProvider, useBingoPage, useBoardModel, useTileModel, type BingoPageModel, type TeamModel, type TileSearchModel } from "../headless";
import { useBingoPageRaw } from "../headless/BingoPageProvider";
import { ThemeRoot } from "../themes/ThemeRoot";
import { BoardGrid } from "../core/board/BoardGrid";
import { TileModal } from "../core/board/TileModal";
import { SubmissionModal } from "../core/submissions/SubmissionModal";
import { TeamSubmissionsList } from "../core/submissions/TeamSubmissionsList";
import { SignupForm } from "../core/signup/SignupForm";
import { TeamRoster } from "../core/draft/TeamRoster";
import { Markdown } from "../core/ui/Markdown";
import { AppHeader } from "../core/ui/AppHeader";
import { Button } from "../core/ui/Button";
import { Badge, EmptyState } from "../core/ui/Card";
import { Dialog, DialogHeader } from "../core/ui/Dialog";
import { Input } from "../core/ui/Field";
import { Menu, MenuItem, MenuTrigger } from "../core/ui/Menu";
import { MilestoneCountdown, StageStepper } from "../core/ui/StageStepper";
import { CountdownTimer } from "../core/ui/CountdownTimer";
import { ChevronDownIcon, ClockIcon, GridIcon, SearchIcon, UsersIcon, XIcon } from "../core/ui/icons";

export function BingoPage() {
  const { slug } = useParams<{ slug: string }>();
  return (
    <BingoPageProvider
      slug={slug!}
      renderLoading={() => <div className="flex min-h-screen items-center justify-center text-fg-muted">Loading…</div>}
      renderError={(message) => <div className="flex min-h-screen items-center justify-center text-danger">{message}</div>}
    >
      <BingoPageContent />
    </BingoPageProvider>
  );
}

function teamBadgeStyle(team: TeamModel) {
  return team.color ? { borderColor: `${team.color}99`, color: team.color } : undefined;
}

function BingoPageContent() {
  const page = useBingoPage();
  const board = useBoardModel();
  const raw = useBingoPageRaw();
  const modalTile = useTileModel(page.openTile.id);

  return (
    <ThemeRoot themeKey={page.themeKey}>
      <div className="min-h-screen bg-bg text-fg">
        <AppHeader
          back={{ to: "/", label: "All bingos" }}
          title={page.bingo.name}
          subtitle={
            page.showEndCountdown && page.bingo.endsAt ? (
              <>
                <CountdownTimer target={page.bingo.endsAt} /> remaining
              </>
            ) : (
              page.bingo.stageLabel
            )
          }
        >
          {page.isMod && page.teams.length > 0 && (
            <MenuTrigger>
              <Button size="sm" style={page.viewing.team ? teamBadgeStyle(page.viewing.team) : undefined}>
                {page.viewing.team?.color && <span className="size-2 rounded-full" style={{ backgroundColor: page.viewing.team.color }} />}
                {page.viewing.team?.name ?? "Select team"}
                <ChevronDownIcon className="text-fg-subtle" />
              </Button>
              <Menu onAction={(key) => page.teamSelector.select(String(key))}>
                {page.teams.map((team) => (
                  <MenuItem key={team.id} id={team.id}>
                    {team.color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: team.color }} />}
                    <span className="truncate">{team.name}</span>
                    {team.isMine && <span className="ml-auto text-[10px] text-fg-subtle">you</span>}
                  </MenuItem>
                ))}
              </Menu>
            </MenuTrigger>
          )}
          {!page.isMod && page.myTeam && (
            <Badge className="hidden sm:inline-flex" style={teamBadgeStyle(page.myTeam)}>
              {page.myTeam.color && <span className="size-2 rounded-full" style={{ backgroundColor: page.myTeam.color }} />}
              {page.myTeam.name}
            </Badge>
          )}
          {page.bingo.rulesMarkdown && (
            <Button size="sm" variant="ghost" onPress={page.rules.show}>
              Rules
            </Button>
          )}
          {(page.boardRevealed || page.isMod) && (
            <Button size="sm" variant="ghost" onPress={page.actions.goToStats}>
              Stats
            </Button>
          )}
          {page.isMod && (
            <Button size="sm" onPress={page.actions.goToMod}>
              Mod panel
              {page.pendingCount > 0 && (
                <Badge tone="warn" className="num -my-1">
                  {page.pendingCount}
                </Badge>
              )}
            </Button>
          )}
          {page.teamSelector.selectedId && (
            <Button size="sm" onPress={page.drawer.show}>
              Submissions
              {page.viewing.submissionCount > 0 && <span className="num text-fg-subtle">{page.viewing.submissionCount}</span>}
            </Button>
          )}
          {page.canSubmit && (
            <Button size="sm" variant="primary" onPress={() => page.submit.show()}>
              Submit
            </Button>
          )}
        </AppHeader>

        <main className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <StageStepper stage={page.bingo.stage} />
            <MilestoneCountdown bingo={raw.bingo} />
          </div>

          {page.stageView === "signup" ? (
            <SignupForm slug={page.slug} />
          ) : page.stageView === "planning" || page.stageView === "captains" ? (
            <EmptyState icon={<ClockIcon size={20} />} title={page.stageView === "planning" ? "Signups haven't opened yet" : "Signups are closed"}>
              {page.stageView === "planning" ? "Check back once the mods open signups." : "Mods are picking team captains. The draft comes next."}
            </EmptyState>
          ) : page.stageView === "draft" ? (
            <DraftStageView draft={page.draft} bingo={raw.bingo} onOpenDraft={page.actions.goToDraft} />
          ) : page.stageView === "noTeam" ? (
            page.isMod ? (
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
                <TileSearch search={page.search} />
                {page.viewing.team && (
                  <div
                    className="flex h-9 items-center justify-between gap-4 rounded-md border border-line bg-surface px-3"
                    style={page.viewing.team.color ? { borderColor: `${page.viewing.team.color}99` } : undefined}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      {page.viewing.team.color && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: page.viewing.team.color }} />}
                      <span className="font-semibold text-fg">{page.viewing.team.name}</span>
                      <span className="text-fg-subtle">{page.viewing.isOtherTeam ? "Viewing as moderator" : "Your team's board"}</span>
                    </div>
                    {board.totalPoints !== null && (
                      <span className="num text-sm font-semibold text-fg">
                        {board.totalPoints.toLocaleString()} <span className="font-normal text-fg-subtle">pts</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              <BoardGrid board={board} onOpenTile={page.openTile.open} />
            </>
          )}
        </main>

        {page.submit.open && (
          <SubmissionModal
            slug={page.slug}
            bingo={raw.bingo}
            tiles={raw.tiles}
            categories={raw.categories}
            nodeStates={raw.nodeStates}
            teamSubmissions={raw.teamSubmissions}
            initialTileId={page.submit.initialTileId}
            onClose={page.submit.hide}
            onSuccess={() => {}}
          />
        )}

        <Dialog isOpen={page.rules.open && !!page.bingo.rulesMarkdown} onClose={page.rules.hide} size="lg">
          <DialogHeader title="Rules" onClose={page.rules.hide} />
          <div className="px-5 pb-5">
            <Markdown>{page.bingo.rulesMarkdown ?? ""}</Markdown>
          </div>
        </Dialog>

        <TeamSubmissionsList
          isOpen={page.drawer.open}
          tiles={raw.tiles}
          submissions={raw.teamSubmissions}
          onClose={page.drawer.hide}
          onSubmit={page.canSubmit ? () => page.submit.show() : undefined}
        />

        <TileModal tile={modalTile} onClose={page.openTile.close} onSubmit={page.canSubmit ? () => page.submit.show(page.openTile.id ?? undefined) : undefined} />
      </div>
    </ThemeRoot>
  );
}

/**
 * Draft stage: before it starts, a countdown; while it runs, a pointer into
 * the draft room; once done, the team reveal. The draft endpoint is 403 for
 * people who didn't sign up, so the error case just shows the generic copy.
 */
function DraftStageView({ draft, bingo, onOpenDraft }: { draft: BingoPageModel["draft"]; bingo: Bingo; onOpenDraft: () => void }) {
  if (draft.isLoading) return null;

  if (!draft.state || !draft.state.draftStarted) {
    return (
      <EmptyState icon={<UsersIcon size={20} />} title="The draft hasn't started yet">
        <MilestoneCountdown bingo={bingo} className="justify-center" />
      </EmptyState>
    );
  }

  if (draft.state.currentPick) {
    return (
      <EmptyState
        icon={<UsersIcon size={20} />}
        title="Draft in progress"
        action={
          <Button variant="primary" onPress={onOpenDraft}>
            Open draft room
          </Button>
        }
      >
        <span className="num">
          Round {draft.state.currentPick.round}, pick {draft.state.currentPick.pickNumber}
        </span>
        . Teams are revealed here once the draft is complete.
      </EmptyState>
    );
  }

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-fg">Teams</h2>
        <p className="text-sm text-fg-muted">Draft complete. The board is revealed next.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {draft.state.teams.map((team) => (
          <TeamRoster key={team.id} team={team} picks={draft.state!.picks.filter((p) => p.teamId === team.id)} />
        ))}
      </div>
    </section>
  );
}

function TileSearch({ search }: { search: TileSearchModel }) {
  return (
    <div className="relative h-fit min-w-1/2 flex-1">
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
      <Input
        ref={search.inputRef}
        type="text"
        placeholder="Search tiles, items…"
        value={search.query}
        onChange={(e) => search.setQuery(e.target.value)}
        onFocus={() => search.setFocused(true)}
        onBlur={search.blur}
        onKeyDown={search.onKeyDown}
        className="h-9 pl-9 pr-9"
      />
      {search.query && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            search.clear();
            search.inputRef.current?.focus();
          }}
          className="hit-40 absolute right-2 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-sm p-1 text-fg-subtle transition-colors hover:text-fg"
        >
          <XIcon />
        </button>
      )}
      {search.showDropdown && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-line bg-surface-raised shadow-pop">
          {search.results.map((tile, i) => (
            <button
              key={tile.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => search.choose(tile.id)}
              className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors ${i === search.highlightedIndex ? "bg-surface-hover text-fg" : "text-fg-muted hover:bg-surface-hover"}`}
            >
              <span className="truncate font-medium">{tile.name}</span>
            </button>
          ))}
          {search.overflowCount > 0 && <p className="border-t border-line px-3 py-2 text-xs text-fg-subtle">{search.overflowCount} more — keep typing to narrow down</p>}
        </div>
      )}
    </div>
  );
}
