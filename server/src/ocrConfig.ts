// Environment-driven OCR settings, kept free of the OCR engine's imports so they can be tested (and read at startup)
// without loading the model runtime.

import fs from "node:fs";
import os from "node:os";

const DEFAULT_OCR_CONCURRENCY = 5;

/** How many screenshots may be read at once (OCR_CONCURRENCY); anything else falls back to the default. */
export function ocrConcurrency(value: string | undefined = process.env.OCR_CONCURRENCY): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_OCR_CONCURRENCY;
}

/**
 * Whether to load the OCR model in the background when the server starts: in production by default, and anywhere
 * with OCR_WARMUP set to "true" or "false". Never when OCR is switched off.
 */
export function shouldWarmOcr(env: Record<string, string | undefined> = process.env): boolean {
  if (env.SCREENSHOT_OCR_DISABLED === "true") return false;
  if (env.OCR_WARMUP === "true") return true;
  if (env.OCR_WARMUP === "false") return false;
  return env.NODE_ENV === "production";
}

/**
 * Where the separate OCR service lives (OCR_URL, e.g. http://ocr:8080), without a trailing slash. Unset means "read
 * screenshots inside this process", which is what local development and the tests do.
 */
export function ocrServiceUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  const url = env.OCR_URL?.trim().replace(/\/+$/, "");
  return url ? url : undefined;
}

const DEFAULT_OCR_TIMEOUT_MS = 20_000;

/** How long to wait for the OCR service to answer (OCR_TIMEOUT_MS) before treating the analysis as failed. */
export function ocrRequestTimeoutMs(env: Record<string, string | undefined> = process.env): number {
  const parsed = Number.parseInt(env.OCR_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_OCR_TIMEOUT_MS;
}

/** The largest image the OCR service accepts. Uploads are capped at 5 MB (MAX_UPLOAD_BYTES); this leaves headroom. */
export const OCR_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * The CPUs a container is allowed to use, from its cgroup's quota text (cgroup v2's `cpu.max`: "200000 100000" or
 * "max 100000", or the same two numbers from cgroup v1), or undefined when it is unlimited or unreadable. Fractions round down but never below one.
 */
export function parseCgroupCpuLimit(cpuMax: string | undefined): number | undefined {
  const [quota, period] = (cpuMax ?? "").trim().split(/\s+/);
  const q = Number(quota);
  const p = Number(period);
  if (!Number.isFinite(q) || !Number.isFinite(p) || q <= 0 || p <= 0) return undefined;
  return Math.max(1, Math.floor(q / p));
}

// cgroup v2 keeps "quota period" in one file; v1 (older hosts, Docker Desktop) keeps them in two, with -1 for no limit.
function readCgroupCpuMax(): string | undefined {
  const read = (file: string) => {
    try {
      return fs.readFileSync(file, "utf8").trim();
    } catch {
      return undefined;
    }
  };
  const v2 = read("/sys/fs/cgroup/cpu.max");
  if (v2) return v2;
  const quota = read("/sys/fs/cgroup/cpu/cpu.cfs_quota_us");
  const period = read("/sys/fs/cgroup/cpu/cpu.cfs_period_us");
  return quota && period ? `${quota} ${period}` : undefined;
}

/**
 * How many threads one recognition may use (OCR_THREADS), otherwise as many CPUs as this process may actually use.
 * Node and onnxruntime count the host's CPUs, not the container's quota, and a 2-CPU container that starts 16 threads
 * spends its time being throttled: the same screenshot took 12 s that way and 2 s with 2 threads.
 */
export function ocrThreads(
  env: Record<string, string | undefined> = process.env,
  detected: { cpuMax?: string; available?: number } = { cpuMax: readCgroupCpuMax(), available: os.availableParallelism() },
): number {
  const parsed = Number.parseInt(env.OCR_THREADS ?? "", 10);
  if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  const available = Math.max(1, detected.available ?? 1);
  return Math.min(available, parseCgroupCpuLimit(detected.cpuMax) ?? available);
}
