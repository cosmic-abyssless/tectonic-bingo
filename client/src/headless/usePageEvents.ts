import { STAGE_LABEL, type BingoShellResponse } from "@bingo/shared";
import { useWebSocketEvent } from "../context/WebSocketContext";
import { toast } from "../core/ui/Toast";

// Moved from BingoPage.tsx verbatim: filters to this bingo's own events,
// toasts on a stage change, and (for mods, when the tab isn't visible)
// raises a browser notification on a new submission.
export function usePageEvents(shell: BingoShellResponse | undefined): void {
  useWebSocketEvent((event) => {
    if (!shell) return;
    if (event.bingoId !== shell.bingo.id) return;
    if (event.type === "stage_changed") {
      toast({ title: "Stage changed", description: STAGE_LABEL[event.payload.stage] });
    }
    if (
      shell.isMod &&
      event.type === "submission_created" &&
      "Notification" in window &&
      Notification.permission === "granted" &&
      document.visibilityState !== "visible"
    ) {
      new Notification("New bingo submission", { body: "A submission is pending review" });
    }
  });
}
