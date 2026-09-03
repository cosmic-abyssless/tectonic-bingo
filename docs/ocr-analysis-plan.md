# Local OCR screenshot analysis — implementation plan

Written 2026-09-02 to be executed phase-by-phase by another model, standalone, on the
`ocr-screenshot-analysis` branch. Goal: replace the Anthropic API call in
`server/src/ai.ts` with a fully local OCR engine. The API is expensive; the analysis only
ever needed text extraction (codeword presence + text-to-item matching — both matched
locally already), so a local OCR engine plus a slightly smarter matcher replaces it
entirely. **Full replacement — no Claude fallback.** The `@anthropic-ai/sdk` dependency
is removed.

Work each phase in order. Each has its own DoD; get it green before moving on. Commit per
phase.

## 0. Decision record + benchmark data (context, don't re-litigate)

Engine choice was settled by benchmarking real OSRS screenshots (a collection log — 19
known strings, colored bitmap font on dark background — and the chat interface, where a
team codeword would appear). Warm per-image latency on this dev machine (Windows, CPU):

| Engine | Collection log recall | Chat text | Latency | Notes |
|---|---|---|---|---|
| **PaddleOCR small — `ppu-paddle-ocr`** | **15/19 exact, 16 normalized** | **2/2** | ~170–700ms | winner |
| PaddleOCR tiny | 14/19 exact, 17 normalized | 0/2 exact | ~100–150ms | `0`/`O` slips break exact match |
| PaddleOCR medium | 14/19 — no better | 2/2 | ~700–1300ms | slower AND worse; do not "upgrade" to it |
| tesseract.js | 2/19 (garbage: "Hallazd Szgulchez") | 0/2 | ~160–880ms | unusable on OSRS's bitmap font; do not revisit |

- **Use `ppu-paddle-ocr` with `V6_SMALL_MODEL`** (MIT license; PaddleOCR PP-OCRv6 ONNX
  models on `onnxruntime-node`; pure Node, no Python sidecar). Models (~30 MB)
  auto-download on first `initialize()` and cache to `~/.cache/ppu-paddle-ocr`.
- Every remaining miss is a 1–2 character bitmap-font slip (`Fishing Trauler`,
  `0ldSchoolRuneScepe`, dropped spaces like `MasteringMixology`). Phase O2's fuzzy
  matcher recovers these — that's why the matcher upgrade is part of this plan, not
  optional polish.
- **Do NOT preprocess/upscale images before OCR.** 3× nearest-neighbor upscaling was
  benchmarked and made PaddleOCR *worse* on every image (it also made tesseract barely
  better, which still left it useless). Feed the uploaded buffer as-is.

## 1. Ground rules and landmines

- **The public result shape is frozen.** `AnalyzeResult` (`codewordFound`, `codeword`,
  `extractedText`, `detectedMatch`, `detectedWildcard`, `warnings`) is consumed by
  `client/src/core/submissions/SubmissionModal.tsx` and typed in `@bingo/shared`. Keep it
  byte-for-byte compatible; the client must need **zero changes**.
- **Buffer → ArrayBuffer footgun.** `ppu-paddle-ocr`'s `recognize()` takes an
  `ArrayBuffer`. `someBuffer.buffer` is WRONG — Node `Buffer`s are views into a shared
  pool, so that hands the library unrelated memory. Use
  `buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)`. (This bit during
  benchmarking; it half-works by luck, then corrupts.)
- **`recognize()` caches results by input by default.** Harmless in production (each
  upload differs) but pass `{ noCache: true }` anyway so repeated identical uploads (and
  tests) behave predictably.
- **First-ever run downloads ~30 MB of models.** That must never happen inside a request
  on CI or E2E. Hence the `SCREENSHOT_OCR_DISABLED` kill switch (Phase O1) which the E2E
  config sets — preserving the exact "analysis unavailable" behavior the E2E suite
  already exercises (Phase E5 of `docs/e2e-testing-plan.md` relied on the analyze
  endpoint failing gracefully; the client's `analysisFailed` path must keep rendering).
- **Init is lazy and slow-ish (~1.6s warm, more on first download).** Initialize the
  service once (module-level singleton promise), not per request. Never at server boot —
  a dev server restart loop (tsx watch) shouldn't pay 1.6s or hit the network.
- Verified working API (from the benchmark script — copy these exact names):
  ```ts
  import { PaddleOcrService, V6_SMALL_MODEL } from "ppu-paddle-ocr";
  const service = new PaddleOcrService({ model: V6_SMALL_MODEL });
  await service.initialize();
  const result = await service.recognize(arrayBuffer, { noCache: true });
  // result.text: string — full extracted text, lines joined with "\n"
  ```
- `npx` has a doubled-`node_modules` path bug in some shells on this machine — invoke
  binaries directly (`node ../node_modules/vitest/vitest.mjs run`, etc.). See
  `docs/e2e-testing-plan.md` §0 for the full list of repo-wide gotchas (never touch
  `server/data/bingo.db`, etc.).

## 2. Phase O1 — Engine swap — DONE (2026-09-02)

Shipped as planned: `server/src/ai.ts` → `server/src/ocr.ts` (git mv), `getAIClient`/
`Anthropic`/`AI_HINT`/the message-building block all gone, replaced with a lazy
module-level singleton (`getOcrService()`) that initializes `PaddleOcrService({ model:
V6_SMALL_MODEL })` once on first use. `analyzeSubmissionScreenshot(db, bingo, team, file)`
drops the `client` param; OCR runs on an ArrayBuffer slice of the upload, `result.text`
splits on newlines into `extractedText`. Codeword/item/wildcard matching stayed plain
`.includes()` in this phase exactly as scoped — Phase O2 is what makes it fuzzy.
`bingos.ts`'s analyze route swaps the `getAIClient()`/503 check for `isOcrEnabled()`/503;
an OCR failure just throws and rides the existing `asyncHandler` → `errorHandler` → 500
path already used everywhere else in this router (no new try/catch needed — confirmed by
reading `errorHandler.ts` before assuming). `ANTHROPIC_API_KEY` removed from
`.env.example` and `playwright.config.ts`, replaced by `SCREENSHOT_OCR_DISABLED` in both;
a stale "same nullable pattern as getAIClient" comment in `tectonicService.ts` (pointing
at a function that no longer exists) was also fixed while grepping for other references.

**Real gotchas hit:**
- `npm audit` reported 15 vulnerabilities after installing — all pre-existing in
  `multer`/`drizzle-orm`/`body-parser`/`nanoid`/`path-to-regexp`, confirmed via
  `npm audit --omit=dev` and a targeted grep that none trace to `onnxruntime-node` or
  `ppu-paddle-ocr` themselves. Out of scope; not touched.
- The E2E suite never explicitly asserts on the "analysis unavailable" UI text, but it
  *does* upload a real screenshot on every submission (triggering the real analyze POST),
  so both full E2E runs organically proved the `SCREENSHOT_OCR_DISABLED` 503 path doesn't
  block submission — exactly what the DoD needed, without a dedicated assertion.
- Manual smoke test could not safely use `npm run dev` against the real `server/data/
  bingo.db` as written — the user's actual dev DB already has 4 real bingos in it, and a
  port check found a real dev server already running on 3001. Instead: `drizzle-kit
  migrate` + `seed-dev.ts` against an isolated `DB_PATH` in the scratchpad, server started
  on port 3199, hit via raw `fetch` (dev-login → multipart POST to `/submissions/
  analyze`). Confirmed both a real downloaded OSRS chat screenshot (real extracted text,
  `codewordFound: false` correctly) and a synthetic "Ahrim's hood" image (correct
  `detectedMatch` against the seeded Barrows tile) work end-to-end. The real dev DB was
  never opened.

**DoD O1 — met:** both `tsc --noEmit` clean, 126 unit tests green, E2E suite green twice,
`@anthropic-ai/sdk` gone from `server/package.json` and the lockfile, manual smoke test
against an isolated DB showed real extraction + a real DB item match.

## 3. Phase O2 — Fuzzy matching — DONE (2026-09-02)

Shipped as planned. New `server/src/services/textMatchService.ts` (pure, DB-free):
`normalizeForMatch`, a bounded `levenshteinWithin` (rolling two-row DP, early exit once a
row's minimum exceeds `max`), and `fuzzyIncludes(lines, needle, { maxEdits? })` — exact
normalized-substring first, short needles (<6 normalized chars) skip edit tolerance
entirely, otherwise a sliding window of widths `needleLen-1..needleLen+1` checked against
`levenshteinWithin` with the length-scaled default (`>=12` chars → 2 edits, else 1).
`ocr.ts` now calls `fuzzyIncludes` for the codeword (pinned to `maxEdits: 1` regardless of
length) and `findBestMatch(extractedText, items, wildcards)` for item/wildcard selection —
that function also moved out of `ocr.ts` per the plan's point 4, so `ocr.ts` is I/O only
now (OCR the image, load the board, hand both to the pure matcher) and the whole matching
decision is unit-testable without OCR or a DB.

**Real gotchas hit:** none on the implementation side — every fixture from the plan's
spec (`"Fishing Trauler"`, `"0ldSchoolRuneScepe"`, `"MasteringMixology"`, `"Rogues'Den"`,
`"Halloved Sepulchre"`, the `"Zamorak hilt"`/`"Zamorakian spear"` negative, the codeword
1-edit-passes/2-edit-fails pair) passed on the first `vitest` run — the plan's own
by-hand edit-distance math (worked out before writing any code) held up exactly.

**DoD O2 — met:** 20 new unit tests green (146 total alongside the existing 126), both
typechecks clean, E2E suite green twice. Manual smoke test: a synthetic screenshot reading
"Ahrim's hoad" (deliberate 1-char OCR-style typo of the real item "Ahrim's hood") resolved
to the correct `detectedMatch` against the seeded Barrows tile — the fuzzy layer confirmed
live end-to-end, not just unit-tested.

## 4. Phase O3 — Verification script + docs — DONE (2026-09-02)

Shipped as planned. `server/scripts/ocr-smoke.ts`: `tsx scripts/ocr-smoke.ts <image>
[bingo-slug]` — prints init/recognize timing and every extracted line; with a slug, also
loads that bingo's real items/wildcards from whatever `DB_PATH` points at and prints what
`findBestMatch` would decide. Lives outside `tsconfig.json`'s `rootDir: "./src"`, so `tsc
--noEmit`/`build` never touch it — confirmed by running the typecheck after adding the
file rather than assuming the exclusion.

**Deployment note:** the model cache lives in `~/.cache/ppu-paddle-ocr`; a fresh deploy
downloads ~30 MB once on the first real (non-`SCREENSHOT_OCR_DISABLED`) analyze call. If
the eventual host can't reach the internet at runtime, pre-warm the cache in the build
step by running `ocr-smoke.ts` once (or calling `PaddleOcrService.downloadModels()`
directly) — not solved here, just flagged for whoever sets up that deploy.

**Real gotchas hit:**
- Running the script against the real dev DB would have hit the same "don't touch the
  user's actual `bingo.db`" concern as Phase O1's manual smoke test — verified it instead
  against the same isolated scratchpad DB built for that phase (`DB_PATH` pointed there),
  both with and without a slug argument, plus a deliberately-missing slug to confirm the
  "no bingo with slug" error path doesn't crash.

**DoD O3 — met:** smoke script run end-to-end against a real image, twice (with and
without a bingo slug) — both produced correct output. Plan doc updated (this section).
Final full pass: both typechecks clean, 146 unit tests green, E2E suite green twice.

## 5. Post-ship fix — real screenshots were missing obvious text — DONE (2026-09-03)

Found via user report against a real RuneLite client screenshot (1500x996, full chatbox
visible): several entire chat lines were missing from `extractedText` even though they
were clearly legible in the image, and a few numeric UI badges (inventory quantities, the
XP-progress percentage) decoded as garbage/CJK characters.

**Root cause:** `ppu-paddle-ocr`'s `detection.maxSideLength` defaults to `"auto"`, which
computes `clamp(0.75 * longestSide, 960, 1920)` and downscales the detector's input to
that cap. For a 1500px-wide screenshot that's a downscale to 1125px — a 25% shrink — which
is enough to make several lines of OSRS's small, densely-packed chatbox font undetectable.
This never showed up during Phase O1's benchmarking (§0) or during Phase O1/O2/O3 manual
smoke tests, because every test image used so far (the benchmark set, the synthetic
"Ahrim's hoad" fixture, `e2e/fixtures/screenshot.png`) was already small/cropped enough to
stay under the auto cap. A real full-client screenshot is not — it's the primary real-world
input this feature exists for, so this was a live accuracy bug, not an edge case.

**Fix:** `ocr.ts`'s `getOcrService()` now passes `detection: { maxSideLength: 4000 }` and
`recognition: { maxCropSourceSideLength: 4000 }` explicitly, overriding the library's
auto-scaling for both the detector and the recognition crop source. Confirmed via a direct
A/B (same image, `"auto"` vs. `4000`) that this recovers every previously-missing chat
line with no regressions on the existing benchmark set; latency cost was small (~1.0s to
~1.2s warm on the 1500px test image).

`getOcrService()` was also exported from `ocr.ts` and `ocr-smoke.ts` now calls it instead
of constructing its own `PaddleOcrService` with default options — the smoke script had
silently drifted from production config, which is exactly how this bug went undetected
until a real user hit it. They can no longer drift apart.

The CJK-character garbage on small numeric UI badges (inventory counts, XP%) was not
fixed — it's a pre-existing PP-OCRv6 multilingual-dictionary quirk on noisy/tiny glyphs,
unrelated to the downscale bug, and harmless: `normalizeForMatch` strips non-`[a-z0-9]`
characters, so CJK garbage can never fuzzy-match a real item/codeword string. Not worth
chasing unless it starts producing false matches in practice.

**DoD — met:** re-verified against the real reported screenshot (all 9 chat lines now
extract correctly), both typechecks clean, 146 unit tests green (unchanged — this is a
config-only change, no matching logic touched), E2E suite green twice.

## 6. Verification discipline

Same as `docs/e2e-testing-plan.md` §9: per phase run both `tsc --noEmit`s, the server
unit suite, and the E2E suite twice; no arbitrary waits; read the component/service
source before inventing an interface. The E2E suite must pass **unmodified** — if it
doesn't, the change broke a behavior contract (most likely the analyze endpoint's failure
shape), not the tests.
