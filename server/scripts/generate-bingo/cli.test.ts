import { describe, expect, it } from "vitest";
import { UsageError, parseArgs } from "./common";

describe("parseArgs", () => {
  const now = new Date("2026-09-19T14:32:00Z");
  const noEnv = {};

  it("has the defaults from the plan", () => {
    const a = parseArgs([], now, noEnv);
    expect(a).toMatchObject({ stage: "live", progress: 0.5, days: 9, teams: 6, teamSize: 14, mods: 3, me: null, base: "http://localhost:3001", dryRun: false, from: null, basicAuth: null });
    expect(a.slug).toBe("testdata-20260919-1432");
  });

  it("reads options and flags", () => {
    const a = parseArgs(["--stage", "draft", "--seed", "7", "--me", "123", "--dry-run", "--teams", "4", "--from", "tectonic-comics-bingo", "--base", "https://staging.example/"], now, noEnv);
    expect(a).toMatchObject({ stage: "draft", seed: 7, me: "123", dryRun: true, teams: 4, from: "tectonic-comics-bingo", base: "https://staging.example" });
  });

  it("takes the staging password from the flag or the environment", () => {
    expect(parseArgs(["--basic-auth", "team:pw"], now, noEnv).basicAuth).toBe("team:pw");
    expect(parseArgs([], now, { GENERATE_BINGO_BASIC_AUTH: "team:pw" }).basicAuth).toBe("team:pw");
    expect(() => parseArgs(["--basic-auth", "nocolon"], now, noEnv)).toThrow(/user:password/);
  });

  it("refuses what it can't use", () => {
    expect(() => parseArgs(["--stage", "nope"], now, noEnv)).toThrow(UsageError);
    expect(() => parseArgs(["--progress", "3"], now, noEnv)).toThrow(/^--progress must be a number from 0.02 to 1/);
    expect(() => parseArgs(["--team-size", "2.5"], now, noEnv)).toThrow(/^--team-size must be a whole number/);
    expect(() => parseArgs(["--bogus", "1"], now, noEnv)).toThrow(/Unknown option/);
    expect(() => parseArgs(["--slug", "real-bingo"], now, noEnv)).toThrow(/testdata-/);
    expect(() => parseArgs(["--from", "a", "--export", "b.json"], now, noEnv)).toThrow(/not both/);
    expect(() => parseArgs(["stray"], now, noEnv)).toThrow(/Unexpected/);
  });
});
