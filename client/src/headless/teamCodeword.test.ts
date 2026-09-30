import { describe, expect, it } from "vitest";
import type { TeamWithMembers } from "@bingo/shared";
import { toTeamModel } from "./boardModel";

// CONTEXT.md "Codeword": who a team's Codeword is shown to (#346).

const team = (id: string, codeword: string): TeamWithMembers => ({
  id,
  bingoId: "b",
  captainUserId: "cap",
  name: id,
  codeword,
  color: null,
  draftOrder: null,
  createdAt: "",
  updatedAt: "",
  members: [],
});

describe("a team's Codeword", () => {
  it("is shown to the team's own Players", () => {
    expect(toTeamModel(team("mine", "Blue giraffe"), "mine", "me", "live").codeword).toBe("Blue giraffe");
  });

  it("isn't shown to Players on another team", () => {
    expect(toTeamModel(team("theirs", "Red panda"), "mine", "me", "live").codeword).toBeNull();
    expect(toTeamModel(team("theirs", "Red panda"), null, "me", "complete").codeword).toBeNull();
  });

  it("is shown to a Moderator for every team, since they can submit for any of them", () => {
    expect(toTeamModel(team("theirs", "Red panda"), null, "mod", "live", true).codeword).toBe("Red panda");
  });
});
