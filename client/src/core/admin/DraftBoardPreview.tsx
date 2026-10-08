import { useState } from "react";
import type { DraftBoardResponse, Bingo, PointAdjustment, SubmissionDetails, TeamNodeState, TileInterest } from "@bingo/shared";
import { useAuth } from "../../context/AuthContext";
import { BoardProvider, useBoardModel } from "../../headless/BoardProvider";
import { ThemeProvider } from "../../themes/ThemeProvider";
import { useSlot } from "../../themes/context";
import { NO_LOCKS } from "../board/exclusivity";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Dialog, DialogHeader } from "../ui/Dialog";
import { InfoIcon } from "../ui/icons";
import { InsideModalContext } from "../ui/insideModal";

const NO_STATES: TeamNodeState[] = [];
const NO_SUBMISSIONS: SubmissionDetails[] = [];
const NO_INTERESTS: TileInterest[] = [];
const NO_ADJUSTMENTS: PointAdjustment[] = [];

/**
 * The Draft board as Players would see it (CONTEXT.md "Draft board"): its Tiles in the bingo's own theme, before any
 * progress, each opening as a Player opens it, and its Rules text. Admins only; nothing can be submitted from here.
 */
export function DraftBoardPreview({ bingo, draft, isOpen, onClose }: { bingo: Bingo; draft: DraftBoardResponse; isOpen: boolean; onClose: () => void }) {
  return (
    <Dialog isOpen={isOpen} onClose={onClose} size="lg" fixedHeight>
      <DialogHeader title="Preview as Players" subtitle={draft.status.hasChanges ? "The Draft board, with its unpublished changes" : "The board as published: there are no unpublished changes"} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isOpen && (
          <ThemeProvider themeKey={bingo.theme} fallback={<p className="text-sm text-on-surface-subtle">Loading the bingo's theme…</p>}>
            <InsideModalContext.Provider value={true}>
              <PreviewBoard bingo={bingo} draft={draft} />
            </InsideModalContext.Provider>
          </ThemeProvider>
        )}
      </div>
    </Dialog>
  );
}

function PreviewBoard({ bingo, draft }: { bingo: Bingo; draft: DraftBoardResponse }) {
  const { user } = useAuth();
  return (
    <BoardProvider
      tiles={draft.board.tiles}
      categories={draft.categories}
      lines={draft.board.lines}
      nodeStates={NO_STATES}
      teamSubmissions={NO_SUBMISSIONS}
      bingoStartsAt={null}
      bingoRows={bingo.boardRows}
      bingoCols={bingo.boardCols}
      canSubmit={false}
      canToggleInterest={false}
      interests={NO_INTERESTS}
      viewerUserId={user?.id ?? ""}
      totalPoints={null}
      adjustments={NO_ADJUSTMENTS}
      locks={NO_LOCKS}
      sealed={false}
    >
      <PreviewGrid rulesMarkdown={draft.rulesMarkdown} />
    </BoardProvider>
  );
}

function PreviewGrid({ rulesMarkdown }: { rulesMarkdown: string | null }) {
  const board = useBoardModel();
  const BoardGrid = useSlot("BoardGrid");
  const TileModal = useSlot("TileModal");
  const RulesDialog = useSlot("RulesDialog");
  const [openTileId, setOpenTileId] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const tile = openTileId ? (board.tileById.get(openTileId) ?? null) : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Notice tone="info" icon={<InfoIcon size={14} />} className="flex-1">
          Open a Tile to see it as Players will. Progress, Submissions and Task interest aren't shown.
        </Notice>
        <Button size="sm" onPress={() => setRulesOpen(true)} isDisabled={!rulesMarkdown}>
          Rules
        </Button>
      </div>
      <BoardGrid board={board} onOpenTile={setOpenTileId} />
      <TileModal tile={tile} isOpen={tile !== null} onClose={() => setOpenTileId(null)} />
      <RulesDialog isOpen={rulesOpen} markdown={rulesMarkdown ?? ""} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
