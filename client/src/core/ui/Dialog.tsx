import { Dialog as AriaDialog, DialogTrigger, Heading, Modal as AriaModal, ModalOverlay } from "react-aria-components";
import type { ReactNode } from "react";
import { IconButton } from "./Button";
import { XIcon } from "./icons";

const MAX_WIDTH = {
  md: "max-w-lg",
  lg: "max-w-2xl",
} as const;

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
}: {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: keyof typeof MAX_WIDTH;
  isDismissable?: boolean;
}) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      isDismissable={isDismissable}
      className="overlay-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <AriaModal className={`overlay-panel w-full ${MAX_WIDTH[size]} max-h-[90vh] overflow-y-auto rounded-lg border border-line bg-surface shadow-pop`}>
        <AriaDialog className="outline-none">{children}</AriaDialog>
      </AriaModal>
    </ModalOverlay>
  );
}

export function DialogHeader({ title, subtitle, onClose, action }: { title: string; subtitle?: string; onClose: () => void; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line p-5">
      <div className="min-w-0">
        <Heading slot="title" className="text-base font-semibold text-fg">
          {title}
        </Heading>
        {subtitle && <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p>}
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
