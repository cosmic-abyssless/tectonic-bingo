import { describe, expect, it, vi } from "vitest";
import { createTextReader } from "./ocrText";

const image = (text: string) => Buffer.from(text);

describe("createTextReader", () => {
  it("reads an image once and serves the same bytes from the cache afterwards", async () => {
    const recognize = vi.fn(async () => ["line one", "line two"]);
    const read = createTextReader(recognize);

    expect(await read(image("a"), "interactive")).toEqual(["line one", "line two"]);
    // The submission modal's analysis and the submission's own analysis send identical bytes.
    expect(await read(image("a"), "background")).toEqual(["line one", "line two"]);
    expect(recognize).toHaveBeenCalledTimes(1);
  });

  it("reads different images separately", async () => {
    const recognize = vi.fn(async (buf: Buffer) => [buf.toString()]);
    const read = createTextReader(recognize);

    expect(await read(image("a"), "interactive")).toEqual(["a"]);
    expect(await read(image("b"), "interactive")).toEqual(["b"]);
    expect(recognize).toHaveBeenCalledTimes(2);
  });

  it("shares one reading between simultaneous requests for the same image", async () => {
    let finish!: (lines: string[]) => void;
    const recognize = vi.fn(() => new Promise<string[]>((resolve) => (finish = resolve)));
    const read = createTextReader(recognize);

    const first = read(image("a"), "interactive");
    const second = read(image("a"), "background");
    await vi.waitFor(() => expect(recognize).toHaveBeenCalled());
    finish(["shared"]);

    expect(await first).toEqual(["shared"]);
    expect(await second).toEqual(["shared"]);
    expect(recognize).toHaveBeenCalledTimes(1);
  });

  it("does not remember a failure, so the next request tries again", async () => {
    const recognize = vi.fn().mockRejectedValueOnce(new Error("ocr down")).mockResolvedValueOnce(["back up"]);
    const read = createTextReader(recognize);

    await expect(read(image("a"), "interactive")).rejects.toThrow("ocr down");
    expect(await read(image("a"), "interactive")).toEqual(["back up"]);
    expect(recognize).toHaveBeenCalledTimes(2);
  });
});
