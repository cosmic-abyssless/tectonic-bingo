import { useEffect, useLayoutEffect, type RefObject } from "react";
import { useOverlay, usePreventScroll } from "react-aria";

/**
 * The open book's modal behaviour, staged so none of it lands in the frame the book takes off in (#470).
 *
 * react-aria's ModalOverlay does all of it the moment it mounts: the scroll lock (`overflow: hidden` on <html>) and
 * `inert` on the rest of the page each restyle the whole page, and it reads styles straight after each (its enter
 * animation check, then finding where focus goes), so a Tile opening paid for the page twice over in one long frame.
 *
 * Here Escape and clicking off close the book from the first frame (react-aria's overlay stack, so a dialog opened from
 * inside the book closes first), focus moves into it with the next frame's rendering, and the scroll lock and hiding
 * the page behind it wait until `armed` (the book has landed): until then the book is flying over a page nobody can
 * reach anyway, under the overlay that covers it.
 */
export function useBookModal({
  modalRef,
  dialogRef,
  onClose,
  armed,
}: {
  modalRef: RefObject<HTMLElement | null>;
  dialogRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  armed: boolean;
}) {
  const { overlayProps: modalProps, underlayProps } = useOverlay({ isOpen: true, onClose, isDismissable: true }, modalRef);

  // Into the dialog just before the next frame is drawn, when the browser works out styles anyway: focusing during the
  // mount would make it do that early, for the whole page, on top of the frame's own.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (dialog && !dialog.contains(document.activeElement)) dialog.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [dialogRef]);

  // Both in the same commit (usePreventScroll's is a layout effect too), so the page behind is restyled once for the
  // two of them rather than in two frames running.
  usePreventScroll({ isDisabled: !armed });
  useLayoutEffect(() => {
    const modal = modalRef.current;
    if (!armed || !modal) return;
    return hideOutside(modal);
  }, [armed, modalRef]);

  return { underlayProps, modalProps };
}

/**
 * Everything on the page but the book's own overlay goes inert (to the pointer, the keyboard and screen readers), as
 * react-aria's modals do it. Kept: other top layers (the Tutorial, toasts) and the live announcer. An element that's
 * already inert is left alone, and react-aria leaves alone what this made inert, so a dialog opened on top of the book
 * and closed again doesn't wake the page behind the book.
 */
function hideOutside(keep: Element): () => void {
  const hidden: HTMLElement[] = [];
  for (const el of Array.from(document.body.children)) {
    if (!(el instanceof HTMLElement) || el.inert || el.contains(keep)) continue;
    if (el.matches("[data-react-aria-top-layer], [data-live-announcer], script, style, link")) continue;
    el.inert = true;
    hidden.push(el);
  }
  return () => {
    for (const el of hidden) el.inert = false;
  };
}
