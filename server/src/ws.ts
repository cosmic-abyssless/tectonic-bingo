import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { BroadcastEvent } from "@bingo/shared";

let wss: WebSocketServer | null = null;

export function initWebSocketServer(server: Server): void {
  wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (socket: WebSocket) => {
    // No auth needed for receiving broadcast events — payloads carry only
    // IDs (v1 leaked team names to every connected client).
    socket.on("error", () => {});
  });
}

export function broadcast(event: BroadcastEvent): void {
  if (!wss) return;
  const msg = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}
