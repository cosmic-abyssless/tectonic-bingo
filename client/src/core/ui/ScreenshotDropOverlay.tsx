import { ImageIcon } from "./icons";

/** Full-page hint shown while dragging a file over the board with the submission modal closed — see useScreenshotCapture. */
export function ScreenshotDropOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-line-strong px-10 py-8 text-fg">
        <ImageIcon className="size-8 text-fg-muted" />
        <span className="text-sm font-medium">Drop screenshot to submit</span>
      </div>
    </div>
  );
}
