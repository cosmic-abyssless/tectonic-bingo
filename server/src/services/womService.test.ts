import { describe, expect, it, vi } from "vitest";
import { WomClient } from "./womService";

function mockFetch(responses: Record<string, { status?: number; body?: unknown }>) {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const match = Object.entries(responses).find(([path]) => url.includes(path));
    if (!match) throw new Error(`Unexpected fetch: ${url}`);
    const { status = 200, body = null } = match[1];
    return new Response(JSON.stringify(body), { status, headers: init?.headers as Record<string, string> | undefined });
  }) as unknown as typeof fetch;
}

const playerBody = (ehb: number, level: number) => ({
  ehb,
  latestSnapshot: { data: { skills: { overall: { level } } } },
});

describe("WomClient", () => {
  it("sends a User-Agent header and parses ehb + overall level", async () => {
    const fetchImpl = mockFetch({ "/players/id/1135": { body: playerBody(42, 1466) } });
    const client = new WomClient(fetchImpl);

    const stats = await client.getPlayerStats("1135");
    expect(stats).toEqual({ ehb: 42, totalLevel: 1466 });

    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(call[0])).toBe("https://api.wiseoldman.net/v2/players/id/1135");
    expect((call[1].headers as Record<string, string>)["User-Agent"]).toBeTruthy();
  });

  it("returns null on a non-2xx response instead of throwing", async () => {
    const fetchImpl = mockFetch({ "/players/id/999": { status: 404, body: { message: "not found" } } });
    const client = new WomClient(fetchImpl);
    expect(await client.getPlayerStats("999")).toBeNull();
  });

  it("returns null on a network failure instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const client = new WomClient(fetchImpl);
    expect(await client.getPlayerStats("1135")).toBeNull();
  });

  it("returns null when the response is missing ehb or the overall level", async () => {
    const fetchImpl = mockFetch({ "/players/id/1": { body: { ehb: 5 } } });
    const client = new WomClient(fetchImpl);
    expect(await client.getPlayerStats("1")).toBeNull();
  });

  it("caches both hits and misses within the TTL", async () => {
    const fetchImpl = mockFetch({ "/players/id/1135": { body: playerBody(1, 100) } });
    const client = new WomClient(fetchImpl);
    await client.getPlayerStats("1135");
    await client.getPlayerStats("1135");
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);

    const failFetch = mockFetch({ "/players/id/999": { status: 500 } });
    const failClient = new WomClient(failFetch);
    await failClient.getPlayerStats("999");
    await failClient.getPlayerStats("999");
    expect((failFetch as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("getManyPlayerStats de-duplicates ids and fetches in parallel", async () => {
    const fetchImpl = mockFetch({
      "/players/id/1": { body: playerBody(1, 10) },
      "/players/id/2": { body: playerBody(2, 20) },
    });
    const client = new WomClient(fetchImpl);

    const results = await client.getManyPlayerStats(["1", "2", "1"]);
    expect(results.get("1")).toEqual({ ehb: 1, totalLevel: 10 });
    expect(results.get("2")).toEqual({ ehb: 2, totalLevel: 20 });
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it("getManyPlayerStats returns an empty map for no ids without calling the API", async () => {
    const fetchImpl = mockFetch({});
    const client = new WomClient(fetchImpl);
    const results = await client.getManyPlayerStats([]);
    expect(results.size).toBe(0);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("backs off after a 429 and short-circuits further calls locally instead of hitting fetch again", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 429, headers: { "retry-after": "30" } })) as unknown as typeof fetch;
    const client = new WomClient(fetchImpl);

    expect(await client.getPlayerStats("1")).toBeNull();
    expect(await client.getPlayerStats("2")).toBeNull(); // different id — still backed off
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("does not poison the cache on a 429 — resumes fetching once the backoff window passes", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "1" } }))
        .mockResolvedValueOnce(new Response(JSON.stringify(playerBody(5, 50)), { status: 200 })) as unknown as typeof fetch;
      const client = new WomClient(fetchImpl);

      expect(await client.getPlayerStats("1")).toBeNull();
      vi.advanceTimersByTime(1_500);
      expect(await client.getPlayerStats("1")).toEqual({ ehb: 5, totalLevel: 50 });
      expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
