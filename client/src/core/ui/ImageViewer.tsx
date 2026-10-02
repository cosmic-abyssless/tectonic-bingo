import { Dialog as AriaDialog, Modal as AriaModal, ModalOverlay } from "react-aria-components";
import { fullUrl } from "../../api/imageVariants";
import { IconButton } from "./Button";
import { XIcon } from "./icons";

/**
 * A picture full size, over everything else, dialogs included (the comic theme's ArtViewer is its own version).
 * Escape, the backdrop and the close button close it. Open while `url` is set.
 */
export function ImageViewer({ url, label, onClose }: { url: string | null; label: string; onClose: () => void }) {
  return (
    <ModalOverlay
      isOpen={!!url}
      onOpenChange={(open) => !open && onClose()}
      isDismissable
      className="overlay-backdrop fixed inset-0 z-60 flex items-center justify-center bg-scrim/80 p-4"
    >
      <AriaModal className="overlay-panel relative outline-none">
        <AriaDialog aria-label={label} className="relative outline-none">
          {url && <img src={fullUrl(url)} alt={label} className="block max-h-[calc(100dvh-4rem)] max-w-[calc(100vw-2rem)] rounded-md border border-outline bg-surface object-contain shadow-pop" />}
          <IconButton label="Close" onPress={onClose} className="absolute -right-3 -top-3 rounded-full border border-outline bg-surface shadow-pop">
            <XIcon />
          </IconButton>
        </AriaDialog>
      </AriaModal>
    </ModalOverlay>
  );
}
