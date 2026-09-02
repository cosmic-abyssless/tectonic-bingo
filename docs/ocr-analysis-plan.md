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

## 2. Phase O1 — Engine swap

Replace the Anthropic call with local OCR, same result shape, no matcher changes yet.

1. Dependencies, from the repo root:
   `npm install ppu-paddle-ocr onnxruntime-node --workspace=server` and
   `npm uninstall @anthropic-ai/sdk --workspace=server`.
2. Rename `server/src/ai.ts` → `server/src/ocr.ts` (git mv so history follows). Inside:
   - Delete `getAIClient`, the `Anthropic` import, the `AI_HINT` prompt, and the
     message-building/JSON-parsing block.
   - Add a lazy singleton:
     ```ts
     let _service: Promise<PaddleOcrService> | null = null;
     function getOcrService(): Promise<PaddleOcrService> { ... } // init once, memoize the promise
     export function isOcrEnabled(): boolean {
       return process.env.SCREENSHOT_OCR_DISABLED !== "true";
     }
     ```
   - `analyzeSubmissionScreenshot(db, bingo, team, file)` (the `client` param is gone):
     run OCR on the file buffer (ArrayBuffer slice — see §1), split `result.text` on
     newlines into `extractedText: string[]` (trim lines, drop empties), then:
     - `codewordFound` = any line contains `team.codeword` case-insensitively (plain
       `includes` for now; Phase O2 makes it fuzzy).
     - Item/wildcard matching: keep the existing loops verbatim (lowercase substring
       against each extracted line). They already operate on `extractedText` — only the
       source of that array changes.
     - Keep the codeword warning string identical.
3. `server/src/routes/bingos.ts` (~line 233): replace the `getAIClient()` /
   `503 "AI analysis is not configured on this server"` block with
   `if (!isOcrEnabled()) throw new ServiceError(503, "Screenshot analysis is disabled on this server")`,
   and call the new signature. Also wrap the OCR call so an engine failure (corrupt
   image, 1×1 test PNG, model load failure) surfaces as a 500 — the client already
   treats any non-2xx as `analysisFailed` and tells the player to pick manually. Do not
   let it take the process down.
4. Config plumbing:
   - `.env.example`: delete the `ANTHROPIC_API_KEY` line; add `SCREENSHOT_OCR_DISABLED`
     (commented, described as a test/CI switch — OCR is on by default, no key needed).
   - `playwright.config.ts` server env: replace `ANTHROPIC_API_KEY: ""` with
     `SCREENSHOT_OCR_DISABLED: "true"`.
   - Check nothing else references `ANTHROPIC_API_KEY` (`git grep`) — `server/src/env.ts`
     and docs may mention it.
5. Manual smoke test (the only step needing eyes): `npm run dev`, log in via dev-login,
   upload any OSRS screenshot through the Submit modal, confirm the analysis box shows
   extracted text / a detected item rather than "analysis unavailable". First call
   downloads models — expect a one-time delay.

**DoD O1:** both `tsc --noEmit` clean; `npm run test --workspace=server` green;
full E2E suite (`npm run test:e2e`) green twice (it exercises the disabled path);
manual smoke test shows real extracted text; `@anthropic-ai/sdk` gone from
`server/package.json` and the lockfile.

## 3. Phase O2 — Fuzzy matching (this is what makes local OCR actually good enough)

New file `server/src/services/textMatchService.ts` — pure, DB-free, unit-tested. OCR of
OSRS's bitmap font reliably confuses `w→u`/`w→v`, `O→0`, `a→e`, and drops spaces around
mixed-case boundaries. All observed misses were within 1–2 edits after normalization.

1. Exports:
   - `normalizeForMatch(s: string): string` — lowercase, strip every non-`[a-z0-9]`.
   - `levenshteinWithin(a: string, b: string, max: number): boolean` — standard DP, early
     row-minimum exit once `> max`.
   - `fuzzyIncludes(lines: string[], needle: string): boolean` —
     1. Normalize the needle; if it's shorter than **6** normalized chars, do plain
        normalized-substring matching only (no edit tolerance — short names like "Vorki"
        must not fuzz into random text).
     2. Otherwise: normalized substring hit on any line wins immediately; else slide a
        window of widths `needleLen-1 … needleLen+1` across each normalized line and
        accept if `levenshteinWithin(window, needle, maxEdits)` where
        `maxEdits = needle length >= 12 ? 2 : 1`.
   - Lines are matched individually (never the joined blob) so a needle can't straddle
     two unrelated lines.
2. Wire into `server/src/ocr.ts`:
   - Codeword: `codewordFound = fuzzyIncludes(extractedText, team.codeword)` — the
     codeword is `adjective-noun`; normalization removes the hyphen, so a player typing
     "crimson falcon" or OCR reading "crimsom-falcon" still counts. Keep `maxEdits` at 1
     for codewords regardless of length (spec it as a `fuzzyIncludes` option) — a
     codeword false-positive wrongly *suppresses* the warning mods rely on, so stay
     conservative.
   - Items and wildcards: replace the `text.toLowerCase().includes(needle)` inner checks
     with `fuzzyIncludes`. Preserve ordering semantics exactly: first item in query order
     wins, wildcards only consulted when no item matched.
3. Unit tests (`textMatchService.test.ts`, vitest, colocated like every other service
   test) — use the *actual observed OCR errors* as fixtures:
   - `"Fishing Trauler"` matches needle `"Fishing Trawler"` (1 edit).
   - `"Welcome to 0ldSchoolRuneScepe."` matches `"Old School RuneScape"` (normalization
     + edits).
   - `"MasteringMixology"` and `"Rogues'Den"` match their spaced/apostrophed names
     (normalization alone).
   - `"Halloved Sepulchre"` matches `"Hallowed Sepulchre"`.
   - Negative cases: `"Vorki"` does NOT match a line containing `"Vorkath"`... note it
     WOULD as a substring — that's existing behavior, keep it; instead assert e.g.
     `"Zamorak hilt"` does not match `"Zamorakian spear"`, and a ≥6-char needle with 3+
     edits does not match. Also assert the short-needle path does no edit-tolerance.
   - Codeword-mode: 1 edit passes, 2 edits fails even for a long codeword.
4. Extract-and-test opportunity: `analyzeSubmissionScreenshot`'s match-selection loops
   can move into `textMatchService` as a pure function taking
   `(extractedText, items, wildcards)` and returning `{ detectedMatch, detectedWildcard }`
   so the whole decision path is unit-tested without OCR or a DB. Do it — `ocr.ts` then
   only does I/O.

**DoD O2:** new unit tests green alongside the existing 126; both typechecks clean; E2E
suite still green twice; manual smoke test now detects an item even when OCR output has a
1-char slip (verify by checking the dev-server response for a real screenshot).

## 4. Phase O3 — Verification script + docs

1. `server/scripts/ocr-smoke.ts` (run via `tsx`, not shipped in any build): takes an
   image path, prints extracted lines, timing, and what
   `analyzeSubmissionScreenshot`-level matching would decide against a named bingo's
   items. Purpose: a mod/dev can sanity-check OCR quality on a real submission in
   seconds without clicking through the UI. Keep it dependency-free beyond what the
   server already has.
2. Update this plan's phase sections to DONE-with-gotchas as executed (same convention as
   `docs/e2e-testing-plan.md`).
3. Deployment note to include in the DONE write-up: the model cache lives in
   `~/.cache/ppu-paddle-ocr`; a fresh deploy downloads ~30 MB once on first analyze call.
   If the eventual host can't reach the internet at runtime, pre-warm the cache in the
   build step (run the smoke script once) — do not solve this now, just document it.

**DoD O3:** smoke script runs against a real screenshot end-to-end; plan doc updated;
final full pass — both typechecks, unit suite, E2E twice — green.

## 5. Verification discipline

Same as `docs/e2e-testing-plan.md` §9: per phase run both `tsc --noEmit`s, the server
unit suite, and the E2E suite twice; no arbitrary waits; read the component/service
source before inventing an interface. The E2E suite must pass **unmodified** — if it
doesn't, the change broke a behavior contract (most likely the analyze endpoint's failure
shape), not the tests.
