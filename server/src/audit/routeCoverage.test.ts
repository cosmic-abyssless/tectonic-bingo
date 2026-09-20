// Enumerates every non-GET route across the /api/* routers and asserts each
// one is either mapped in AUDITED_ROUTES or explicitly auditSkip()'d — the
// test-time half of "a new mutation can't silently escape the log" (the
// other two are TypeScript's AuditDetailsMap/AUDIT_ACTIONS registry and the
// runtime http.mutation fallback). Dynamically imports the routers so env
// vars (dev-route gating, an in-memory DB) are in place before their
// module-level code runs.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Router } from "express";

vi.mock("../ocr", () => ({
  isOcrEnabled: () => false,
  analyzeSubmissionScreenshot: vi.fn(),
}));

const ORIGINAL_ENV = { ...process.env };

beforeAll(() => {
  process.env.DB_PATH = ":memory:";
  process.env.NODE_ENV = "test";
  process.env.DEV_LOGIN_ENABLED = "true";
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

interface RouteInfo {
  key: string;
  skipped: boolean;
}

function routesFor(router: Router, mountPrefix: string): RouteInfo[] {
  const infos: RouteInfo[] = [];
  for (const layer of router.stack as unknown as { route?: { path: string; methods: Record<string, boolean>; stack: { handle: { auditSkipReason?: string } }[] } }[]) {
    const route = layer.route;
    if (!route) continue;
    const methods = Object.keys(route.methods).filter((m) => route.methods[m] && m.toUpperCase() !== "GET");
    const skipped = route.stack.some((l) => !!l.handle.auditSkipReason);
    for (const method of methods) {
      infos.push({ key: `${method.toUpperCase()} ${mountPrefix}${route.path}`, skipped });
    }
  }
  return infos;
}

describe("route coverage", () => {
  it("maps every non-GET /api/* route to AUDITED_ROUTES or an auditSkip marker, with no stale entries", async () => {
    const { default: bingosRouter } = await import("../routes/bingos");
    const { default: modRouter } = await import("../routes/mod");
    const { default: adminRouter } = await import("../routes/admin");
    const { default: siteAdminRouter } = await import("../routes/siteAdmin");
    const { default: bugReportsRouter } = await import("../routes/bugReports");
    const { default: devRouter } = await import("../routes/dev");
    const { default: clientErrorsRouter } = await import("../routes/clientErrors");
    const { AUDITED_ROUTES } = await import("./routePolicy");

    const routes = [
      ...routesFor(bingosRouter, "/api/bingos"),
      ...routesFor(modRouter, "/api/bingos/:slug/mod"),
      ...routesFor(adminRouter, "/api/bingos/:slug/admin"),
      ...routesFor(siteAdminRouter, "/api/admin"),
      ...routesFor(bugReportsRouter, "/api/bug-reports"),
      ...routesFor(devRouter, "/api/dev"),
      ...routesFor(clientErrorsRouter, "/api/client-errors"),
    ];

    // Sanity check the dev-gated routes actually registered under our env vars.
    expect(routes.some((r) => r.key === "POST /api/bingos/:slug/mod/dev/seed-signups")).toBe(true);

    const unmapped = routes.filter((r) => !r.skipped && !(r.key in AUDITED_ROUTES)).map((r) => r.key);
    expect(unmapped).toEqual([]);

    const allKeys = new Set(routes.map((r) => r.key));
    const stale = Object.keys(AUDITED_ROUTES).filter((key) => !allKeys.has(key));
    expect(stale).toEqual([]);
  });

  it("fails a deliberately-unmapped route, proving the assertion above actually guards something", async () => {
    const { Router } = await import("express");
    const { AUDITED_ROUTES } = await import("./routePolicy");

    const testRouter = Router();
    testRouter.post("/definitely-not-audited", (_req, res) => res.json({ ok: true }));
    const routes = routesFor(testRouter, "/api/test");

    expect(routes).toEqual([{ key: "POST /api/test/definitely-not-audited", skipped: false }]);
    expect(routes.every((r) => r.key in AUDITED_ROUTES)).toBe(false);
  });
});
