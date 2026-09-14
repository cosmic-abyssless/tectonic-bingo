import { describe, expect, it } from "vitest";
import express from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { getAuditContext, runWithAuditContext, type AuditContext } from "./context";

function makeCtx(overrides: Partial<AuditContext> = {}): AuditContext {
  return { requestId: "req-1", actorUserId: "u1", actorType: "user", actorRole: "player", recorded: 0, skip: null, ...overrides };
}

describe("AsyncLocalStorage audit context", () => {
  it("is visible inside the run() callback", () => {
    const ctx = makeCtx();
    runWithAuditContext(ctx, () => {
      expect(getAuditContext()).toBe(ctx);
    });
  });

  it("is undefined outside any run()", () => {
    expect(getAuditContext()).toBeUndefined();
  });

  it("survives an await", async () => {
    const ctx = makeCtx();
    await runWithAuditContext(ctx, async () => {
      await new Promise((r) => setTimeout(r, 0));
      expect(getAuditContext()).toBe(ctx);
    });
  });

  it("survives a setTimeout callback", async () => {
    const ctx = makeCtx();
    await new Promise<void>((resolve) => {
      runWithAuditContext(ctx, () => {
        setTimeout(() => {
          expect(getAuditContext()).toBe(ctx);
          resolve();
        }, 0);
      });
    });
  });

  it("is inherited by a fire-and-forget async IIFE started inside the context", async () => {
    const ctx = makeCtx();
    let seen: AuditContext | undefined;
    const done = new Promise<void>((resolve) => {
      runWithAuditContext(ctx, () => {
        (async () => {
          await Promise.resolve();
          seen = getAuditContext();
          resolve();
        })();
      });
    });
    await done;
    expect(seen).toBe(ctx);
  });
});

describe("asyncHandler ALS re-entry", () => {
  it("re-enters req.audit's context when it was set outside the active store (simulates multer resuming a multipart request)", async () => {
    const app = express();
    let seenInsideHandler: AuditContext | undefined;

    app.use((req, _res, next) => {
      // Mimics auditContext(), but deliberately NOT run inside
      // runWithAuditContext — the point of this test is the re-entry
      // asyncHandler does on its own, not auditContext's own wrapping.
      req.audit = makeCtx({ requestId: "multipart-req" });
      next();
    });
    app.post(
      "/upload",
      asyncHandler(async (_req, res) => {
        seenInsideHandler = getAuditContext();
        res.status(200).json({ ok: true });
      }),
    );

    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;
    try {
      const res = await fetch(`http://localhost:${port}/upload`, { method: "POST" });
      expect(res.status).toBe(200);
      expect(seenInsideHandler?.requestId).toBe("multipart-req");
    } finally {
      server.close();
    }
  });

  it("runs the handler directly when req.audit was never set", async () => {
    const app = express();
    let ran = false;
    app.get(
      "/plain",
      asyncHandler(async (_req, res) => {
        ran = true;
        expect(getAuditContext()).toBeUndefined();
        res.status(200).json({ ok: true });
      }),
    );
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;
    try {
      await fetch(`http://localhost:${port}/plain`);
      expect(ran).toBe(true);
    } finally {
      server.close();
    }
  });
});
