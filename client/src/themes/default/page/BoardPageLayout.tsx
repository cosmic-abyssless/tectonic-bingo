import type { ComponentType } from "react";
import { RULES_COME_LATER, useBingoPage, useBoardModel, useTileModel, useTileSearchModel } from "../../../headless";
import type { TileSearchModel } from "../../../headless/types";
import { SubmissionFlowHost } from "../../../headless/SubmissionFlowHost";
import { useScreenshotCapture } from "../../../headless/useScreenshotCapture";
import { ScreenshotDropOverlay } from "../../../core/ui/ScreenshotDropOverlay";
import { SealedTilesNotice } from "../../../core/board/SealedTilesNotice";
import { HistoricalBingoView } from "../../../core/historical/HistoricalBingoView";
import { useSlot } from "../../context";
import { ImageViewer } from "../../../core/ui/ImageViewer";
import { ScreenshotViewerHost } from "../../../core/submissions/screenshotViewer";

// The Tile search box, reading its model from TileSearchProvider itself: typing re-renders it, not this layout.
function BoardSearch({ TileSearch }: { TileSearch: ComponentType<{ search: TileSearchModel }> }) {
  return <TileSearch search={useTileSearchModel()} />;
}

export function BoardPageLayout() {
  const page = useBingoPage();
  const board = useBoardModel();
  const modalTile = useTileModel(page.openTile.id);
  const { dragActive } = useScreenshotCapture(page);

  const PageHeader = useSlot("PageHeader");
  const SignupStage = useSlot("SignupStage");
  const ScoutBanner = useSlot("ScoutBanner");
  const WrappedBanner = useSlot("WrappedBanner");
  const FeedbackBanner = useSlot("FeedbackBanner");
  const PlanningStage = useSlot("PlanningStage");
  const DraftStage = useSlot("DraftStage");
  const NoTeamStage = useSlot("NoTeamStage");
  const NotPartStage = useSlot("NotPartStage");
  const TileSearch = useSlot("TileSearch");
  const TeamBanner = useSlot("TeamBanner");
  const BoardGrid = useSlot("BoardGrid");
  const RulesDialog = useSlot("RulesDialog");
  const TeamInfoDialog = useSlot("TeamInfoDialog");
  const PointBreakdownDialog = useSlot("PointBreakdownDialog");
  const SubmissionsDrawer = useSlot("SubmissionsDrawer");
  const TileModal = useSlot("TileModal");
  const SubmissionModal = useSlot("SubmissionModal");

  return (
    // A Submission's screenshot opens full size over the page rather than in a new tab.
    <ScreenshotViewerHost viewer={(url, close) => <ImageViewer url={url} label="Submission screenshot" onClose={close} />}>
      <div className="min-h-dvh bg-background text-on-surface">
        <PageHeader page={page} />

        <main className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
          {page.canScout && <ScoutBanner onOpen={page.actions.goToDraft} canRate={page.canRatePicks} />}
          {page.wrapped.canOpen && <WrappedBanner preview={page.wrapped.preview} onOpen={page.actions.goToWrapped} />}
          {page.feedback.canOpen && <FeedbackBanner responded={page.feedback.responded} onOpen={page.actions.goToFeedback} />}
          {page.stageView === "signup" ? (
            <SignupStage slug={page.slug} />
          ) : page.stageView === "notPart" ? (
            <NotPartStage isCut={page.isCut} removedFromTeam={page.removedFromTeam} />
          ) : page.stageView === "planning" || page.stageView === "captains" ? (
            <PlanningStage stage={page.stageView} />
          ) : page.stageView === "draft" ? (
            <DraftStage draft={page.draft} milestone={page.milestone} onOpenDraft={page.actions.goToDraft} />
          ) : page.stageView === "historical" && page.historical ? (
            <HistoricalBingoView slug={page.slug} board={board} teams={page.teams} recorded={page.historical} />
          ) : page.stageView === "noTeam" ? (
            <NoTeamStage selector={page.teamSelector} />
          ) : (
            <>
              {page.canModerate && page.sealed.forPlayers && <SealedTilesNotice slug={page.slug} />}
              <div className="mb-4 flex flex-wrap justify-between gap-4">
                <BoardSearch TileSearch={TileSearch} />
                {page.viewing.team && <TeamBanner team={page.viewing.team} isOtherTeam={page.viewing.isOtherTeam} totalPoints={board.totalPoints} onOpenPoints={page.pointBreakdown.show} />}
              </div>

              <BoardGrid board={board} onOpenTile={page.openTile.open} />
            </>
          )}
        </main>

        <ScreenshotDropOverlay visible={dragActive} />

        {page.submit.open && (
          <SubmissionFlowHost
            initialTileId={page.submit.initialTileId}
            initialTaskId={page.submit.initialTaskId}
            initialFile={page.submit.initialFile}
            initialKind={page.submit.initialKind}
            onClose={page.submit.hide}
            onSuccess={() => {}}
          >
            {(flow) => <SubmissionModal flow={flow} />}
          </SubmissionFlowHost>
        )}

        <RulesDialog isOpen={page.rules.open} markdown={page.bingo.rulesComeLater ? RULES_COME_LATER : (page.bingo.rulesMarkdown ?? "")} onClose={page.rules.hide} />

        <TeamInfoDialog slug={page.slug} team={page.teamInfo.open ? page.viewing.team : null} stage={page.bingo.stage} onClose={page.teamInfo.hide} />

        <PointBreakdownDialog team={page.pointBreakdown.open ? page.viewing.team : null} onClose={page.pointBreakdown.hide} />

        <SubmissionsDrawer isOpen={page.drawer.open} submissions={page.submissions} onClose={page.drawer.hide} onSubmit={page.canSubmit ? () => page.submit.show() : undefined} />

        <TileModal
          tile={modalTile}
          isOpen={page.openTile.id !== null}
          onClose={page.openTile.close}
          onToggleInterest={modalTile?.interest.canToggle ? (taskId) => page.tileInterest.toggle(modalTile.id, taskId) : undefined}
          onSubmit={page.canSubmit ? (taskId) => page.submit.show(page.openTile.id ?? undefined, undefined, taskId) : undefined}
          onPostProof={page.canSubmit && modalTile ? (taskId) => page.submit.showProof(modalTile.id, taskId) : undefined}
        />
      </div>
    </ScreenshotViewerHost>
  );
}
