import { describe, expect, it } from "vitest";
import { PAIRS_FIRST_MESSAGE, type DraftUnit } from "@bingo/shared";
import { takesBlock } from "./poolData";

const unit = (size: number, cut = false) => ({ pairingId: size > 1 ? "p" : null, entries: Array.from({ length: size }, () => ({})), cut }) as unknown as DraftUnit;

describe("takesBlock", () => {
  it("holds singles back with the pairs-first message while a pair may still be taken", () => {
    const takes = { pairs: true, singles: false, pairsFirst: true };
    expect(takesBlock(unit(1), takes)).toBe(PAIRS_FIRST_MESSAGE);
    expect(takesBlock(unit(2), takes)).toBeNull();
  });

  it("says the team has its share otherwise", () => {
    expect(takesBlock(unit(1), { pairs: true, singles: false, pairsFirst: false })).toBe("The team on the clock already has its singles");
    expect(takesBlock(unit(2), { pairs: false, singles: true, pairsFirst: false })).toBe("The team on the clock already has its pairs");
    expect(takesBlock(unit(1), { pairs: false, singles: true, pairsFirst: false })).toBeNull();
  });

  it("says a cut unit is cut, whatever the team may take", () => {
    expect(takesBlock(unit(1, true), { pairs: true, singles: false, pairsFirst: true })).toBe("Will be cut from the draft");
  });
});
