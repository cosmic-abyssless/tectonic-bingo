// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { noteServerBuild } from "../../api/serverBuild";
import { forceReloadDelayMs, NewVersionNotice } from "./NewVersionNotice";
import { toast, toastQueue } from "./Toast";

afterEach(() => {
  cleanup();
  while (toastQueue.visibleToasts.length) toastQueue.close(toastQueue.visibleToasts[0]!.key);
  vi.unstubAllEnvs();
});

describe("NewVersionNotice", () => {
  it("shows a forced reload's notice at once, however many toasts are up", () => {
    vi.stubEnv("DEV", false);
    for (let i = 0; i < 3; i++) toast({ title: `Saved ${i}` });
    noteServerBuild({ buildId: `${__BUILD_ID__}-next`, forceReload: true });
    render(
      <MemoryRouter>
        <NewVersionNotice />
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert").textContent).toContain("This page reloads in about a minute");
    expect(screen.getByRole("button", { name: "Reload now" })).toBeTruthy();
  });

  it("waits 10 to 60 seconds before a forced reload, at random", () => {
    expect(forceReloadDelayMs(() => 0)).toBe(10_000);
    expect(forceReloadDelayMs(() => 0.5)).toBe(35_000);
    expect(forceReloadDelayMs(() => 0.999)).toBeLessThan(60_000);
    expect(forceReloadDelayMs(() => 0.999)).toBeGreaterThan(59_000);
  });
});
