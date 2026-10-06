import { describe, expect, it } from "vitest";
import { picturesThatFit } from "./TaskInterestPeople";

// A circle is 28 px, and each one after the first adds 20 (they overlap by 8): n circles take 28 + 20 * (n - 1).
describe("picturesThatFit", () => {
  it("shows everyone while they fit", () => {
    expect(picturesThatFit(3, 68)).toBe(3); // exactly 28 + 20 + 20
    expect(picturesThatFit(14, 1000)).toBe(14);
  });

  it("once they don't, shows as many as leave room for the +N circle", () => {
    // 14 people in 120 px: 5 circles would be 108 px, but then "+N" makes 6 (128 px); 4 and "+10" is 108.
    expect(picturesThatFit(14, 120)).toBe(4);
    // One too many by a pixel: the last picture gives way to "+2" rather than the stack overflowing.
    expect(picturesThatFit(5, 107)).toBe(3);
  });

  it("falls back to only the +N circle when there's no room for any picture", () => {
    expect(picturesThatFit(9, 30)).toBe(0);
    expect(picturesThatFit(9, 0)).toBe(0);
  });

  it("shows everyone before the room has been measured", () => {
    expect(picturesThatFit(9, null)).toBe(9);
  });
});
