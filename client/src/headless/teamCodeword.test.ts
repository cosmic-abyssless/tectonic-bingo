import { describe, expect, it } from "vitest";
import type { BingoPermissionsResponse, TeamWithMembers } from "@bingo/shared";
import { toTeamModel } from "./boardModel";
import { permissionCheck } from "./permissionCheck";

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

const player = permissionCheck({ roles: ["player"], allowed: ["view_bingo"], reasons: {} });
const moderator = permissionCheck({ roles: ["moderator"], allowed: ["moderate_bingo", "submit_for_any_team", "view_bingo"], reasons: {} });

describe("a team's Codeword", () => {
  it("is shown to the team's own Players", () => {
    expect(toTeamModel(team("mine", "Blue giraffe"), "mine", player).codeword).toBe("Blue giraffe");
  });

  it("isn't shown to Players on another team", () => {
    expect(toTeamModel(team("theirs", "Red panda"), "mine", player).codeword).toBeNull();
    expect(toTeamModel(team("theirs", "Red panda"), null, player).codeword).toBeNull();
  });

  it("is shown to a Moderator for every team, since they can submit for any of them", () => {
    expect(toTeamModel(team("theirs", "Red panda"), null, moderator).codeword).toBe("Red panda");
  });
});

describe("a team's rename control", () => {
  const captain = (permissions: Pick<BingoPermissionsResponse, "allowed" | "reasons">) => permissionCheck({ roles: ["captain", "player"], ...permissions });

  it("is open on the Captain's own team while rename_team is", () => {
    expect(toTeamModel(team("mine", "x"), "mine", captain({ allowed: ["rename_team"], reasons: {} })).rename).toEqual({ allowed: true, reason: null });
  });

  it("is disabled, with the reason, while the stage closes it", () => {
    const live = captain({ allowed: [], reasons: { rename_team: "Team names are locked once the Bingo is Live" } });
    expect(toTeamModel(team("mine", "x"), "mine", live).rename).toEqual({ allowed: false, reason: "Team names are locked once the Bingo is Live" });
  });

  it("isn't there for a Player who doesn't lead the team, or on another team", () => {
    expect(toTeamModel(team("mine", "x"), "mine", player).rename).toBeNull();
    expect(toTeamModel(team("theirs", "x"), "mine", captain({ allowed: ["rename_team"], reasons: {} })).rename).toBeNull();
  });
});
