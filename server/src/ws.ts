import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";

let wss: WebSocketServer | null = null;

export function initWebSocketServer(server: Server): void {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket: WebSocket, req: IncomingMessage) => {
    // Client connected — no auth needed for receiving broadcast events
    socket.on("error", () => {});
  });
}

export function broadcast(data: object): void {
  if (!wss) return;
  const msg = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}
