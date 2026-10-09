import { afterEach, describe, expect, it, vi } from "vitest";
import { log } from "../log";
import { bossAliases, OsrsWikiClient, WikiUnavailableError } from "./osrsWikiService";

function mockFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

afterEach(() => vi.restoreAllMocks());

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

  it("reports a non-ok response to Sentry (log.error with an error)", async () => {
    const error = vi.spyOn(log, "error").mockImplementation(() => {});
    await new OsrsWikiClient(mockFetch(null, 503)).searchItems("whip");
    expect(error).toHaveBeenCalledWith("osrs-wiki search failed", expect.objectContaining({ status: 503, err: expect.any(Error) }));
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

describe("bossAliases", () => {
  it("keeps the wiki's other names for a boss, in order, without subpages, the boss's own name or repeats in other capitals", () => {
    expect(
      bossAliases("Vorkath", ["Vorkath/", "Vork", "vorkath", "Vorki boss", "VORK", "Money making guide/vorkath", " Vorkie ", "Vorki Boss"]),
    ).toEqual(["Vork", "Vorki boss", "Vorkie"]);
  });

  it("leaves out a name longer than a tag can be", () => {
    expect(bossAliases("Sire", ["x".repeat(41), "x".repeat(40)])).toEqual(["x".repeat(40)]);
  });
});

// A queue of wiki answers, one per call, recording the URLs asked for.
function wikiReplies(...bodies: unknown[]) {
  const urls: URL[] = [];
  const fetchImpl = vi.fn(async (url: string) => {
    urls.push(new URL(url));
    const body = bodies.shift();
    if (body === undefined) throw new Error("no more replies");
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
  return { client: new OsrsWikiClient(fetchImpl), urls, fetchImpl: fetchImpl as unknown as ReturnType<typeof vi.fn> };
}

describe("OsrsWikiClient.bossPage", () => {
  const bossesCategory = [{ ns: 14, title: "Category:Bosses" }];

  it("asks for the page's redirects and whether it's in the Bosses category, following every continuation", async () => {
    const { client, urls } = wikiReplies(
      { continue: { rdcontinue: "108248", continue: "||categories" }, query: { pages: [{ title: "Kalphite Queen", redirects: [{ title: "Kq" }, { title: "KQ" }], categories: bossesCategory }] } },
      { query: { pages: [{ title: "Kalphite Queen", redirects: [{ title: "Kal queen" }] }] } },
    );
    expect(await client.bossPage("kq")).toEqual({ title: "Kalphite Queen", redirects: ["Kq", "KQ", "Kal queen"] });
    const first = urls[0]!.searchParams;
    expect(Object.fromEntries(first)).toMatchObject({ action: "query", prop: "redirects|categories", titles: "kq", redirects: "1", rdnamespace: "0", rdlimit: "max", clcategories: "Category:Bosses|Category:Raids|Category:Minigames", formatversion: "2" });
    expect(urls[1]!.searchParams.get("rdcontinue")).toBe("108248");
  });

  it("is null for a page that doesn't exist, or isn't in the Bosses or Raids category", async () => {
    expect(await wikiReplies({ query: { pages: [{ title: "Nope", missing: true }] } }).client.bossPage("Nope")).toBeNull();
    expect(await wikiReplies({ query: { pages: [{ title: "Abyssal whip", redirects: [{ title: "Whip" }] }] } }).client.bossPage("Abyssal whip")).toBeNull();
  });

  it("takes a raid or a minigame (the Raids and Minigames categories), but not those categories' overview pages", async () => {
    const raids = [{ ns: 14, title: "Category:Raids" }];
    const cox = { query: { pages: [{ title: "Chambers of Xeric", redirects: [{ title: "CoX" }, { title: "Raids 1" }], categories: raids }] } };
    expect(await wikiReplies(cox).client.bossPage("cox")).toEqual({ title: "Chambers of Xeric", redirects: ["CoX", "Raids 1"] });
    expect(await wikiReplies({ query: { pages: [{ title: "Raids", redirects: [{ title: "Raid" }], categories: raids }] } }).client.bossPage("Raids")).toBeNull();
    const minigames = [{ ns: 14, title: "Category:Minigames" }];
    const gauntlet = { query: { pages: [{ title: "The Gauntlet", redirects: [{ title: "Gauntlet" }, { title: "CG" }], categories: minigames }] } };
    expect(await wikiReplies(gauntlet).client.bossPage("gauntlet")).toEqual({ title: "The Gauntlet", redirects: ["Gauntlet", "CG"] });
    expect(await wikiReplies({ query: { pages: [{ title: "Minigames", categories: minigames }] } }).client.bossPage("Minigames")).toBeNull();
  });

  it("throws WikiUnavailableError when the wiki can't be reached or answers with an error", async () => {
    const down = new OsrsWikiClient(vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch);
    await expect(down.bossPage("Vorkath")).rejects.toBeInstanceOf(WikiUnavailableError);
    await expect(new OsrsWikiClient(mockFetch(null, 503)).bossPage("Vorkath")).rejects.toBeInstanceOf(WikiUnavailableError);
    await expect(new OsrsWikiClient(mockFetch({ error: { code: "badvalue" } })).bossPage("Vorkath")).rejects.toBeInstanceOf(WikiUnavailableError);
  });

  it("reports the wiki answering with a non-2xx to Sentry (log.error with the error)", async () => {
    const error = vi.spyOn(log, "error").mockImplementation(() => {});
    await expect(new OsrsWikiClient(mockFetch(null, 503)).bossPage("Vorkath")).rejects.toThrow("The OSRS Wiki answered HTTP 503");
    expect(error).toHaveBeenCalledWith("osrs-wiki query failed", expect.objectContaining({ status: 503, err: expect.any(WikiUnavailableError) }));
  });
});

describe("OsrsWikiClient.searchBosses", () => {
  const members = (titles: string[]) => ({ query: { categorymembers: titles.map((title) => ({ ns: 0, title })) } });

  it("lists the Bosses, Raids and Minigames categories once, then filters them as typed, names starting with the query first", async () => {
    const { client, urls, fetchImpl } = wikiReplies(
      { continue: { cmcontinue: "page|x", continue: "-||" }, ...members(["Abyssal Sire", "Kalphite Queen"]) },
      members(["Sarachnis", "Vorkath"]),
      // The Raids category: its overview page is left out, and a page in both categories is listed once.
      members(["Chambers of Xeric", "Raids", "Sarachnis"]),
      // The Minigames category, its overview page left out too.
      members(["Fortis Colosseum", "Minigames", "The Gauntlet"]),
    );
    expect((await client.searchBosses("sar")).map((b) => b.name)).toEqual(["Sarachnis"]);
    expect((await client.searchBosses("S")).map((b) => b.name)).toEqual(["Sarachnis", "Abyssal Sire", "Chambers of Xeric", "Fortis Colosseum"]);
    expect(await client.searchBosses("vork")).toEqual([{ name: "Vorkath", wikiUrl: "https://oldschool.runescape.wiki/w/Vorkath" }]);
    expect((await client.searchBosses("xeric")).map((b) => b.name)).toEqual(["Chambers of Xeric"]);
    expect(await client.searchBosses("raids")).toEqual([]);
    expect((await client.searchBosses("gaunt")).map((b) => b.name)).toEqual(["The Gauntlet"]);
    expect((await client.searchBosses("colo")).map((b) => b.name)).toEqual(["Fortis Colosseum"]);
    expect(await client.searchBosses("minigames")).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(4); // the Bosses listing's two pages, then the Raids and Minigames ones, then no more calls
    expect(Object.fromEntries(urls[0]!.searchParams)).toMatchObject({ list: "categorymembers", cmtitle: "Category:Bosses", cmnamespace: "0", cmlimit: "max" });
    expect(urls[1]!.searchParams.get("cmcontinue")).toBe("page|x");
    expect(urls[2]!.searchParams.get("cmtitle")).toBe("Category:Raids");
    expect(urls[3]!.searchParams.get("cmtitle")).toBe("Category:Minigames");
  });

  it("asks nothing for a blank query, and throws WikiUnavailableError when the wiki can't be reached", async () => {
    const { client, fetchImpl } = wikiReplies();
    expect(await client.searchBosses("  ")).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(client.searchBosses("vork")).rejects.toBeInstanceOf(WikiUnavailableError);
  });
});
