import { describe, expect, it } from "vitest";
import { ocrConcurrency, ocrRequestTimeoutMs, ocrServiceUrl, ocrThreads, parseCgroupCpuLimit, shouldWarmOcr } from "./ocrConfig";

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

describe("ocrServiceUrl", () => {
  it("is unset by default, meaning screenshots are read in-process", () => {
    expect(ocrServiceUrl({})).toBeUndefined();
    expect(ocrServiceUrl({ OCR_URL: "" })).toBeUndefined();
    expect(ocrServiceUrl({ OCR_URL: "   " })).toBeUndefined();
  });

  it("returns the address without trailing slashes", () => {
    expect(ocrServiceUrl({ OCR_URL: "http://ocr:8080" })).toBe("http://ocr:8080");
    expect(ocrServiceUrl({ OCR_URL: " http://ocr:8080// " })).toBe("http://ocr:8080");
  });
});

describe("ocrRequestTimeoutMs", () => {
  it("defaults to 20 seconds", () => {
    expect(ocrRequestTimeoutMs({})).toBe(20_000);
  });

  it("takes a positive number of milliseconds and ignores anything else", () => {
    expect(ocrRequestTimeoutMs({ OCR_TIMEOUT_MS: "5000" })).toBe(5000);
    for (const bad of ["0", "-1", "soon"]) expect(ocrRequestTimeoutMs({ OCR_TIMEOUT_MS: bad })).toBe(20_000);
  });
});

describe("parseCgroupCpuLimit", () => {
  it("reads the quota as a number of CPUs", () => {
    expect(parseCgroupCpuLimit("200000 100000\n")).toBe(2);
    expect(parseCgroupCpuLimit("400000 100000")).toBe(4);
  });

  it("rounds a fraction down but never below one CPU", () => {
    expect(parseCgroupCpuLimit("250000 100000")).toBe(2);
    expect(parseCgroupCpuLimit("50000 100000")).toBe(1);
  });

  it("is undefined when there is no limit or nothing to read", () => {
    for (const none of ["max 100000", "-1 100000", "", undefined, "garbage"]) expect(parseCgroupCpuLimit(none)).toBeUndefined();
  });
});

describe("ocrThreads", () => {
  it("uses OCR_THREADS when it is set", () => {
    expect(ocrThreads({ OCR_THREADS: "3" }, { cpuMax: "200000 100000", available: 16 })).toBe(3);
  });

  it("matches the container's CPU quota rather than the host's CPU count", () => {
    expect(ocrThreads({}, { cpuMax: "200000 100000", available: 16 })).toBe(2);
  });

  it("uses every available CPU when the container is unlimited", () => {
    expect(ocrThreads({}, { cpuMax: "max 100000", available: 8 })).toBe(8);
    expect(ocrThreads({}, { available: 4 })).toBe(4);
  });

  it("never exceeds the CPUs that are actually available", () => {
    expect(ocrThreads({}, { cpuMax: "800000 100000", available: 4 })).toBe(4);
  });

  it("ignores an unusable OCR_THREADS", () => {
    for (const bad of ["0", "-2", "many"]) expect(ocrThreads({ OCR_THREADS: bad }, { available: 4 })).toBe(4);
  });
});
