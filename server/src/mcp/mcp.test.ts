// The admin MCP server end to end over real HTTP: OAuth discovery, registration, the admin's sign-in and approval,
// the token endpoint (PKCE, single-use codes, refresh rotation, expiry), and /mcp's bearer checks and list_bingos.
import { createHash, randomBytes } from "crypto";
import path from "path";
import type { AddressInfo } from "net";
import http, { type Server } from "http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import session from "express-session";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { auditLog, bingos, oauthTokens, signups, users } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { auditContext } from "../audit/middleware";
import { createMcpRouter } from "./router";
import { authorizeReturnPath, isAllowedRedirectUri, RETURN_COOKIE } from "./oauthProvider";
import { RATE_LIMIT, resetRateLimits, takeRateLimit } from "./tools";
import { listConnections, revokeConnection } from "./connections";
import { setUserAdmin } from "../services/userService";
import { buildReplica, resetReplica } from "./sql/replica";
import { saveTo, tempDir } from "../testUtils/mcpSql";

// Each test gets a fresh in-memory DB; modules that import "../db" (the audit middleware) see the current one.
let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

vi.mock("../db", () => ({
  get db() {
    return db;
  },
  get sqlite() {
    return sqlite;
  },
}));


declare module "express-session" {
  interface SessionData {
    testUserId?: string;
  }
}

const CALLBACK = "https://claude.ai/api/mcp/auth_callback";

let server: Server;
let base: string;
let adminId: string;
let playerId: string;

// The app as index.ts wires it, with a test login in place of Discord's.
function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => {
    const id = req.session.testUserId;
    if (id) req.user = db.select().from(users).where(eq(users.id, id)).get();
    next();
  });
  app.post("/test-login", (req, res) => {
    req.session.testUserId = (req.body as { userId: string }).userId;
    res.json({ ok: true });
  });
  app.use(auditContext);
  return app;
}

beforeAll(async () => {
  const app = buildApp();
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // Mounted once, over whichever test DB is current.
  app.use(createMcpRouter(new Proxy({} as typeof db, { get: (_t, key) => Reflect.get(db, key) }), { issuer: new URL(`${base}/`), resource: new URL(`${base}/mcp`) }, { rateLimit: false }));
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
  adminId = db.insert(users).values({ discordId: "1", discordUsername: "admin", isAdmin: true }).returning().get().id;
  playerId = db.insert(users).values({ discordId: "2", discordUsername: "player" }).returning().get().id;
  resetRateLimits();
});

afterEach(() => {
  vi.useRealTimers();
  sqlite.close();
});

/** A browser: keeps its cookies, never follows redirects. */
class Browser {
  private cookies = new Map<string, string>();

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookies.size) headers.set("cookie", [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    const res = await fetch(path.startsWith("http") ? path : `${base}${path}`, { ...init, headers, redirect: "manual" });
    for (const cookie of res.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const [name, ...value] = pair.split("=");
      this.cookies.set(name, value.join("="));
    }
    return res;
  }

  cookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  async login(userId: string): Promise<void> {
    await this.fetch("/test-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId }) });
  }
}

async function register(redirectUris: string[] = [CALLBACK]): Promise<Response> {
  return fetch(`${base}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Claude", redirect_uris: redirectUris, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }),
  });
}

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

function authorizePath(clientId: string, challenge: string, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: CALLBACK,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "st4te",
    scope: "bingo:read",
    resource: `${base}/mcp`,
    ...extra,
  });
  return `/authorize?${params}`;
}

/** The consent page's form fields. */
function formFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const m of html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)) {
    fields[m[1]] = m[2].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'");
  }
  return fields;
}

async function approve(browser: Browser, clientId: string, challenge: string, decision = "approve"): Promise<URL> {
  const page = await browser.fetch(authorizePath(clientId, challenge));
  expect(page.status).toBe(200);
  const fields = formFields(await page.text());
  const res = await browser.fetch("/authorize", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...fields, decision }),
  });
  expect(res.status).toBe(302);
  return new URL(res.headers.get("location")!);
}

async function token(params: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${base}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** A registered client, an approving admin, and the tokens it got. */
async function connect(userId = adminId): Promise<{ clientId: string; access: string; refresh: string }> {
  const clientId = ((await (await register()).json()) as { client_id: string }).client_id;
  const browser = new Browser();
  await browser.login(userId);
  const { verifier, challenge } = pkce();
  const code = (await approve(browser, clientId, challenge)).searchParams.get("code")!;
  const { body } = await token({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: verifier, redirect_uri: CALLBACK, resource: `${base}/mcp` });
  return { clientId, access: body.access_token as string, refresh: body.refresh_token as string };
}

async function callMcp(accessToken: string | null, message: object, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: JSON.stringify(message),
  });
}

/** The JSON-RPC message in a response, whether sent as JSON or as one server-sent event. */
async function rpcResult(res: Response): Promise<{ result?: Record<string, unknown>; error?: unknown }> {
  const text = await res.text();
  const data = text.startsWith("{") ? text : text.split("\n").find((l) => l.startsWith("data: "))!.slice(6);
  return JSON.parse(data);
}

describe("discovery", () => {
  it("serves Authorization Server Metadata with PKCE S256 and registration", async () => {
    const meta = (await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json()) as Record<string, unknown>;
    expect(meta).toMatchObject({
      issuer: `${base}/`,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/token`,
      registration_endpoint: `${base}/register`,
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["bingo:read"],
      authorization_response_iss_parameter_supported: true,
    });
  });

  it("serves Protected Resource Metadata at the /mcp path and at the root, naming only our issuer", async () => {
    for (const path of ["/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-protected-resource"]) {
      const meta = (await (await fetch(`${base}${path}`)).json()) as Record<string, unknown>;
      expect(meta).toMatchObject({ resource: `${base}/mcp`, authorization_servers: [`${base}/`], scopes_supported: ["bingo:read"] });
    }
  });
});

describe("registration", () => {
  it("registers Claude's callback and loopback callbacks", async () => {
    expect((await register()).status).toBe(201);
    expect((await register(["http://localhost:53682/callback", "http://127.0.0.1:1234/callback"])).status).toBe(201);
  });

  it("refuses any other redirect", async () => {
    const res = await register(["https://evil.example/api/mcp/auth_callback"]);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_redirect_uri");
  });

  it("allows only the exact callbacks", () => {
    expect(isAllowedRedirectUri("https://claude.com/api/mcp/auth_callback")).toBe(true);
    expect(isAllowedRedirectUri("http://localhost:9999/callback")).toBe(true);
    expect(isAllowedRedirectUri("https://localhost:9999/callback")).toBe(false);
    expect(isAllowedRedirectUri("http://localhost:9999/other")).toBe(false);
    expect(isAllowedRedirectUri("http://localhost.evil.example/callback")).toBe(false);
    expect(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback?x=1")).toBe(false);
  });
});

describe("authorize", () => {
  let clientId: string;
  beforeEach(async () => {
    clientId = ((await (await register()).json()) as { client_id: string }).client_id;
  });

  it("sends someone without a session to Discord login, to come back to the same request", async () => {
    const browser = new Browser();
    const path = authorizePath(clientId, pkce().challenge);
    const res = await browser.fetch(path);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/auth/discord");
    expect(authorizeReturnPath(`${RETURN_COOKIE}=${browser.cookie(RETURN_COOKIE)}`)).toBe(path);
  });

  it("resumes only /authorize requests", () => {
    expect(authorizeReturnPath(`other=1; ${RETURN_COOKIE}=${encodeURIComponent("/authorize?a=1")}`)).toBe("/authorize?a=1");
    expect(authorizeReturnPath(`${RETURN_COOKIE}=${encodeURIComponent("https://evil.example/authorize?a=1")}`)).toBeNull();
    expect(authorizeReturnPath(`${RETURN_COOKIE}=${encodeURIComponent("//evil.example/authorize?")}`)).toBeNull();
    expect(authorizeReturnPath(undefined)).toBeNull();
  });

  it("refuses anyone who isn't an Admin", async () => {
    const browser = new Browser();
    await browser.login(playerId);
    const res = await browser.fetch(authorizePath(clientId, pkce().challenge));
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("site admins can connect Claude");
  });

  it("asks an Admin once, naming the app and its redirect host, then redirects with a code, the state and iss", async () => {
    const browser = new Browser();
    await browser.login(adminId);
    const page = await browser.fetch(authorizePath(clientId, pkce().challenge));
    const html = await page.text();
    expect(html).toContain("Connect Claude to Tectonic Bingo?");
    expect(html).toContain("claude.ai");

    const location = await approve(browser, clientId, pkce().challenge);
    expect(`${location.origin}${location.pathname}`).toBe(CALLBACK);
    expect(location.searchParams.get("code")).toBeTruthy();
    expect(location.searchParams.get("state")).toBe("st4te");
    expect(location.searchParams.get("iss")).toBe(`${base}/`);
  });

  it("doesn't ask again while the Admin has a live connection to that app", async () => {
    const { clientId: connected } = await connect();
    const browser = new Browser();
    await browser.login(adminId);
    const res = await browser.fetch(authorizePath(connected, pkce().challenge));
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get("location")!).searchParams.get("code")).toBeTruthy();
  });

  it("sends a declined approval back as access_denied", async () => {
    const browser = new Browser();
    await browser.login(adminId);
    const location = await approve(browser, clientId, pkce().challenge, "deny");
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("code")).toBeNull();
  });

  it("ignores an approval posted without the consent page's token", async () => {
    const browser = new Browser();
    await browser.login(adminId);
    const params = Object.fromEntries(new URL(`${base}${authorizePath(clientId, pkce().challenge)}`).searchParams);
    const res = await browser.fetch("/authorize", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...params, decision: "approve" }) });
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("error")).toBe("invalid_request");
    expect(location.searchParams.get("code")).toBeNull();
  });

  it("refuses another resource or scope", async () => {
    const browser = new Browser();
    await browser.login(adminId);
    const cases: Record<string, string>[] = [{ resource: "https://other.example/mcp" }, { scope: "bingo:write" }];
    for (const extra of cases) {
      const res = await browser.fetch(authorizePath(clientId, pkce().challenge, extra));
      expect(res.status).toBe(302);
      expect(new URL(res.headers.get("location")!).searchParams.get("error")).toMatch(/invalid_target|invalid_scope/);
    }
  });
});

describe("token", () => {
  let clientId: string;
  let browser: Browser;
  beforeEach(async () => {
    clientId = ((await (await register()).json()) as { client_id: string }).client_id;
    browser = new Browser();
    await browser.login(adminId);
  });

  it("exchanges a code once, only with the right PKCE verifier, for an opaque hour-long token", async () => {
    const { verifier, challenge } = pkce();
    const code = (await approve(browser, clientId, challenge)).searchParams.get("code")!;
    const grant = { grant_type: "authorization_code", client_id: clientId, code, redirect_uri: CALLBACK };

    const wrong = await token({ ...grant, code_verifier: pkce().verifier });
    expect(wrong).toMatchObject({ status: 400, body: { error: "invalid_grant" } });

    const ok = await token({ ...grant, code_verifier: verifier });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "bingo:read" });
    expect(ok.body.refresh_token).toBeTruthy();
    // Only hashes are stored.
    const row = db.select().from(oauthTokens).get()!;
    expect(row.accessTokenHash).not.toBe(ok.body.access_token);
    expect(row).toMatchObject({ userId: adminId, clientId, resource: `${base}/mcp`, scope: "bingo:read" });

    const again = await token({ ...grant, code_verifier: verifier });
    expect(again).toMatchObject({ status: 400, body: { error: "invalid_grant" } });
  });

  it("rotates the refresh token: the old one gets invalid_grant", async () => {
    const { clientId: id, refresh } = await connect();
    const first = await token({ grant_type: "refresh_token", client_id: id, refresh_token: refresh });
    expect(first.status).toBe(200);
    expect(first.body.refresh_token).not.toBe(refresh);

    const reused = await token({ grant_type: "refresh_token", client_id: id, refresh_token: refresh });
    expect(reused).toMatchObject({ status: 400, body: { error: "invalid_grant" } });

    const next = await token({ grant_type: "refresh_token", client_id: id, refresh_token: first.body.refresh_token as string });
    expect(next.status).toBe(200);
  });

  it("lets a connection lapse 30 days after it was last used", async () => {
    const { clientId: id, refresh } = await connect();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 31 * 24 * 60 * 60 * 1000);
    const res = await token({ grant_type: "refresh_token", client_id: id, refresh_token: refresh });
    expect(res).toMatchObject({ status: 400, body: { error: "invalid_grant" } });
  });

  it("expires an access token after an hour", async () => {
    const { access } = await connect();
    expect((await callMcp(access, { jsonrpc: "2.0", id: 1, method: "tools/list" })).status).toBe(200);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61 * 60 * 1000);
    expect((await callMcp(access, { jsonrpc: "2.0", id: 1, method: "tools/list" })).status).toBe(401);
  });
});

describe("/mcp", () => {
  it("answers no token with a 401 pointing at the resource metadata", async () => {
    const res = await callMcp(null, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(res.status).toBe(401);
    const challenge = res.headers.get("www-authenticate")!;
    expect(challenge).toBe(`Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp", scope="bingo:read"`);
  });

  it("ignores a session cookie", async () => {
    const browser = new Browser();
    await browser.login(adminId);
    const res = await browser.fetch("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(401);
  });

  it("names the error for a bad token", async () => {
    const res = await callMcp("not-a-token", { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  it("refuses a token for another resource", async () => {
    const { access } = await connect();
    db.update(oauthTokens).set({ resource: "https://other.example/mcp" }).run();
    expect((await callMcp(access, { jsonrpc: "2.0", id: 1, method: "tools/list" })).status).toBe(401);
  });

  it("refuses a token whose user is no longer an Admin", async () => {
    const { access } = await connect();
    db.update(users).set({ isAdmin: false }).where(eq(users.id, adminId)).run();
    expect((await callMcp(access, { jsonrpc: "2.0", id: 1, method: "tools/list" })).status).toBe(401);
  });

  it("refuses a revoked token", async () => {
    const { clientId, access } = await connect();
    const res = await fetch(`${base}/revoke`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, token: access }) });
    expect(res.status).toBe(200);
    expect((await callMcp(access, { jsonrpc: "2.0", id: 1, method: "tools/list" })).status).toBe(401);
  });

  it("is POST only", async () => {
    expect((await fetch(`${base}/mcp`)).status).toBe(405);
    expect((await fetch(`${base}/mcp`, { method: "DELETE" })).status).toBe(405);
  });

  it("lists read-only tools", async () => {
    const { access } = await connect();
    const { result } = await rpcResult(await callMcp(access, { jsonrpc: "2.0", id: 1, method: "tools/list" }));
    const tools = result!.tools as { name: string; annotations: Record<string, unknown> }[];
    expect(tools.map((t) => t.name)).toEqual(["list_bingos", "bingo_summary", "tile_stats", "player_contributions", "describe_schema", "run_sql"]);
    for (const tool of tools) expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
  });

  it("answers list_bingos and audits the call", async () => {
    const bingo = db.insert(bingos).values({ slug: "summer", name: "Summer Bingo", boardRows: 5, boardCols: 5, createdByUserId: adminId, stage: "signup" }).returning().get();
    db.insert(signups).values([{ bingoId: bingo.id, userId: playerId, rsn: "Player" }, { bingoId: bingo.id, userId: adminId, rsn: "Admin", status: "withdrawn" }]).run();
    const { clientId, access } = await connect();

    const res = await callMcp(access, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_bingos", arguments: {} } });
    expect(res.status).toBe(200);
    const { result } = await rpcResult(res);
    expect(result!.structuredContent).toEqual({
      bingos: [expect.objectContaining({ slug: "summer", name: "Summer Bingo", stage: "signup", teams: 0, players: 1 })],
    });

    const entry = db.select().from(auditLog).where(eq(auditLog.action, "mcp.tool_called")).get()!;
    expect(entry).toMatchObject({ bingoId: null, actorUserId: adminId, actorRole: "admin", entityType: "mcp_tool", entityId: "list_bingos" });
    expect(JSON.parse(entry.details)).toEqual({ tool: "list_bingos", arguments: {}, clientId, clientName: "Claude" });
  });

  it("scopes a Bingo tool's audit entry to its Bingo, and answers an unknown slug with a tool error", async () => {
    const bingo = db.insert(bingos).values({ slug: "summer", name: "Summer Bingo", boardRows: 5, boardCols: 5, createdByUserId: adminId }).returning().get();
    const { access } = await connect();

    const ok = await rpcResult(await callMcp(access, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "bingo_summary", arguments: { slug: "summer" } } }));
    expect(ok.result!.isError).toBeFalsy();
    expect(ok.result!.structuredContent).toMatchObject({ bingo: { slug: "summer" }, standings: [] });

    const missing = await rpcResult(await callMcp(access, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "tile_stats", arguments: { slug: "nope" } } }));
    expect(missing.result).toMatchObject({ isError: true, content: [{ type: "text", text: expect.stringContaining('No Bingo has the slug "nope"') }] });

    const entries = db.select().from(auditLog).where(eq(auditLog.action, "mcp.tool_called")).all();
    expect(entries.map((e) => [e.entityId, e.bingoId])).toEqual([["bingo_summary", bingo.id], ["tile_stats", null]]);
  });

  it("answers run_sql from the replica and audits the query and its row count", async () => {
    db.insert(bingos).values({ slug: "summer", name: "Summer Bingo", boardRows: 5, boardCols: 5, createdByUserId: adminId }).returning().get();
    const { clientId, access } = await connect();
    const dir = tempDir();
    try {
      await buildReplica(saveTo(sqlite, path.join(dir.dir, "bingo.db")), path.join(dir.dir, "replica.db"));
      const query = "SELECT slug FROM bingos";
      const { result } = await rpcResult(await callMcp(access, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "run_sql", arguments: { query } } }));
      expect(result!.structuredContent).toMatchObject({ columns: ["slug"], rows: [["summer"]], rowCount: 1, dataAge: "data as of less than a minute ago" });

      const refused = await rpcResult(await callMcp(access, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "run_sql", arguments: { query: "DELETE FROM bingos" } } }));
      expect(refused.result).toMatchObject({ isError: true });

      const entries = db.select().from(auditLog).where(eq(auditLog.action, "mcp.tool_called")).all().map((e) => JSON.parse(e.details));
      expect(entries).toEqual([
        { tool: "run_sql", arguments: { query }, clientId, clientName: "Claude", rowCount: 1 },
        { tool: "run_sql", arguments: { query: "DELETE FROM bingos" }, clientId, clientName: "Claude", error: expect.stringContaining("read-only") },
      ]);
    } finally {
      resetReplica();
      dir.cleanup();
    }
  });

  it("only accepts its own host name", async () => {
    const { access } = await connect();
    // fetch won't send another Host header, so this goes through node:http.
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(`${base}/mcp`, { method: "POST", headers: { host: "evil.example", authorization: `Bearer ${access}`, "content-type": "application/json", accept: "application/json, text/event-stream" } }, (res) => {
        res.resume();
        resolve(res.statusCode!);
      });
      req.on("error", reject);
      req.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    });
    expect(status).toBe(403);
  });
});

describe("rate limit", () => {
  it("allows RATE_LIMIT.calls per window per connection", () => {
    const start = 1_000_000;
    for (let i = 0; i < RATE_LIMIT.calls; i++) expect(takeRateLimit("a", start).ok).toBe(true);
    expect(takeRateLimit("a", start + 1000)).toEqual({ ok: false, retryAfterSeconds: 59 });
    expect(takeRateLimit("b", start + 1000).ok).toBe(true);
    expect(takeRateLimit("a", start + RATE_LIMIT.windowMs).ok).toBe(true);
  });
});

describe("connections", () => {
  const tools = { jsonrpc: "2.0", id: 1, method: "tools/list" };

  it("lists an Admin's live connections with the app's name and redirect host", async () => {
    await connect();
    const otherAdmin = db.insert(users).values({ discordId: "3", discordUsername: "other", isAdmin: true }).returning().get().id;
    await connect(otherAdmin);
    const mine = listConnections(db, adminId);
    expect(mine).toEqual([expect.objectContaining({ clientName: "Claude", redirectHost: "claude.ai", user: expect.objectContaining({ id: adminId, discordUsername: "admin" }) })]);
    expect(listConnections(db).map((c) => c.user.id).sort()).toEqual([adminId, otherAdmin].sort());
  });

  it("revoking your own connection stops its access and refresh tokens at once, and is audited", async () => {
    const { clientId, access, refresh } = await connect();
    const [conn] = listConnections(db, adminId);
    revokeConnection(db, conn.id, { id: adminId, isSiteAdmin: false });

    expect((await callMcp(access, tools)).status).toBe(401);
    expect(await token({ grant_type: "refresh_token", client_id: clientId, refresh_token: refresh })).toMatchObject({ status: 400, body: { error: "invalid_grant" } });
    expect(listConnections(db, adminId)).toEqual([]);
    const entry = db.select().from(auditLog).where(eq(auditLog.action, "mcp.connection_revoked")).get()!;
    expect(entry).toMatchObject({ bingoId: null, entityType: "mcp_connection", entityId: conn.id });
    expect(JSON.parse(entry.details)).toEqual({ clientName: "Claude", redirectHost: "claude.ai", ownerUserId: adminId, ownerName: "admin", byOwner: true, reason: "revoked" });
  });

  it("only lets a Site Admin revoke someone else's connection", async () => {
    const { access } = await connect();
    const [conn] = listConnections(db, adminId);
    const otherAdmin = db.insert(users).values({ discordId: "3", discordUsername: "other", isAdmin: true }).returning().get().id;

    expect(() => revokeConnection(db, conn.id, { id: otherAdmin, isSiteAdmin: false })).toThrow("Connection not found");
    expect((await callMcp(access, tools)).status).toBe(200);

    revokeConnection(db, conn.id, { id: otherAdmin, isSiteAdmin: true });
    expect((await callMcp(access, tools)).status).toBe(401);
    expect(JSON.parse(db.select().from(auditLog).where(eq(auditLog.action, "mcp.connection_revoked")).get()!.details)).toMatchObject({ ownerUserId: adminId, byOwner: false });
    // Already revoked: nothing left to revoke.
    expect(() => revokeConnection(db, conn.id, { id: otherAdmin, isSiteAdmin: true })).toThrow("Connection not found");
  });

  it("revokes every token when the Admin role is removed, in the same change, and doesn't bring them back with the role", async () => {
    const first = await connect();
    const second = await connect();
    setUserAdmin(db, adminId, false);

    expect(db.select().from(oauthTokens).all().every((t) => t.revokedAt !== null)).toBe(true);
    const entries = db.select().from(auditLog).where(eq(auditLog.action, "mcp.connection_revoked")).all().map((e) => JSON.parse(e.details));
    expect(entries).toEqual([expect.objectContaining({ reason: "admin_removed", ownerUserId: adminId }), expect.objectContaining({ reason: "admin_removed", ownerUserId: adminId })]);

    setUserAdmin(db, adminId, true);
    expect((await callMcp(first.access, tools)).status).toBe(401);
    expect((await token({ grant_type: "refresh_token", client_id: second.clientId, refresh_token: second.refresh })).body).toMatchObject({ error: "invalid_grant" });
  });
});
