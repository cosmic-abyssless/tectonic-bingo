import { afterEach, describe, expect, it, vi } from "vitest";
import { RuneProfileClient, getRuneProfileClanName } from "./runeProfileService";

function member(username: string, key: string) {
  return { username, accountType: { key } };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getRuneProfileClanName", () => {
  it("returns null unless RUNEPROFILE_CLAN_NAME is set", () => {
    vi.stubEnv("RUNEPROFILE_CLAN_NAME", "");
    expect(getRuneProfileClanName()).toBeNull();
    vi.stubEnv("RUNEPROFILE_CLAN_NAME", "Tectonic");
    expect(getRuneProfileClanName()).toBe("Tectonic");
  });
});

describe("RuneProfileClient.getClanAccountTypes", () => {
  it("sends a User-Agent header and returns account types keyed by lowercased RSN", async () => {
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      void input;
      const req = init;
      return new Response(JSON.stringify({ members: [member("C osmic", "ironman"), member("Abyssless", "normal")], hasMore: false, nextCursor: null }), {
        status: 200,
        headers: req?.headers as Record<string, string> | undefined,
      });
    }) as unknown as typeof fetch;
    const client = new RuneProfileClient(fetchImpl, null);

    const types = await client.getClanAccountTypes("Tectonic");
    expect(types?.get("c osmic")).toBe("ironman");
    expect(types?.get("abyssless")).toBe("normal");

    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(call[0])).toContain("/clans/Tectonic");
    expect((call[1].headers as Record<string, string>)["User-Agent"]).toBeTruthy();
  });

  it("sends the X-API-Key header when an api key is configured", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      void _input;
      return new Response(JSON.stringify({ members: [], hasMore: false, nextCursor: null }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = new RuneProfileClient(fetchImpl, "secret-key");
    await client.getClanAccountTypes("Tectonic");

    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((call[1].headers as Record<string, string>)["X-API-Key"]).toBe("secret-key");
  });

  it("recognizes every known account type and falls back to unknown for anything else", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          members: [
            member("a", "ironman"),
            member("b", "ultimate_ironman"),
            member("c", "hardcore_ironman"),
            member("d", "group_ironman"),
            member("e", "hardcore_group_ironman"),
            member("f", "unranked_group_ironman"),
            member("g", "some_future_type"),
          ],
          hasMore: false,
          nextCursor: null,
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const client = new RuneProfileClient(fetchImpl, null);
    const types = await client.getClanAccountTypes("Tectonic");
    expect(types?.get("a")).toBe("ironman");
    expect(types?.get("b")).toBe("ultimate_ironman");
    expect(types?.get("c")).toBe("hardcore_ironman");
    expect(types?.get("d")).toBe("group_ironman");
    expect(types?.get("e")).toBe("hardcore_group_ironman");
    expect(types?.get("f")).toBe("unranked_group_ironman");
    expect(types?.get("g")).toBe("unknown");
  });

  it("follows pagination via cursor until hasMore is false", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ members: [member("p1", "normal")], hasMore: true, nextCursor: "cursor-2" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ members: [member("p2", "ironman")], hasMore: false, nextCursor: null }), { status: 200 })) as unknown as typeof fetch;
    const client = new RuneProfileClient(fetchImpl, null);

    const types = await client.getClanAccountTypes("Tectonic");
    expect(types?.size).toBe(2);
    expect(types?.get("p1")).toBe("normal");
    expect(types?.get("p2")).toBe("ironman");

    const secondCallUrl = String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[1]![0]);
    expect(secondCallUrl).toContain("cursor=cursor-2");
  });

  it("returns null on a non-2xx response instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    const client = new RuneProfileClient(fetchImpl, null);
    expect(await client.getClanAccountTypes("NoSuchClan")).toBeNull();
  });

  it("returns null on a network failure instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const client = new RuneProfileClient(fetchImpl, null);
    expect(await client.getClanAccountTypes("Tectonic")).toBeNull();
  });

  it("caches a successful fetch across all pages for the TTL", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ members: [member("a", "normal")], hasMore: false, nextCursor: null }), { status: 200 })) as unknown as typeof fetch;
    const client = new RuneProfileClient(fetchImpl, null);
    await client.getClanAccountTypes("Tectonic");
    await client.getClanAccountTypes("Tectonic");
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("backs off after a 429 and short-circuits further calls locally instead of hitting fetch again", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 429, headers: { "retry-after": "30" } })) as unknown as typeof fetch;
    const client = new RuneProfileClient(fetchImpl, null);

    expect(await client.getClanAccountTypes("Tectonic")).toBeNull();
    expect(await client.getClanAccountTypes("Tectonic")).toBeNull();
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("does not poison the cache on a 429 — resumes fetching once the backoff window passes", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "1" } }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ members: [member("a", "normal")], hasMore: false, nextCursor: null }), { status: 200 })) as unknown as typeof fetch;
      const client = new RuneProfileClient(fetchImpl, null);

      expect(await client.getClanAccountTypes("Tectonic")).toBeNull();
      vi.advanceTimersByTime(1_500);
      const types = await client.getClanAccountTypes("Tectonic");
      expect(types?.get("a")).toBe("normal");
      expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
