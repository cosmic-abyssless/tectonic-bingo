import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { BroadcastEvent } from "@bingo/shared";
import { log } from "./log";

let wss: WebSocketServer | null = null;

export function initWebSocketServer(server: Server): void {
  wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (socket: WebSocket) => {
    // No auth needed for receiving broadcast events — payloads carry only
    // IDs (v1 leaked team names to every connected client).
    log.info("ws connect", { clients: wss?.clients.size });
    socket.on("close", () => log.info("ws close", { clients: wss?.clients.size }));
    socket.on("error", (err) => log.warn("ws error", { err }));
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

export function closeWebSocketServer(): void {
  if (!wss) return;
  for (const client of wss.clients) client.terminate();
  wss.close();
  wss = null;
}
