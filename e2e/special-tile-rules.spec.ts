import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { loginAs, dismissNotifPromptIfPresent, E2E_USERS } from "./helpers";

// Separate bingo/slug from full-flow.spec.ts's "pokemon" — this test exists
// purely to exercise node-graph mechanics the main lifecycle test never
// touches: a nested ANY-of-ALL requirement, distinctItems, a wildcard's
// per-team cap, a frozen tile, and submitGateNodeId. No signup questions, no
// buy-in, no lines (irrelevant here and their point-math would just add
// noise — see docs/e2e-testing-plan.md Phase E5 for how easily that gets
// away from you). One captain acting as the sole team member submits
// everything.
//
// The board itself is built through the admin API rather than clicking
// through RequirementTreeEditor — full-flow.spec.ts already exercises that
// UI end to end (adding a task, "+ item", editing labels/points); what this
// file cares about is the player- and mod-facing behavior of the resulting
// graph, so construction stays out of the way.
const SLUG = "special-rules";
const SCREENSHOT_PATH = "e2e/fixtures/screenshot.png";
const PENDING_ROW = ".bg-slate-800.rounded-lg.border.border-slate-700.overflow-hidden";
const CAPTAIN = "e2e-p4";

function teamPoints(page: Page) {
  return page.locator("span.text-xl.font-bold.text-yellow-400");
}

function pendingRow(page: Page) {
  return page.locator(PENDING_ROW).first();
}

async function pickTileAndTask(page: Page, tileName: string, taskLabel?: string) {
  await page.getByPlaceholder("Search tiles…").click();
  await page.getByRole("button", { name: tileName, exact: true }).click();
  if (taskLabel) await page.getByRole("button", { name: taskLabel, exact: true }).click();
}

// Explicit item-name pick — for a leaf whose own item list has more than one
// option left (SearchableSelect stays interactive, not readOnly-auto-selected).
async function pickItem(page: Page, itemName: string) {
  await page.getByPlaceholder("Search items…").click();
  await page.getByRole("button", { name: itemName, exact: true }).click();
}

// Explicit requirement (leaf) pick — for a task whose tree has more than one
// leaf to choose from (e.g. Barrows' 8 separate one-item pieces). Distinct
// from pickItem: this picks *which leaf*, not which item name on one leaf.
async function pickRequirement(page: Page, label: string) {
  await page.getByPlaceholder("Search requirements…").click();
  await page.getByRole("button", { name: label, exact: true }).click();
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface GraphNode {
  id: string;
  label: string | null;
  children: GraphNode[];
}
interface BoardTile {
  name: string;
  node: GraphNode;
}

async function getTaskId(request: APIRequestContext, tileName: string, taskLabel: string): Promise<string> {
  const res = await request.get(`/api/bingos/${SLUG}/board`);
  const body = (await res.json()) as { tiles: BoardTile[] };
  const tile = body.tiles.find((t) => t.name === tileName);
  const task = tile?.node.children.find((t) => t.label === taskLabel);
  if (!task) throw new Error(`Task "${taskLabel}" on tile "${tileName}" not found in board response`);
  return task.id;
}

// A raw multipart POST bypassing the UI entirely — proves the server itself
// rejects the submission (submissionService.ts's own comment: "the client
// mirrors these checks for UX, but this is the enforcement"), not just that
// the client hid the option. The client-side UI checks are asserted
// separately in each scenario below.
async function rawSubmit(request: APIRequestContext, nodeId: string) {
  return request.post(`/api/bingos/${SLUG}/submissions`, {
    multipart: {
      screenshot: { name: "screenshot.png", mimeType: "image/png", buffer: readFileSync(SCREENSHOT_PATH) },
      claims: JSON.stringify([{ nodeId, itemName: "x" }]),
    },
  });
}

async function createTile(request: APIRequestContext, params: { name: string; boardRow: number; boardCol: number; hasFreezePeriod?: boolean; freezeDurationMinutes?: number }): Promise<{ id: string }> {
  const res = await request.post(`/api/bingos/${SLUG}/admin/tiles`, { data: params });
  expect(res.ok(), `createTile ${params.name}: ${res.status()} ${await res.text()}`).toBe(true);
  return ((await res.json()) as { tile: { id: string } }).tile;
}

async function createTask(request: APIRequestContext, tileId: string, input: Record<string, unknown>): Promise<GraphNode> {
  const res = await request.post(`/api/bingos/${SLUG}/admin/tiles/${tileId}/tasks`, { data: input });
  expect(res.ok(), `createTask ${input.label}: ${res.status()} ${await res.text()}`).toBe(true);
  return ((await res.json()) as { task: GraphNode }).task;
}

async function createWildcard(request: APIRequestContext, tileId: string, params: { itemName: string; applicableNodeId?: string }): Promise<{ id: string }> {
  const res = await request.post(`/api/bingos/${SLUG}/admin/tiles/${tileId}/wildcards`, { data: params });
  expect(res.ok(), `createWildcard: ${res.status()} ${await res.text()}`).toBe(true);
  return ((await res.json()) as { wildcard: { id: string } }).wildcard;
}

test("special tile-rule mechanics", async ({ page }) => {
  await test.step("admin logs in and creates the special-rules bingo", async () => {
    await loginAs(page, E2E_USERS.admin);
    const res = await page.request.post("/api/admin/bingos", { data: { slug: SLUG, name: "Special Rules Bingo", boardRows: 3, boardCols: 3 } });
    expect(res.ok()).toBe(true);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
  });

  await test.step("admin builds Barrows via the API: ANY of ALL(4 Ahrim's)/ALL(4 Dharok's)", async () => {
    const tile = await createTile(page.request, { name: "Barrows", boardRow: 0, boardCol: 0 });
    await createTask(page.request, tile.id, {
      kind: "ANY",
      label: "Part A",
      points: 30,
      description: "Obtain a complete set from one brother.",
      children: [
        { kind: "ALL", children: ["Ahrim's hood", "Ahrim's robetop", "Ahrim's robeskirt", "Ahrim's staff"].map((n) => ({ kind: "ITEM", itemNames: [n] })) },
        { kind: "ALL", children: ["Dharok's helm", "Dharok's platebody", "Dharok's platelegs", "Dharok's greataxe"].map((n) => ({ kind: "ITEM", itemNames: [n] })) },
      ],
    });
  });

  await test.step("admin builds K'ril Tsutsaroth via the API: 2 distinct drops required, not just 2 of the same", async () => {
    const tile = await createTile(page.request, { name: "K'ril Tsutsaroth", boardRow: 0, boardCol: 1 });
    await createTask(page.request, tile.id, {
      kind: "ITEM",
      label: "Part A",
      points: 25,
      description: "Obtain two different unique drops.",
      itemNames: ["Steam battlestaff", "Zamorakian spear", "Zamorak hilt"],
      quantity: 2,
      distinctItems: true,
    });
  });

  await test.step("admin builds Cerberus via the API: same item group on both tasks, Part B gated on Part A, a wildcard capped at 1", async () => {
    const tile = await createTile(page.request, { name: "Cerberus", boardRow: 0, boardCol: 2 });
    const partA = await createTask(page.request, tile.id, {
      kind: "ITEM", label: "Part A", points: 25, description: "Obtain your first Cerberus drop.",
      itemNames: ["Any Cerberus drop"], allowsPreLoad: true,
    });
    await createTask(page.request, tile.id, {
      kind: "ITEM", label: "Part B", points: 40, description: "Obtain another Cerberus drop.",
      itemNames: ["Any Cerberus drop"], submitGateNodeId: partA.id,
    });
    await createWildcard(page.request, tile.id, { itemName: "Cerberus jar" });
  });

  await test.step("admin builds Colosseum via the API: frozen for 120 minutes", async () => {
    const tile = await createTile(page.request, { name: "Colosseum", boardRow: 1, boardCol: 0, hasFreezePeriod: true, freezeDurationMinutes: 120 });
    await createTask(page.request, tile.id, { kind: "ITEM", label: "Part A", points: 20, description: "Clear waves 1 through 3.", itemNames: ["Waves 1-3 proof"] });
  });

  await test.step("admin builds Duke Sucellus via the API: Part B gated on Part A", async () => {
    const tile = await createTile(page.request, { name: "Duke Sucellus", boardRow: 1, boardCol: 1 });
    const partA = await createTask(page.request, tile.id, { kind: "ITEM", label: "Part A", points: 20, description: "Kill Duke Sucellus.", itemNames: ["Duke Sucellus kill proof"] });
    await createTask(page.request, tile.id, { kind: "ITEM", label: "Part B", points: 30, description: "Obtain a Vestige.", itemNames: ["Vestige"], submitGateNodeId: partA.id });
  });

  await test.step("admin advances to signup, one captain signs up, advances to captains and creates the team", async () => {
    await page.reload();
    await page.getByRole("button", { name: "Advance to signup →" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("signup", { exact: true })).toBeVisible();

    await loginAs(page, CAPTAIN);
    await page.goto(`/b/${SLUG}`);
    // RSN input has maxLength=12 (matches OSRS's real limit).
    await page.getByLabel("RuneScape name").fill("RuleTester");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByText("Saved!", { exact: true })).toBeVisible();

    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    await page.getByRole("button", { name: "Advance to captains →" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("captains", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Teams" }).click();
    await page.getByLabel("Assign a captain").selectOption({ label: "RuleTester (e2e_player_4)" });
    await page.getByRole("button", { name: "Make captain" }).click();
    await expect(page.getByText(/There will be 1 team of 1/)).toBeVisible();
  });

  await test.step("admin skips the draft entirely (advanceStage has no draft-completeness gate) straight to live, and sets a starts-at that leaves Colosseum still frozen", async () => {
    await page.getByRole("button", { name: "Advance to draft →" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("draft", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Advance to reveal →" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("reveal", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Advance to live →" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("live", { exact: true })).toBeVisible();

    // 10 minutes ago: bingo has "started" (submissions unblocked generally),
    // but well inside Colosseum's 120-minute freeze window.
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByLabel("Bingo starts").fill(toDatetimeLocal(new Date(Date.now() - 10 * 60_000)));
    await page.getByRole("button", { name: "Save Settings" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  });

  await test.step("Barrows: a partial set (3/4) doesn't complete, the 4th piece does", async () => {
    await loginAs(page, CAPTAIN);
    await page.goto(`/b/${SLUG}`);

    for (const item of ["Ahrim's hood", "Ahrim's robetop", "Ahrim's robeskirt"]) {
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(page.getByText("Submit Completion")).toBeVisible();
      await pickTileAndTask(page, "Barrows");
      await pickRequirement(page, item);
      await page.locator('input[type="file"]').setInputFiles(SCREENSHOT_PATH);
      await page.getByRole("button", { name: "Submit for Review" }).click();
      await expect(page.getByText("Submit Completion")).not.toBeVisible();
    }

    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    for (let i = 0; i < 3; i++) {
      const row = pendingRow(page);
      await row.click();
      await row.getByRole("button", { name: "Approve" }).click();
    }

    await loginAs(page, CAPTAIN);
    await page.goto(`/b/${SLUG}`);
    // A 3/4 set from one brother is not "complete" — the ALL under Barrows'
    // ANY needs every item in one whole group, not most of one.
    await expect(teamPoints(page)).toHaveText("0 pts");

    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await pickTileAndTask(page, "Barrows");
    await pickRequirement(page, "Ahrim's staff");
    await page.locator('input[type="file"]').setInputFiles(SCREENSHOT_PATH);
    await page.getByRole("button", { name: "Submit for Review" }).click();
    await expect(page.getByText("Submit Completion")).not.toBeVisible();

    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    const lastRow = pendingRow(page);
    await lastRow.click();
    await lastRow.getByRole("button", { name: "Approve" }).click();

    await loginAs(page, CAPTAIN);
    await page.goto(`/b/${SLUG}`);
    await expect(teamPoints(page)).toHaveText("30 pts");
  });

  await test.step("K'ril Tsutsaroth: a 2nd claim of the SAME item doesn't complete distinctItems, a different one does", async () => {
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Submit Completion")).toBeVisible();
    await pickTileAndTask(page, "K'ril Tsutsaroth");
    await pickItem(page, "Steam battlestaff");
    await page.locator('input[type="file"]').setInputFiles(SCREENSHOT_PATH);
    await page.getByRole("button", { name: "Submit for Review" }).click();
    await expect(page.getByText("Submit Completion")).not.toBeVisible();

    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    const row = pendingRow(page);
    await row.click();
    await row.getByRole("button", { name: "Approve" }).click();

    await loginAs(page, CAPTAIN);
    await page.goto(`/b/${SLUG}`);
    // One distinct drop out of the 2 required — distinctItems counts unique
    // names, so a repeat of this same drop still wouldn't be enough.
    await expect(teamPoints(page)).toHaveText("30 pts");

    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Submit Completion")).toBeVisible();
    await pickTileAndTask(page, "K'ril Tsutsaroth");
    await pickItem(page, "Zamorakian spear");
    await page.locator('input[type="file"]').setInputFiles(SCREENSHOT_PATH);
    await page.getByRole("button", { name: "Submit for Review" }).click();
    await expect(page.getByText("Submit Completion")).not.toBeVisible();

    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    const row2 = pendingRow(page);
    await row2.click();
    await row2.getByRole("button", { name: "Approve" }).click();

    await loginAs(page, CAPTAIN);
    await page.goto(`/b/${SLUG}`);
    await expect(teamPoints(page)).toHaveText("55 pts");
  });

  await test.step("Cerberus: a wildcard redemption succeeds once, a second is rejected server-side, then a real claim completes the gated Part B", async () => {
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Submit Completion")).toBeVisible();
    // Part B is submitGate'd on Part A, so Part A is the only available
    // task from the start — auto-selected, no task picker to click.
    await pickTileAndTask(page, "Cerberus");
    await page.getByLabel("Submit with a wildcard").check();
    await page.locator('input[type="file"]').setInputFiles(SCREENSHOT_PATH);
    await page.getByRole("button", { name: "Submit for Review" }).click();
    await expect(page.getByText("Submit Completion")).not.toBeVisible();

    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    const partARow = pendingRow(page);
    await partARow.click();
    await partARow.getByRole("button", { name: "Approve" }).click();

    await loginAs(page, CAPTAIN);
    await page.goto(`/b/${SLUG}`);
    await expect(teamPoints(page)).toHaveText("80 pts");
    await page.getByRole("button", { name: "Cerberus" }).click();
    await expect(page.getByText("Pre-load allowed", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();

    // Second wildcard redemption attempt, on the tile's other task — this
    // submission is allowed (Part B isn't complete yet), but its approval
    // must be rejected: the wildcard is already at its 1-per-team cap.
    // Part A is complete now, so it's excluded from availableTasks — Part B
    // is the only one left, no task picker to click.
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Submit Completion")).toBeVisible();
    await pickTileAndTask(page, "Cerberus");
    await page.getByLabel("Submit with a wildcard").check();
    await page.locator('input[type="file"]').setInputFiles(SCREENSHOT_PATH);
    await page.getByRole("button", { name: "Submit for Review" }).click();
    await expect(page.getByText("Submit Completion")).not.toBeVisible();

    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    const wildcardRow2 = pendingRow(page);
    await wildcardRow2.click();
    await wildcardRow2.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText(/already been redeemed/)).toBeVisible();
    // Rejected approval — the submission is still sitting there, pending.
    await expect(wildcardRow2).toBeVisible();
    await wildcardRow2.getByRole("button", { name: "Reject" }).click();

    // A real (non-wildcard) claim on Part B — its own independent ITEM leaf
    // on the same item group, now unblocked since Part A is approved.
    await loginAs(page, CAPTAIN);
    await page.goto(`/b/${SLUG}`);
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Submit Completion")).toBeVisible();
    await pickTileAndTask(page, "Cerberus");
    await page.locator('input[type="file"]').setInputFiles(SCREENSHOT_PATH);
    await page.getByRole("button", { name: "Submit for Review" }).click();
    await expect(page.getByText("Submit Completion")).not.toBeVisible();

    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    const partBRow = pendingRow(page);
    await partBRow.click();
    await partBRow.getByRole("button", { name: "Approve" }).click();

    await loginAs(page, CAPTAIN);
    await page.goto(`/b/${SLUG}`);
    await expect(teamPoints(page)).toHaveText("120 pts");
  });

  await test.step("Colosseum: a frozen tile is unreachable through either submit entry point, and the server rejects a direct API call too", async () => {
    await expect(page.getByRole("button", { name: /Colosseum/ })).toContainText("🔒");

    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Submit Completion")).toBeVisible();
    await page.getByPlaceholder("Search tiles…").click();
    await expect(page.getByRole("button", { name: "Colosseum", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Close" }).click();

    // page.request, not a bare `request` fixture — it shares page's cookie
    // jar (already logged in as the captain), so this call is authenticated.
    const colosseumTaskId = await getTaskId(page.request, "Colosseum", "Part A");
    const res = await rawSubmit(page.request, colosseumTaskId);
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/frozen/);
  });

  await test.step("Duke Sucellus: Part B is unreachable and server-rejected before Part A, then unlocks normally once Part A is approved", async () => {
    const partBTaskId = await getTaskId(page.request, "Duke Sucellus", "Part B");
    const res = await rawSubmit(page.request, partBTaskId);
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/must be completed first/);

    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Submit Completion")).toBeVisible();
    await page.getByPlaceholder("Search tiles…").click();
    await page.getByRole("button", { name: "Duke Sucellus", exact: true }).click();
    // Only Part A is offered — Part B is excluded client-side too.
    await expect(page.getByText("Submitting for Part A")).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles(SCREENSHOT_PATH);
    await page.getByRole("button", { name: "Submit for Review" }).click();
    await expect(page.getByText("Submit Completion")).not.toBeVisible();

    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    const partARow = pendingRow(page);
    await partARow.click();
    await partARow.getByRole("button", { name: "Approve" }).click();

    await loginAs(page, CAPTAIN);
    await page.goto(`/b/${SLUG}`);
    await expect(teamPoints(page)).toHaveText("140 pts");

    // Part B is submittable now that Part A is done — and Part A is
    // complete now too, so it drops out of availableTasks, leaving Part B
    // as the sole option with no task picker to click (same shape as
    // Cerberus above).
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Submit Completion")).toBeVisible();
    await pickTileAndTask(page, "Duke Sucellus");
    await page.locator('input[type="file"]').setInputFiles(SCREENSHOT_PATH);
    await page.getByRole("button", { name: "Submit for Review" }).click();
    await expect(page.getByText("Submit Completion")).not.toBeVisible();

    await loginAs(page, E2E_USERS.admin);
    await page.goto(`/b/${SLUG}/mod`);
    await dismissNotifPromptIfPresent(page);
    const partBRow = pendingRow(page);
    await partBRow.click();
    await partBRow.getByRole("button", { name: "Approve" }).click();

    await loginAs(page, CAPTAIN);
    await page.goto(`/b/${SLUG}`);
    // Barrows 30 + K'ril 25 (one node, distinctItems — not per-item) +
    // Cerberus 65 (25 + 40) + Duke Sucellus 50 (20 + 30) = 170.
    await expect(teamPoints(page)).toHaveText("170 pts");
  });
});
