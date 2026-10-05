// Which writes under /api/bingos/:slug run the before and after role scans (mayChangeRoles), and a guard that every
// non-GET route there has been classified: a new one fails here until it's in ROUTES, true when its handler can write
// anything bingoRolesOfEveryone reads (Moderators, Staff, Team members and leads, active Signups, and through the Cut
// the accepted pairs, the picks, the Team count and the cut mode). When unsure, true: a missed one leaves a Player's
// open pages on their old access. Whether the scans then see a change is permissions.test.ts's.
import fs from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response, Router } from "express";
import * as schema from "../db/schema";

vi.mock("../ocr", () => ({
  isOcrEnabled: () => false,
  analyzeSubmissionScreenshot: vi.fn(),
}));
vi.mock("../ws", () => ({ broadcast: vi.fn() }));
vi.mock("../db", async () => {
  const { createTestDb } = await import("../testUtils/testDb");
  return { ...createTestDb(), DB_PATH: ":memory:", BUSY_TIMEOUT_MS: 0 };
});
vi.mock("../services/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/permissions")>();
  return { ...actual, bingoRolesOfEveryone: vi.fn(actual.bingoRolesOfEveryone) };
});

const ORIGINAL_ENV = { ...process.env };

beforeAll(() => {
  process.env.NODE_ENV = "test";
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

// Every non-GET route under /api/bingos, as `METHOD mount+path`, and whether it can change anyone's roles.
const ROUTES: Record<string, boolean> = {
  // routes/bingos.ts
  "PUT /api/bingos/:slug/superlatives/:categoryId": false,
  "DELETE /api/bingos/:slug/superlatives/:categoryId": false,
  "PUT /api/bingos/:slug/feedback": false,
  "POST /api/bingos/:slug/submissions": false,
  "POST /api/bingos/:slug/submissions/analyze": false,
  "POST /api/bingos/:slug/signup": true,
  // Writes only the RSN, timezone and answers, but it's the Signup's own row: kept with the rest of /signup.
  "PATCH /api/bingos/:slug/signup": true,
  "DELETE /api/bingos/:slug/signup": true,
  "POST /api/bingos/:slug/signup/pairing": true,
  "DELETE /api/bingos/:slug/signup/pairing/:pairingId": true,
  "POST /api/bingos/:slug/signup/pairing/:pairingId/respond": true,
  "PUT /api/bingos/:slug/draft/ratings/:signupId": false,
  "PUT /api/bingos/:slug/submissions/:id/reactions": false,
  "PUT /api/bingos/:slug/tiles/:tileId/tasks/:taskId/interest": false,
  "POST /api/bingos/:slug/draft/pick": true,
  "POST /api/bingos/:slug/draft/undo": true,
  // A Captain's rename: the Team's name only.
  "PATCH /api/bingos/:slug/teams/:teamId": false,
  "POST /api/bingos/:slug/achievements/popups-shown": false,
  "POST /api/bingos/:slug/achievements/opened": false,
  // routes/mod.ts
  "PATCH /api/bingos/:slug/mod/submissions/:id": false,
  "PATCH /api/bingos/:slug/mod/submissions/:id/attribution": false,
  "POST /api/bingos/:slug/mod/wrapped/publish": false,
  "POST /api/bingos/:slug/mod/submissions/:id/reprice": false,
  "POST /api/bingos/:slug/mod/teams/:teamId/adjustments": false,
  "POST /api/bingos/:slug/mod/stage": true,
  // Pick order, its reveal lock and the started flag: none of them decides who is Cut.
  "POST /api/bingos/:slug/mod/draft/shuffle": false,
  "PUT /api/bingos/:slug/mod/draft/order": false,
  "POST /api/bingos/:slug/mod/draft/start": false,
  "POST /api/bingos/:slug/mod/pairings": true,
  "DELETE /api/bingos/:slug/mod/pairings/:id": true,
  "POST /api/bingos/:slug/mod/signups/:signupId/refresh-stats": false,
  "PATCH /api/bingos/:slug/mod/signups/:id/buyin": false,
  "PATCH /api/bingos/:slug/mod/signups/:id/timezone": false,
  "DELETE /api/bingos/:slug/mod/signups/:id": true,
  // A Restriction isn't a role: these tell their user with access_changed themselves.
  "POST /api/bingos/:slug/mod/restrictions": false,
  "DELETE /api/bingos/:slug/mod/restrictions/:id": false,
  // routes/buyins.ts
  "PATCH /api/bingos/:slug/buyins/:signupId": false,
  // routes/historicalScreenshots.ts
  "POST /api/bingos/:slug/admin/historical/screenshots/:key": false,
  // routes/admin.ts
  "PATCH /api/bingos/:slug/admin/settings": true,
  // The Draft board (CONTEXT.md): its Rules, and the Publish that applies it to the board, the Rules text and the Exclusive
  // Item rules. Roles read none of those.
  "PATCH /api/bingos/:slug/admin/board-draft/rules": false,
  "POST /api/bingos/:slug/admin/board-draft/publish": false,
  "POST /api/bingos/:slug/admin/board-draft/discard": false,
  "POST /api/bingos/:slug/admin/settings/wom-check": false,
  "POST /api/bingos/:slug/admin/discord/sync": false,
  "POST /api/bingos/:slug/admin/discord/remove": false,
  "POST /api/bingos/:slug/admin/mods": true,
  "DELETE /api/bingos/:slug/admin/mods/:userId": true,
  "POST /api/bingos/:slug/admin/staff": true,
  "DELETE /api/bingos/:slug/admin/staff/:userId": true,
  "POST /api/bingos/:slug/admin/categories": false,
  "PATCH /api/bingos/:slug/admin/categories/:id": false,
  "DELETE /api/bingos/:slug/admin/categories/:id": false,
  "POST /api/bingos/:slug/admin/tiles": false,
  "PATCH /api/bingos/:slug/admin/tiles/:id": false,
  "DELETE /api/bingos/:slug/admin/tiles/:id": false,
  "PATCH /api/bingos/:slug/admin/tiles/:id/bonus-points": false,
  "POST /api/bingos/:slug/admin/tiles/:id/image": false,
  "POST /api/bingos/:slug/admin/wrapped-art/:group": false,
  "PUT /api/bingos/:slug/admin/wrapped-art/:group/order": false,
  "PUT /api/bingos/:slug/admin/wrapped-art/:group/credits": false,
  "POST /api/bingos/:slug/admin/wrapped-art/images/:id": false,
  "POST /api/bingos/:slug/admin/wrapped-art/images/:id/recut": false,
  "PUT /api/bingos/:slug/admin/wrapped-art/images/:id/credit": false,
  "DELETE /api/bingos/:slug/admin/wrapped-art/images/:id": false,
  "POST /api/bingos/:slug/admin/tiles/:tileId/tags": false,
  "POST /api/bingos/:slug/admin/parts/:partId/tags": false,
  "DELETE /api/bingos/:slug/admin/tags/:id": false,
  "POST /api/bingos/:slug/admin/tiles/:tileId/tasks": false,
  "PATCH /api/bingos/:slug/admin/tasks/:id": false,
  "POST /api/bingos/:slug/admin/nodes/:nodeId/reprice": false,
  "DELETE /api/bingos/:slug/admin/tasks/:id": false,
  "POST /api/bingos/:slug/admin/lines/generate": false,
  "PATCH /api/bingos/:slug/admin/lines/:id": false,
  "DELETE /api/bingos/:slug/admin/lines/:id": false,
  "POST /api/bingos/:slug/admin/questions": false,
  "PATCH /api/bingos/:slug/admin/questions/:id": false,
  "DELETE /api/bingos/:slug/admin/questions/:id": false,
  "POST /api/bingos/:slug/admin/questions/reorder": false,
  "POST /api/bingos/:slug/admin/superlatives": false,
  "PATCH /api/bingos/:slug/admin/superlatives/:id": false,
  "DELETE /api/bingos/:slug/admin/superlatives/:id": false,
  "POST /api/bingos/:slug/admin/superlatives/reorder": false,
  "POST /api/bingos/:slug/admin/teams": true,
  // Name, colour and password only.
  "PATCH /api/bingos/:slug/admin/teams/:id": false,
  "POST /api/bingos/:slug/admin/teams/:id/members": true,
  "DELETE /api/bingos/:slug/admin/teams/:id": true,
  "DELETE /api/bingos/:slug/admin/teams/:id/members/:userId": true,
  "POST /api/bingos/:slug/admin/late-signups": true,
  // The RSN, WOM id and borrowed flag of a Signup that stays active.
  "PUT /api/bingos/:slug/admin/signups/:signupId/account": false,
  // Scores a plan without making it.
  "POST /api/bingos/:slug/admin/cut-review/score": false,
  "POST /api/bingos/:slug/admin/cut-review/apply": true,
};

// Where index.ts mounts each router under /api/bingos (checked against index.ts below).
const MOUNTS: Record<string, string> = {
  "/api/bingos": "bingosRouter",
  "/api/bingos/:slug/mod": "modRouter",
  "/api/bingos/:slug/buyins": "buyinsRouter",
  "/api/bingos/:slug/admin/historical": "historicalScreenshotsRouter",
  "/api/bingos/:slug/admin": "adminRouter",
};

type Layer = { name?: string; handle?: { stack?: unknown }; route?: { path: unknown; methods: Record<string, boolean> } };

/** Every non-GET route of `router`, as `METHOD prefix+path`. */
function writeRoutes(router: Router, prefix: string): string[] {
  const keys: string[] = [];
  for (const layer of router.stack as unknown as Layer[]) {
    // A router inside a router would hide its routes from this walk: list them here first.
    if (!layer.route) {
      expect(layer.handle?.stack, `a router nested in ${prefix}`).toBeUndefined();
      continue;
    }
    const route = layer.route;
    expect(typeof route.path, `a route path under ${prefix} that isn't a string`).toBe("string");
    for (const method of Object.keys(route.methods).filter((m) => route.methods[m] && m !== "get")) keys.push(`${method.toUpperCase()} ${prefix}${route.path as string}`);
  }
  return keys;
}

/** A url Express would route to `routePath`: each parameter given a value. */
function sampleUrl(routePath: string): string {
  return routePath.replace(/:slug\b/, "b1").replace(/:\w+/g, "x1");
}

describe("mayChangeRoles", () => {
  it("covers every non-GET route under /api/bingos, as index.ts mounts them, with no stale entries", async () => {
    const source = fs.readFileSync(path.join(__dirname, "../index.ts"), "utf8");
    const mounted = Object.fromEntries([...source.matchAll(/app\.use\(\s*"(\/api\/bingos[^"]*)"[^)]*?(\w+Router)\s*\)/g)].map((m) => [m[1], m[2]]));
    expect(mounted).toEqual(MOUNTS);

    const { mayChangeRoles } = await import("./broadcastAccessChanges");
    const routers: Record<string, Router> = {
      bingosRouter: (await import("../routes/bingos")).default,
      modRouter: (await import("../routes/mod")).default,
      buyinsRouter: (await import("../routes/buyins")).default,
      historicalScreenshotsRouter: (await import("../routes/historicalScreenshots")).default,
      adminRouter: (await import("../routes/admin")).default,
    };
    const routes = Object.entries(MOUNTS).flatMap(([prefix, name]) => writeRoutes(routers[name]!, prefix));

    expect(routes.filter((key) => !(key in ROUTES))).toEqual([]);
    const all = new Set(routes);
    expect(Object.keys(ROUTES).filter((key) => !all.has(key))).toEqual([]);

    const wrong = routes.filter((key) => {
      const [method, routePath] = key.split(" ") as [string, string];
      return mayChangeRoles(method, sampleUrl(routePath)) !== ROUTES[key];
    });
    expect(wrong).toEqual([]);
  }, 20_000);

  it("fails a route nobody has classified, proving the walk above guards something", async () => {
    const { Router } = await import("express");
    const router = Router();
    router.get("/:slug/read", (_req, res) => res.end());
    router.post("/:slug/new-write", (_req, res) => res.end());
    const routes = writeRoutes(router, "/api/bingos");
    expect(routes).toEqual(["POST /api/bingos/:slug/new-write"]);
    expect(routes.filter((key) => !(key in ROUTES))).toEqual(routes);
  });

  it.each([
    ["a query string", "DELETE", "/api/bingos/b1/admin/mods/u1?force=1", true],
    ["a query string that looks like a path", "POST", "/api/bingos/b1/submissions?to=/draft/pick", false],
    ["a fragment", "POST", "/api/bingos/b1/draft/pick#x", true],
    ["a trailing slash", "POST", "/api/bingos/b1/draft/pick/", true],
    ["doubled slashes", "POST", "/api/bingos/b1//draft//pick", true],
    ["an encoded slug", "POST", "/api/bingos/my%20bingo/admin/teams", true],
    ["an encoded slash in the slug", "POST", "/api/bingos/a%2Fb/draft/pick", true],
    ["an encoded path segment", "POST", "/api/bingos/b1/%73ignup", true],
    ["a malformed escape in the slug", "POST", "/api/bingos/%E0%A4%A/signup", true],
    ["another case", "POST", "/API/Bingos/B1/Draft/Pick", true],
    ["a lower-case method", "post", "/api/bingos/b1/draft/pick", true],
    ["an absolute url", "POST", "http://example.com/api/bingos/b1/draft/pick", true],
    ["a hot write with a query string", "PUT", "/api/bingos/b1/submissions/s1/reactions?emoji=1", false],
    ["a write that isn't a route", "POST", "/api/bingos/b1/nothing-here", false],
    ["a write to the bingo itself", "DELETE", "/api/bingos/b1", false],
    ["another method on a role-changing path", "PUT", "/api/bingos/b1/draft/pick", false],
    ["a url outside /api/bingos/:slug", "POST", "/elsewhere", true],
    ["a read", "GET", "/api/bingos/b1/signup", false],
    ["a HEAD", "HEAD", "/api/bingos/b1/signup", false],
    ["an OPTIONS", "OPTIONS", "/api/bingos/b1/admin/mods", false],
  ])("answers for %s", async (_name, method, url, expected) => {
    const { mayChangeRoles } = await import("./broadcastAccessChanges");
    expect(mayChangeRoles(method, url)).toBe(expected);
  });
});

describe("broadcastAccessChanges", () => {
  async function run(method: string, originalUrl: string) {
    const { db } = await import("../db");
    const { bingoRolesOfEveryone } = await import("../services/permissions");
    const { broadcastAccessChanges } = await import("./broadcastAccessChanges");
    let bingo = db.select().from(schema.bingos).get();
    if (!bingo) {
      const admin = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin", isAdmin: true }).returning().get();
      bingo = db.insert(schema.bingos).values({ slug: "b1", name: "B1", boardRows: 5, boardCols: 5, createdByUserId: admin.id, stage: "draft" }).returning().get();
    }
    vi.mocked(bingoRolesOfEveryone).mockClear();
    const finish: (() => void)[] = [];
    const req = { method, originalUrl, user: { id: "u1", isAdmin: true }, params: { slug: "b1" } } as unknown as Request;
    const res = { statusCode: 200, on: (event: string, fn: () => void) => event === "finish" && finish.push(fn) } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;
    broadcastAccessChanges(req, res, next);
    for (const fn of finish) fn();
    return { next, scans: vi.mocked(bingoRolesOfEveryone).mock.calls.length };
  }

  it("scans everyone's roles before and after a draft pick", async () => {
    const { next, scans } = await run("POST", "/api/bingos/b1/draft/pick");
    expect(next).toHaveBeenCalledOnce();
    expect(scans).toBe(2);
  });

  it("doesn't scan for a submission, a reaction or a rating", async () => {
    for (const url of ["/api/bingos/b1/submissions", "/api/bingos/b1/submissions/s1/reactions", "/api/bingos/b1/draft/ratings/s1"]) {
      const { next, scans } = await run(url.endsWith("submissions") ? "POST" : "PUT", url);
      expect(next).toHaveBeenCalledOnce();
      expect(scans, url).toBe(0);
    }
  });
});
