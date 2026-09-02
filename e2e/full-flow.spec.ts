import { test, expect, type Page } from "@playwright/test";
import { loginAs, dismissNotifPromptIfPresent, E2E_USERS } from "./helpers";

const SLUG = "pokemon";

// Scopes to one task's full container (its expand button + expandable body)
// within an open tile modal. Needed because multiple tasks can render the
// same field labels ("Label", "Points", "Description") simultaneously —
// getByLabel alone would be ambiguous once more than one task is expanded.
function taskPanel(page: Page, taskLabel: string) {
  return page
    .locator(".bg-slate-900.border.border-slate-700.rounded-lg.overflow-hidden")
    .filter({ has: page.getByRole("button", { name: new RegExp(`task: ${taskLabel}$`) }) });
}

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

  await test.step("admin creates the Pokemon Bingo", async () => {
    await page.goto("/admin");
    await page.getByLabel("Name").fill("Pokemon Bingo");
    // Override the auto-generated slug ("pokemon-bingo") — every later step
    // and URL in this suite assumes the short slug "pokemon".
    await page.getByLabel("Slug (used in the URL)").fill(SLUG);
    await page.getByLabel("Board size (NxN)").fill("3");
    await page.getByRole("button", { name: "Create bingo" }).click();
    await expect(page).toHaveURL(new RegExp(`/b/${SLUG}/mod$`));
    await dismissNotifPromptIfPresent(page);
  });

  await test.step("admin sets buy-in and bonus pot", async () => {
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByLabel("Buy-in (GP)").fill("10000000");
    await page.getByLabel("Bonus pot / extra donations (GP)").fill("50000000");
    await page.getByRole("button", { name: "Save Settings" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    // 0 paid signups yet, so total pot is just the bonus.
    await expect(page.getByText(/Total pot:\s*50,000,000 GP/)).toBeVisible();
  });

  await test.step("admin builds the board: Vorkath, Wintertodt, GOTR Speedrun", async () => {
    await page.getByRole("button", { name: "Board", exact: true }).click();

    // --- Tile (0,0): Vorkath — two tasks, Part B's points withheld until Part A ---
    await page.getByRole("button", { name: "Create tile at row 0, column 0" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Vorkath");
    await page.getByLabel("Name", { exact: true }).press("Tab");

    await page.getByRole("button", { name: "+ Add task" }).click();
    await taskPanel(page, "Part A").getByRole("button", { name: /Expand task: Part A/ }).click();
    await taskPanel(page, "Part A").getByLabel("Label", { exact: true }).fill("Part A");
    await taskPanel(page, "Part A").getByLabel("Points", { exact: true }).fill("25");
    await taskPanel(page, "Part A").getByLabel("Description", { exact: true }).fill("Obtain a Vorki pet or Draconic visage.");
    await taskPanel(page, "Part A").getByPlaceholder("Item name").fill("Vorki");
    await taskPanel(page, "Part A").getByRole("button", { name: "Add" }).click();
    await expect(taskPanel(page, "Part A").getByText("Vorki", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "+ Add task" }).click();
    await taskPanel(page, "Part B").getByRole("button", { name: /Expand task: Part B/ }).click();
    await taskPanel(page, "Part B").getByLabel("Label", { exact: true }).fill("Part B");
    await taskPanel(page, "Part B").getByLabel("Points", { exact: true }).fill("35");
    await taskPanel(page, "Part B").getByLabel("Description", { exact: true }).fill("Obtain a second unique drop.");
    // Controlled checkbox — its `checked` prop only reflects the new value
    // once the patch round-trips and the board query refetches, so a plain
    // .check() (single click + immediate verify) races that. Click, then
    // let expect's polling absorb the round-trip.
    await taskPanel(page, "Part B").getByLabel("Withhold points until previous").click();
    await expect(taskPanel(page, "Part B").getByLabel("Withhold points until previous")).toBeChecked();
    await taskPanel(page, "Part B").getByPlaceholder("Item name").fill("Draconic visage");
    await taskPanel(page, "Part B").getByRole("button", { name: "Add" }).click();
    await expect(taskPanel(page, "Part B").getByText("Draconic visage", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Close" }).click();

    // --- Tile (0,1): Wintertodt — one task ---
    await page.getByRole("button", { name: "Create tile at row 0, column 1" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Wintertodt");
    await page.getByLabel("Name", { exact: true }).press("Tab");

    await page.getByRole("button", { name: "+ Add task" }).click();
    await taskPanel(page, "Part A").getByRole("button", { name: /Expand task: Part A/ }).click();
    await taskPanel(page, "Part A").getByLabel("Points", { exact: true }).fill("20");
    await taskPanel(page, "Part A").getByLabel("Description", { exact: true }).fill("Complete a Wintertodt kill.");
    await taskPanel(page, "Part A").getByPlaceholder("Item name").fill("Bruma torch");
    await taskPanel(page, "Part A").getByRole("button", { name: "Add" }).click();
    await expect(taskPanel(page, "Part A").getByText("Bruma torch", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Close" }).click();

    // --- Tile (0,2): GOTR Speedrun — one manual-scoring task, no item list ---
    await page.getByRole("button", { name: "Create tile at row 0, column 2" }).click();
    await page.getByLabel("Name", { exact: true }).fill("GOTR Speedrun");
    await page.getByLabel("Name", { exact: true }).press("Tab");

    await page.getByRole("button", { name: "+ Add task" }).click();
    await taskPanel(page, "Part A").getByRole("button", { name: /Expand task: Part A/ }).click();
    await taskPanel(page, "Part A").getByLabel("Points", { exact: true }).fill("20");
    await taskPanel(page, "Part A").getByLabel("Description", { exact: true }).fill("Complete a Guardians of the Rift run in under 6 minutes.");
    await taskPanel(page, "Part A").getByRole("button", { name: "Manual (mod judges)" }).click();

    await page.getByRole("button", { name: "Close" }).click();

    await expect(page.getByRole("button", { name: /Edit tile at row 0, column 0: Vorkath/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Edit tile at row 0, column 1: Wintertodt/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Edit tile at row 0, column 2: GOTR Speedrun/ })).toBeVisible();
  });

  await test.step("admin generates lines", async () => {
    await page.getByRole("button", { name: "Lines" }).click();
    await page.getByRole("button", { name: "Generate lines from board" }).click();
    // 3 rows + 3 columns + 2 diagonals for a square 3x3 board.
    await expect(page.locator("tbody tr")).toHaveCount(8);
  });

  await test.step("admin adds signup questions", async () => {
    await page.getByRole("button", { name: "Signup Questions" }).click();
    // Each existing question renders in its own same-shaped wrapper div, in
    // order — no id/placeholder on the prompt input itself (defaultValue,
    // not value, so toHaveValue still reads the live DOM value correctly).
    const questionRows = page.locator(".bg-slate-900.border.border-slate-700.rounded-lg.p-3.space-y-2");

    await page.getByPlaceholder("New question…").fill("What is your preferred combat style?");
    await page.getByLabel("New question type").selectOption({ label: "Dropdown" });
    await page.getByPlaceholder("Comma-separated options").fill("Melee, Ranged, Magic");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(questionRows).toHaveCount(1);
    await expect(questionRows.first().locator("input").first()).toHaveValue("What is your preferred combat style?");
    // Mark it required — it's the only question so far, so its "Required"
    // checkbox is unambiguous.
    await questionRows.first().getByLabel("Required").click();
    await expect(questionRows.first().getByLabel("Required")).toBeChecked();

    await page.getByPlaceholder("New question…").fill("Willing to captain?");
    await page.getByLabel("New question type").selectOption({ label: "Yes / No" });
    await page.getByRole("button", { name: "Add" }).click();
    await expect(questionRows).toHaveCount(2);
    await expect(questionRows.nth(1).locator("input").first()).toHaveValue("Willing to captain?");
  });

  await test.step("admin advances planning to signup", async () => {
    await page.getByRole("button", { name: "Advance to signup →" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("signup", { exact: true })).toBeVisible();
  });
});
