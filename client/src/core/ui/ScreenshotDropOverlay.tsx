import { createPortal } from "react-dom";
import { ImageIcon } from "./icons";

/**
 * Full-page hint shown while dragging a file over the board with the submission modal closed — see useScreenshotCapture.
 *
 * Portaled to <body> and stacked above the modals (z-50, portaled themselves): rendered in place it would sit
 * inside the page's own stacking context and could never rise above an open tile modal, which is exactly
 * when a screenshot gets dropped.
 */
export function ScreenshotDropOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-outline-strong px-10 py-8 text-on-surface">
        <ImageIcon className="size-8 text-on-surface-muted" />
        <span className="text-sm font-medium">Drop screenshot to submit</span>
      </div>
    </div>,
    document.body,
  );
}
