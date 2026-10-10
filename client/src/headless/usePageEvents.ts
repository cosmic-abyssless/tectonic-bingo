import { STAGE_LABEL, type BingoShellResponse } from "@bingo/shared";
import { useNavigate } from "react-router-dom";
import { useWebSocketEvent } from "../context/WebSocketContext";
import { toast } from "../core/ui/Toast";

// Moved from BingoPage.tsx verbatim: filters to this bingo's own events,
// toasts on a stage change, and (for whoever moderates it, when the tab isn't
// visible) raises a browser notification on a new submission, which opens the
// Mod panel's Submissions tab when clicked.
export function usePageEvents(shell: BingoShellResponse | undefined, canModerate: boolean): void {
  const navigate = useNavigate();
  useWebSocketEvent((event) => {
    if (!shell) return;
    if (!("bingoId" in event) || event.bingoId !== shell.bingo.id) return;
    if (event.type === "stage_changed") {
      toast({ title: "Stage changed", description: STAGE_LABEL[event.payload.stage] });
    }
    if (
      canModerate &&
      event.type === "submission_created" &&
      "Notification" in window &&
      Notification.permission === "granted" &&
      document.visibilityState !== "visible"
    ) {
      const notification = new Notification("New bingo submission", { body: "A submission is pending review" });
      notification.onclick = () => {
        window.focus();
        navigate(`/b/${shell.bingo.slug}/mod?tab=submissions`);
        notification.close();
      };
    }
  });
}
