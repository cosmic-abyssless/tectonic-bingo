import { STAGE_LABEL, type BingoShellResponse } from "@bingo/shared";
import { useWebSocketEvent } from "../context/WebSocketContext";
import { toast } from "../core/ui/Toast";

// Moved from BingoPage.tsx verbatim: filters to this bingo's own events and toasts on a stage change. A new Submission
// reaches its Moderators as a Notification (CONTEXT.md), not from here.
export function usePageEvents(shell: BingoShellResponse | undefined): void {
  useWebSocketEvent((event) => {
    if (!shell) return;
    if (!("bingoId" in event) || event.bingoId !== shell.bingo.id) return;
    if (event.type === "stage_changed") {
      toast({ title: "Stage changed", description: STAGE_LABEL[event.payload.stage] });
    }
  });
}
