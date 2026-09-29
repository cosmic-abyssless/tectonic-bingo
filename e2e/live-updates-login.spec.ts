import { test, expect, type WebSocket } from "@playwright/test";
import { loginAs, E2E_USERS } from "./helpers";

// The live-update socket (/ws) is for logged-in clan members only: the client never tries it while logged out, opens
// it once someone is logged in, and closes it for good on logout. Longer than the client's 3s reconnect delay, so a
// retry would have shown up.
const QUIET_MS = 4_000;

test("the live-update socket needs a login", async ({ page }) => {
  const sockets: WebSocket[] = [];
  page.on("websocket", (ws) => {
    if (new URL(ws.url()).pathname === "/ws") sockets.push(ws);
  });

  await test.step("a logged-out visitor makes no /ws connection", async () => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /e2e_admin/ })).toBeVisible();
    await page.waitForTimeout(QUIET_MS);
    expect(sockets).toHaveLength(0);
  });

  await test.step("a logged-in clan member's socket connects and stays open", async () => {
    await loginAs(page, E2E_USERS.admin);
    await page.goto("/");
    // The header's ☰ menu names who's signed in.
    await page.getByRole("button", { name: /^Menu/ }).click();
    await expect(page.getByText("e2e_admin")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect.poll(() => sockets.length).toBe(1);
    await page.waitForTimeout(1_000);
    expect(sockets[0]!.isClosed()).toBe(false);
  });

  await test.step("logging out closes it, with no reconnect", async () => {
    await page.getByRole("button", { name: /^Menu/ }).click();
    await page.getByRole("menuitem", { name: "Log out" }).click();
    await expect.poll(() => sockets[0]!.isClosed()).toBe(true);
    await page.waitForTimeout(QUIET_MS);
    expect(sockets).toHaveLength(1);
  });

  await test.step("an upload needs the login too", async () => {
    const res = await page.request.get("/uploads/anything.png");
    expect(res.status()).toBe(401);
    expect(await res.text()).toBe("");
  });
});
