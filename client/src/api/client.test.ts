import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, onSlowDown } from "./client";
import { getServerBuild } from "./serverBuild";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a write the server's write limit refuses (429)", () => {
  it("fails with the server's message, and is told to the slow-down listeners", async () => {
    const body = { error: "Slow down: too many changes in a few seconds. Try again in a moment.", code: "write_limited" };
    const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status: 429, headers: { "Retry-After": "4" } }));
    vi.stubGlobal("fetch", fetch);
    const heard = vi.fn();
    const stop = onSlowDown(heard);

    const failed = await api.patch("/api/bingos/b1/admin/teams/t1", { color: "#123456" }).catch((e: unknown) => e);
    stop();

    expect(failed).toBeInstanceOf(ApiError);
    expect(failed).toMatchObject({ status: 429, code: "write_limited", message: body.error });
    expect(heard).toHaveBeenCalledWith(failed);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("every response", () => {
  it("tells the page which build the server serves", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200, headers: { "X-Build-Id": "abc123", "X-Force-Reload": "1" } })));
    await api.get("/api/me");
    expect(getServerBuild()).toEqual({ buildId: "abc123", forceReload: true });
  });
});
