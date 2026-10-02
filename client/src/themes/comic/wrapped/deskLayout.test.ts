import { describe, expect, it } from "vitest";
import { WRAPPED_PAGE_WIDTH } from "./camera";
import { deskGroups, deskLayout } from "./deskLayout";
import type { PageKind } from "./guide";

const kinds: PageKind[] = ["cover", "contents", "page", "page", "page", "back", "page", "page"];

describe("the desk", () => {
  it("lays a wide screen's book out in spreads, the covers alone", () => {
    expect(deskGroups(kinds, "wide")).toEqual([[0], [1, 2], [3, 4], [5], [6, 7]]);
  });

  it("lays the credits alone too, between the share cards and the back cover", () => {
    expect(deskGroups(["cover", "contents", "page", "page", "credits", "back"], "wide")).toEqual([[0], [1, 2], [3], [4], [5]]);
  });

  it("lays a phone's book out a page at a time", () => {
    expect(deskGroups(kinds, "phone")).toEqual(kinds.map((_, i) => [i]));
  });

  it("makes each spread as tall as its tallest page, and keeps the groups apart, left to right", () => {
    const heights = [630, 630, 700, 640, 630, 630, 630, 630];
    const desk = deskLayout(deskGroups(kinds, "wide"), heights, "wide");
    expect(desk[1]!.h).toBe(700);
    expect(desk[1]!.w).toBe(2 * WRAPPED_PAGE_WIDTH);
    for (let i = 1; i < desk.length; i++) expect(desk[i]!.place.x).toBeGreaterThan(desk[i - 1]!.place.x + desk[i - 1]!.w);
  });

  it("scatters the groups after the first: off the row, a little turned, the same way every time", () => {
    const heights = kinds.map(() => 630);
    const desk = deskLayout(deskGroups(kinds, "wide"), heights, "wide");
    expect(desk[0]!.place).toEqual({ x: 0, y: 0, angle: 0 });
    const rest = desk.slice(1);
    expect(rest.every((g) => g.place.y !== 0)).toBe(true);
    expect(rest.some((g) => g.place.angle !== 0)).toBe(true);
    expect(rest.every((g) => Math.abs(g.place.angle) <= 3.2)).toBe(true);
    expect(deskLayout(deskGroups(kinds, "wide"), heights, "wide")).toEqual(desk);
  });
});
