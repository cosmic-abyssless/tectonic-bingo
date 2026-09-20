// Some routes under /api/bingos/:slug/mod are for site admins only, even though the router as a whole lets any
// per-bingo mod in. This pins which ones, by checking that requireAdmin sits in each route's handler chain.
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
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: unknown }[] } };

function handlersFor(router: Router, method: string, path: string): unknown[] {
  const layer = (router.stack as unknown as Layer[]).find((l) => l.route?.path === path && l.route.methods[method]);
  if (!layer?.route) throw new Error(`no ${method.toUpperCase()} ${path} route`);
  return layer.route.stack.map((l) => l.handle);
}

describe("site-admin-only mod routes", () => {
  it.each([
    ["post", "/stage"],
    ["post", "/draft/shuffle"],
    ["put", "/draft/order"],
    ["post", "/draft/start"],
  ])("%s %s needs a site admin", async (method, path) => {
    const { default: modRouter } = await import("./mod");
    const { requireAdmin } = await import("../middleware/requireAdmin");
    expect(handlersFor(modRouter, method, path)).toContain(requireAdmin);
  });

  it("leaves reviewing submissions to any mod", async () => {
    const { default: modRouter } = await import("./mod");
    const { requireAdmin } = await import("../middleware/requireAdmin");
    const layer = (modRouter.stack as unknown as Layer[]).find((l) => l.route?.path === "/submissions/:id" && !l.route.methods.get);
    expect(layer, "the review route").toBeDefined();
    expect(layer!.route!.stack.map((l) => l.handle)).not.toContain(requireAdmin);
  });
});
