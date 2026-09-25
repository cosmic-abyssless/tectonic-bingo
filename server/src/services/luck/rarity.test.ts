import { describe, expect, it } from "vitest";
import { parseRarity, ratesFromRows, rowFromBucket, type DropRow } from "./rarity";
import dropsline from "./__fixtures__/dropsline.json";

// Saved `dropsline` bucket entries from the wiki: Barrows (7 rolls), a Colosseum wave (splinters twice, a "Varies"),
// Nex ("Uncommon"), Yama (decimals) and the KQ head ("Once").
const rows = dropsline.map(rowFromBucket).filter((r): r is DropRow => r !== null);

describe("parseRarity", () => {
  it("reads fractions, with thousands commas and decimals", () => {
    expect(parseRarity("1/128")).toBe(1 / 128);
    expect(parseRarity("3/1,088")).toBe(3 / 1088);
    expect(parseRarity("7.5/95.11")).toBe(7.5 / 95.11);
    expect(parseRarity("~1/40")).toBe(1 / 40);
  });

  it("reads Always as every kill", () => {
    expect(parseRarity("Always")).toBe(1);
  });

  it("gives nothing for words and blanks", () => {
    for (const r of ["Common", "Uncommon", "Varies", "Once", "Unknown", ""]) expect(parseRarity(r)).toBeNull();
  });
});

describe("ratesFromRows", () => {
  const { rates, skipped } = ratesFromRows(rows);

  it("multiplies by the number of rolls", () => {
    expect(rates["Chest (Barrows)"]["Dharok's helm"]).toBeCloseTo(7 / 2448);
  });

  it("adds up an item's rows from one source", () => {
    expect(rates["Rewards Chest (Fortis Colosseum)#Wave 3"]["Sunfire splinters"]).toBeCloseTo(10 / 70);
  });

  it("skips the rows it can't read, and keeps the rest of their source", () => {
    expect(skipped.map((r) => r.rarity).sort()).toEqual(["Once", "Uncommon", "Varies"]);
    expect(rates["Nex"]).toEqual({ "Zaryte vambraces": 1 / 172 });
    expect(rates["Kalphite Queen"]).toBeUndefined();
  });
});
