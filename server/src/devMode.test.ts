import { afterEach, describe, expect, it } from "vitest";
import { devSkipsIntegrations, devSkipsOcr, isDevModeActive } from "./devMode";

const saved = { NODE_ENV: process.env.NODE_ENV, DEV_LOGIN_ENABLED: process.env.DEV_LOGIN_ENABLED };
afterEach(() => {
  process.env.NODE_ENV = saved.NODE_ENV;
  if (saved.DEV_LOGIN_ENABLED === undefined) delete process.env.DEV_LOGIN_ENABLED;
  else process.env.DEV_LOGIN_ENABLED = saved.DEV_LOGIN_ENABLED;
});

describe("isDevModeActive", () => {
  it("needs DEV_LOGIN_ENABLED, and is never on in production", () => {
    delete process.env.DEV_LOGIN_ENABLED;
    expect(isDevModeActive()).toBe(false);
    process.env.DEV_LOGIN_ENABLED = "true";
    expect(isDevModeActive()).toBe(true);
    process.env.NODE_ENV = "production";
    expect(isDevModeActive()).toBe(false);
  });
});

describe("devSkipsOcr", () => {
  it("skips only on the exact header value, and only in dev mode", () => {
    process.env.DEV_LOGIN_ENABLED = "true";
    expect(devSkipsOcr("1")).toBe(true);
    expect(devSkipsOcr(undefined)).toBe(false);
    expect(devSkipsOcr("true")).toBe(false);
    delete process.env.DEV_LOGIN_ENABLED;
    expect(devSkipsOcr("1")).toBe(false);
  });
});

describe("devSkipsIntegrations", () => {
  it("skips only on the exact header value, and only in dev mode (never in production)", () => {
    process.env.DEV_LOGIN_ENABLED = "true";
    process.env.NODE_ENV = "staging";
    expect(devSkipsIntegrations("1")).toBe(true);
    expect(devSkipsIntegrations(undefined)).toBe(false);
    expect(devSkipsIntegrations("yes")).toBe(false);
    process.env.NODE_ENV = "production";
    expect(devSkipsIntegrations("1")).toBe(false);
  });
});
