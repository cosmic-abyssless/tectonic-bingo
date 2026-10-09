import { useEffect, useRef, type RefObject } from "react";
import { useOverlay } from "react-aria";

/**
 * The open book's modal behaviour, without restyling the page behind it (#470).
 *
 * react-aria's ModalOverlay locks scrolling with `overflow: hidden` on <html> and hides the page with `inert` on the
 * rest of it. Both change something every element under them inherits, so each restyled the whole page (about 1,500
 * and 900 elements): in the frame the book took off in, and, staged, in the one after it landed.
 *
 * Here nothing on the page behind changes but an attribute no style reads:
 * - Escape closes the book (react-aria's overlay stack, so a dialog opened from inside the book closes first), and so
 *   does clicking off it: react-aria's own outside-click, through the same stack, so a popover opened over the book
 *   closes first. Inside another modal the overlay is a react-aria top layer (`topLayer`, see InsideModalContext),
 *   whose clicks react-aria never counts as outside, so there it's closeOnBackdrop's.
 * - Focus moves into it with the next frame's rendering, stays inside (Overlay, around this), and goes back to what
 *   opened it.
 * - The page can't be scrolled from inside it: a wheel, a touch drag or a scrolling key that nothing in its way can
 *   take is cancelled, rather than locking the page itself (lockPageScroll).
 * - The page is hidden from screen readers with `aria-hidden`. Nothing behind can be clicked (the overlay covers it) or
 *   tabbed to (focus is contained), which `inert` would otherwise have been for.
 */
export function useBookModal({
  overlayRef,
  modalRef,
  dialogRef,
  onClose,
  topLayer,
}: {
  overlayRef: RefObject<HTMLElement | null>;
  modalRef: RefObject<HTMLElement | null>;
  dialogRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** The overlay carries react-aria's top-layer mark (opened inside another modal). */
  topLayer: boolean;
}) {
  const { overlayProps: modalProps, underlayProps } = useOverlay({ isOpen: true, onClose, isDismissable: true }, modalRef);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const overlay = overlayRef.current;
    const modal = modalRef.current;
    if (!topLayer || !overlay || !modal) return;
    return closeOnBackdrop(overlay, modal, () => close.current());
  }, [overlayRef, modalRef, topLayer]);

  // Into the dialog just before the next frame is drawn, when the browser works out styles anyway: focusing during the
  // mount would make it do that early, for the whole page, on top of the frame's own.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (dialog && !dialog.contains(document.activeElement)) dialog.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [dialogRef]);

  useEffect(() => lockPageScroll(), []);

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;
    return hideOutside(modal);
  }, [modalRef]);

  return { underlayProps, modalProps };
}

/**
 * A press that starts and ends on the overlay but off the book closes it. The DOM decides what's on the overlay, so a
 * dialog opened from the book (portalled elsewhere, though React bubbles its events through the book) never counts.
 * While focus is in something opened over the book (a popover), the press is that thing's to close it, not the book.
 */
function closeOnBackdrop(overlay: HTMLElement, modal: HTMLElement, close: () => void): () => void {
  const offBook = (target: EventTarget | null) => target instanceof Node && overlay.contains(target) && !modal.contains(target);
  const bookHasFocus = () => !document.activeElement || document.activeElement === document.body || modal.contains(document.activeElement);
  let pressed = false;
  const onDown = (e: PointerEvent) => {
    pressed = e.isPrimary && e.button === 0 && offBook(e.target) && bookHasFocus();
  };
  const onUp = (e: PointerEvent) => {
    if (pressed && offBook(e.target)) close();
    pressed = false;
  };
  overlay.addEventListener("pointerdown", onDown);
  overlay.addEventListener("pointerup", onUp);
  return () => {
    overlay.removeEventListener("pointerdown", onDown);
    overlay.removeEventListener("pointerup", onUp);
  };
}

type Axis = "x" | "y";

/** Whether `el` is a scroll container that can still move `dir` (+1: down/right, -1: up/left) along `axis`. */
function canScroll(el: Element, axis: Axis, dir: 1 | -1): boolean {
  const room = axis === "y" ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
  if (room <= 0) return false;
  const overflow = getComputedStyle(el)[axis === "y" ? "overflowY" : "overflowX"];
  if (overflow !== "auto" && overflow !== "scroll") return false;
  const at = axis === "y" ? el.scrollTop : Math.abs(el.scrollLeft);
  return dir < 0 ? at > 0 : at < room - 1;
}

/** Whether something between `target` and the page itself would take a scroll that way (so it isn't the page's). */
function takenBefore(target: EventTarget | null, axis: Axis, dir: 1 | -1): boolean {
  const page = document.scrollingElement ?? document.documentElement;
  for (let el = target instanceof Element ? target : null; el && el !== page && el !== document.body; el = el.parentElement) {
    if (canScroll(el, axis, dir)) return true;
  }
  return false;
}

// Keys that scroll whatever holds focus, and which way. The left and right arrows turn the book's pages.
const SCROLL_KEYS: Record<string, [Axis, 1 | -1]> = {
  " ": ["y", 1],
  PageDown: ["y", 1],
  PageUp: ["y", -1],
  End: ["y", 1],
  Home: ["y", -1],
  ArrowDown: ["y", 1],
  ArrowUp: ["y", -1],
};
// A field keeps every one of them (they move its caret); a button, checkbox or switch keeps Space (it presses it). A
// widget that uses an arrow or Home/End itself (a list, a slider) cancels the key, so it never gets this far.
const EDITABLE = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";
const PRESSED_BY_SPACE = "button, [role='button'], [role='checkbox'], [role='switch'], [role='radio']";

/**
 * Stops the page itself scrolling while the book is open, by cancelling the wheel, touch drags and scrolling keys that
 * would have reached it. Anything inside that can scroll still does: a page of the book (which scrolls itself, see
 * dragScroll), the overlay when the book is taller than the window, a popover's list. Only one thing gets through:
 * dragging the page's own scrollbar.
 */
function lockPageScroll(): () => void {
  const onWheel = (e: WheelEvent) => {
    if (e.defaultPrevented || e.ctrlKey) return; // already taken, or a trackpad pinch (zoom)
    const axis: Axis = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? "y" : "x";
    const delta = axis === "y" ? e.deltaY : e.deltaX;
    if (delta === 0) return;
    if (!takenBefore(e.target, axis, delta > 0 ? 1 : -1) && e.cancelable) e.preventDefault();
  };
  let touch: { x: number; y: number } | null = null;
  const onTouchStart = (e: TouchEvent) => {
    touch = e.touches.length === 1 ? { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY } : null;
  };
  const onTouchMove = (e: TouchEvent) => {
    if (!touch || e.touches.length !== 1 || e.defaultPrevented || !e.cancelable) return; // a pinch zooms as ever
    const dx = touch.x - e.touches[0]!.clientX;
    const dy = touch.y - e.touches[0]!.clientY;
    const axis: Axis = Math.abs(dy) >= Math.abs(dx) ? "y" : "x";
    const delta = axis === "y" ? dy : dx;
    if (delta === 0) return;
    if (!takenBefore(e.target, axis, delta > 0 ? 1 : -1)) e.preventDefault();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const key = SCROLL_KEYS[e.key];
    if (!key || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof Element && (e.target.closest(EDITABLE) || (e.key === " " && e.target.closest(PRESSED_BY_SPACE)))) return;
    const [axis, dir] = key;
    if (!takenBefore(e.target, axis, e.key === " " && e.shiftKey ? -1 : dir)) e.preventDefault();
  };
  document.addEventListener("wheel", onWheel, { passive: false });
  document.addEventListener("touchstart", onTouchStart, { passive: true });
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  document.addEventListener("keydown", onKeyDown);
  return () => {
    document.removeEventListener("wheel", onWheel);
    document.removeEventListener("touchstart", onTouchStart);
    document.removeEventListener("touchmove", onTouchMove);
    document.removeEventListener("keydown", onKeyDown);
  };
}

/**
 * Everything on the page but the book's own overlay is hidden from screen readers. Kept: other top layers (the
 * Tutorial, toasts) and the live announcer. An element already hidden or inert is left alone, and react-aria leaves
 * alone what this hid (it hides with `inert`, and checks for that), so a dialog opened on top of the book and closed
 * again doesn't bring the page behind the book back.
 */
function hideOutside(keep: Element): () => void {
  const hidden: HTMLElement[] = [];
  for (const el of Array.from(document.body.children)) {
    if (!(el instanceof HTMLElement) || el.inert || el.getAttribute("aria-hidden") === "true" || el.contains(keep)) continue;
    if (el.matches("[data-react-aria-top-layer], [data-live-announcer], script, style, link")) continue;
    el.setAttribute("aria-hidden", "true");
    hidden.push(el);
  }
  return () => {
    for (const el of hidden) el.removeAttribute("aria-hidden");
  };
}
