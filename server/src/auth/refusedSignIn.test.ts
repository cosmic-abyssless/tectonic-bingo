import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { onRefusedSignInCode } from "./refusedSignIn";

vi.mock("../log", () => ({ log: Object.assign(vi.fn(), { info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

// passport-oauth2's own error class for what Discord's token endpoint answered: named "TokenError", with Discord's code.
class TokenError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "TokenError";
  }
}

let server: Server;
let base: string;
const CLIENT_URL = "https://bingo.example";

// The callback route's shape: passport stands in as a middleware that fails with `error`, then the handler under test,
// then the app's error handler (a 500, as errorHandler.ts answers).
function start(error: Error, signedIn: boolean) {
  const app = express();
  app.get(
    "/auth/discord/callback",
    (req: Request, _res: Response, next: NextFunction) => {
      Object.assign(req, { isAuthenticated: () => signedIn });
      next(error);
    },
    onRefusedSignInCode,
  );
  app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: "Internal server error" });
  });
  return new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
}

const callback = () => fetch(`${base}/auth/discord/callback?code=used`, { redirect: "manual" });

beforeEach(() => {
  vi.stubEnv("CLIENT_URL", CLIENT_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
  server?.close();
});

describe("the Discord callback refusing a sign-in code", () => {
  it("sends someone already signed in home: the same code arriving a second time, after it signed them in", async () => {
    await start(new TokenError('Invalid "code" in request.', "invalid_grant"), true);
    const res = await callback();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${CLIENT_URL}/`);
  });

  it("sends anyone else back to the login page with its message, not an error page", async () => {
    await start(new TokenError('Invalid "code" in request.', "invalid_grant"), false);
    const res = await callback();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${CLIENT_URL}/login?error=auth_failed`);
  });

  it("leaves any other error to the error handler (Discord unreachable, say)", async () => {
    await start(new Error("Failed to obtain access token"), false);
    const res = await callback();
    expect(res.status).toBe(500);
  });
});
