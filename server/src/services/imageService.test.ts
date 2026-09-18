import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import { generateVariants, thumbUrl, fullUrl, THUMB_MAX_WIDTH, FULL_MAX_WIDTH, THUMB_SUFFIX, FULL_SUFFIX, VARIANT_EXT } from "./imageService";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "img-svc-"));
}

describe("generateVariants", () => {
  it("writes thumb + full JPEG variants and leaves the original untouched", async () => {
    const dir = tmpDir();
    const original = path.join(dir, "shot.png");
    // 3000x2000 original — larger than both caps, so both variants downscale.
    await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#ff0000" } }).png().toFile(original);
    const before = fs.statSync(original).size;

    const result = await generateVariants(original);
    expect(result).not.toBeNull();

    const base = original.slice(0, original.length - ".png".length);
    const thumbPath = `${base}${THUMB_SUFFIX}${VARIANT_EXT}`;
    const fullPath = `${base}${FULL_SUFFIX}${VARIANT_EXT}`;
    expect(result!.thumbPath).toBe(thumbPath);
    expect(result!.fullPath).toBe(fullPath);

    const thumb = await sharp(thumbPath).metadata();
    expect(thumb.width).toBe(THUMB_MAX_WIDTH);
    const full = await sharp(fullPath).metadata();
    expect(full.width).toBe(FULL_MAX_WIDTH);

    // Original bytes unchanged (variant generation must not touch it).
    expect(fs.statSync(original).size).toBe(before);
  });

  it("does not enlarge images smaller than the caps", async () => {
    const dir = tmpDir();
    const original = path.join(dir, "small.png");
    await sharp({ create: { width: 100, height: 50, channels: 3, background: "#0000ff" } }).png().toFile(original);

    const result = await generateVariants(original);
    expect(result).not.toBeNull();

    const thumb = await sharp(result!.thumbPath).metadata();
    expect(thumb.width).toBe(100);
    const full = await sharp(result!.fullPath).metadata();
    expect(full.width).toBe(100);
  });
});

describe("variantUrl helpers", () => {
  it("derives variant URLs from a /uploads path", () => {
    expect(thumbUrl("/uploads/abc123.png")).toBe(`/uploads/abc123${THUMB_SUFFIX}${VARIANT_EXT}`);
    expect(fullUrl("/uploads/tiles/abc123.webp")).toBe(`/uploads/tiles/abc123${FULL_SUFFIX}${VARIANT_EXT}`);
  });
});
