import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

let wss: WebSocketServer | null = null;

export function initWebSocketServer(server: Server): void {
  wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (socket: WebSocket) => {
    // No auth needed for receiving broadcast events — payloads carry only
    // IDs (v1 leaked team names to every connected client).
    socket.on("error", () => {});
  });
}

export type BroadcastEvent =
  | { type: "submission_created"; bingoId: string; payload: { teamId: string } }
  | { type: "submission_reviewed"; bingoId: string; payload: { teamId: string; taskIds: string[] } }
  | { type: "stage_changed"; bingoId: string; payload: { stage: string } }
  | { type: "draft_started"; bingoId: string; payload: Record<string, never> }
  | { type: "draft_pick"; bingoId: string; payload: { pickNumber: number; teamId: string; userId: string } }
  | { type: "team_updated"; bingoId: string; payload: { teamId: string } };

export function broadcast(event: BroadcastEvent): void {
  if (!wss) return;
  const msg = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}
