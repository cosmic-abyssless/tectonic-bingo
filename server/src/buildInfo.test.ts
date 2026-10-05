import { afterEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import type { AddressInfo } from "net";
import { buildHeaders, forceClientReload, helloMessage, readBuildId, setBuildId } from "./buildInfo";

const ORIGINAL_FORCE = process.env.FORCE_CLIENT_RELOAD;

afterEach(() => {
  setBuildId(null);
  if (ORIGINAL_FORCE === undefined) delete process.env.FORCE_CLIENT_RELOAD;
  else process.env.FORCE_CLIENT_RELOAD = ORIGINAL_FORCE;
});

/** The build headers on a request through a bare app. */
async function headersOf(): Promise<Headers> {
  const app = express();
  app.use("/api", buildHeaders);
  app.get("/api/ping", (_req, res) => {
    res.json({ ok: true });
  });
  const server = app.listen(0);
  try {
    return (await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ping`)).headers;
  } finally {
    server.close();
  }
}

describe("the build id", () => {
  it("is read from the built client, and is null without one (development)", () => {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), "client-dist-"));
    try {
      expect(readBuildId(dist)).toBeNull();
      fs.writeFileSync(path.join(dist, "build-id.txt"), "abc123\n");
      expect(readBuildId(dist)).toBe("abc123");
    } finally {
      fs.rmSync(dist, { recursive: true, force: true });
    }
  });

  it("is on every API response as X-Build-Id, with X-Force-Reload when forcing", async () => {
    setBuildId("abc123");
    let headers = await headersOf();
    expect(headers.get("x-build-id")).toBe("abc123");
    expect(headers.get("x-force-reload")).toBeNull();

    process.env.FORCE_CLIENT_RELOAD = "true";
    headers = await headersOf();
    expect(headers.get("x-force-reload")).toBe("1");
  });

  it("announces nothing without a build id", async () => {
    process.env.FORCE_CLIENT_RELOAD = "true";
    const headers = await headersOf();
    expect(headers.get("x-build-id")).toBeNull();
    expect(headers.get("x-force-reload")).toBeNull();
    expect(helloMessage()).toBeNull();
  });

  it("is the socket's hello", () => {
    setBuildId("abc123");
    expect(helloMessage()).toEqual({ type: "hello", buildId: "abc123", forceReload: false });
  });
});

describe("forceClientReload", () => {
  it("is on only with FORCE_CLIENT_RELOAD=true", () => {
    expect(forceClientReload({})).toBe(false);
    expect(forceClientReload({ FORCE_CLIENT_RELOAD: "1" })).toBe(false);
    expect(forceClientReload({ FORCE_CLIENT_RELOAD: "true" })).toBe(true);
  });
});
