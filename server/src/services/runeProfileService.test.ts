import { describe, expect, it, vi } from "vitest";
import { RuneProfileClient, parseAccountType } from "./runeProfileService";

function accountBody(key: string) {
  return { username: "C osmic", accountType: { key } };
}

describe("RuneProfileClient.getAccountFull", () => {
  it("sends a User-Agent header and returns the raw account object", async () => {
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      void input;
      return new Response(JSON.stringify(accountBody("ironman")), { status: 200, headers: init?.headers as Record<string, string> | undefined });
    }) as unknown as typeof fetch;
    const client = new RuneProfileClient(fetchImpl, null);

    const account = await client.getAccountFull("C osmic");
    expect(account).toEqual(accountBody("ironman"));

    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(call[0])).toBe("https://api.runeprofile.com/v1/accounts/C%20osmic/full");
    expect((call[1].headers as Record<string, string>)["User-Agent"]).toBeTruthy();
  });

  it("sends the X-API-Key header when an api key is configured", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(accountBody("normal")), { status: 200 })) as unknown as typeof fetch;
    const client = new RuneProfileClient(fetchImpl, "secret-key");
    await client.getAccountFull("C osmic");

    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((call[1].headers as Record<string, string>)["X-API-Key"]).toBe("secret-key");
  });

  it("returns null on a 404 (not tracked by RuneProfile) instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    const client = new RuneProfileClient(fetchImpl, null);
    expect(await client.getAccountFull("Nobody")).toBeNull();
  });

  it("returns null on a network failure instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const client = new RuneProfileClient(fetchImpl, null);
    expect(await client.getAccountFull("C osmic")).toBeNull();
  });

  it("backs off after a 429 and short-circuits further calls locally instead of hitting fetch again", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 429, headers: { "retry-after": "30" } })) as unknown as typeof fetch;
    const client = new RuneProfileClient(fetchImpl, null);

    expect(await client.getAccountFull("a")).toBeNull();
    expect(await client.getAccountFull("b")).toBeNull();
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("resumes fetching once the backoff window passes", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "1" } }))
        .mockResolvedValueOnce(new Response(JSON.stringify(accountBody("normal")), { status: 200 })) as unknown as typeof fetch;
      const client = new RuneProfileClient(fetchImpl, null);

      expect(await client.getAccountFull("a")).toBeNull();
      vi.advanceTimersByTime(1_500);
      expect(await client.getAccountFull("a")).toEqual(accountBody("normal"));
      expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("parseAccountType", () => {
  it("recognizes every known account type", () => {
    expect(parseAccountType(accountBody("normal"))).toBe("normal");
    expect(parseAccountType(accountBody("ironman"))).toBe("ironman");
    expect(parseAccountType(accountBody("ultimate_ironman"))).toBe("ultimate_ironman");
    expect(parseAccountType(accountBody("hardcore_ironman"))).toBe("hardcore_ironman");
    expect(parseAccountType(accountBody("group_ironman"))).toBe("group_ironman");
    expect(parseAccountType(accountBody("hardcore_group_ironman"))).toBe("hardcore_group_ironman");
    expect(parseAccountType(accountBody("unranked_group_ironman"))).toBe("unranked_group_ironman");
  });

  it("falls back to unknown for an unrecognized type", () => {
    expect(parseAccountType(accountBody("some_future_type"))).toBe("unknown");
  });

  it("returns null for null, undefined, or a non-object (no data fetched)", () => {
    expect(parseAccountType(null)).toBeNull();
    expect(parseAccountType(undefined)).toBeNull();
    expect(parseAccountType("not an object")).toBeNull();
  });

  it("falls back to unknown (not null) for an object with a missing accountType.key", () => {
    expect(parseAccountType({ username: "x" })).toBe("unknown");
  });
});
