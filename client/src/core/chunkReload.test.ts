import { describe, expect, it } from "vitest";
import { shouldReloadForMissingChunk } from "./chunkReload";

describe("shouldReloadForMissingChunk", () => {
  it("reloads when this tab hasn't reloaded for a missing chunk yet", () => {
    expect(shouldReloadForMissingChunk(null, 1_000_000)).toBe(true);
  });

  it("doesn't reload again within a minute, so a chunk that's really missing reaches the error page", () => {
    expect(shouldReloadForMissingChunk(1_000_000, 1_030_000)).toBe(false);
  });

  it("reloads again after a minute (the next deploy)", () => {
    expect(shouldReloadForMissingChunk(1_000_000, 1_061_000)).toBe(true);
  });
});
