import multer from "multer";
import path from "path";
import fs from "fs";
import { ServiceError } from "../services/errors";
import { generateVariants } from "../services/imageService";

// Mirrors MAX_UPLOAD_MB in @bingo/shared (the server can't import it at runtime).
// A 1080p screenshot is ~1.6 MB, so 5 MB leaves room for 1440p/4K captures.
export const MAX_UPLOAD_MB = 5;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export interface ImageUploadOptions {
  // When true, writes `-thumb` and `-full` WebP display variants beside the
  // original (issue #61). The original is always kept for OCR + full-size.
  variants?: boolean;
}

// Image-only multer instance. Files are saved under `dir` when given, otherwise
// kept in memory (for analysis-only uploads). When `options.variants` is set and
// a `dir` is given, display variants are generated after the file is saved.
export function imageUpload(dir?: string, options: ImageUploadOptions = {}) {
  if (dir) fs.mkdirSync(dir, { recursive: true });
  const { variants = false } = options;

  const storage = dir
    ? multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, dir),
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname).toLowerCase();
          cb(null, `${Date.now()}-${Math.random().toString(36).substring(2, 11)}${ext}`);
        },
      })
    : multer.memoryStorage();

  if (dir && variants) {
    // Wrap diskStorage so variants are generated after the original is saved,
    // keeping every upload site consistent without route-level plumbing. The
    // file always lands in `dir` (the only destination this instance uses).
    const handleFile = storage._handleFile.bind(storage);
    storage._handleFile = (req, file, cb) => {
      handleFile(req, file, (err, info) => {
        if (err) return cb(err);
        // Fire-and-forget: the response doesn't wait for variants (they're
        // display-only). Failures are logged and the original still serves.
        if (info?.filename) generateVariants(path.join(dir, info.filename));
        cb(null, info);
      });
    };
  }

  return multer({
    storage,
    limits: { fileSize: MAX_UPLOAD_BYTES },
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype.startsWith("image/")) {
        cb(new ServiceError(415, "Only image files are allowed (PNG, JPG, WebP)"));
        return;
      }
      cb(null, true);
    },
  });
}
