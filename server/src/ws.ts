import { WebSocketServer, WebSocket } from "ws";
import { ServerResponse, type IncomingMessage, type Server } from "http";
import type { Duplex } from "stream";
import type { Request, RequestHandler, Response } from "express";
import type { BroadcastEvent } from "@bingo/shared";
import { passesGuildGate } from "./middleware/requireGuildMember";
import { log } from "./log";

/** Decides whether an upgrade request may open a socket: the session id it belongs to if so, null if not. */
export type AuthorizeUpgrade = (req: IncomingMessage) => Promise<string | null>;

let wss: WebSocketServer | null = null;
let detach: (() => void) | null = null;
// The session each socket was opened under, so logging out can close that session's sockets.
const socketSessions = new WeakMap<WebSocket, string>();

/**
 * An upgrade request never passes through Express, so this runs the app's own session and Passport middleware on it by
 * hand (the same store and deserializeUser as every HTTP request). A socket needs a logged-in user who passes the clan
 * gate, like the bingo routes.
 */
export function authorizeWithSession(middleware: RequestHandler[]): AuthorizeUpgrade {
  return (req) =>
    new Promise((resolve, reject) => {
      // Nothing is ever written to it: an upgrade is answered on the raw socket (or rejected, below).
      const res = new ServerResponse(req);
      let i = 0;
      const next = (err?: unknown): void => {
        if (err) {
          reject(err);
          return;
        }
        const handler = middleware[i++];
        if (handler) {
          handler(req as Request, res as Response, next);
          return;
        }
        const { user, sessionID } = req as Request;
        resolve(user && passesGuildGate(user) ? sessionID : null);
      };
      next();
    });
}

function reject(socket: Duplex, status: 401 | 500): void {
  const reason = status === 401 ? "Unauthorized" : "Internal Server Error";
  socket.once("finish", () => socket.destroy());
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

async function onUpgrade(authorize: AuthorizeUpgrade, req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
  // Until ws takes the socket over, a reset connection would otherwise be an unhandled 'error'.
  const onError = (): void => {
    socket.destroy();
  };
  socket.on("error", onError);
  if (new URL(req.url ?? "/", "http://localhost").pathname !== "/ws") {
    socket.destroy();
    return;
  }
  let sessionId: string | null;
  try {
    sessionId = await authorize(req);
  } catch (err) {
    log.warn("ws auth failed", { err });
    reject(socket, 500);
    return;
  }
  if (!sessionId) {
    reject(socket, 401);
    return;
  }
  const server = wss;
  if (!server || socket.destroyed) {
    socket.destroy();
    return;
  }
  socket.off("error", onError);
  server.handleUpgrade(req, socket, head, (ws) => {
    socketSessions.set(ws, sessionId);
    server.emit("connection", ws, req);
  });
}

export function initWebSocketServer(server: Server, authorize: AuthorizeUpgrade): void {
  const created = new WebSocketServer({ noServer: true });
  wss = created;
  created.on("connection", (socket: WebSocket) => {
    // Every logged-in clan member gets every event: payloads carry only IDs
    // (v1 leaked team names to every connected client).
    log.info("ws connect", { clients: created.clients.size });
    socket.on("close", () => log.info("ws close", { clients: created.clients.size }));
    socket.on("error", (err) => log.warn("ws error", { err }));
  });
  const listener = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
    void onUpgrade(authorize, req, socket, head);
  };
  server.on("upgrade", listener);
  detach = () => server.off("upgrade", listener);
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

/** Closes every socket opened under this session (on logout; a session that merely expires is caught at the next reconnect). */
export function closeSocketsForSession(sessionId: string): void {
  if (!wss) return;
  for (const client of wss.clients) {
    if (socketSessions.get(client) === sessionId) client.close(1008, "Logged out");
  }
}

export function closeWebSocketServer(): void {
  if (!wss) return;
  detach?.();
  detach = null;
  for (const client of wss.clients) client.terminate();
  wss.close();
  wss = null;
}
