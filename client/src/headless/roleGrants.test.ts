import { describe, expect, it } from "vitest";
import { ACTIONS } from "@bingo/shared";
import { describeStages, roleGrants } from "./roleGrants";

// The mod panel's Permissions tab (CONTEXT.md "Action"): every role's grants, in the stages they're open in.

const settings = { showScreenshotsWhenFinished: true };
const grant = (role: Parameters<typeof roleGrants>[0], action: string) => roleGrants(role, settings).find((g) => g.action === action);

describe("roleGrants", () => {
  it("gives Admin every Action, none of them restrictable", () => {
    const grants = roleGrants("admin", settings);
    expect(grants.map((g) => g.action)).toEqual([...ACTIONS]);
    expect(grants.some((g) => g.restrictable)).toBe(false);
  });

  it("narrows a grant to the stages the rules for everyone leave open", () => {
    // Granted to Admin in every stage, but the Draft is only run in the Draft.
    expect(grant("admin", "run_draft")?.stages).toEqual(["draft"]);
    // A Captain's rating is granted throughout, and locks once Live.
    expect(grant("captain", "rate_picks")?.stages).toEqual(["planning", "signup", "captains", "draft", "reveal"]);
  });

  it("narrows Submitting and Reacting to Live, as the Submission checks outside can() do", () => {
    expect(grant("player", "submit")?.stages).toEqual(["live"]);
    expect(grant("admin", "react")?.stages).toEqual(["live"]);
  });

  it("keeps a role's own stage limits", () => {
    expect(grant("captain", "rename_team")?.stages).toEqual(["reveal"]);
    expect(grant("staff", "view_buyins")?.stages).toEqual(["signup", "captains", "draft", "reveal"]);
  });

  it("tells doing from seeing, and marks what a Restriction can take", () => {
    expect(grant("player", "submit")).toMatchObject({ does: true, restrictable: true });
    expect(grant("player", "view_bingo")).toMatchObject({ does: false, restrictable: false });
    expect(grant("captain", "make_draft_pick")).toMatchObject({ does: true, restrictable: false });
  });

  it("lists only what the role is granted", () => {
    expect(roleGrants("staff", settings).map((g) => g.action)).toEqual(["mark_buyins", "view_buyins"]);
  });
});

describe("describeStages", () => {
  it("says every stage, one stage, a run of them, or lists them", () => {
    expect(describeStages(["planning", "signup", "captains", "draft", "reveal", "live", "complete"])).toBe("Every stage");
    expect(describeStages(["reveal"])).toBe("Board revealed only");
    expect(describeStages(["signup", "captains", "draft", "reveal"])).toBe("Signups open to Board revealed");
    expect(describeStages(["signup", "captains", "draft", "reveal", "live", "complete"])).toBe("From Signups open on");
    expect(describeStages(["signup", "live"])).toBe("Signups open, Live");
  });
});
