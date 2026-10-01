// The admin MCP server's OAuth 2.1 authorization server, over SQLite (docs: #289, #290). The SDK's mcpAuthRouter serves
// the endpoints (discovery, /register, /authorize, /token, /revoke) and calls this provider for everything that needs
// storage or a person: registering Claude's apps, the admin's sign-in and approval, and issuing and checking tokens.
//
// Sign-in reuses the site's Discord login: /authorize reads the session's user, sends someone without one to Discord
// and back, refuses anyone who isn't a site Admin, and asks an Admin once per app before handing it a code. Every code
// and token is random, and only its SHA-256 is stored.
import { createHash, randomBytes } from "crypto";
import { and, eq, gte, isNull, lt, notExists, or, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { Request, Response } from "express";
// /mcp's bearer check is v2's (@modelcontextprotocol/express), which only recognises v2's OAuthError.
import { OAuthError, OAuthErrorCode, type OAuthClientInformationFull, type OAuthTokens } from "@modelcontextprotocol/server";
import {
  AccessDeniedError,
  CustomOAuthError,
  InvalidGrantError,
  InvalidRequestError,
  InvalidScopeError,
  InvalidTargetError,
  type AuthInfo,
  type AuthorizationParams,
  type OAuthRegisteredClientsStore,
  type OAuthServerProvider,
} from "@modelcontextprotocol/server-legacy/auth";
import * as schema from "../db/schema";
import { oauthClients, oauthCodes, oauthTokens, users } from "../db/schema";
import { can, discordName } from "@bingo/shared";
import { siteRoles } from "../services/permissions";
import { MCP_SCOPE, type McpUrls } from "./config";
import { consentPage, messagePage } from "./pages";
import { now as clockNow } from "../clock";

type Db = BetterSQLite3Database<typeof schema>;

export const CODE_TTL_MS = 10 * 60 * 1000;
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
/** A connection (and its refresh token) lapses this long after it was last used. */
export const CONNECTION_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
/** A registration nobody has finished signing in with is deleted after this long. */
export const UNUSED_CLIENT_TTL_MS = 24 * 60 * 60 * 1000;

/** Where, after the admin's Discord login, to pick the authorize request back up (a path on this site). */
export const RETURN_COOKIE = "mcp_authorize_return";

// claude.ai and Claude Desktop come back through Claude's own callback; Claude Code listens on a loopback port.
const CLAUDE_CALLBACKS = new Set(["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** The authorize request to resume after a Discord login (see RETURN_COOKIE), or null: only ever a path under /authorize. */
export function authorizeReturnPath(cookieHeader: string | undefined): string | null {
  for (const part of (cookieHeader ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== RETURN_COOKIE) continue;
    let value: string;
    try {
      value = decodeURIComponent(rest.join("="));
    } catch {
      return null;
    }
    return value.startsWith("/authorize?") ? value : null;
  }
  return null;
}

export function isAllowedRedirectUri(uri: string): boolean {
  if (CLAUDE_CALLBACKS.has(uri)) return true;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname) && url.pathname === "/callback" && !url.search && !url.hash && !url.username && !url.password;
}

function invalidToken(message: string): OAuthError {
  return new OAuthError(OAuthErrorCode.InvalidToken, message);
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function newSecret(): string {
  return randomBytes(32).toString("base64url");
}

declare module "express-session" {
  interface SessionData {
    /** The consent page's anti-forgery token: its form must post this back for the approval to count. */
    mcpConsentToken?: string;
  }
}

export class SqliteOAuthProvider implements OAuthServerProvider {
  constructor(
    private readonly db: Db,
    private readonly urls: McpUrls,
    private readonly now: () => Date = clockNow,
  ) {}

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: (clientId) => {
        const row = this.db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).get();
        return row ? (JSON.parse(row.metadataJson) as OAuthClientInformationFull) : undefined;
      },
      registerClient: (client) => {
        const bad = client.redirect_uris.filter((uri) => !isAllowedRedirectUri(String(uri)));
        if (bad.length > 0 || client.redirect_uris.length === 0) {
          throw new CustomOAuthError("invalid_redirect_uri", `Only Claude's callbacks and loopback http://localhost/callback redirects are allowed, not ${bad.join(", ")}`);
        }
        this.prune();
        const full = client as OAuthClientInformationFull;
        this.db
          .insert(oauthClients)
          .values({ clientId: full.client_id, clientSecret: full.client_secret ?? null, metadataJson: JSON.stringify(full), createdAt: this.now() })
          .run();
        return full;
      },
    };
  }

  /** Clears out expired codes, lapsed connections, and registrations that never got a connection. */
  prune(): void {
    const now = this.now().getTime();
    this.db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, new Date(now))).run();
    this.db.delete(oauthTokens).where(lt(oauthTokens.lastUsedAt, new Date(now - CONNECTION_IDLE_MS))).run();
    this.db
      .delete(oauthClients)
      .where(
        and(
          lt(oauthClients.createdAt, new Date(now - UNUSED_CLIENT_TTL_MS)),
          notExists(this.db.select({ one: sql`1` }).from(oauthTokens).where(eq(oauthTokens.clientId, oauthClients.clientId))),
          notExists(this.db.select({ one: sql`1` }).from(oauthCodes).where(eq(oauthCodes.clientId, oauthClients.clientId))),
        ),
      )
      .run();
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    const req = res.req as Request;
    const requested = (params.scopes ?? []).filter(Boolean);
    if (requested.some((s) => s !== MCP_SCOPE)) throw new InvalidScopeError(`The only scope is ${MCP_SCOPE}`);
    if (params.resource && params.resource.href !== this.urls.resource.href) throw new InvalidTargetError(`The only resource is ${this.urls.resource.href}`);

    const user = req.user;
    if (!user) {
      if (req.method !== "GET") {
        res.status(401).type("html").send(messagePage("Signed out", "Your login ended before you approved the app. Start connecting again from Claude."));
        return;
      }
      // Discord login, then back to this same authorize request (routes/auth.ts reads the cookie).
      res.cookie(RETURN_COOKIE, req.originalUrl, { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: CODE_TTL_MS, path: "/" });
      res.redirect("/auth/discord");
      return;
    }
    if (!can(siteRoles(user), null, "administer_site").ok) {
      res.status(403).type("html").send(messagePage("Admins only", "Only Tectonic Bingo's site admins can connect Claude. Ask an admin if you need this."));
      return;
    }

    if (req.method === "POST") {
      const body = req.body as { decision?: string; consent_token?: string };
      const expected = req.session.mcpConsentToken;
      delete req.session.mcpConsentToken;
      if (!expected || body.consent_token !== expected) throw new InvalidRequestError("The approval form expired; start connecting again");
      if (body.decision !== "approve") throw new AccessDeniedError("The admin declined to connect this app");
    } else if (!this.hasLiveConnection(user.id, client.client_id)) {
      const token = newSecret();
      req.session.mcpConsentToken = token;
      const fields: Record<string, string> = {
        client_id: client.client_id,
        redirect_uri: params.redirectUri,
        response_type: "code",
        code_challenge: params.codeChallenge,
        code_challenge_method: "S256",
        consent_token: token,
      };
      if (requested.length > 0) fields.scope = requested.join(" ");
      if (params.state !== undefined) fields.state = params.state;
      if (params.resource) fields.resource = params.resource.href;
      res
        .status(200)
        .set("Cache-Control", "no-store")
        .type("html")
        .send(consentPage({ appName: client.client_name || "An unnamed app", redirectHost: new URL(params.redirectUri).host, adminName: discordName(user), fields }));
      return;
    }

    const code = newSecret();
    this.db
      .insert(oauthCodes)
      .values({
        codeHash: hash(code),
        clientId: client.client_id,
        userId: user.id,
        codeChallenge: params.codeChallenge,
        redirectUri: params.redirectUri,
        resource: this.urls.resource.href,
        scope: MCP_SCOPE,
        expiresAt: new Date(this.now().getTime() + CODE_TTL_MS),
      })
      .run();
    const target = new URL(params.redirectUri);
    target.searchParams.set("code", code);
    if (params.state !== undefined) target.searchParams.set("state", params.state);
    // The SDK appends `iss` to this redirect (RFC 9207).
    res.redirect(302, target.href);
  }

  /** Whether this admin already approved this app and the connection is still live: then no second approval is asked. */
  private hasLiveConnection(userId: string, clientId: string): boolean {
    const idleSince = new Date(this.now().getTime() - CONNECTION_IDLE_MS);
    const row = this.db
      .select({ id: oauthTokens.id })
      .from(oauthTokens)
      .where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.clientId, clientId), isNull(oauthTokens.revokedAt), gte(oauthTokens.lastUsedAt, idleSince)))
      .get();
    return !!row;
  }

  private liveCode(client: OAuthClientInformationFull, code: string) {
    const row = this.db.select().from(oauthCodes).where(eq(oauthCodes.codeHash, hash(code))).get();
    if (!row || row.clientId !== client.client_id || row.expiresAt.getTime() <= this.now().getTime()) {
      throw new InvalidGrantError("The authorization code is invalid, expired or already used");
    }
    return row;
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    return this.liveCode(client, authorizationCode).codeChallenge;
  }

  async exchangeAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string, _codeVerifier?: string, redirectUri?: string, resource?: URL): Promise<OAuthTokens> {
    const row = this.liveCode(client, authorizationCode);
    // Used up whatever happens next: a code works once.
    const deleted = this.db.delete(oauthCodes).where(eq(oauthCodes.codeHash, row.codeHash)).returning({ codeHash: oauthCodes.codeHash }).all();
    if (deleted.length === 0) throw new InvalidGrantError("The authorization code was already used");
    if (redirectUri !== undefined && redirectUri !== row.redirectUri) throw new InvalidGrantError("redirect_uri doesn't match the authorization request");
    if (resource && resource.href !== row.resource) throw new InvalidTargetError(`The only resource is ${row.resource}`);
    if (!this.isAdmin(row.userId)) throw new InvalidGrantError("The user is no longer a site admin");

    const access = newSecret();
    const refresh = newSecret();
    const now = this.now();
    this.db
      .insert(oauthTokens)
      .values({
        accessTokenHash: hash(access),
        refreshTokenHash: hash(refresh),
        userId: row.userId,
        clientId: client.client_id,
        scope: row.scope,
        resource: row.resource,
        accessExpiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS),
        lastUsedAt: now,
        createdAt: now,
      })
      .run();
    return this.tokenResponse(access, refresh, row.scope);
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, scopes?: string[], resource?: URL): Promise<OAuthTokens> {
    const oldHash = hash(refreshToken);
    const row = this.db.select().from(oauthTokens).where(eq(oauthTokens.refreshTokenHash, oldHash)).get();
    const now = this.now();
    if (!row || row.clientId !== client.client_id || row.revokedAt || row.lastUsedAt.getTime() + CONNECTION_IDLE_MS < now.getTime()) {
      throw new InvalidGrantError("The refresh token is invalid, expired or revoked");
    }
    if (scopes?.some((s) => s !== row.scope)) throw new InvalidScopeError(`The only scope is ${row.scope}`);
    if (resource && resource.href !== row.resource) throw new InvalidTargetError(`The only resource is ${row.resource}`);
    if (!this.isAdmin(row.userId)) throw new InvalidGrantError("The user is no longer a site admin");

    const access = newSecret();
    const refresh = newSecret();
    // Replaces the pair only if it's still the one presented, so two refreshes racing with one token can't both win.
    const updated = this.db
      .update(oauthTokens)
      .set({ accessTokenHash: hash(access), refreshTokenHash: hash(refresh), accessExpiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS), lastUsedAt: now })
      .where(and(eq(oauthTokens.id, row.id), eq(oauthTokens.refreshTokenHash, oldHash)))
      .returning({ id: oauthTokens.id })
      .all();
    if (updated.length === 0) throw new InvalidGrantError("The refresh token was already used");
    return this.tokenResponse(access, refresh, row.scope);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const row = this.db
      .select({ token: oauthTokens, isAdmin: users.isAdmin })
      .from(oauthTokens)
      .innerJoin(users, eq(users.id, oauthTokens.userId))
      .where(eq(oauthTokens.accessTokenHash, hash(token)))
      .get();
    const now = this.now();
    if (!row || row.token.revokedAt || row.token.accessExpiresAt.getTime() <= now.getTime()) throw invalidToken("The access token is invalid, expired or revoked");
    if (row.token.resource !== this.urls.resource.href) throw invalidToken("The access token is for another resource");
    if (!can(siteRoles(row), null, "administer_site").ok) throw invalidToken("The user is no longer a site admin");

    this.db.update(oauthTokens).set({ lastUsedAt: now }).where(eq(oauthTokens.id, row.token.id)).run();
    return {
      token,
      clientId: row.token.clientId,
      scopes: row.token.scope.split(" "),
      expiresAt: Math.floor(row.token.accessExpiresAt.getTime() / 1000),
      resource: new URL(row.token.resource),
      extra: { userId: row.token.userId, connectionId: row.token.id },
    };
  }

  async revokeToken(client: OAuthClientInformationFull, request: { token: string; token_type_hint?: string }): Promise<void> {
    const tokenHash = hash(request.token);
    this.db
      .update(oauthTokens)
      .set({ revokedAt: this.now() })
      .where(and(eq(oauthTokens.clientId, client.client_id), or(eq(oauthTokens.accessTokenHash, tokenHash), eq(oauthTokens.refreshTokenHash, tokenHash))))
      .run();
  }

  private isAdmin(userId: string): boolean {
    const user = this.db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId)).get();
    return !!user && can(siteRoles(user), null, "administer_site").ok;
  }

  private tokenResponse(access: string, refresh: string, scope: string): OAuthTokens {
    return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL_MS / 1000, refresh_token: refresh, scope };
  }
}
