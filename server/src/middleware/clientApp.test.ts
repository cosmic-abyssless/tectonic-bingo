import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { mountClientApp } from "./clientApp";

let outer: string;
let server: Server;
let base: string;

beforeAll(async () => {
  outer = fs.mkdtempSync(path.join(os.tmpdir(), "client-app-"));
  const dist = path.join(outer, "dist");
  fs.mkdirSync(path.join(dist, "assets"), { recursive: true });
  fs.writeFileSync(path.join(dist, "index.html"), "<html><head><title>app</title></head><body>shell</body></html>");
  fs.writeFileSync(path.join(dist, "assets", "app-abc123.js"), "console.log(1)");
  fs.writeFileSync(path.join(dist, "favicon.svg"), "<svg/>");

  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/thing", (_req, res) => res.json({ api: true }));
  expect(mountClientApp(app, dist, { sentryDsn: "https://k@x/1", environment: "staging", release: "abc1234" })).toBe(true);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  fs.rmSync(outer, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

const text = async (url: string) => (await fetch(`${base}${url}`)).text();

describe("mountClientApp", () => {
  it("injects the runtime config into the page itself, deep links, and /index.html", async () => {
    for (const url of ["/", "/index.html", "/b/some-bingo/mod"]) {
      const res = await fetch(`${base}${url}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(res.headers.get("cache-control")).toBe("no-cache");
      const body = await res.text();
      expect(body).toContain('window.__APP_CONFIG__={"sentryDsn":"https://k@x/1","environment":"staging","release":"abc1234"}');
      expect(body).toContain("shell");
    }
  });

  it("serves assets and other static files untouched", async () => {
    expect(await text("/assets/app-abc123.js")).toBe("console.log(1)");
    expect(await text("/favicon.svg")).toBe("<svg/>");
    expect((await fetch(`${base}/assets/app-abc123.js`)).headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("leaves routes registered earlier alone", async () => {
    expect(await (await fetch(`${base}/health`)).json()).toEqual({ ok: true });
    expect(await (await fetch(`${base}/api/thing`)).json()).toEqual({ api: true });
  });

  it("does not answer API-shaped paths that nothing handles with the app", async () => {
    const res = await fetch(`${base}/api/does-not-exist`);
    expect(res.status).toBe(404);
  });

  it("mounts nothing when there is no build", () => {
    const app = express();
    expect(mountClientApp(app, path.join(outer, "missing"), {})).toBe(false);
  });
});
