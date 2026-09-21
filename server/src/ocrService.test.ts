// The HTTP boundary between the API and the OCR service: the real client talking to the real app over a real socket,
// with a fake engine behind it (the model itself is exercised by scripts/ocr-smoke.ts and the container smoke test).

import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOcrApp } from "./ocrApp";
import { createRemoteRecognizer } from "./ocrClient";
import { OcrImageError, OcrUnavailableError } from "./ocrErrors";
import { createLimiter, type OcrPriority } from "./ocrScheduler";
import { ServiceError } from "./services/errors";

let server: Server | undefined;
let ready = true;
const recognize = vi.fn<(image: Buffer, priority: OcrPriority, signal: AbortSignal) => Promise<string[]>>();

async function startService(maxBytes = 1024): Promise<string> {
  const app = createOcrApp({ recognize, isReady: () => ready, maxBytes });
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

async function stopService(): Promise<void> {
  const running = server;
  server = undefined;
  // fetch keeps connections alive, and close() would wait for them to go idle.
  running?.closeAllConnections();
  await new Promise<void>((resolve) => (running ? running.close(() => resolve()) : resolve()));
}

beforeEach(() => {
  ready = true;
  recognize.mockReset();
  vi.spyOn(process.stdout, "write").mockImplementation(() => true); // the app logs every reading and every failure
});

afterEach(async () => {
  vi.restoreAllMocks();
  await stopService();
});

describe("recognising over HTTP", () => {
  it("sends the image's exact bytes and returns the lines that were read", async () => {
    recognize.mockResolvedValue(["Codeword: pikachu", "You receive a drop"]);
    const url = await startService();
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 255, 1, 2, 3]);

    const lines = await createRemoteRecognizer({ url, timeoutMs: 2000 })(bytes, "interactive");

    expect(lines).toEqual(["Codeword: pikachu", "You receive a drop"]);
    expect(recognize.mock.calls[0]![0].equals(bytes)).toBe(true);
  });

  it("carries the priority across, so the service still serves people who are waiting first", async () => {
    recognize.mockResolvedValue([]);
    const url = await startService();
    const read = createRemoteRecognizer({ url, timeoutMs: 2000 });

    await read(Buffer.from("x"), "background");
    await read(Buffer.from("y"), "interactive");

    expect(recognize.mock.calls.map((call) => call[1])).toEqual(["background", "interactive"]);
  });

  it("treats a request with no priority header as interactive", async () => {
    recognize.mockResolvedValue([]);
    const url = await startService();
    await fetch(`${url}/recognize`, { method: "POST", body: Buffer.from("x") });
    expect(recognize.mock.calls[0]![1]).toBe("interactive");
  });

  it("refuses an empty body with a 400", async () => {
    const url = await startService();
    const response = await fetch(`${url}/recognize`, { method: "POST" });
    expect(response.status).toBe(400);
    expect(recognize).not.toHaveBeenCalled();
  });

  it("refuses an image over the size limit with a 413", async () => {
    const url = await startService(16);
    const response = await fetch(`${url}/recognize`, { method: "POST", body: Buffer.alloc(64) });
    expect(response.status).toBe(413);
    expect(recognize).not.toHaveBeenCalled();
  });

  it("reports a refused image to the API as that status, not as an outage", async () => {
    const url = await startService(16);
    const error = await createRemoteRecognizer({ url, timeoutMs: 2000 })(Buffer.alloc(64), "interactive").catch((e) => e);
    expect(error).toBeInstanceOf(ServiceError);
    expect(error).not.toBeInstanceOf(OcrUnavailableError);
    expect(error.status).toBe(413);
  });

  it("answers 422 for an image the engine can't read, and the client reports that image, not an outage", async () => {
    recognize.mockRejectedValue(new OcrImageError(new Error("truncated png")));
    const url = await startService();

    const error = await createRemoteRecognizer({ url, timeoutMs: 2000 })(Buffer.from("x"), "interactive").catch((e) => e);

    expect(error).toBeInstanceOf(OcrImageError);
    expect(error).not.toBeInstanceOf(OcrUnavailableError);
    expect(error.status).toBe(422);
  });

  it("answers 500 when the engine fails, and the client reports the service as unavailable", async () => {
    recognize.mockRejectedValue(new Error("onnx exploded"));
    const url = await startService();

    const error = await createRemoteRecognizer({ url, timeoutMs: 2000 })(Buffer.from("x"), "interactive").catch((e) => e);

    expect(error).toBeInstanceOf(OcrUnavailableError);
    expect(error.status).toBe(503);
  });
});

describe("a caller that gives up", () => {
  it("has its reading dropped if it was still waiting, so abandoned work can't pile up", async () => {
    const limiter = createLimiter(1);
    const started: string[] = [];
    let releaseFirst!: () => void;
    const firstDone = new Promise<void>((resolve) => (releaseFirst = resolve));
    recognize.mockImplementation((image, priority, signal) =>
      limiter.run(
        async () => {
          started.push(image.toString());
          if (image.toString() === "first") await firstDone;
          return [image.toString()];
        },
        priority,
        signal,
      ),
    );
    const url = await startService();

    const first = createRemoteRecognizer({ url, timeoutMs: 5000 })(Buffer.from("first"), "interactive");
    await vi.waitFor(() => expect(started).toEqual(["first"]));
    // Queued behind the first, and gives up after 100 ms: what the API does at its timeout.
    const second = await createRemoteRecognizer({ url, timeoutMs: 100 })(Buffer.from("second"), "interactive").catch((e) => e);
    expect(second).toBeInstanceOf(OcrUnavailableError);
    // The service notices the hang-up and takes the request out of the queue.
    await vi.waitFor(() => expect(limiter.stats().queued).toBe(0));

    releaseFirst();
    await first;
    expect(await createRemoteRecognizer({ url, timeoutMs: 5000 })(Buffer.from("third"), "interactive")).toEqual(["third"]);
    expect(started).toEqual(["first", "third"]);
  });
});

describe("/health", () => {
  it("is 503 while the model is loading and 200 once it is ready", async () => {
    const url = await startService();
    ready = false;
    expect((await fetch(`${url}/health`)).status).toBe(503);
    ready = true;
    const response = await fetch(`${url}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe("when the OCR service is not doing its job", () => {
  it("fails fast with 503 when nothing is listening", async () => {
    const url = await startService();
    await stopService();

    const error = await createRemoteRecognizer({ url, timeoutMs: 2000 })(Buffer.from("x"), "interactive").catch((e) => e);

    expect(error).toBeInstanceOf(OcrUnavailableError);
    expect(error.status).toBe(503);
  });

  it("gives up after the timeout instead of holding the request open", async () => {
    recognize.mockReturnValue(new Promise(() => undefined));
    const url = await startService();
    const started = Date.now();

    const error = await createRemoteRecognizer({ url, timeoutMs: 100 })(Buffer.from("x"), "interactive").catch((e) => e);

    expect(error).toBeInstanceOf(OcrUnavailableError);
    expect(error.message).toContain("no answer within 100 ms");
    expect(Date.now() - started).toBeLessThan(5000); // generous: the point is "not the OCR service's own 20 s", not a benchmark
  });

  it("rejects an answer that isn't the agreed shape", async () => {
    for (const body of ['{"lines": "not an array"}', '{"lines": [1, 2]}', "<html>a proxy error page</html>", "null"]) {
      const fetchImpl = (async () => new Response(body, { status: 200 })) as typeof fetch;
      const error = await createRemoteRecognizer({ url: "http://ocr", timeoutMs: 100, fetchImpl })(Buffer.from("x"), "interactive").catch((e) => e);
      expect(error).toBeInstanceOf(OcrUnavailableError);
    }
  });

  it("reports a 5xx from a proxy or crashed service as unavailable", async () => {
    const fetchImpl = (async () => new Response("bad gateway", { status: 502 })) as typeof fetch;
    const error = await createRemoteRecognizer({ url: "http://ocr", timeoutMs: 100, fetchImpl })(Buffer.from("x"), "interactive").catch((e) => e);
    expect(error).toBeInstanceOf(OcrUnavailableError);
  });
});
