// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { RosterEntry } from "@bingo/shared";
import { buildPartnerRsnMap } from "./SignupRoster";

// Only the fields buildPartnerRsnMap reads; the rest of RosterEntry isn't relevant to this logic.
function entry(signupId: string, rsn: string, pairingId?: string): RosterEntry {
  return {
    signup: { id: signupId, rsn } as RosterEntry["signup"],
    user: {} as RosterEntry["user"],
    answers: [],
    pairing: pairingId ? ({ id: pairingId } as RosterEntry["pairing"]) : null,
  };
}

describe("buildPartnerRsnMap", () => {
  it("maps each half of a pair to the other's RSN", () => {
    const roster = [entry("a", "Alpha", "p1"), entry("b", "Beta", "p1"), entry("c", "Cosmic")];
    const map = buildPartnerRsnMap(roster);
    expect(map.get("a")).toBe("Beta");
    expect(map.get("b")).toBe("Alpha");
    expect(map.has("c")).toBe(false); // unpaired: never had an entry to begin with
  });

  it("falls back to 'Not signed up yet' when nothing else shares the pairing id", () => {
    const roster = [entry("a", "Alpha", "p1")];
    expect(buildPartnerRsnMap(roster).get("a")).toBe("Not signed up yet");
  });

  it("handles more than one duo independently", () => {
    const roster = [entry("a", "Alpha", "p1"), entry("b", "Beta", "p1"), entry("c", "Cosmic", "p2"), entry("d", "Delta", "p2")];
    const map = buildPartnerRsnMap(roster);
    expect(map.get("a")).toBe("Beta");
    expect(map.get("c")).toBe("Delta");
  });
});
