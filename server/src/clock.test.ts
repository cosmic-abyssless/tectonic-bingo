import { describe, expect, it } from "vitest";
import { runWithAuditContext, type AuditContext } from "./audit/context";
import { now } from "./clock";

const ctx = (overrides: Partial<AuditContext> = {}): AuditContext => ({ requestId: "r", actorUserId: null, actorType: "system", actorRole: "system", recorded: 0, skip: null, ...overrides });

describe("now", () => {
  it("is the real clock outside a request, and inside one with no override", () => {
    const before = Date.now();
    expect(now().getTime()).toBeGreaterThanOrEqual(before);
    runWithAuditContext(ctx(), () => expect(Math.abs(now().getTime() - Date.now())).toBeLessThan(1000));
  });

  it("is the request's override when one is set", () => {
    const at = new Date("2026-01-05T10:00:00Z");
    runWithAuditContext(ctx({ now: at }), () => expect(now()).toEqual(at));
  });

  it("keeps the override across awaits inside the request", async () => {
    const at = new Date("2026-01-05T10:00:00Z");
    await runWithAuditContext(ctx({ now: at }), async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(now()).toEqual(at);
    });
  });
});
