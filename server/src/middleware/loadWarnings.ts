import { performance } from "node:perf_hooks";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { log, requestPath, shouldSkipHttpLog } from "../log";
import { MCP_PATH, type LoadWarnings } from "../loadWarnings";
import { TESTDATA_PREFIX } from "../services/devTestDataService";

/** Whether a request counts towards the load warnings: the API, logins and the MCP server; not health checks, uploads, icons or the static client. */
export function countsTowardsLoad(path: string): boolean {
  if (shouldSkipHttpLog(path)) return false;
  return path.startsWith("/api/") || path.startsWith("/auth/") || MCP_PATH.test(path);
}

/** A route's full pattern from its router's baseUrl and its own path. A router mounted under a Bingo has the Bingo's slug in its baseUrl. */
export function routePattern(baseUrl: string, routePath: unknown): string {
  const base = baseUrl.replace(/^\/api\/bingos\/[^/]+(?=\/|$)/, "/api/bingos/:slug");
  const path = typeof routePath === "string" ? routePath : String(routePath);
  return path === "/" && base ? base : base + path;
}

// Express sets req.route as a route matches, when req.baseUrl is that route's router's mount path. By the time the
// response is done, a request that failed has left the router and baseUrl is reset, so the pattern is taken right then.
function captureRoute(req: Request): () => string | null {
  let route: unknown = req.route;
  let pattern: string | null = null;
  Object.defineProperty(req, "route", {
    configurable: true,
    enumerable: true,
    get: () => route,
    set: (value: unknown) => {
      route = value;
      try {
        pattern = routePattern(req.baseUrl, (value as { path?: unknown } | undefined)?.path);
      } catch {
        pattern = null;
      }
    },
  });
  return () => pattern;
}

/**
 * Feeds every API request, once it's done, to the load warnings (loadWarnings.ts). Mount after auditContext (whose
 * context says whether the request is the test data generator's). Never fails a request: anything that goes wrong here
 * is only logged.
 */
export function loadWarningsMiddleware(warnings: LoadWarnings): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (countsTowardsLoad(requestPath(req.originalUrl || req.url))) watch(warnings, req, res);
    } catch (err) {
      log.warn("load warning failed", { err });
    }
    next();
  };
}

function watch(warnings: LoadWarnings, req: Request, res: Response): void {
  const started = performance.now();
  const route = captureRoute(req);
  // "close" rather than "finish": a request the browser gave up waiting for (as on 2026-10-03) never finishes.
  res.on("close", () => {
    try {
      warnings.recordRequest({
        method: req.method,
        route: route() ?? "(no route)",
        ms: performance.now() - started,
        // Answered, or closed before the answer was finished (the browser gave up): statusCode then is only the default.
        status: res.writableFinished ? res.statusCode : null,
        // An anonymous route (the Feedback form's) names no user here either.
        userId: req.audit?.anonymous ? null : (req.user?.id ?? null),
        bingoId: req.bingo?.id ?? null,
        // The test data generator sends X-Dev-Skip-Integrations with every request, and plays testdata- Bingos.
        generator: req.audit?.skipIntegrations === true || !!req.bingo?.slug.startsWith(TESTDATA_PREFIX),
      });
    } catch (err) {
      log.warn("load warning failed", { err });
    }
  });
}
