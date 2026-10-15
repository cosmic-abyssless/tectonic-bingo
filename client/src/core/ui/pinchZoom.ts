import { useEffect } from "react";

// Whether the page is pinch-zoomed in, on <html data-pinch-zoomed> while it is, so CSS can drop what's too costly to
// draw zoomed (comic.css: the page behind the picture viewer).

/** Pinch-zoomed in, by more than rounding. */
export function isPinchZoomed(): boolean {
  return (window.visualViewport?.scale ?? 1) > 1.01;
}

/**
 * Keeps <html data-pinch-zoomed> in step with the pinch zoom; call once at the app root. Safari redraws every layer at
 * the zoom: pinching a Submission's screenshot with the board and the Submissions modal behind it reloaded the page,
 * then crashed it.
 */
export function useSyncPinchZoomAttribute(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const sync = () => document.documentElement.toggleAttribute("data-pinch-zoomed", isPinchZoomed());
    sync();
    viewport.addEventListener("resize", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      document.documentElement.removeAttribute("data-pinch-zoomed");
    };
  }, []);
}
