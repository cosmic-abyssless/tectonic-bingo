import { describe, expect, it } from "vitest";
import { initialStatsTeams, readStatsTeams, statsTeamsStorageKey, writeStatsTeams } from "./statsTeamsStore";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const viewer = { stage: "live", myTeamId: "t1", teamIds: ["t1", "t2", "t3"] };

describe("statsTeamsStore", () => {
  it("remembers a pick per Bingo and stage", () => {
    const storage = memoryStorage();
    writeStatsTeams("comics", "live", ["t2", "t3"], storage);
    expect(readStatsTeams("comics", "live", storage)).toEqual(["t2", "t3"]);
    expect(readStatsTeams("comics", "complete", storage)).toBeNull();
    expect(readStatsTeams("other", "live", storage)).toBeNull();
  });

  it("remembers every Team as an empty pick, apart from nothing remembered", () => {
    const storage = memoryStorage();
    writeStatsTeams("comics", "live", [], storage);
    expect(readStatsTeams("comics", "live", storage)).toEqual([]);
  });

  it("ignores what it can't read", () => {
    const storage = memoryStorage();
    storage.setItem(statsTeamsStorageKey("comics", "live"), "{not json");
    expect(readStatsTeams("comics", "live", storage)).toBeNull();
    storage.setItem(statsTeamsStorageKey("comics", "live"), JSON.stringify([1, 2]));
    expect(readStatsTeams("comics", "live", storage)).toBeNull();
    expect(readStatsTeams("comics", "live", null)).toBeNull();
  });

  it("starts a Live Bingo on the viewer's own Team", () => {
    expect(initialStatsTeams(null, viewer)).toEqual(["t1"]);
  });

  it("starts on every Team once Finished, or for a viewer with no Team among them", () => {
    expect(initialStatsTeams(null, { ...viewer, stage: "complete" })).toEqual([]);
    expect(initialStatsTeams(null, { ...viewer, myTeamId: null })).toEqual([]);
    expect(initialStatsTeams(null, { ...viewer, myTeamId: "gone" })).toEqual([]);
  });

  it("prefers the remembered pick, less any Team no longer on offer", () => {
    expect(initialStatsTeams(["t2", "gone"], viewer)).toEqual(["t2"]);
    expect(initialStatsTeams([], viewer)).toEqual([]);
  });
});
