import { describe, expect, it } from "vitest";
import type { NotificationEntry } from "@bingo/shared";
import { pageShows } from "./NotificationDelivery";

const entry = (kind: NotificationEntry["kind"], link: string | null): NotificationEntry => ({ id: "n1", bingoId: "b", kind, title: "t", body: null, link, createdAt: "2026-10-11T00:00:00Z", readAt: null });

describe("pageShows", () => {
  it("skips a completed Tile's toast on that Bingo's Board, which animates it already", () => {
    expect(pageShows(entry("team_tile_completed", "/b/summer?tile=t1"), "/b/summer")).toBe(true);
    expect(pageShows(entry("team_part_completed", "/b/summer?tile=t1"), "/b/summer")).toBe(true);
  });

  it("toasts it anywhere else, and toasts every other kind on the Board", () => {
    expect(pageShows(entry("team_tile_completed", "/b/summer?tile=t1"), "/b/summer/stats")).toBe(false);
    expect(pageShows(entry("team_tile_completed", "/b/summer?tile=t1"), "/b/winter")).toBe(false);
    expect(pageShows(entry("drop_rejected", "/b/summer"), "/b/summer")).toBe(false);
  });
});
