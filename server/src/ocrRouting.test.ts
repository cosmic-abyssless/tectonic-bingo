// Where a screenshot gets read is decided by OCR_URL: the separate service when it is set, this process when it isn't.
// A service that is set but down must not quietly move the work into the API process.

import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "./db/schema";
import { createOcrApp } from "./ocrApp";
import { createTestDb } from "./testUtils/testDb";

const engine = vi.hoisted(() => ({ recognizeLocally: vi.fn(), warmOcrEngine: vi.fn() }));
vi.mock("./ocrEngine", () => engine);

import { analyzeSubmissionScreenshot, warmOcr } from "./ocr";

type Bingo = typeof schema.bingos.$inferSelect;
type Team = typeof schema.teams.$inferSelect;

const bingo = { id: "bingo-1" } as Bingo;
const team = { id: "team-1", codeword: "pikachu" } as Team;
let server: Server | undefined;
const remoteReads = vi.fn();

function serve(port = 0): Promise<string> {
  const app = createOcrApp({ recognize: async (image, priority) => (remoteReads(image, priority), ["remote pikachu"]), isReady: () => true, maxBytes: 1024 });
  return new Promise((resolve) => {
    server = app.listen(port, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server!.address() as AddressInfo).port}`));
  });
}

async function stopService(): Promise<void> {
  const running = server;
  server = undefined;
  // fetch keeps connections alive, and close() would wait for them to go idle.
  running?.closeAllConnections();
  await new Promise<void>((resolve) => (running ? running.close(() => resolve()) : resolve()));
}

beforeEach(() => {
  vi.stubEnv("OCR_URL", "");
  engine.recognizeLocally.mockReset().mockResolvedValue(["local pikachu"]);
  engine.warmOcrEngine.mockReset().mockResolvedValue(undefined);
  remoteReads.mockReset();
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await stopService();
});

// A distinct image per test: readings are cached by the image's bytes.
const shot = (name: string) => ({ buffer: Buffer.from(`screenshot ${name}`), mimetype: "image/png" });

describe("analysing a screenshot", () => {
  it("reads it in-process when OCR_URL is unset (local development, tests)", async () => {
    const { db } = createTestDb();
    const result = await analyzeSubmissionScreenshot(db, bingo, team, shot("in-process"));

    expect(engine.recognizeLocally).toHaveBeenCalledTimes(1);
    expect(result.extractedText).toEqual(["local pikachu"]);
    expect(result.codewordFound).toBe(true);
  });

  it("sends it to the OCR service when OCR_URL is set, and never loads the engine", async () => {
    vi.stubEnv("OCR_URL", await serve());
    const { db } = createTestDb();

    const result = await analyzeSubmissionScreenshot(db, bingo, team, shot("remote"), { priority: "background" });

    expect(result.extractedText).toEqual(["remote pikachu"]);
    expect(result.codewordFound).toBe(true);
    expect(remoteReads).toHaveBeenCalledWith(expect.any(Buffer), "background");
    expect(engine.recognizeLocally).not.toHaveBeenCalled();
  });

  it("reads a screenshot once even though the modal and the submission both analyse it", async () => {
    vi.stubEnv("OCR_URL", await serve());
    const { db } = createTestDb();
    const file = shot("cached");

    await analyzeSubmissionScreenshot(db, bingo, team, file);
    await analyzeSubmissionScreenshot(db, bingo, team, file, { priority: "background" });

    expect(remoteReads).toHaveBeenCalledTimes(1);
  });

  it("fails with a 503 when the service is set but down, without reading in-process", async () => {
    const url = await serve();
    await stopService();
    vi.stubEnv("OCR_URL", url);
    const { db } = createTestDb();

    const error = await analyzeSubmissionScreenshot(db, bingo, team, shot("down")).catch((e) => e);

    expect(error.status).toBe(503);
    expect(engine.recognizeLocally).not.toHaveBeenCalled();
  });

  it("logs an outage as a warning, not an error, so it isn't reported to Sentry on top of the route's own response", async () => {
    const url = await serve();
    await stopService();
    vi.stubEnv("OCR_URL", url);
    const { db } = createTestDb();
    const written = () => (process.stdout.write as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((call) => String(call[0]));

    await analyzeSubmissionScreenshot(db, bingo, team, shot("quiet outage")).catch(() => undefined);

    const levels = written().map((line) => (JSON.parse(line) as { level: string }).level);
    expect(levels).toContain("warn");
    expect(levels).not.toContain("error");
  });

  it("recovers by itself once the service is back", async () => {
    const url = await serve();
    await stopService();
    vi.stubEnv("OCR_URL", url);
    const { db } = createTestDb();
    const file = shot("recovers");

    await expect(analyzeSubmissionScreenshot(db, bingo, team, file)).rejects.toMatchObject({ status: 503 });

    await serve(Number(new URL(url).port));
    const result = await analyzeSubmissionScreenshot(db, bingo, team, file);
    expect(result.codewordFound).toBe(true);
  });
});

describe("warmOcr", () => {
  it("loads the engine in-process when there is no OCR service", async () => {
    await warmOcr();
    expect(engine.warmOcrEngine).toHaveBeenCalledTimes(1);
  });

  it("leaves the model to the OCR service when there is one", async () => {
    vi.stubEnv("OCR_URL", "http://ocr:8080");
    await warmOcr();
    expect(engine.warmOcrEngine).not.toHaveBeenCalled();
  });
});
