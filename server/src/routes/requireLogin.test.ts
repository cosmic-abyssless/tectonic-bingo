// Nothing about a bingo may be served to an anonymous request: the bingo shell carries team rosters (players'
// Discord accounts and RSNs). This walks the bingo router and checks every route has requireAuth in its chain,
// so a new route can't be added open by accident.
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

describe("bingo routes need a login", () => {
  it("has requireAuth on every route, reads included", async () => {
    const { default: bingosRouter } = await import("./bingos");
    const { requireAuth } = await import("../middleware/requireAuth");
    const open: string[] = [];
    let checked = 0;
    for (const layer of (bingosRouter as Router).stack as unknown as Layer[]) {
      if (!layer.route) continue;
      checked++;
      if (!layer.route.stack.some((l) => l.handle === requireAuth)) {
        open.push(`${Object.keys(layer.route.methods).join(",").toUpperCase()} ${layer.route.path}`);
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(open).toEqual([]);
  });
});
