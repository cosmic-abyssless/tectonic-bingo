// The live-update socket is for logged-in clan members only, checked on the upgrade with the same session and Passport
// machinery as HTTP requests, and a logout closes that session's sockets. A Bingo's events go to the sockets watching it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import session from "express-session";
import { Passport } from "passport";
import http from "http";
import type { AddressInfo } from "net";
import { WebSocket } from "ws";
import type { BroadcastEvent } from "@bingo/shared";

const ORIGINAL_ENV = { ...process.env };

const users: Record<string, Partial<Express.User>> = {
  member: { id: "member", inGuild: true, isAdmin: false },
  outsider: { id: "outsider", inGuild: false, isAdmin: false },
  admin: { id: "admin", inGuild: false, isAdmin: true },
};

let server: http.Server;
let base: string;
let ws: typeof import("./ws");

beforeAll(async () => {
  // routes/auth pulls in the database.
  process.env.DB_PATH = ":memory:";
  process.env.NODE_ENV = "test";
  ws = await import("./ws");
  const { default: authRouter } = await import("./routes/auth");

  // Its own Passport, so nothing leaks into the app-wide one.
  const passport = new Passport();
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id: string, done) => done(null, (users[id] as Express.User | undefined) ?? false));
  const sessionAuth = [
    session({ secret: "test", resave: false, saveUninitialized: false, store: new session.MemoryStore() }),
    passport.initialize(),
    passport.session(),
  ];

  const app = express();
  app.use(express.json());
  app.use(...sessionAuth);
  app.post("/test-login/:id", (req, res, next) => {
    req.login(users[req.params.id] as Express.User, (err) => (err ? next(err) : res.end()));
  });
  app.use("/auth", authRouter);

  server = http.createServer(app);
  ws.initWebSocketServer(server, ws.authorizeWithSession(sessionAuth));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  ws.closeWebSocketServer();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  process.env = ORIGINAL_ENV;
});

async function login(who: string): Promise<string> {
  const res = await fetch(`http://${base}/test-login/${who}`, { method: "POST" });
  expect(res.status).toBe(200);
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

/** Opens a socket; resolves once it's open, or rejects with the server's refusal. */
function connect(cookie?: string, path = "/ws"): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://${base}${path}`, { headers: cookie ? { cookie } : {} });
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

const nextMessage = (socket: WebSocket) =>
  new Promise<BroadcastEvent>((resolve) => socket.once("message", (data) => resolve(JSON.parse(String(data)) as BroadcastEvent)));
const closed = (socket: WebSocket) => new Promise<number>((resolve) => socket.once("close", (code) => resolve(code)));

describe("the /ws upgrade", () => {
  it("is refused with 401 when there is no session", async () => {
    await expect(connect()).rejects.toThrow("Unexpected server response: 401");
  });

  it("is refused with 401 for a session whose cookie doesn't match any session", async () => {
    await expect(connect("connect.sid=s%3Anope.nope")).rejects.toThrow("Unexpected server response: 401");
  });

  it("is refused with 401 for a logged-in user who isn't in the clan's Discord server", async () => {
    await expect(connect(await login("outsider"))).rejects.toThrow("Unexpected server response: 401");
  });

  it("refuses an upgrade on any other path", async () => {
    await expect(connect(await login("member"), "/elsewhere")).rejects.toThrow();
  });

  it("lets a clan member (and a site admin) in, and they get broadcasts unchanged", async () => {
    const member = await connect(await login("member"));
    const admin = await connect(await login("admin"));
    const event: BroadcastEvent = { type: "stage_changed", bingoId: "b1", payload: { stage: "live" } };
    const received = Promise.all([nextMessage(member), nextMessage(admin)]);
    ws.broadcast(event);
    expect(await received).toEqual([event, event]);
    member.close();
    admin.close();
  });
});

describe("watching Bingos", () => {
  // The server reads a socket's messages in order; this gives a sent one time to land before the test broadcasts.
  const settle = () => new Promise((resolve) => setTimeout(resolve, 100));
  /** Every event a socket receives from now on. */
  const record = (socket: WebSocket) => {
    const got: BroadcastEvent[] = [];
    socket.on("message", (data) => got.push(JSON.parse(String(data)) as BroadcastEvent));
    return got;
  };
  const stage = (bingoId: string): BroadcastEvent => ({ type: "stage_changed", bingoId, payload: { stage: "live" } });
  const watch = (socket: WebSocket, bingoIds: unknown) => socket.send(JSON.stringify({ type: "watch", bingoIds }));

  it("sends a Bingo's events only to the sockets watching it, and site-wide ones to everyone", async () => {
    const cookie = await login("member");
    const onB1 = await connect(cookie);
    const onB2 = await connect(cookie);
    watch(onB1, ["b1"]);
    watch(onB2, ["b2", "b3"]);
    const [got1, got2] = [record(onB1), record(onB2)];
    await settle();

    ws.broadcast(stage("b1"));
    ws.broadcast(stage("b3"));
    ws.broadcast({ type: "bug_report_changed", payload: { id: "r1" } });
    await settle();
    expect(got1).toEqual([stage("b1"), { type: "bug_report_changed", payload: { id: "r1" } }]);
    expect(got2).toEqual([stage("b3"), { type: "bug_report_changed", payload: { id: "r1" } }]);
    onB1.close();
    onB2.close();
  });

  it("sends everything to a socket that never said what it watches (a tab from before watching)", async () => {
    const old = await connect(await login("member"));
    const got = record(old);
    ws.broadcast(stage("b1"));
    ws.broadcast(stage("b2"));
    await settle();
    expect(got).toEqual([stage("b1"), stage("b2")]);
    old.close();
  });

  it("follows a new watch list, and ignores a malformed one", async () => {
    const socket = await connect(await login("member"));
    const got = record(socket);
    watch(socket, ["b1"]);
    await settle();
    watch(socket, ["b2"]);
    for (const bad of ["not json", JSON.stringify({ type: "watch", bingoIds: "b1" }), JSON.stringify({ type: "watch", bingoIds: [1] }), JSON.stringify({ type: "watch", bingoIds: Array.from({ length: 51 }, (_, i) => `b${i}`) }), JSON.stringify({ type: "other" }), "null"]) socket.send(bad);
    await settle();
    ws.broadcast(stage("b1"));
    ws.broadcast(stage("b2"));
    await settle();
    expect(got).toEqual([stage("b2")]);
    expect(socket.readyState).toBe(WebSocket.OPEN);
    socket.close();
  });

  it("sends an event for some users only to their sockets, among those watching its Bingo", async () => {
    const member = await connect(await login("member"));
    const admin = await connect(await login("admin"));
    const memberElsewhere = await connect(await login("member"));
    watch(memberElsewhere, ["b2"]);
    const [gotMember, gotAdmin, gotElsewhere] = [record(member), record(admin), record(memberElsewhere)];
    await settle();

    const rating: BroadcastEvent = { type: "draft_rating_changed", bingoId: "b1", payload: { teamId: "t1" } };
    ws.broadcast(rating, { to: ["member"] });
    await settle();
    expect(gotMember).toEqual([rating]);
    expect(gotAdmin).toEqual([]);
    expect(gotElsewhere).toEqual([]);
    for (const s of [member, admin, memberElsewhere]) s.close();
  });
});

describe("logging out", () => {
  it("closes that session's sockets, and only those", async () => {
    const cookie = await login("member");
    const mine = [await connect(cookie), await connect(cookie)];
    const someoneElse = await connect(await login("member"));
    const bothClosed = Promise.all(mine.map(closed));

    const res = await fetch(`http://${base}/auth/logout`, { method: "POST", headers: { cookie } });
    expect(res.status).toBe(200);
    expect(await bothClosed).toEqual([1008, 1008]);
    expect(someoneElse.readyState).toBe(WebSocket.OPEN);

    // The logged-out cookie no longer opens a socket.
    await expect(connect(cookie)).rejects.toThrow("Unexpected server response: 401");
    someoneElse.close();
  });
});
