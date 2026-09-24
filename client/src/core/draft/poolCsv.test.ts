import { describe, expect, it } from "vitest";
import type { DraftPoolEntry, DraftUnit, SignupQuestion } from "@bingo/shared";
import { buildPoolCsv } from "./poolCsv";

function entry(id: string, rsn: string, answers: DraftPoolEntry["answers"] = null): DraftPoolEntry {
  return {
    signup: { id, rsn, timezone: null },
    user: { id: `u-${id}`, discordUsername: `${rsn.toLowerCase()}_dc`, discordGlobalName: null, discordGuildNick: null, rsn: null },
    answers,
    womStats: null,
    accountType: null,
    caCurrent: null,
    caPeak: null,
    tectonicProfile: null,
  } as unknown as DraftPoolEntry;
}

const question = { id: "q1", prompt: "Hours, per day", type: "text" } as unknown as SignupQuestion;

describe("buildPoolCsv", () => {
  it("writes a row per player, a pair naming each other and sharing its rating, with the note and answers", () => {
    const pool: DraftUnit[] = [
      { pairingId: "p1", cut: false, entries: [entry("a", "Alpha", [{ questionId: "q1", value: "4, maybe 5" }] as never), entry("b", "Bravo", [] as never)] },
      { pairingId: null, cut: true, entries: [entry("c", "Charlie", [] as never)] },
    ];
    const csv = buildPoolCsv(pool, [question], { a: { stars: 2, note: 'says "hi"' } });
    const [header, alpha, bravo, charlie] = csv.split("\n");
    expect(header).toBe('RSN,Discord,Paired with,Rating,Note,Will be cut,Timezone,EHB,EHP,Current CA,Peak CA,"Hours, per day"');
    expect(alpha).toMatch(/^Alpha,alpha_dc,Bravo,2,"says ""hi""",,/);
    expect(alpha).toMatch(/,"4, maybe 5"$/);
    expect(bravo).toMatch(/^Bravo,bravo_dc,Alpha,2,"says ""hi""",,/);
    expect(charlie).toMatch(/^Charlie,charlie_dc,,,,Yes,/);
  });

  it("leaves out the rating and answer columns for a viewer who doesn't get them", () => {
    const pool: DraftUnit[] = [{ pairingId: null, cut: false, entries: [entry("a", "Alpha")] }];
    const [header] = buildPoolCsv(pool, [question], null).split("\n");
    expect(header).toBe("RSN,Discord,Timezone,EHB,EHP,Current CA,Peak CA");
  });
});
