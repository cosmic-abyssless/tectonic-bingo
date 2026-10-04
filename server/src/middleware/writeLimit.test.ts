import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import type { AuditContext } from "../audit/context";
import type { SessionUser } from "../types";
import { WRITE_LIMIT_MESSAGE, WriteLimit, apiArea, writeLimitMiddleware, writeLimitPerWindow, type WriteLimitHit } from "./writeLimit";

let t = 1_000_000;
let limit: WriteLimit;
let hits: WriteLimitHit[];
let server: Server;
let base: string;

beforeAll(() => {
  const app = express();
  app.use((req, _res, next) => {
    // Stands in for passport and auditContext: who's logged in, and whether it's the test data generator.
    const userId = req.header("x-user");
    if (userId) (req as unknown as { user: SessionUser }).user = { id: userId } as SessionUser;
    req.audit = { skipIntegrations: req.header("x-generator") === "1" } as AuditContext;
    next();
  });
  app.use((req, res, next) => writeLimitMiddleware(limit, (hit) => hits.push(hit))(req, res, next));
  app.use((_req, res) => {
    res.json({ ok: true });
  });
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  t = 1_000_000;
  limit = new WriteLimit(30, () => t);
  hits = [];
});

function send(method: string, path: string, headers: Record<string, string> = { "x-user": "u1" }) {
  return fetch(`${base}${path}`, { method, headers });
}

async function writes(n: number, path = "/api/bingos/b1/admin/teams/t1", headers?: Record<string, string>): Promise<number[]> {
  const statuses: number[] = [];
  for (let i = 0; i < n; i++) statuses.push((await send("PATCH", path, headers)).status);
  return statuses;
}

describe("the write limit", () => {
  it("refuses the 31st write in 10 seconds with a 429, the usual error shape and Retry-After", async () => {
    expect(await writes(30)).toEqual(Array(30).fill(200));
    t += 4_000;
    const refused = await send("PATCH", "/api/bingos/b1/admin/teams/t1");
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBe("6");
    expect(await refused.json()).toEqual({ error: WRITE_LIMIT_MESSAGE, code: "write_limited" });
    expect(hits).toEqual([{ userId: "u1", method: "PATCH", area: "/api/bingos/:slug/admin", perWindow: 30 }]);
  });

  it("doesn't count reads", async () => {
    for (let i = 0; i < 40; i++) expect((await send("GET", "/api/bingos/b1/board")).status).toBe(200);
    expect(await writes(30)).toEqual(Array(30).fill(200));
  });

  it("leaves another user alone", async () => {
    await writes(31);
    expect(await writes(1, undefined, { "x-user": "u2" })).toEqual([200]);
  });

  it("slides: a write is allowed again once the oldest leaves the window, and refused ones don't count", async () => {
    await writes(15);
    t += 5_000;
    await writes(15);
    expect(await writes(5)).toEqual(Array(5).fill(429));
    t += 5_001; // the first 15 have left the window
    expect(await writes(15)).toEqual(Array(15).fill(200));
    expect(await writes(1)).toEqual([429]);
  });

  it("exempts the test data generator, anonymous requests, logins and the Achievements' open signal", async () => {
    await writes(31);
    expect(await writes(1, "/api/bingos/testdata-abc/admin/teams/t1")).toEqual([200]);
    expect(await writes(1, undefined, { "x-user": "u1", "x-generator": "1" })).toEqual([200]);
    expect(await writes(1, "/auth/phone-link")).toEqual([200]);
    expect(await writes(1, "/api/bingos/b1/achievements/opened")).toEqual([200]);
    expect(await writes(40, undefined, {})).toEqual(Array(40).fill(200));
  });
});

describe("writeLimitPerWindow", () => {
  it("is 30 unless set, and off with WRITE_LIMIT_DISABLED", () => {
    expect(writeLimitPerWindow({})).toBe(30);
    expect(writeLimitPerWindow({ WRITE_LIMIT_PER_10S: "50" })).toBe(50);
    expect(writeLimitPerWindow({ WRITE_LIMIT_DISABLED: "true" })).toBeNull();
  });

  it("warns about a value that isn't a positive whole number, 0 included, and keeps the default", () => {
    for (const value of ["0", "-5", "2.5", "nope"]) {
      const warned: unknown[] = [];
      expect(writeLimitPerWindow({ WRITE_LIMIT_PER_10S: value }, (msg, fields) => warned.push([msg, fields]))).toBe(30);
      expect(warned).toEqual([[expect.stringContaining("WRITE_LIMIT_DISABLED=true"), { value }]]);
    }
  });
});

describe("apiArea", () => {
  it("names where a write went without the slug or ids", () => {
    expect(apiArea("/api/bingos/my-bingo/admin/teams/abc")).toBe("/api/bingos/:slug/admin");
    expect(apiArea("/api/bingos/my-bingo")).toBe("/api/bingos/:slug");
    expect(apiArea("/api/me/tutorial-seen")).toBe("/api/me");
  });
});
