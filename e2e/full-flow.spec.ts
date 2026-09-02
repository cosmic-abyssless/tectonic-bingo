import { test, expect } from "@playwright/test";
import { loginAs, E2E_USERS } from "./helpers";

// One long test walking the entire bingo lifecycle — a single flow keeps
// state continuity trivial (draft order, team ids, etc. all carry forward
// naturally) at the cost of not being independently re-runnable per step.
// See docs/e2e-testing-plan.md for the phase-by-phase build-out; each phase
// adds more test.step() blocks to this same test.
test("full bingo lifecycle", async ({ page }) => {
  await test.step("admin logs in", async () => {
    await loginAs(page, E2E_USERS.admin);
    await page.goto("/");
    await expect(page.getByText("e2e_admin")).toBeVisible();
  });
});
