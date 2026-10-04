import { describe, expect, it, vi } from "vitest";
import { getServerBuild, noteServerBuild, subscribeServerBuild, versionAction } from "./serverBuild";

describe("versionAction", () => {
  const newer = { buildId: "new", forceReload: false };

  it("does nothing when the server serves this page's build, or says nothing", () => {
    expect(versionAction("old", { buildId: "old", forceReload: false }, null, true)).toBe("none");
    expect(versionAction("old", { buildId: "old", forceReload: true }, null, true)).toBe("none");
    expect(versionAction("old", null, null, true)).toBe("none");
  });

  it("offers a reload when the server serves another build, until that build's prompt is dismissed", () => {
    expect(versionAction("old", newer, null, true)).toBe("prompt");
    expect(versionAction("old", newer, "new", true)).toBe("none");
    // Dismissing one new build doesn't dismiss the next.
    expect(versionAction("old", { buildId: "newer", forceReload: false }, "new", true)).toBe("prompt");
  });

  it("reloads when the server forces it, dismissed or not", () => {
    expect(versionAction("old", { buildId: "new", forceReload: true }, null, true)).toBe("force");
    expect(versionAction("old", { buildId: "new", forceReload: true }, "new", true)).toBe("force");
  });

  it("is off in development", () => {
    expect(versionAction("old", { buildId: "new", forceReload: true }, null, false)).toBe("none");
  });
});

describe("the server's build", () => {
  it("tells its subscribers when it changes, not when it's announced again", () => {
    const heard = vi.fn();
    const stop = subscribeServerBuild(heard);
    noteServerBuild({ buildId: "b1", forceReload: false });
    noteServerBuild({ buildId: "b1", forceReload: false });
    noteServerBuild({ buildId: "b1", forceReload: true });
    stop();
    expect(heard).toHaveBeenCalledTimes(2);
    expect(getServerBuild()).toEqual({ buildId: "b1", forceReload: true });
  });
});
