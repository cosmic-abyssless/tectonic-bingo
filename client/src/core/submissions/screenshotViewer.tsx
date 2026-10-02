import { createContext, useContext, useRef, useState, type ReactNode } from "react";

/*
 * On the board, a Submission's screenshot opens in the page's own picture viewer (the theme's, the one a Tile's
 * artwork opens in) rather than a new tab. ScreenshotLink asks for it here; where there's no viewer (the Mod panel,
 * Rewind, Wrapped) it opens the full image in a new tab, as before.
 */

const ViewScreenshot = createContext<((url: string) => void) | null>(null);

/** How to show a screenshot on this page, or null to open it in a new tab. */
export function useViewScreenshot(): ((url: string) => void) | null {
  return useContext(ViewScreenshot);
}

/**
 * Gives everything under it (dialogs included) a viewer for screenshots, drawn by `viewer` with the one being viewed,
 * or null. Closing it puts focus back on the screenshot that opened it.
 */
export function ScreenshotViewerHost({ viewer, children }: { viewer: (url: string | null, onClose: () => void) => ReactNode; children: ReactNode }) {
  const [url, setUrl] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const view = (next: string) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setUrl(next);
  };
  const close = () => {
    setUrl(null);
    opener.current?.focus({ preventScroll: true });
  };
  return (
    <ViewScreenshot.Provider value={view}>
      {children}
      {viewer(url, close)}
    </ViewScreenshot.Provider>
  );
}
