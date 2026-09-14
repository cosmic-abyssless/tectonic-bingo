import multer from "multer";
import path from "path";
import fs from "fs";
import { ServiceError } from "../services/errors";

// Mirrors MAX_UPLOAD_MB in @bingo/shared (the server can't import it at runtime).
// A 1080p screenshot is ~1.6 MB, so 5 MB leaves room for 1440p/4K captures.
export const MAX_UPLOAD_MB = 5;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

// Image-only multer instance. Files are saved under `dir` when given, otherwise
// kept in memory (for analysis-only uploads).
export function imageUpload(dir?: string) {
  if (dir) fs.mkdirSync(dir, { recursive: true });
  return multer({
    storage: dir
      ? multer.diskStorage({
          destination: (_req, _file, cb) => cb(null, dir),
          filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, `${Date.now()}-${Math.random().toString(36).substring(2, 11)}${ext}`);
          },
        })
      : multer.memoryStorage(),
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
