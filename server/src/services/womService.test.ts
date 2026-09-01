import { afterEach, describe, expect, it, vi } from "vitest";
import { WomClient, getWomGroupId } from "./womService";

function mockFetch(responses: Record<string, { status?: number; body?: unknown; headers?: Record<string, string> }>) {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const match = Object.entries(responses).find(([path]) => url.includes(path));
    if (!match) throw new Error(`Unexpected fetch: ${url}`);
    const { status = 200, body = null, headers } = match[1];
    void init;
    return new Response(JSON.stringify(body), { status, headers });
  }) as unknown as typeof fetch;
}

const groupBody = (members: Array<{ id: number; ehb: number }>) => ({
  memberships: members.map((player) => ({ player })),
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getWomGroupId", () => {
  it("returns null unless WOM_GROUP_ID is set", () => {
    vi.stubEnv("WOM_GROUP_ID", "");
    expect(getWomGroupId()).toBeNull();
    vi.stubEnv("WOM_GROUP_ID", "2921");
    expect(getWomGroupId()).toBe("2921");
  });
});

describe("WomClient.getGroupStats", () => {
  it("sends a User-Agent header and returns EHB keyed by wom id", async () => {
    const fetchImpl = mockFetch({ "/groups/2921": { body: groupBody([{ id: 1135, ehb: 42 }, { id: 999, ehb: 7 }]) } });
    const client = new WomClient(fetchImpl);

    const stats = await client.getGroupStats("2921");
    expect(stats?.get("1135")).toEqual({ ehb: 42 });
    expect(stats?.get("999")).toEqual({ ehb: 7 });

    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(call[0])).toBe("https://api.wiseoldman.net/v2/groups/2921");
    expect((call[1].headers as Record<string, string>)["User-Agent"]).toBeTruthy();
  });

  it("returns null on a non-2xx response instead of throwing", async () => {
    const fetchImpl = mockFetch({ "/groups/999": { status: 404 } });
    const client = new WomClient(fetchImpl);
    expect(await client.getGroupStats("999")).toBeNull();
  });

  it("returns null on a network failure instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const client = new WomClient(fetchImpl);
    expect(await client.getGroupStats("2921")).toBeNull();
  });

  it("skips memberships with a missing/malformed player and still returns the rest", async () => {
    const fetchImpl = mockFetch({ "/groups/2921": { body: { memberships: [{ player: { id: 1, ehb: 5 } }, { player: {} }, {}] } } });
    const client = new WomClient(fetchImpl);
    const stats = await client.getGroupStats("2921");
    expect(stats?.size).toBe(1);
    expect(stats?.get("1")).toEqual({ ehb: 5 });
  });

  it("caches a successful fetch — one request covers the whole group for the TTL", async () => {
    const fetchImpl = mockFetch({ "/groups/2921": { body: groupBody([{ id: 1, ehb: 1 }]) } });
    const client = new WomClient(fetchImpl);
    await client.getGroupStats("2921");
    await client.getGroupStats("2921");
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("backs off after a 429 and short-circuits further calls locally instead of hitting fetch again", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 429, headers: { "retry-after": "30" } })) as unknown as typeof fetch;
    const client = new WomClient(fetchImpl);

    expect(await client.getGroupStats("2921")).toBeNull();
    expect(await client.getGroupStats("2921")).toBeNull();
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("does not poison the cache on a 429 — resumes fetching once the backoff window passes", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "1" } }))
        .mockResolvedValueOnce(new Response(JSON.stringify(groupBody([{ id: 1, ehb: 5 }])), { status: 200 })) as unknown as typeof fetch;
      const client = new WomClient(fetchImpl);

      expect(await client.getGroupStats("2921")).toBeNull();
      vi.advanceTimersByTime(1_500);
      const stats = await client.getGroupStats("2921");
      expect(stats?.get("1")).toEqual({ ehb: 5 });
      expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
