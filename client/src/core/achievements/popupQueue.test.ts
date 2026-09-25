import { describe, expect, it } from "vitest";
import type { AchievementKey } from "@bingo/shared";
import { nextPopupKey } from "./popupQueue";

describe("nextPopupKey", () => {
  it("plays the server's unshown popups in order", () => {
    const unshown: AchievementKey[] = ["strong_start", "partner_slayer"];
    expect(nextPopupKey(unshown, new Set())).toBe("strong_start");
  });

  it("skips ones this session already played, even mid-queue", () => {
    const unshown: AchievementKey[] = ["strong_start", "partner_slayer", "big_spender"];
    const played = new Set<AchievementKey>(["strong_start"]);
    expect(nextPopupKey(unshown, played)).toBe("partner_slayer");
  });

  it("returns null once every unshown popup has been played this session", () => {
    const unshown: AchievementKey[] = ["strong_start", "partner_slayer"];
    const played = new Set<AchievementKey>(["strong_start", "partner_slayer"]);
    expect(nextPopupKey(unshown, played)).toBeNull();
  });

  it("returns null with nothing unshown", () => {
    expect(nextPopupKey([], new Set())).toBeNull();
  });
});
