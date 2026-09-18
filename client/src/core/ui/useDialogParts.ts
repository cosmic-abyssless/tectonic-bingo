import { useOptionalSlot } from "../../themes/context";
import { Dialog, DialogHeader } from "./Dialog";

/**
 * The dialog frame + header to build a core dialog from: the page's theme's
 * (slots `DialogFrame` / `DialogHeader`) when there is one, else the plain
 * core ones. Core dialogs like bug report and player profile also mount on
 * pages outside any ThemeProvider (mod panel, site admin), hence the
 * optional lookup.
 */
export function useDialogParts() {
  return {
    Dialog: useOptionalSlot("DialogFrame") ?? Dialog,
    DialogHeader: useOptionalSlot("DialogHeader") ?? DialogHeader,
  };
}
