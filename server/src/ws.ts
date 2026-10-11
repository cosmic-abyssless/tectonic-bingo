import { WebSocketServer, WebSocket } from "ws";
import { ServerResponse, type IncomingMessage, type Server } from "http";
import type { Duplex } from "stream";
import type { Request, RequestHandler, Response } from "express";
import { MAX_WATCHED_BINGOS, type BroadcastEvent, type ClientSocketMessage, type ServerSocketMessage } from "@bingo/shared";
import { passesGuildGate } from "./middleware/requireGuildMember";
import { createCoalescer, type Outgoing } from "./broadcastCoalescing";
import { helloMessage } from "./buildInfo";
import { log } from "./log";

/** Who opened a socket: the session it belongs to and its user. */
export interface SocketOwner {
  sessionId: string;
  userId: string;
}

/** Decides whether an upgrade request may open a socket: whose it is if so, null if not. */
export type AuthorizeUpgrade = (req: IncomingMessage) => Promise<SocketOwner | null>;

/** The most a client may send up its socket in one message (a watch list is far smaller). */
const MAX_CLIENT_MESSAGE_BYTES = 16 * 1024;

let wss: WebSocketServer | null = null;
let detach: (() => void) | null = null;
// Whose each socket is (so logging out can close that session's sockets, and an event for some users reaches only
// theirs), and which Bingos it watches: null until it says, when it gets every Bingo's events (a tab from before
// watching existed).
const sockets = new WeakMap<WebSocket, SocketOwner & { watching: ReadonlySet<string> | null; presence: SocketPresence | null }>();

/** What a socket last said of its tab (ClientSocketMessage "presence"); null until it says (an older tab). */
export type SocketPresence = Omit<Extract<ClientSocketMessage, { type: "presence" }>, "type">;

/** Told of every presence message, with whose socket sent it (notificationPresence.ts records it). */
let presenceListener: ((owner: SocketOwner, presence: SocketPresence) => void) | null = null;
export function onPresence(listener: ((owner: SocketOwner, presence: SocketPresence) => void) | null): void {
  presenceListener = listener;
}

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
        resolve(user && passesGuildGate(user) ? { sessionId: sessionID, userId: user.id } : null);
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
  let owner: SocketOwner | null;
  try {
    owner = await authorize(req);
  } catch (err) {
    log.warn("ws auth failed", { err });
    reject(socket, 500);
    return;
  }
  if (!owner) {
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
    sockets.set(ws, { ...owner, watching: null, presence: null });
    server.emit("connection", ws, req);
  });
}

function parseMessage(data: unknown): { type?: unknown } | null {
  try {
    const msg: unknown = JSON.parse(String(data));
    return typeof msg === "object" && msg !== null ? (msg as { type?: unknown }) : null;
  } catch {
    return null;
  }
}

const PERMISSIONS = new Set(["granted", "denied", "default", "unsupported"]);

/** A valid presence message's contents, or null for anything else (ignored). */
function parsePresence(msg: { type?: unknown } | null): SocketPresence | null {
  if (msg?.type !== "presence") return null;
  const { visible, notifications, bingoId } = msg as { visible?: unknown; notifications?: unknown; bingoId?: unknown };
  if (typeof visible !== "boolean" || typeof notifications !== "string" || !PERMISSIONS.has(notifications)) return null;
  if (bingoId !== null && (typeof bingoId !== "string" || bingoId.length > 64)) return null;
  return { visible, notifications: notifications as SocketPresence["notifications"], bingoId };
}

/** The Bingo ids of a valid watch message, or null for anything else (ignored). */
function parseWatch(msg: { type?: unknown } | null): string[] | null {
  if (msg?.type !== "watch") return null;
  const { bingoIds } = msg as { bingoIds?: unknown };
  if (!Array.isArray(bingoIds) || bingoIds.length > MAX_WATCHED_BINGOS) return null;
  return bingoIds.every((id): id is string => typeof id === "string" && id.length <= 64) ? bingoIds : null;
}

export function initWebSocketServer(server: Server, authorize: AuthorizeUpgrade): void {
  const created = new WebSocketServer({ noServer: true, maxPayload: MAX_CLIENT_MESSAGE_BYTES });
  wss = created;
  created.on("connection", (socket: WebSocket) => {
    // Any logged-in clan member may watch any Bingo: payloads carry only IDs (v1 leaked team names to every connected
    // client), and each client refetches under its own auth.
    log.info("ws connect", { clients: created.clients.size });
    // The build this server serves, so a page from an older one offers a reload (buildInfo.ts).
    const hello = helloMessage();
    if (hello) socket.send(JSON.stringify(hello));
    socket.on("message", (data) => {
      const msg = parseMessage(data);
      const info = sockets.get(socket);
      if (!info) return;
      const bingoIds = parseWatch(msg);
      if (bingoIds) info.watching = new Set(bingoIds);
      const presence = parsePresence(msg);
      if (presence) {
        info.presence = presence;
        try {
          presenceListener?.({ sessionId: info.sessionId, userId: info.userId }, presence);
        } catch (err) {
          log.warn("presence listener failed", { err });
        }
      }
    });
    socket.on("close", () => log.info("ws close", { clients: created.clients.size }));
    socket.on("error", (err) => log.warn("ws error", { err }));
  });
  const listener = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
    void onUpgrade(authorize, req, socket, head);
  };
  server.on("upgrade", listener);
  detach = () => server.off("upgrade", listener);
}

/** Whether this socket gets this event: its Bingo's watchers (everyone, for a site-wide one), and only `to` if it's for some users. */
function wants(client: WebSocket, { event, to }: Outgoing): boolean {
  const info = sockets.get(client);
  if (to && (!info || !to.includes(info.userId))) return false;
  const bingoId = "bingoId" in event ? event.bingoId : null;
  return !bingoId || !info?.watching || info.watching.has(bingoId);
}

function deliver(out: Outgoing): void {
  if (!wss) return;
  const msg = JSON.stringify(out.event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN && wants(client, out)) client.send(msg);
  }
}

const coalescer = createCoalescer(deliver);

/**
 * Tells the clients watching the event's Bingo (every client, for a site-wide one; with `to`, only those users'). A
 * burst of one type for one Bingo goes out as the first at once and the rest as one shortly after (broadcastCoalescing.ts).
 */
export function broadcast(event: BroadcastEvent, options: { to?: readonly string[] } = {}): void {
  if (!wss) return;
  coalescer.push({ event, ...(options.to ? { to: options.to } : {}) });
}

/**
 * Where a user has the site open, from their sockets on this server: any tab at all, any in view, and any hidden one
 * in a browser that allowed notifications. A tab that hasn't said (an older page) counts as open and in view.
 */
export interface UserPresence {
  open: boolean;
  visible: boolean;
  hiddenWithPermission: boolean;
  /** Hidden tabs in browsers that didn't allow notifications. */
  hiddenWithoutPermission: boolean;
}

export function userPresence(userId: string): UserPresence {
  const out: UserPresence = { open: false, visible: false, hiddenWithPermission: false, hiddenWithoutPermission: false };
  if (!wss) return out;
  for (const client of wss.clients) {
    const info = sockets.get(client);
    if (client.readyState !== WebSocket.OPEN || info?.userId !== userId) continue;
    out.open = true;
    if (!info.presence || info.presence.visible) out.visible = true;
    else if (info.presence.notifications === "granted") out.hiddenWithPermission = true;
    else out.hiddenWithoutPermission = true;
  }
  return out;
}

/** Sends each of a user's open sockets what `pick` makes for it from its presence (nothing, for null). Not coalesced. */
export function sendToUser(userId: string, pick: (presence: SocketPresence | null) => ServerSocketMessage | null): void {
  if (!wss) return;
  for (const client of wss.clients) {
    const info = sockets.get(client);
    if (client.readyState !== WebSocket.OPEN || info?.userId !== userId) continue;
    const msg = pick(info.presence);
    if (msg) client.send(JSON.stringify(msg));
  }
}

/** Closes every socket opened under this session (on logout; a session that merely expires is caught at the next reconnect). */
export function closeSocketsForSession(sessionId: string): void {
  if (!wss) return;
  for (const client of wss.clients) {
    if (sockets.get(client)?.sessionId === sessionId) client.close(1008, "Logged out");
  }
}

export function closeWebSocketServer(): void {
  if (!wss) return;
  detach?.();
  detach = null;
  coalescer.clear();
  for (const client of wss.clients) client.terminate();
  wss.close();
  wss = null;
}
