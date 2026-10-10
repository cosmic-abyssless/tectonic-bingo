import { describe, expect, it } from "vitest";
import { isTabOutOfStage, MOD_TAB_ROWS, MOD_TABS, mayViewTab, visibleSections } from "./modTabs";

const tab = (key: string) => MOD_TABS.find((t) => t.key === key)!;
const keys = (key: string, canAdminister: boolean) => visibleSections(tab(key), canAdminister).map((s) => s.key);

describe("mod panel tabs with sub-tabs", () => {
  it("shows a Moderator only the sub-tabs their Action allows", () => {
    expect(keys("feedback", false)).toEqual(["responses"]);
    expect(keys("signups", false)).toEqual(["roster"]);
    expect(keys("feedback", true)).toEqual(["responses", "questions", "superlatives"]);
    expect(keys("signups", true)).toEqual(["roster", "questions"]);
  });

  it("hides a tab whose every sub-tab is Admin-only from a Moderator", () => {
    for (const key of ["settings", "board", "extras"]) {
      expect(mayViewTab(tab(key), false)).toBe(false);
      expect(mayViewTab(tab(key), true)).toBe(true);
    }
    expect(MOD_TABS.filter((t) => mayViewTab(t, false)).map((t) => t.key)).toEqual(["submissions", "signups", "audit", "feedback"]);
  });

  it("is out of stage only when every sub-tab the viewer sees is", () => {
    // A Moderator sees only the Responses, which wait for the Bingo to be Finished.
    expect(isTabOutOfStage(tab("feedback"), "live", false)).toBe(true);
    expect(isTabOutOfStage(tab("feedback"), "complete", false)).toBe(false);
    // An Admin also sees the Questions, editable in any stage.
    expect(isTabOutOfStage(tab("feedback"), "live", true)).toBe(false);
    // The Board's Tiles and Lines both stop at Board revealed.
    expect(isTabOutOfStage(tab("board"), "reveal", true)).toBe(false);
    expect(isTabOutOfStage(tab("board"), "live", true)).toBe(true);
  });

  it("names each sub-tab in the Settings tab's list of who sees each tab", () => {
    expect(MOD_TAB_ROWS.map((r) => [r.label, r.action])).toEqual([
      ["Submissions", "moderate_bingo"],
      ["Signups: Roster", "moderate_bingo"],
      ["Signups: Questions", "administer_bingo"],
      ["Audit log", "moderate_bingo"],
      ["Feedback: Responses", "moderate_bingo"],
      ["Feedback: Questions", "administer_bingo"],
      ["Feedback: Superlatives", "administer_bingo"],
      ["Settings: General", "administer_bingo"],
      ["Settings: Moderators and Staff", "administer_bingo"],
      ["Settings: Mod panel tabs", "administer_bingo"],
      ["Settings: What each role can do", "administer_bingo"],
      ["Board: Tiles", "administer_bingo"],
      ["Board: Lines", "administer_bingo"],
      ["Captains", "administer_bingo"],
      ["Extras: Achievements", "administer_bingo"],
      ["Extras: Wrapped art", "administer_bingo"],
    ]);
  });
});
