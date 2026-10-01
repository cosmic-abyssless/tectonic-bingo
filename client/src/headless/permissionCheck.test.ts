import { describe, expect, it } from "vitest";
import { resolvePermissions, type Role, type Stage } from "@bingo/shared";
import { lostAccessMessage, permissionCheck } from "./permissionCheck";

// The client's side of can() (CONTEXT.md "Action"): answering from the server's resolved Actions, and what a viewer is
// told when they lose one while looking at it.

const at = (stage: Stage, roles: Role[]) => resolvePermissions(roles, { stage, showScreenshotsWhenFinished: true });

describe("permissionCheck", () => {
  it("allows what the server allowed", () => {
    const can = permissionCheck(at("live", ["moderator"]));
    expect(can("moderate_bingo")).toEqual({ allowed: true, reason: null });
  });

  it("refuses with the server's reason what the stage closes, and with none what no role grants", () => {
    const can = permissionCheck(at("live", ["captain", "player"]));
    expect(can("rename_team")).toEqual({ allowed: false, reason: "Team names are locked once the Bingo is Live" });
    expect(can("moderate_bingo")).toEqual({ allowed: false, reason: null });
  });

  it("refuses everything until the permissions have loaded", () => {
    expect(permissionCheck(undefined)("view_bingo")).toEqual({ allowed: false, reason: null });
  });
});

describe("lostAccessMessage", () => {
  it("names the role that granted the lost Action", () => {
    expect(lostAccessMessage(at("live", ["moderator", "player"]), at("live", ["player"]), "moderate_bingo", "Summer Bingo")).toBe("You're no longer a Moderator on Summer Bingo");
    expect(lostAccessMessage(at("signup", ["captain", "player"]), at("signup", ["player"]), "view_draft_room", "Summer Bingo")).toBe("You're no longer a Captain on Summer Bingo");
    expect(lostAccessMessage(at("live", ["admin"]), at("live", []), "administer_bingo", "Summer Bingo")).toBe("You're no longer an Admin");
    expect(lostAccessMessage(at("draft", ["staff", "player"]), at("draft", ["player"]), "view_buyins", "Summer Bingo")).toBe("You're no longer Staff on Summer Bingo");
  });

  it("says why when the stage closed it rather than a role going", () => {
    expect(lostAccessMessage(at("reveal", ["captain", "player"]), at("live", ["captain", "player"]), "rename_team", "Summer Bingo")).toBe("Team names are locked once the Bingo is Live");
    expect(lostAccessMessage(at("reveal", ["staff"]), at("live", ["staff"]), "view_buyins", "Summer Bingo")).toBe("Buy-ins are only collected from Signups open until the Bingo is Live");
  });
});

describe("a Restriction", () => {
  const restricted = resolvePermissions(["player"], { stage: "live", showScreenshotsWhenFinished: true }, [{ action: "react", reason: "Reaction spam" }]);

  it("refuses the Action with its reason", () => {
    expect(permissionCheck(restricted)("react")).toEqual({ allowed: false, reason: "Restricted: Reaction spam" });
    expect(permissionCheck(restricted)("submit")).toEqual({ allowed: true, reason: null });
  });

  it("is what the viewer is told when it takes an Action from them", () => {
    expect(lostAccessMessage(at("live", ["player"]), restricted, "react", "Summer Bingo")).toBe("Restricted: Reaction spam");
  });
});
