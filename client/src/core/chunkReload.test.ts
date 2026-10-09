// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { awaitModule, installChunkReload, shouldReloadForMissingChunk } from "./chunkReload";

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

// Vite resolves a dynamic import with undefined once the reload handler has suppressed its error (Sentry
// TECTONIC-CLIENT-5: "Cannot read properties of undefined (reading 'browserTracingIntegration')").
describe("awaitModule", () => {
  it("passes a loaded module through", async () => {
    const module = { browserTracingIntegration: () => "tracing" };
    expect(await awaitModule(Promise.resolve(module))).toBe(module);
  });

  it("waits for the reload instead of handing on a missing module", async () => {
    let settled = false;
    void awaitModule(Promise.resolve(undefined)).then(() => (settled = true), () => (settled = true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);
  });

  it("still rejects when the import itself fails", async () => {
    await expect(awaitModule(Promise.reject(new Error("Failed to fetch dynamically imported module")))).rejects.toThrow(/Failed to fetch/);
  });
});

// Sentry: a theme's chunk and the page's failed together after a deploy; the first reloaded the page, and the second,
// held back by the minute's guard, was thrown ("Importing a module script failed") on the page's way out.
describe("installChunkReload", () => {
  const missingChunk = () => {
    const event = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it("lets a chunk missing again within a minute through, but suppresses every failure once the page is reloading", () => {
    const reload = vi.fn();
    installChunkReload(reload);

    sessionStorage.setItem("chunk-reload-at", String(Date.now()));
    expect(missingChunk()).toBe(false);
    expect(reload).not.toHaveBeenCalled();

    sessionStorage.clear();
    expect(missingChunk()).toBe(true);
    expect(missingChunk()).toBe(true);
    expect(missingChunk()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
