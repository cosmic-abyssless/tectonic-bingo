import { describe, expect, it, vi } from "vitest";
import { OsrsWikiClient } from "./osrsWikiService";

function mockFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

const searchBody = (titles: string[]) => ({ query: { search: titles.map((title) => ({ title })) } });

describe("OsrsWikiClient.searchItems", () => {
  it("maps wiki search results into name/iconUrl/wikiUrl, deriving URLs from the title", async () => {
    const fetchImpl = mockFetch(searchBody(["Abyssal whip"]));
    const client = new OsrsWikiClient(fetchImpl);

    const results = await client.searchItems("abyssal whip");
    expect(results).toEqual([
      {
        name: "Abyssal whip",
        iconUrl: "https://oldschool.runescape.wiki/images/Abyssal_whip.png",
        wikiUrl: "https://oldschool.runescape.wiki/w/Abyssal_whip",
      },
    ]);
  });

  it("scopes the search to incategory:\"Items\" and sends a User-Agent header", async () => {
    const fetchImpl = mockFetch(searchBody([]));
    const client = new OsrsWikiClient(fetchImpl);
    await client.searchItems("whip");

    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const url = String(call[0]);
    expect(url).toContain("srsearch=incategory%3A%22Items%22+whip");
    expect((call[1].headers as Record<string, string>)["User-Agent"]).toBeTruthy();
  });

  it("URL-encodes titles with spaces, apostrophes, and parentheses for icon/wiki URLs", async () => {
    const fetchImpl = mockFetch(searchBody(["Ahrim's hood", "Abyssal whip (or)"]));
    const client = new OsrsWikiClient(fetchImpl);

    const results = await client.searchItems("ahrim");
    expect(results[0]!.iconUrl).toBe("https://oldschool.runescape.wiki/images/Ahrim's_hood.png");
    expect(results[1]!.iconUrl).toBe("https://oldschool.runescape.wiki/images/Abyssal_whip_(or).png");
  });

  it("returns an empty array for a blank/whitespace-only query without calling fetch", async () => {
    const fetchImpl = mockFetch(searchBody([]));
    const client = new OsrsWikiClient(fetchImpl);

    expect(await client.searchItems("")).toEqual([]);
    expect(await client.searchItems("   ")).toEqual([]);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("returns an empty array on a non-ok response instead of throwing", async () => {
    const fetchImpl = mockFetch(null, 503);
    const client = new OsrsWikiClient(fetchImpl);
    expect(await client.searchItems("whip")).toEqual([]);
  });

  it("returns an empty array on a network failure instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const client = new OsrsWikiClient(fetchImpl);
    expect(await client.searchItems("whip")).toEqual([]);
  });

  it("returns an empty array when the response has no query.search field", async () => {
    const fetchImpl = mockFetch({});
    const client = new OsrsWikiClient(fetchImpl);
    expect(await client.searchItems("whip")).toEqual([]);
  });
});
