import { Dialog as AriaDialog, DialogTrigger, Heading, Modal as AriaModal, ModalOverlay } from "react-aria-components";
import type { ReactNode } from "react";
import { IconButton } from "./Button";
import { XIcon } from "./icons";

const MAX_WIDTH = {
  md: "max-w-lg",
  lg: "max-w-2xl",
} as const;

/** A fixedHeight dialog's height: the whole of the 90vh every dialog is capped at, for a long list. */
export const FIXED_HEIGHT = "h-[90vh]";

export { DialogTrigger };

/**
 * Controlled dialog. Render it unconditionally with `isOpen` so react-aria can
 * play the exit animation; the old `{open && <Modal>}` pattern unmounts before
 * it can animate.
 */
export function Dialog({
  isOpen,
  onClose,
  children,
  size = "md",
  isDismissable = true,
  fixedHeight = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: keyof typeof MAX_WIDTH;
  isDismissable?: boolean;
  /**
   * One height whatever the content, so switching a filter inside doesn't make the dialog jump. The dialog becomes a
   * flex column that doesn't scroll itself: give the part that should scroll `min-h-0 flex-1 overflow-y-auto`.
   */
  fixedHeight?: boolean;
}) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      isDismissable={isDismissable}
      className="overlay-backdrop fixed inset-0 z-50 flex items-center justify-center bg-scrim/70 p-4"
    >
      <AriaModal
        className={`overlay-panel w-full ${MAX_WIDTH[size]} max-h-[90vh] rounded-lg border border-outline bg-surface shadow-pop ${fixedHeight ? `${FIXED_HEIGHT} flex flex-col overflow-hidden` : "overflow-y-auto"}`}
      >
        <AriaDialog className={`outline-none ${fixedHeight ? "flex min-h-0 flex-1 flex-col" : ""}`}>{children}</AriaDialog>
      </AriaModal>
    </ModalOverlay>
  );
}

export function DialogHeader({ title, subtitle, onClose, action }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-outline p-5">
      <div className="min-w-0">
        <Heading slot="title" className="flex items-center gap-2 text-base font-semibold text-on-surface">
          {title}
        </Heading>
        {subtitle && <p className="mt-0.5 text-sm text-on-surface-muted">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {action}
        <IconButton label="Close" onPress={onClose} size="sm">
          <XIcon />
        </IconButton>
      </div>
    </div>
  );
}
