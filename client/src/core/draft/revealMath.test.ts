import { describe, expect, it } from "vitest";
import type { DraftPick } from "@bingo/shared";
import { GIVE_UP_AFTER_MS, burstLetteringSize, expiredPicks, flightTo, isOnScreen, namesForPick, readyPick } from "./revealMath";

const pick = (pickNumber: number, teamId: string, rsn: string): DraftPick =>
  ({ id: `${pickNumber}-${rsn}`, bingoId: "b", pickNumber, teamId, userId: rsn, pickedByUserId: "x", createdAt: "", rsn, user: { id: rsn, discordUsername: `${rsn}_dc`, discordGlobalName: null, discordGuildNick: null, rsn } }) as DraftPick;

describe("readyPick", () => {
  const picks = [pick(1, "A", "Ann"), pick(2, "B", "Bob"), pick(2, "B", "Bea")];

  it("is the first waiting pick whose players have arrived in the draft state", () => {
    expect(readyPick([{ pickNumber: 3, teamId: "C", queuedAt: 0 }, { pickNumber: 2, teamId: "B", queuedAt: 1 }], picks)).toMatchObject({ pickNumber: 2 });
  });

  it("waits while the pick isn't in the state yet, and needs the team to match too", () => {
    expect(readyPick([{ pickNumber: 3, teamId: "C", queuedAt: 0 }], picks)).toBeNull();
    expect(readyPick([{ pickNumber: 2, teamId: "A", queuedAt: 0 }], picks)).toBeNull();
    expect(readyPick([], picks)).toBeNull();
  });
});

describe("expiredPicks", () => {
  it("drops a pick that has waited too long for its players to load", () => {
    const pending = [{ pickNumber: 1, teamId: "A", queuedAt: 1000 }, { pickNumber: 2, teamId: "A", queuedAt: 1000 + GIVE_UP_AFTER_MS }];
    expect(expiredPicks(pending, [], 1000 + GIVE_UP_AFTER_MS).map((p) => p.pickNumber)).toEqual([1]);
    expect(expiredPicks(pending, [], 1000 + GIVE_UP_AFTER_MS * 2).map((p) => p.pickNumber)).toEqual([1, 2]);
  });

  it("keeps a pick that is loaded and only waiting for its turn on screen", () => {
    const pending = [{ pickNumber: 1, teamId: "A", queuedAt: 0 }, { pickNumber: 2, teamId: "B", queuedAt: 0 }];
    expect(expiredPicks(pending, [pick(1, "A", "Ann")], GIVE_UP_AFTER_MS * 2).map((p) => p.pickNumber)).toEqual([2]);
  });
});

describe("namesForPick", () => {
  it("lists each drafted player by RSN, both halves of a duo pair", () => {
    expect(namesForPick([pick(1, "A", "Ann"), pick(2, "B", "Bob"), pick(2, "B", "Bea")], 2)).toEqual(["Bob", "Bea"]);
    expect(namesForPick([], 1)).toEqual([]);
  });

  it("falls back to the Discord name when a player has no RSN", () => {
    const p = { ...pick(1, "A", ""), rsn: "", user: { id: "u", discordUsername: "handle", discordGlobalName: "Global", discordGuildNick: null } } as DraftPick;
    expect(namesForPick([p], 1)).toEqual(["Global"]);
  });
});

describe("flightTo", () => {
  it("moves centre to centre and shrinks the shape to the slot's width", () => {
    const flight = flightTo({ left: 300, top: 100, width: 400, height: 400 }, { left: 800, top: 600, width: 200, height: 30 });
    expect(flight).toEqual({ x: 800 + 100 - 500, y: 600 + 15 - 300, scale: 0.5 });
  });

  it("never grows the shape, and keeps a minimum size", () => {
    expect(flightTo({ left: 0, top: 0, width: 100, height: 100 }, { left: 0, top: 0, width: 500, height: 30 }).scale).toBe(1);
    expect(flightTo({ left: 0, top: 0, width: 1000, height: 1000 }, { left: 0, top: 0, width: 20, height: 20 }).scale).toBe(0.15);
  });
});

describe("isOnScreen", () => {
  const viewport = { width: 1000, height: 800 };
  it("is true for a box that is at least partly in view", () => {
    expect(isOnScreen({ left: 100, top: 100, width: 50, height: 20 }, viewport)).toBe(true);
    expect(isOnScreen({ left: 980, top: 790, width: 100, height: 100 }, viewport)).toBe(true);
  });
  it("is false when it is off screen or has no size", () => {
    expect(isOnScreen({ left: 100, top: 900, width: 50, height: 20 }, viewport)).toBe(false);
    expect(isOnScreen({ left: -200, top: 10, width: 100, height: 20 }, viewport)).toBe(false);
    expect(isOnScreen({ left: 10, top: 10, width: 0, height: 0 }, viewport)).toBe(false);
  });
});

describe("burstLetteringSize", () => {
  it("shrinks for long names, within limits", () => {
    expect(burstLetteringSize(["Al"])).toBe(16);
    expect(burstLetteringSize(["GoldenGuardian"])).toBeLessThan(burstLetteringSize(["Zezima"]));
    expect(burstLetteringSize(["x".repeat(40)])).toBe(7);
    expect(burstLetteringSize(["Bob", "MightyIronman"])).toBe(burstLetteringSize(["MightyIronman"]));
  });
});
