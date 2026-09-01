import { describe, expect, it, vi } from "vitest";
import { WomClient, parseWomSummary } from "./womService";

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

const playerBody = (ehb: number, type: string) => ({ ehb, type });

describe("WomClient.getPlayerByUsername", () => {
  it("sends a User-Agent header and returns the raw player object", async () => {
    const fetchImpl = mockFetch({ "/players/Zezima": { body: playerBody(42, "ironman") } });
    const client = new WomClient(fetchImpl);

    const player = await client.getPlayerByUsername("Zezima");
    expect(player).toEqual({ ehb: 42, type: "ironman" });

    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(call[0])).toBe("https://api.wiseoldman.net/v2/players/Zezima");
    expect((call[1].headers as Record<string, string>)["User-Agent"]).toBeTruthy();
  });

  it("URL-encodes RSNs with spaces", async () => {
    const fetchImpl = mockFetch({ "/players/C%20osmic": { body: playerBody(1, "ironman") } });
    const client = new WomClient(fetchImpl);
    await client.getPlayerByUsername("C osmic");
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(call[0])).toBe("https://api.wiseoldman.net/v2/players/C%20osmic");
  });

  it("returns null on a 404 (not tracked by WOM) instead of throwing", async () => {
    const fetchImpl = mockFetch({ "/players/Nobody": { status: 404 } });
    const client = new WomClient(fetchImpl);
    expect(await client.getPlayerByUsername("Nobody")).toBeNull();
  });

  it("returns null on a network failure instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const client = new WomClient(fetchImpl);
    expect(await client.getPlayerByUsername("Zezima")).toBeNull();
  });

  it("backs off after a 429 and short-circuits further calls locally instead of hitting fetch again", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 429, headers: { "retry-after": "30" } })) as unknown as typeof fetch;
    const client = new WomClient(fetchImpl);

    expect(await client.getPlayerByUsername("a")).toBeNull();
    expect(await client.getPlayerByUsername("b")).toBeNull();
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("resumes fetching once the backoff window passes", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "1" } }))
        .mockResolvedValueOnce(new Response(JSON.stringify(playerBody(5, "regular")), { status: 200 })) as unknown as typeof fetch;
      const client = new WomClient(fetchImpl);

      expect(await client.getPlayerByUsername("a")).toBeNull();
      vi.advanceTimersByTime(1_500);
      expect(await client.getPlayerByUsername("a")).toEqual({ ehb: 5, type: "regular" });
      expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("parseWomSummary", () => {
  it("maps all four WOM types onto the shared AccountType enum", () => {
    expect(parseWomSummary(playerBody(1, "regular"))).toEqual({ ehb: 1, accountType: "normal" });
    expect(parseWomSummary(playerBody(2, "ironman"))).toEqual({ ehb: 2, accountType: "ironman" });
    expect(parseWomSummary(playerBody(3, "hardcore"))).toEqual({ ehb: 3, accountType: "hardcore_ironman" });
    expect(parseWomSummary(playerBody(4, "ultimate"))).toEqual({ ehb: 4, accountType: "ultimate_ironman" });
  });

  it("falls back to unknown for an unrecognized or missing type", () => {
    expect(parseWomSummary(playerBody(5, "some_future_type"))?.accountType).toBe("unknown");
    expect(parseWomSummary({ ehb: 6 })?.accountType).toBe("unknown");
  });

  it("returns null for null, non-objects, or a missing/non-numeric ehb", () => {
    expect(parseWomSummary(null)).toBeNull();
    expect(parseWomSummary(undefined)).toBeNull();
    expect(parseWomSummary("not an object")).toBeNull();
    expect(parseWomSummary({ type: "ironman" })).toBeNull();
  });
});
