import { describe, expect, it, vi } from "vitest";
import { GePriceTable } from "./gePriceService";

const MAPPING = [
  { id: 4151, name: "Abyssal whip" },
  { id: 13576, name: "Dragon warhammer" },
  { id: 11286, name: "Draconic visage" },
  { id: 22550, name: "Craw's bow (u)" },
  { id: 27277, name: "Tumeken's shadow (uncharged)" },
  { id: 12924, name: "Toxic blowpipe (empty)" },
];
const LATEST = {
  data: {
    "4151": { high: 1_600_000, low: 1_400_000 },
    "13576": { high: 30_000_000, low: null },
    "11286": { high: null, low: null },
    "22550": { high: 14_000_000, low: 14_000_000 },
    "27277": { high: 900_000_000, low: 900_000_000 },
    "12924": { high: 1_000_000, low: 1_000_000 },
  },
};

function fakeWiki(opts: { fail?: boolean } = {}) {
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    if (opts.fail) return new Response("down", { status: 503 });
    const body = String(url).endsWith("/mapping") ? MAPPING : LATEST;
    return new Response(JSON.stringify(body), { status: 200 });
  });
  const paths = () => fetchImpl.mock.calls.map((c) => String(c[0]).split("/").pop());
  return { fetchImpl: fetchImpl as unknown as typeof fetch, paths };
}

function tableAt(clock: { t: number }, wiki: ReturnType<typeof fakeWiki>, enabled = true) {
  return new GePriceTable(wiki.fetchImpl, () => clock.t, () => enabled);
}

describe("GePriceTable", () => {
  it("prices at the midpoint of the latest buy and sell, falling back to whichever exists", async () => {
    const table = tableAt({ t: 0 }, fakeWiki());
    await table.refreshIfStale();

    expect(table.unitPrice("Abyssal whip")).toBe(1_500_000);
    expect(table.unitPrice("Dragon warhammer")).toBe(30_000_000);
    expect(table.unitPrice("Draconic visage")).toBeNull();
    expect(table.unitPrice("Vorki")).toBeNull();
  });

  it("matches item names case-insensitively", async () => {
    const table = tableAt({ t: 0 }, fakeWiki());
    await table.refreshIfStale();
    expect(table.unitPrice("  abyssal WHIP ")).toBe(1_500_000);
    expect(table.isKnownItem("dragon warhammer")).toBe(true);
  });

  it("prices a charged item as its uncharged version", async () => {
    const table = tableAt({ t: 0 }, fakeWiki());
    await table.refreshIfStale();
    expect(table.unitPrice("Craw's bow")).toBe(14_000_000);
    expect(table.unitPrice("tumeken's shadow")).toBe(900_000_000);
    expect(table.unitPrice("Toxic blowpipe")).toBe(1_000_000);
    expect(table.isKnownItem("Craw's bow")).toBe(true);
  });

  it("has no prices before the first refresh", () => {
    const table = tableAt({ t: 0 }, fakeWiki());
    expect(table.isLoaded()).toBe(false);
    expect(table.unitPrice("Abyssal whip")).toBeNull();
  });

  it("refetches /latest at most every 5 minutes, and /mapping at most daily", async () => {
    const clock = { t: 0 };
    const wiki = fakeWiki();
    const table = tableAt(clock, wiki);

    expect(await table.refreshIfStale()).toBe(true);
    clock.t += 4 * 60_000;
    expect(await table.refreshIfStale()).toBe(false);
    clock.t += 2 * 60_000;
    expect(await table.refreshIfStale()).toBe(true);
    clock.t += 25 * 60 * 60_000;
    expect(await table.refreshIfStale()).toBe(true);

    expect(wiki.paths()).toEqual(["mapping", "latest", "latest", "mapping", "latest"]);
  });

  it("shares one refresh between concurrent callers", async () => {
    const wiki = fakeWiki();
    const table = tableAt({ t: 0 }, wiki);

    await Promise.all(Array.from({ length: 50 }, () => table.refreshIfStale()));

    expect(wiki.paths()).toEqual(["mapping", "latest"]);
  });

  it("waits a minute after a failure before trying again", async () => {
    const clock = { t: 0 };
    const wiki = fakeWiki({ fail: true });
    const table = tableAt(clock, wiki);

    expect(await table.refreshIfStale()).toBe(false);
    clock.t += 30_000;
    expect(await table.refreshIfStale()).toBe(false);
    expect(wiki.paths()).toHaveLength(1);
    clock.t += 31_000;
    await table.refreshIfStale();
    expect(wiki.paths()).toHaveLength(2);
  });

  it("never throws on a network error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const table = new GePriceTable(fetchImpl, () => 0, () => true);
    expect(await table.refreshIfStale()).toBe(false);
  });

  it("never fetches when disabled", async () => {
    const wiki = fakeWiki();
    const table = tableAt({ t: 0 }, wiki, false);
    expect(await table.refreshIfStale()).toBe(false);
    expect(wiki.paths()).toEqual([]);
  });

  it("sends a User-Agent", async () => {
    const wiki = fakeWiki();
    await tableAt({ t: 0 }, wiki).refreshIfStale();
    const init = (wiki.fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/ge prices/);
  });
});
