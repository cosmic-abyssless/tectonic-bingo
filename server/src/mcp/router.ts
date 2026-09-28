// The admin MCP server (docs: #289, #290): an OAuth 2.1 authorization server in front of the site's Discord login, and
// a stateless Streamable HTTP endpoint at POST /mcp that only takes this server's own bearer tokens. Mounted at the
// site root (the OAuth documents live under /.well-known), after the session and audit middleware.
import { Readable } from "stream";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import { Router, type Request, type Response } from "express";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { hostHeaderValidation, requireBearerAuth } from "@modelcontextprotocol/express";
import { getOAuthProtectedResourceMetadataUrl, mcpAuthRouter, metadataHandler } from "@modelcontextprotocol/server-legacy/auth";
import type * as schema from "../db/schema";
import { auditSkip } from "../audit/middleware";
import { asyncHandler } from "../middleware/errorHandler";
import { log } from "../log";
import { MCP_SCOPE, mcpUrls, type McpUrls } from "./config";
import { SqliteOAuthProvider } from "./oauthProvider";
import { buildMcpServer } from "./tools";

type Db = BetterSQLite3Database<typeof schema>;

const RESOURCE_NAME = "Tectonic Bingo";

function methodNotAllowed(_req: Request, res: Response): void {
  res.status(405).set("Allow", "POST").json({ error: "method_not_allowed", error_description: "This MCP server is stateless: POST only" });
}

// Hands the parsed request to the SDK's web-standard handler and streams its answer back.
async function forward(handler: ReturnType<typeof createMcpHandler>, req: Request, res: Response, urls: McpUrls): Promise<void> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || ["host", "connection", "content-length", "transfer-encoding"].includes(name)) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  const body = JSON.stringify(req.body ?? null);
  const request = new Request(urls.resource, { method: "POST", headers, body });
  const response = await handler.fetch(request, { authInfo: req.auth, parsedBody: req.body });
  res.status(response.status);
  response.headers.forEach((value, name) => res.setHeader(name, value));
  // Keeps the site's compression middleware from holding an event stream back.
  res.setHeader("Cache-Control", "no-store, no-transform");
  if (!response.body) {
    res.end();
    return;
  }
  Readable.fromWeb(response.body as unknown as NodeReadableStream).pipe(res);
}

/** `rateLimit: false` turns off the OAuth endpoints' per-IP limits, for tests that register many apps from one address. */
export function createMcpRouter(db: Db, urls: McpUrls = mcpUrls(), options: { rateLimit?: false } = {}): Router {
  const provider = new SqliteOAuthProvider(db, urls);
  const router = Router();

  // The SDK's router below serves these; the route entries only declare them for audit/routeCoverage.test.ts. Signing
  // in isn't a change to the site's data, and each tool call is audited on its own (tools.ts).
  const passThrough = (_req: Request, _res: Response, next: () => void) => next();
  router.post("/authorize", auditSkip("OAuth sign-in: approving a Claude app"), passThrough);
  router.post("/token", auditSkip("OAuth token exchange"), passThrough);
  router.post("/register", auditSkip("OAuth client registration"), passThrough);
  router.post("/revoke", auditSkip("OAuth token revocation by the app itself"), passThrough);

  router.use(
    mcpAuthRouter({
      provider,
      issuerUrl: urls.issuer,
      resourceServerUrl: urls.resource,
      scopesSupported: [MCP_SCOPE],
      resourceName: RESOURCE_NAME,
      ...(options.rateLimit === false && {
        authorizationOptions: { rateLimit: false },
        clientRegistrationOptions: { rateLimit: false },
        tokenOptions: { rateLimit: false },
        revocationOptions: { rateLimit: false },
      }),
    }),
  );
  // Also at the root, for clients that look there before the path-suffixed document above.
  router.use(
    "/.well-known/oauth-protected-resource",
    metadataHandler({ resource: urls.resource.href, authorization_servers: [urls.issuer.href], scopes_supported: [MCP_SCOPE], resource_name: RESOURCE_NAME }),
  );

  const handler = createMcpHandler((ctx) => buildMcpServer(db, ctx.authInfo), {
    onerror: (err) => log.warn("mcp request failed", { err }),
  });
  router.get("/mcp", methodNotAllowed);
  router.delete("/mcp", auditSkip("stateless MCP server: no session to end"), methodNotAllowed);
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(urls.resource);
  router.post(
    "/mcp",
    hostHeaderValidation([urls.resource.hostname]),
    // No credentials at all: the bare challenge (no error code, RFC 6750 §3.1) that starts Claude's sign-in.
    (req, res, next) => {
      if (req.headers.authorization) return next();
      res.status(401).set("WWW-Authenticate", `Bearer resource_metadata="${resourceMetadataUrl}", scope="${MCP_SCOPE}"`).json({ error: "invalid_token", error_description: "Sign in to use this server" });
    },
    // Bearer tokens only: a session cookie on this route is never looked at.
    requireBearerAuth({ verifier: provider, requiredScopes: [MCP_SCOPE], resourceMetadataUrl }),
    asyncHandler((req, res) => forward(handler, req, res, urls)),
  );
  return router;
}
