// The bundle script (build.ts, source.ts) on the fixture folder, with Wise Old Man and the Tectonic API stood in for.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateHistoricalBundle } from "@bingo/shared";
import type { TectonicDetailedUser } from "../../src/services/tectonicService";
import { buildBundle, formatReport, type BundleSources } from "./build";

const FIXTURE = path.join(__dirname, "fixture");
const COMPETITION = JSON.parse(fs.readFileSync(path.join(FIXTURE, "wom-competition.json"), "utf8")) as { participations: unknown[] };

// Everyone's in the clan except Old Flame and Pebble; Magma Mike has changed RSN since.
const LEFT = new Set(["100000000000000003", "100000000000000022"]);
const member = (id: string, rsns: string[]) => ({ user_id: id, guild_id: "g", points: 0, rank: 0, rsns: rsns.map((rsn) => ({ rsn, wom_id: "1" })), records: [], events: [], achievements: [], combat_achievements: [] }) as TectonicDetailedUser;
const RSNS: Record<string, string[]> = { "100000000000000001": ["Lava Mike"], "100000000000000011": ["Main Acc", "Tidecaller"] };

function sources(competition: unknown = COMPETITION): BundleSources & { asked: string[][] } {
  const asked: string[][] = [];
  return {
    asked,
    getCompetition: async (id) => {
      if (id !== 424242) throw new Error(`GET /competitions/${id}: HTTP 404`);
      return structuredClone(competition);
    },
    getClanMembers: async (ids) => {
      asked.push(ids);
      return ids.filter((id) => !LEFT.has(id)).map((id) => member(id, RSNS[id] ?? [`rsn-${id.slice(-2)}`]));
    },
  };
}

let folder: string;
beforeEach(() => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), "historical-source-"));
  fs.cpSync(FIXTURE, folder, { recursive: true });
});
afterEach(() => {
  fs.rmSync(folder, { recursive: true, force: true });
});

const yaml = () => fs.readFileSync(path.join(folder, "bingo.yaml"), "utf8");
const writeYaml = (text: string) => fs.writeFileSync(path.join(folder, "bingo.yaml"), text);
const edit = (from: string, to: string) => {
  expect(yaml()).toContain(from);
  writeYaml(yaml().replace(from, to));
};

describe("a good folder", () => {
  it("makes a bundle that passes the validator", async () => {
    const { bundle, report } = await buildBundle(folder, sources(), "spring-2024");
    expect(report.errors).toEqual([]);
    expect(bundle).not.toBeNull();
    expect(validateHistoricalBundle(bundle)).toMatchObject({ ok: true });
    expect(bundle!.bingo).toMatchObject({ name: "Spring Bingo 2024 (sample)", slug: "sample-historical-2024", startsAt: "2024-03-01T18:00:00.000Z", boardRows: 3, boardCols: 3 });
    expect(bundle!.bingo.rulesMarkdown).toContain("Drops count from the start time.");
    expect(bundle!.source).toBe("spring-2024");
    expect(bundle!.tiles.find((t) => t.name === "Vorkath")).toMatchObject({ boardRow: 0, boardCol: 0, points: 5, rules: "Any unique drop from Vorkath.", image: "r1c1.png" });
    expect(Object.keys(bundle!.images).sort()).toEqual(["r1c1.png", "r1c2.png", "r1c3.png", "r2c1.png", "r2c2.png", "r2c3.png", "r3c1.png", "r3c2.png", "r3c3.png"]);
    expect(bundle!.teams[1]).toEqual({ name: "Sea Snakes", color: "#3498db", captain: "100000000000000011", coCaptain: "100000000000000012", players: ["100000000000000011", "100000000000000012", "100000000000000013"] });
    expect(bundle!.wom).toEqual({ competitionId: 424242, data: COMPETITION });
  });

  it("names clan members from the clan, by the RSN they played under when it's still theirs", async () => {
    const { bundle } = await buildBundle(folder, sources(), "x");
    const player = (rsn: string) => bundle!.players.find((p) => p.rsn === rsn);
    expect(player("Tidecaller")!.clan).toEqual({ name: "Tidecaller" });
    expect(player("Magma Mike")!.clan).toEqual({ name: "Lava Mike" });
    expect(player("Old Flame")!.clan).toBeNull();
  });

  it("keeps unknown Players off the Teams, for the Wise Old Man leaderboard", async () => {
    const { bundle, report } = await buildBundle(folder, sources(), "x");
    expect(bundle!.unknownPlayers).toEqual(["Ghost Rider"]);
    expect(bundle!.teams[2]!.players).toHaveLength(3);
    expect(report.unknown).toEqual([{ rsn: "Ghost Rider", team: "Rock Crabs" }]);
  });

  it("reports who's in the clan, who isn't, and who's unknown", async () => {
    const { report } = await buildBundle(folder, sources(), "x");
    const text = formatReport(report);
    expect(text).toContain("In the clan (7)\n  Magma Mike (Lava Dragons) → Lava Mike");
    expect(text).toContain("Not in the clan (named by their RSN, locked out) (2)\n  Old Flame (Lava Dragons)\n  Pebble (Rock Crabs)");
    expect(text).toContain("Unknown (Wise Old Man leaderboard only) (1)\n  Ghost Rider (Rock Crabs)");
    expect(text).not.toContain("Errors");
  });
});

describe("what it catches in bingo.yaml, and where", () => {
  it("a Team whose Captain isn't one of its Players", async () => {
    edit("captain: Magma Mike", "captain: Magma Mikey");
    const { bundle, report } = await buildBundle(folder, sources(), "x");
    expect(bundle).toBeNull();
    expect(report.errors).toEqual(['bingo.yaml:19:14: Team "Lava Dragons" captain: "Magma Mikey" isn\'t one of the Team\'s players']);
  });

  it("a Team with no Captain, and one who's unknown", async () => {
    edit("    captain: Magma Mike\n", "");
    edit("captain: Shellshock", "captain: Ghost Rider");
    const { report } = await buildBundle(folder, sources(), "x");
    expect(report.errors).toEqual([
      "bingo.yaml:17:5: teams.0.captain: missing",
      'bingo.yaml:32:14: Team "Rock Crabs" captain: "Ghost Rider" needs a Discord id: a Captain can\'t be unknown',
    ]);
  });

  it("a Player with no Discord id, or one that isn't", async () => {
    edit('{ rsn: Cinder, discordId: "100000000000000002" }', "{ rsn: Cinder }");
    edit('{ rsn: Brine, discordId: "100000000000000012" }', "{ rsn: Brine, discordId: brine#1234 }");
    const { report } = await buildBundle(folder, sources(), "x");
    expect(report.errors).toEqual([
      'bingo.yaml:22:9: Team "Lava Dragons" players[1] (Cinder): discordId missing: a Discord user id, or unknown',
      'bingo.yaml:30:34: Team "Sea Snakes" players[1] (Brine): discordId "brine#1234" isn\'t a Discord user id (or unknown)',
    ]);
  });

  it("reads an unquoted Discord id exactly, digits and all", async () => {
    edit('discordId: "100000000000000001"', "discordId: 123456789012345678901");
    const { bundle } = await buildBundle(folder, sources(), "x");
    expect(bundle!.players[0]!.discordId).toBe("123456789012345678901");
  });

  it("a board cell with no picture, and a position off the board", async () => {
    fs.rmSync(path.join(folder, "tiles", "r2c3.png"));
    edit("  r3c3: { name: Slayer", "  r4c1: { name: Nowhere }\n  r3c3: { name: Slayer");
    const { report } = await buildBundle(folder, sources(), "x");
    expect(report.errors).toEqual(["bingo.yaml:55:3: tiles.r4c1: isn't a position on the 3x3 board (r1c1 to r3c3)", "tiles/r2c3.png: missing (every Tile needs a picture)"]);
  });

  it("broken YAML, with its line", async () => {
    writeYaml(yaml().replace("rows: 3", "rows: [3"));
    const { report } = await buildBundle(folder, sources(), "x");
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toMatch(/^bingo\.yaml:\d+:\d+: /);
  });

  it("dates, standings and settings", async () => {
    edit("end: 2024-03-15T18:00:00Z", "end: 2024-02-15T18:00:00Z");
    edit("{ team: Rock Crabs, place: 3 }", "{ team: Rock Lobsters, place: 3 }");
    edit("slug: sample-historical-2024", "slug: Sample 2024");
    const { report } = await buildBundle(folder, sources(), "x");
    expect(report.errors).toEqual(["bingo.yaml:3:7: slug: must be lowercase letters, numbers and hyphens", "bingo.yaml:6:6: end: must be after start", 'bingo.yaml:43:13: standings[2]: "Rock Lobsters" isn\'t one of the Teams']);
  });
});

describe("checking against Wise Old Man", () => {
  it("reports missing and extra Players and Teams that don't match, without blocking", async () => {
    const competition = structuredClone(COMPETITION) as { participations: { player: { username: string; displayName: string }; teamName: string }[] };
    competition.participations = competition.participations.filter((p) => p.player.displayName !== "Kelp Lord");
    competition.participations.push({ player: { username: "stray_cat", displayName: "Stray Cat" }, teamName: "Sea Snakes" } as never);
    competition.participations.find((p) => p.player.displayName === "Pebble")!.teamName = "Lava Dragons";
    competition.participations.find((p) => p.player.displayName === "Boulder")!.teamName = "Rock Crabz";
    const { bundle, report } = await buildBundle(folder, sources(competition), "x");
    expect(bundle).not.toBeNull();
    expect(report.womMismatches).toEqual([
      'Wise Old Man has a Team "Rock Crabz" that bingo.yaml doesn\'t',
      "Kelp Lord (Sea Snakes) isn't in the Wise Old Man competition",
      'Pebble is on "Rock Crabs" in bingo.yaml but on "Lava Dragons" in Wise Old Man',
      'Boulder is on "Rock Crabs" in bingo.yaml but on "Rock Crabz" in Wise Old Man',
      "Stray Cat (Sea Snakes) is in the Wise Old Man competition but not in bingo.yaml",
    ]);
    expect(formatReport(report)).toContain("Wise Old Man mismatches (5)");
  });

  it("matches RSNs the way Wise Old Man writes them", async () => {
    const { report } = await buildBundle(folder, sources(), "x");
    expect(report.womMismatches).toEqual([]);
  });

  it("fails when the competition can't be fetched", async () => {
    edit("womCompetitionId: 424242", "womCompetitionId: 999");
    const { bundle, report } = await buildBundle(folder, sources(), "x");
    expect(bundle).toBeNull();
    expect(report.errors).toEqual(["Wise Old Man competition 999: GET /competitions/999: HTTP 404"]);
  });
});

it("warns about Tiles without names and stray files, and names them by position", async () => {
  edit("  r2c2: { name: Chambers of Xeric }\n", "");
  fs.writeFileSync(path.join(folder, "tiles", "board.png"), "x");
  const { bundle, report } = await buildBundle(folder, sources(), "x");
  expect(report.unnamedTiles).toEqual(["r2c2"]);
  expect(report.warnings).toEqual(["tiles/board.png: skipped (not a png, jpg or webp named like r1c1.png)"]);
  expect(bundle!.tiles.find((t) => t.boardRow === 1 && t.boardCol === 1)!.name).toBe("Tile r2c2");
});
