# Faster screenshot OCR — findings and plan

**Status: THEORETICAL.** Measured 2026-10-06. The two recommended changes are one-line settings in
`server/src/ocrEngine.ts`, being made in their own pull request; the infrastructure levers are tabled until after the
Bingo; the rest is ruled out.

## Where the time goes

Measured with the production options (`ocrEngine.ts`: PP-OCRv6 small, `maxSideLength: 4000`, per-box recognition)
on 12 real uploaded screenshots (933×1003 up to 3017×1384, the full RuneLite client), 2 inference threads, warm model,
on a Ryzen 3800X. The box (Hetzner cpx31, 4 vCPU AMD EPYC Rome, 2 of them for the `ocr` service) is slower per core,
so take the absolute numbers as a lower bound and the ratios as what carries over.

- **2.5–2.6 s per screenshot** on average, 1.5 s for the smallest to 4.7 s for a busy 1913×1030 one.
- **Recognition is 62%** of it. A full-client screenshot has 80–490 detected text boxes (inventory counts, skill
  levels, minimap numbers, chat, overlays), recognized 6 to an inference, so 14–82 recognition inferences per image.
  Time tracks the box count, not the image size.
- **Detection is 31%** and tracks pixels: ~0.8 s for 1920×1080, 1.6 s for 3017×1384, 0.33 s for 933×1003.
- **Everything else is 7%**: PNG decode, packing the detection tensor, contour extraction, cropping.

Threads: 1 → 3.57 s, 2 → 2.53 s, 4 → 1.85 s, 8 → 1.53 s. Two threads buy 1.4×, four buy 1.9×.

**Reading two screenshots at once in one process gains nothing.** Pinned to 2 CPUs, two concurrent single-thread
readings finished in the same wall time as reading them one after the other: `onnxruntime-node` runs one
`session.run` at a time. So production's shape, `OCR_CONCURRENCY=1` with 2 threads, is the right one for 2 CPUs; a
higher concurrency would only queue work inside the engine instead of in front of it. Throughput there is about
0.5 screenshots/s on this machine: a burst of 20 submissions is ~40 s of queue, against the API's 20 s `OCR_TIMEOUT_MS`.

Note that the submission modal stops waiting after 2 s (`ANALYSIS_MAX_WAIT_MS`) and lets the Player carry on; the
analysis still lands on the saved Submission for the Moderators. Almost every real screenshot already takes longer
than 2 s, so what the Player sees won't change much until OCR is under 2 s on the box; what changes is how long the
queue gets during a burst, and how often the 20 s timeout drops an analysis.

Production has had **no real OCR traffic yet**: all 1,396 screenshots there are the historical import (`pending`,
never analysed). There are no production timings to compare against; staging's `ocr` container logs
`"ocr recognized" {ms, bytes, lines}` for every reading and is the place to get the real per-screenshot number.

## How accuracy was judged

Counting extracted lines is misleading: most of them are UI fragments nobody matches against. Instead, 56 **key
terms** were read by eye off 10 of the 12 screenshots: drop lines ("Dharok's platebody", "Eclipse moon helm",
"Spirit shield"), kill-count lines, the RuneLite screenshot label with the codeword-style word ("Spark", "Frost",
"Charm", "Blaze"), collection-log headings and chat sentences. A candidate was judged on how many of those it still
reads exactly or within one edit (the matcher's tolerance), against the production options' 52 exact / 2 fuzzy /
2 missed (a 9-px "Frost" label on a dark bar, and "received a drop" read as "wed a drop").

## Recommended (−25% together, same recall)

| Change in `ocrEngine.ts` | Time | Key terms | Lines vs production |
|---|---|---|---|
| `detection.minimumAreaThreshold: 120` (library default 20) | **−18%** | 52 / 2 / 2, identical | 127 lost, 117 gained, all tiny fragments ("Un On On 01:38:54", "+3 others in voice") |
| `session.executionMode: "parallel", interOpNumThreads: <threads>` | **−6%** | identical | **byte-identical text** |
| both | **−25%** (2.60 → 1.95 s) | 52 / 2 / 2 | as the first |

- **Box area.** A detected box with an area of 120 px² or less on the detection map (≈ 11×11 at full resolution) is
  a lone digit or an icon fragment, and recognizing fewer of them is where the time goes. Chat text at 1920 wide is
  ~12 px tall and tens of px wide; the smallest key term that matters (that "Frost" label on a 933-px-wide
  screenshot) is ~25×8 = 200. 200 as the threshold was 3% faster still with the same recall, but 120 leaves a margin
  for smaller screenshots. The detection map is at full resolution (`maxSideLength: 4000`), so the threshold is in
  real pixels, not downscaled ones.
- **Parallel execution.** ONNX Runtime schedules independent graph branches on the inter-op threads; the output is
  unchanged, the gain is small but free.

## Ruled out

| Candidate | Time | Why not |
|---|---|---|
| `detection.maxSideLength: "auto"` (the library default: 1440 for a 1920 screenshot) | −24% | Loses the drop line: "Dharok's platebody" and "Barrows chest count is" gone on the Barrows screenshot, 4–5 key terms missed. The same failure docs/ocr-analysis-plan.md §5 fixed. |
| `maxSideLength: 1728` / `1600` | −10% / −17% | 3 / 5 key terms missed, the drop line among them at 1600. Small chat text does not survive any downscale of the detector's input. |
| PP-OCRv6 **tiny** detection model (small recognition) | −22% | Loses whole lines, overlay names among them ("Dark Shellay", "Dave - Lord Inferno"). Not measured against the key terms; not worth it given the above. |
| `recognition.strategy: "per-line"` | +5% slower | Slower here (long merged crops), and §5.1 found it less accurate. |
| `recBatchSize` 1, 2, 3 | +7%, 0, +7% | No gain; 2 was level with the default 6. |
| `recBatchSize` 32 | **+36%** | Crops in a batch are padded to the widest; big batches waste most of the tensor. |
| PP-OCRv5 English mobile, its INT8 build, PP-OCRv4 English | ±5% | No faster (the recognition backbone dominates, not the dictionary head) and 1–2 more key terms missed. |
| Running 2 readings at once | 0 | `session.run` is serialized per process (above). |

## Infrastructure levers — tabled (2026-10-06)

Not measured on the box, and **tabled until after the Bingo**: no infrastructure changes this close to going live.
Kept here for afterwards.

1. **Give the `ocr` container 4 CPUs with a low CPU share instead of a hard 2-CPU quota.** `cpus: 2` in
   `deploy/stack.yml` is a CFS quota: the container is throttled at 2 CPUs even while the other two idle, which is
   almost always. With `cpus: 4` and `cpu_shares: 256` (the API's default is 1024), OCR would use all four when free,
   `ocrThreads()` would pick 4 threads from the cgroup, and under contention the API gets four times the share.
   Measured gain on this machine: 4 threads −27% on top of the above. The risk is API event-loop latency while a
   reading saturates every core; the load warnings (#452) would show it on staging during a burst of test uploads.
   Each environment has its own `ocr` service on the same box, so staging's should stay at 2.
2. **A bigger box.** cpx41 (8 vCPU) would let OCR keep 4 CPUs without sharing the API's. Money, not code.
3. **Two `ocr` processes.** Since one process reads one screenshot at a time, two replicas (Compose `deploy.replicas`
   or a second service behind the API's `OCR_URL`) would double throughput on 4 CPUs, at the per-screenshot latency
   of 2 threads each. Only worth it over lever 1 if bursts matter more than single latency.

## Verifying on staging

1. Deploy the two settings and upload a few real screenshots (a full-client one with a drop line in chat, a
   collection log, a small cropped one).
2. `docker logs tectonic-staging-ocr-1 2>&1 | grep '"ocr recognized"'` gives `ms` per reading before and after.
3. The Moderators' submission panel shows the extracted text and the detected item: the drop line and the screenshot
   label must still be there.

## Method

A scratch harness built the engine with the production options, timed each `session.run` of the detection and
recognition sessions separately (everything else is the remainder), ran each candidate over the 12 screenshots after
a warm-up, and reported key-term recall and the normalized lines lost or gained against the production options.
Throughput was measured with the process pinned to two CPUs (`Start-Process` + `ProcessorAffinity`). Worth turning
into `server/scripts/ocr-bench.ts` next to `ocr-smoke.ts` if the options are tuned again: `ocr-smoke.ts` times one
image whole and can't say where the time went.
