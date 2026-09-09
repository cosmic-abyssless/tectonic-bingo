import { useBingoPage, useBoardModel, useTileModel } from "../../../headless";
import { SubmissionFlowHost } from "../../../headless/SubmissionFlowHost";
import { useSlot } from "../../context";

// Ben-Day dot shading over the page background — the classic comic-book
// halftone texture. A repeating radial-gradient is the cheapest way to get
// a dot grid in CSS: each "tile" of the background is one dot on a
// transparent field, then `backgroundSize` sets the grid spacing.
const DOT_GRID_STYLE = {
  backgroundColor: "var(--color-bg)",
  backgroundImage: "radial-gradient(circle at center, rgba(0,0,0,0.18) 1.6px, transparent 1.7px)",
  backgroundSize: "10px 10px",
};

export function BoardPageLayout() {
  const page = useBingoPage();
  const board = useBoardModel();
  const modalTile = useTileModel(page.openTile.id);

  const PageHeader = useSlot("PageHeader");
  const StageRow = useSlot("StageRow");
  const SignupStage = useSlot("SignupStage");
  const PlanningStage = useSlot("PlanningStage");
  const DraftStage = useSlot("DraftStage");
  const NoTeamStage = useSlot("NoTeamStage");
  const TileSearch = useSlot("TileSearch");
  const TeamBanner = useSlot("TeamBanner");
  const BoardGrid = useSlot("BoardGrid");
  const RulesDialog = useSlot("RulesDialog");
  const SubmissionsDrawer = useSlot("SubmissionsDrawer");
  const TileModal = useSlot("TileModal");
  const SubmissionModal = useSlot("SubmissionModal");

  return (
    <div className="min-h-screen text-fg" style={DOT_GRID_STYLE}>
      <PageHeader page={page} />

      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
        <StageRow stage={page.bingo.stage} milestone={page.milestone} />

        {page.stageView === "signup" ? (
          <SignupStage slug={page.slug} />
        ) : page.stageView === "planning" || page.stageView === "captains" ? (
          <PlanningStage stage={page.stageView} />
        ) : page.stageView === "draft" ? (
          <DraftStage draft={page.draft} milestone={page.milestone} onOpenDraft={page.actions.goToDraft} />
        ) : page.stageView === "noTeam" ? (
          <NoTeamStage isMod={page.isMod} />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap justify-between gap-4">
              <TileSearch search={page.search} />
              {page.viewing.team && <TeamBanner team={page.viewing.team} isOtherTeam={page.viewing.isOtherTeam} totalPoints={board.totalPoints} />}
            </div>

            <BoardGrid board={board} onOpenTile={page.openTile.open} />
          </>
        )}
      </main>

      {page.submit.open && (
        <SubmissionFlowHost initialTileId={page.submit.initialTileId} onClose={page.submit.hide} onSuccess={() => {}}>
          {(flow) => <SubmissionModal flow={flow} />}
        </SubmissionFlowHost>
      )}

      <RulesDialog isOpen={page.rules.open} markdown={page.bingo.rulesMarkdown ?? ""} onClose={page.rules.hide} />

      <SubmissionsDrawer isOpen={page.drawer.open} submissions={page.submissions} onClose={page.drawer.hide} onSubmit={page.canSubmit ? () => page.submit.show() : undefined} />

      <TileModal
        tile={modalTile}
        isOpen={page.openTile.id !== null}
        onClose={page.openTile.close}
        onSubmit={page.canSubmit ? () => page.submit.show(page.openTile.id ?? undefined) : undefined}
      />
    </div>
  );
}
