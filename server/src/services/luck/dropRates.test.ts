import { describe, expect, it } from "vitest";
import { dropRateTable, getDropRates } from "./dropRates";

describe("dropRateTable", () => {
  const table = dropRateTable({
    Vardorvis: { "Ultor vestige": 1 / 1088 },
    "Vorkath#Post-quest": { "Dragonbone necklace": 1 / 1000 },
    "Branda the Fire Queen": { "Giantsoul amulet": 1 / 16 },
    "Eldric the Ice King": { "Giantsoul amulet": 1 / 16 },
    "Tombs of Amascut": { "Tumeken's shadow (uncharged)": 1 / 400 },
    "Chest (Barrows)": { "Coins": 2 },
    Unmapped: { "Twisted bow": 1 },
  });

  it("finds an Item by the bosses whose sources drop it", () => {
    expect(table.sourcesOf("Ultor vestige")).toEqual([{ metric: "vardorvis", rate: 1 / 1088 }]);
    expect(table.sourcesOf("Dragonbone necklace")).toEqual([{ metric: "vorkath", rate: 1 / 1000 }]);
  });

  it("weights a boss's sources", () => {
    expect(table.sourcesOf("Giantsoul amulet")).toEqual([{ metric: "the_royal_titans", rate: 1 / 16 }]);
  });

  it("gives one source to every metric that shares it", () => {
    expect(table.sourcesOf("Tumeken's shadow (uncharged)").map((s) => s.metric).sort()).toEqual(["tombs_of_amascut", "tombs_of_amascut_expert"]);
  });

  it("matches case-insensitively, and a charged name to its uncharged version", () => {
    expect(table.sourcesOf("ULTOR VESTIGE")).toHaveLength(1);
    expect(table.sourcesOf("Tumeken's shadow")).toHaveLength(2);
  });

  it("gives no sources for an Item no tracked boss drops", () => {
    expect(table.sourcesOf("Twisted bow")).toEqual([]);
    expect(table.sourcesOf("Abyssal whip")).toEqual([]);
  });
});

describe("the checked-in snapshot", () => {
  it("has every boss's headline drop", () => {
    const rates = getDropRates();
    expect(rates.sourcesOf("Ultor vestige")).toEqual([{ metric: "vardorvis", rate: 1 / 1088 }]);
    expect(rates.sourcesOf("Twisted bow")).toEqual([
      { metric: "chambers_of_xeric", rate: expect.any(Number) },
      { metric: "chambers_of_xeric_challenge_mode", rate: expect.any(Number) },
    ]);
    expect(rates.sourcesOf("Pet snakeling")).toEqual([{ metric: "zulrah", rate: expect.any(Number) }]);
  });
});
