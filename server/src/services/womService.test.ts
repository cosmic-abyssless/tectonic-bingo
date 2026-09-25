import { describe, expect, it, vi } from "vitest";
import { WomClient, parseSnapshots, parseWomSummary } from "./womService";

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
    expect((call[1].headers as Record<string, string>)["x-api-key"]).toBeUndefined();
  });

  it("sends the x-api-key header when an api key is configured", async () => {
    const fetchImpl = mockFetch({ "/players/Zezima": { body: playerBody(1, "regular") } });
    const client = new WomClient(fetchImpl, "wom-secret");
    await client.getPlayerByUsername("Zezima");

    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((call[1].headers as Record<string, string>)["x-api-key"]).toBe("wom-secret");
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
    expect(parseWomSummary(playerBody(1, "regular"))).toEqual({ ehb: 1, ehp: 0, accountType: "normal" });
    expect(parseWomSummary(playerBody(2, "ironman"))).toEqual({ ehb: 2, ehp: 0, accountType: "ironman" });
    expect(parseWomSummary(playerBody(3, "hardcore"))).toEqual({ ehb: 3, ehp: 0, accountType: "hardcore_ironman" });
    expect(parseWomSummary(playerBody(4, "ultimate"))).toEqual({ ehb: 4, ehp: 0, accountType: "ultimate_ironman" });
  });

  it("reads ehp when present and defaults it to 0 for older blobs", () => {
    expect(parseWomSummary({ ehb: 1, ehp: 250.5, type: "regular" })?.ehp).toBe(250.5);
    expect(parseWomSummary({ ehb: 1, type: "regular" })?.ehp).toBe(0);
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

const snapshot = (createdAt: string, vardorvis: number, clues = 10) => ({
  createdAt,
  data: {
    bosses: { vardorvis: { metric: "vardorvis", kills: vardorvis }, zulrah: { metric: "zulrah", kills: -1 } },
    activities: { clue_scrolls_all: { score: clues } },
    computed: { ehb: { value: 12.5 }, ehp: { value: 40 } },
  },
});

describe("WomClient.getSnapshots", () => {
  const start = new Date("2026-01-01T00:00:00Z");
  const end = new Date("2026-01-08T00:00:00Z");

  // Serves `total` snapshots newest first, one page per request, honouring limit and offset.
  function pagedFetch(total: number) {
    const all = Array.from({ length: total }, (_, i) => snapshot(new Date(end.getTime() - i * 60_000).toISOString(), total - i));
    return vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      const limit = Number(url.searchParams.get("limit"));
      const offset = Number(url.searchParams.get("offset"));
      return new Response(JSON.stringify(all.slice(offset, offset + limit)));
    }) as unknown as typeof fetch;
  }

  it("reads the date range from the player's snapshots", async () => {
    const fetchImpl = pagedFetch(3);
    const snapshots = await new WomClient(fetchImpl).getSnapshots("C osmic", start, end);
    expect(snapshots).toHaveLength(3);

    const url = new URL(String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]));
    expect(url.pathname).toBe("/v2/players/C%20osmic/snapshots");
    expect(url.searchParams.get("startDate")).toBe(start.toISOString());
    expect(url.searchParams.get("endDate")).toBe(end.toISOString());
  });

  it("pages through every snapshot in the range", async () => {
    const fetchImpl = pagedFetch(250);
    const snapshots = await new WomClient(fetchImpl).getSnapshots("Zezima", start, end);
    expect(snapshots).toHaveLength(250);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(3);
  });

  it("never asks WOM to update the player", async () => {
    const fetchImpl = pagedFetch(3);
    await new WomClient(fetchImpl).getSnapshots("Zezima", start, end);
    for (const [input, init] of (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls) {
      expect(init?.method ?? "GET").toBe("GET");
      expect(String(input)).not.toMatch(/update/);
    }
  });

  it("returns null when rate limited, and holds off until the retry-after passes", async () => {
    const fetchImpl = mockFetch({ "/snapshots": { status: 429, headers: { "retry-after": "30" } } });
    const client = new WomClient(fetchImpl);
    expect(await client.getSnapshots("Zezima", start, end)).toBeNull();
    expect(await client.getSnapshots("Zezima", start, end)).toBeNull();
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});

describe("parseSnapshots", () => {
  it("gives kill counts over time, oldest first", () => {
    const timeline = parseSnapshots([snapshot("2026-01-02T00:00:00Z", 20, 15), snapshot("2026-01-01T00:00:00Z", 10)]);
    expect(timeline.map((s) => s.at.toISOString())).toEqual(["2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z"]);
    expect(timeline[1]).toEqual({ at: new Date("2026-01-02T00:00:00Z"), bossKills: { vardorvis: 20, zulrah: null }, ehb: 12.5, ehp: 40, clues: 15 });
  });

  it("reads an unranked count (-1) as unknown, not zero", () => {
    const [snap] = parseSnapshots([snapshot("2026-01-01T00:00:00Z", -1, -1)]);
    expect(snap!.bossKills.vardorvis).toBeNull();
    expect(snap!.clues).toBeNull();
  });

  it("drops entries it can't read", () => {
    expect(parseSnapshots([null, { createdAt: "not a date", data: {} }, { createdAt: "2026-01-01T00:00:00Z" }])).toEqual([]);
  });
});
