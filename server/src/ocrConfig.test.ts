import { describe, expect, it } from "vitest";
import { ocrConcurrency, shouldWarmOcr } from "./ocrConfig";

describe("ocrConcurrency", () => {
  it("defaults to 5", () => {
    expect(ocrConcurrency(undefined)).toBe(5);
    expect(ocrConcurrency("")).toBe(5);
  });

  it("takes a positive whole number from the environment", () => {
    expect(ocrConcurrency("2")).toBe(2);
    expect(ocrConcurrency("12")).toBe(12);
  });

  it("ignores anything that isn't a usable limit", () => {
    for (const bad of ["0", "-3", "many", "NaN"]) expect(ocrConcurrency(bad)).toBe(5);
  });
});

describe("shouldWarmOcr", () => {
  it("warms in production by default, and not elsewhere", () => {
    expect(shouldWarmOcr({ NODE_ENV: "production" })).toBe(true);
    expect(shouldWarmOcr({ NODE_ENV: "development" })).toBe(false);
    expect(shouldWarmOcr({})).toBe(false);
  });

  it("can be forced either way with OCR_WARMUP", () => {
    expect(shouldWarmOcr({ OCR_WARMUP: "true" })).toBe(true);
    expect(shouldWarmOcr({ OCR_WARMUP: "false", NODE_ENV: "production" })).toBe(false);
  });

  it("never warms a server that has OCR switched off", () => {
    expect(shouldWarmOcr({ SCREENSHOT_OCR_DISABLED: "true", NODE_ENV: "production" })).toBe(false);
    expect(shouldWarmOcr({ SCREENSHOT_OCR_DISABLED: "true", OCR_WARMUP: "true" })).toBe(false);
  });
});
