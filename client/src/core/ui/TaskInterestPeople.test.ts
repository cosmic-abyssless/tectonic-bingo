import { describe, expect, it } from "vitest";
import { picturesThatFit } from "./TaskInterestPeople";

// A circle is 28 px, and each one after the first adds 20 (they overlap by 8): n circles take 28 + 20 * (n - 1). The
// stack always ends in one more circle (a list icon, or "+N").
describe("picturesThatFit", () => {
  it("shows everyone while they fit beside the end circle", () => {
    expect(picturesThatFit(3, 88)).toBe(3); // exactly 3 pictures and the end circle: 28 + 20 * 3
    expect(picturesThatFit(14, 1000)).toBe(14);
  });

  it("once they don't, shows as many as there's room for, the end circle saying how many more", () => {
    // 14 people in 120 px: 5 pictures and the end circle would be 128 px; 4 and "+10" is 108.
    expect(picturesThatFit(14, 120)).toBe(4);
    // Short of the room for all three and the end circle by a pixel: the last picture gives way to "+1".
    expect(picturesThatFit(3, 87)).toBe(2);
  });

  it("falls back to only the end circle when there's no room for any picture", () => {
    expect(picturesThatFit(9, 30)).toBe(0);
    expect(picturesThatFit(9, 0)).toBe(0);
  });

  it("shows everyone before the room has been measured", () => {
    expect(picturesThatFit(9, null)).toBe(9);
  });
});
