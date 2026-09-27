// Screenshot analysis matches against every item on the board, so outside the live stage it would tell anyone which
// tile holds an item. It follows the same stage rule as creating a submission, and refuses before any OCR runs (#214).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Router } from "express";

const ocr = vi.hoisted(() => ({ isOcrEnabled: () => true, analyzeSubmissionScreenshot: vi.fn() }));
vi.mock("../ocr", () => ocr);

const team = vi.hoisted(() => ({ id: "team-1", codeword: "pikachu" }));
vi.mock("../services/submissionTarget", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/submissionTarget")>()),
  resolveSubmissionTeam: vi.fn(() => team),
}));

const ORIGINAL_ENV = { ...process.env };

beforeAll(() => {
  process.env.DB_PATH = ":memory:";
  process.env.NODE_ENV = "test";
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

beforeEach(() => {
  ocr.analyzeSubmissionScreenshot.mockReset();
});

type Handler = (req: unknown, res: unknown, next: (err?: unknown) => void) => void;
type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: Handler }[] } };

// The route's own handler, past auth, bingo lookup and upload parsing; resolves with what it sent or passed on.
async function analyze(stage: string): Promise<{ body?: unknown; error?: { status?: number; message?: string } }> {
  const { default: bingosRouter } = await import("./bingos");
  const layer = ((bingosRouter as Router).stack as unknown as Layer[]).find(
    (l) => l.route?.path === "/:slug/submissions/analyze" && l.route.methods.post,
  );
  const handler = layer!.route!.stack.at(-1)!.handle;
  const file = { buffer: Buffer.from("screenshot"), mimetype: "image/png" };
  const req = { bingo: { id: "bingo-1", stage }, user: { id: "user-1" }, body: {}, file };
  return new Promise((resolve) => {
    handler(req, { json: (body: unknown) => resolve({ body }) }, (error) => resolve({ error: error as never }));
  });
}

describe("POST /:slug/submissions/analyze", () => {
  it.each(["planning", "signup", "captains", "draft", "reveal", "complete"])("refuses in %s without running OCR", async (stage) => {
    const { error } = await analyze(stage);

    expect(error).toMatchObject({ status: 400, message: "Submissions are only open while the bingo is live" });
    expect(ocr.analyzeSubmissionScreenshot).not.toHaveBeenCalled();
  });

  it("analyses the screenshot while live", async () => {
    const result = { extractedText: ["pikachu"], codewordFound: true, detectedMatch: null };
    ocr.analyzeSubmissionScreenshot.mockResolvedValue(result);

    const { body, error } = await analyze("live");

    expect(error).toBeUndefined();
    expect(body).toEqual(result);
    expect(ocr.analyzeSubmissionScreenshot).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ stage: "live" }), team, expect.objectContaining({ mimetype: "image/png" }));
  });
});
