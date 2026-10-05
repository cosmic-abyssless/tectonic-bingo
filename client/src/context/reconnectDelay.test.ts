import { describe, expect, it } from "vitest";
import { reconnectDelayMs } from "./reconnectDelay";

describe("reconnectDelayMs", () => {
  it("waits 1 to 3 s on the first try", () => {
    expect(reconnectDelayMs(0, () => 0)).toBe(1000);
    expect(reconnectDelayMs(0, () => 0.5)).toBe(2000);
    expect(reconnectDelayMs(0, () => 0.999)).toBeLessThan(3000);
  });

  it("doubles with each try that fails", () => {
    expect(reconnectDelayMs(1, () => 0.5)).toBe(4000);
    expect(reconnectDelayMs(2, () => 0.5)).toBe(8000);
    expect(reconnectDelayMs(3, () => 0.5)).toBe(16_000);
  });

  it("stops growing at 30 s, jitter and all", () => {
    expect(reconnectDelayMs(4, () => 0.5)).toBe(30_000);
    expect(reconnectDelayMs(4, () => 0)).toBe(15_000);
    expect(reconnectDelayMs(50, () => 0.999)).toBeLessThan(45_000);
    expect(reconnectDelayMs(5000, () => 0.5)).toBe(30_000);
  });
});
