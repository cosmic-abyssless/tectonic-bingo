import { afterEach, describe, expect, it, vi } from "vitest";
import { TectonicClient, TectonicUnavailableError, getTectonicConfig, type TectonicConfig } from "./tectonicService";

const cfg: TectonicConfig = { baseUrl: "http://tectonic.test", apiKey: "secret-key", guildId: "guild123" };

function mockFetch(responses: Record<string, { status?: number; body?: unknown }>) {
  return vi.fn(async (input: string | URL) => {
    const url = String(input);
    const match = Object.entries(responses).find(([path]) => url.includes(path));
    if (!match) throw new Error(`Unexpected fetch: ${url}`);
    const { status = 200, body = null } = match[1];
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getTectonicConfig", () => {
  it("returns null unless all three env vars are set", () => {
    vi.stubEnv("TECTONIC_API_URL", "http://x");
    vi.stubEnv("TECTONIC_API_KEY", "k");
    vi.stubEnv("TECTONIC_GUILD_ID", "");
    expect(getTectonicConfig()).toBeNull();

    vi.stubEnv("TECTONIC_GUILD_ID", "g");
    expect(getTectonicConfig()).toEqual({ baseUrl: "http://x", apiKey: "k", guildId: "g" });
  });

  it("strips trailing slashes from the base URL", () => {
    vi.stubEnv("TECTONIC_API_URL", "http://x///");
    vi.stubEnv("TECTONIC_API_KEY", "k");
    vi.stubEnv("TECTONIC_GUILD_ID", "g");
    expect(getTectonicConfig()?.baseUrl).toBe("http://x");
  });
});

describe("TectonicClient", () => {
  it("sends the API key and hits the guild-scoped roster endpoint", async () => {
    const fetchImpl = mockFetch({ "/api/v1/guilds/guild123/leaderboard": { body: [{ user_id: "1", guild_id: "guild123", points: 50, rsns: [] }] } });
    const client = new TectonicClient(cfg, fetchImpl);

    const roster = await client.getRoster();
    expect(roster).toHaveLength(1);
    expect(roster![0]!.points).toBe(50);

    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(call[0])).toBe("http://tectonic.test/api/v1/guilds/guild123/leaderboard?limit=1000");
    expect(call[1].headers.Authorization).toBe("secret-key");
  });

  it("throws TectonicUnavailableError on a non-2xx response", async () => {
    const fetchImpl = mockFetch({ "/leaderboard": { status: 401, body: { error: "bad key" } } });
    const client = new TectonicClient(cfg, fetchImpl);
    await expect(client.getRoster()).rejects.toBeInstanceOf(TectonicUnavailableError);
  });

  it("throws TectonicUnavailableError on a network failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const client = new TectonicClient(cfg, fetchImpl);
    await expect(client.getDetailedUser("111")).rejects.toBeInstanceOf(TectonicUnavailableError);
  });

  it("caches successful responses and skips refetching within the TTL", async () => {
    const fetchImpl = mockFetch({ "/leaderboard": { body: [] } });
    const client = new TectonicClient(cfg, fetchImpl);

    await client.getRoster();
    await client.getRoster();
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("does not cache failures", async () => {
    const fetchImpl = mockFetch({ "/leaderboard": { status: 500 } });
    const client = new TectonicClient(cfg, fetchImpl);

    await client.getRoster().catch(() => {});
    await client.getRoster().catch(() => {});
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it("returns [] for an empty detailed-users request without calling the API", async () => {
    const fetchImpl = mockFetch({});
    const client = new TectonicClient(cfg, fetchImpl);
    expect(await client.getDetailedUsers([])).toEqual([]);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("joins and URL-encodes Discord IDs for detailed-user lookups", async () => {
    const fetchImpl = mockFetch({ "/users/": { body: [] } });
    const client = new TectonicClient(cfg, fetchImpl);

    await client.getDetailedUsers(["111", "222"]);
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(call[0])).toBe("http://tectonic.test/api/v1/guilds/guild123/users/111,222");
  });

  it("getDetailedUser picks the matching user out of the batch response, null when absent", async () => {
    const fetchImpl = mockFetch({
      "/users/": { body: [{ user_id: "111", guild_id: "guild123", points: 10, rank: 1, rsns: [], records: [], events: [], achievements: [], combat_achievements: [] }] },
    });
    const client = new TectonicClient(cfg, fetchImpl);

    const found = await client.getDetailedUser("111");
    expect(found?.points).toBe(10);

    const clientB = new TectonicClient(cfg, mockFetch({ "/users/": { body: [] } }));
    expect(await clientB.getDetailedUser("999")).toBeNull();
  });
});
