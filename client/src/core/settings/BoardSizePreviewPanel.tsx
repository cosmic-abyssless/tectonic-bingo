import { useNavigate } from "react-router-dom";
import { BOARD_SIZE_DEVICE_LABELS } from "@bingo/shared";
import { useUrlParam } from "../ui/useUrlParam";
import { Button, IconButton } from "../ui/Button";
import { XIcon } from "../ui/icons";
import { USER_SETTINGS_PATH } from "../notifications/InboxButton";
import { BoardSizeControls } from "./BoardSizeControls";
import { useBoardSizeDevice } from "./boardSize";

/** On a Bingo's page, `?boardSize=preview` opens the Board size panel over the Board: where Settings' Change leads. */
export const BOARD_SIZE_PREVIEW_PARAM = "boardSize";

/**
 * The Board size for the device you're on, in a small panel floating over the Board (not a modal: the Board stays in
 * view and scrolls under it), so each change shows on the real thing. Back to Settings returns to the Settings page;
 * the close button just leaves the panel.
 */
export function BoardSizePreviewPanel({ slug }: { slug: string }) {
  const [param, setParam] = useUrlParam(BOARD_SIZE_PREVIEW_PARAM);
  const device = useBoardSizeDevice();
  const navigate = useNavigate();
  if (param !== "preview") return null;
  return (
    <section
      role="dialog"
      aria-label={`Board size (${BOARD_SIZE_DEVICE_LABELS[device]})`}
      className="fixed bottom-4 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-outline bg-surface p-4 text-on-surface shadow-lg"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Board size ({BOARD_SIZE_DEVICE_LABELS[device]})</h2>
          <p className="text-xs text-on-surface-muted">Each change shows on the Board behind this, and is saved.</p>
        </div>
        <IconButton label="Close" size="sm" onPress={() => setParam(null)}>
          <XIcon />
        </IconButton>
      </div>
      <BoardSizeControls device={device} />
      <div className="mt-4 flex justify-end">
        <Button variant="primary" size="sm" onPress={() => navigate(USER_SETTINGS_PATH, { state: { bingoSlug: slug } })}>
          Back to Settings
        </Button>
      </div>
    </section>
  );
}
