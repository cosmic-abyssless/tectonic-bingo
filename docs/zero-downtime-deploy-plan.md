# Zero-downtime deploys, a separate OCR service, and a new home: the plan

Status: proposed, 2026-09-21. Not started. Deploys today go from `Miconen/tectonic-bingo` (`production` branch) to
Railway; this plan replaces that with a pipeline owned by `cosmic-abyssless/tectonic-bingo`.

## What we're solving

1. **Every deploy takes the site down for a few seconds** (issue #75). SQLite and the uploads live on one Railway volume,
   Railway will not overlap two containers on it, so old stops before new starts.
2. **Screenshot analysis competes with the site for CPU.** OCR runs inside the API process on shared vCPUs; a burst of
   submissions slows every request, and the size of the box is set by OCR, not by the site.
3. **The repo that deploys isn't the one we work in.**

## What we're not solving, and why

**We keep SQLite.** The server makes 842 synchronous database calls across 30 files, with 60 transaction sites, all on
better-sqlite3's synchronous API. Postgres (or Turso/libSQL) has an asynchronous API, so moving means rewriting every
service, not swapping a driver. For a clan-sized event (under a hundred players, a few requests a second at peak)
SQLite in WAL mode is not the bottleneck and won't be. Zero-downtime is reachable without leaving it: see below.

**We keep one machine.** No horizontal scaling. The app was designed around one process (SQLite file, uploads on disk,
WebSocket broadcasts in memory); the plan makes that one machine deployable without downtime and protects its data,
rather than turning it into a fleet. If the event ever outgrows this, the Postgres rewrite becomes the next plan.

## Target architecture

One VPS running Docker Compose with five containers:

```
                    ┌──────────────────────────────────── VPS (Hetzner, Ashburn) ────────────────────────────────┐
  tectonic.cc ───►  │  caddy (TLS, reverse proxy) ──► api-blue  ─┐   shared bind mounts:                        │
                    │                        (or) ──► api-green ─┤   /data/sqlite/bingo.db  (WAL)  /data/uploads │
                    │                                            └──► ocr  (POST /recognize, internal only)     │
                    │  litestream ── continuous replication of bingo.db ──► Cloudflare R2                        │
                    │  backup (nightly) ── /data/uploads ──► Cloudflare R2                                       │
                    └────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **api** is the existing Express server, unchanged except that OCR becomes an HTTP call. Two copies exist only during a
  deploy (blue/green); one runs the rest of the time.
- **ocr** is a small HTTP service in the same image (`node dist/ocrServer.js`): `POST /recognize` with the image bytes,
  returns `{ lines: string[] }`. It owns the model, the warm-up and the concurrency limit. It has its own CPU
  reservation, so a burst of screenshots can't slow the site, and the site can't starve it.
- **caddy** terminates TLS (automatic certificates) and proxies to whichever api colour is live. Switching colours is
  one config reload with no dropped connections.
- **litestream** streams every SQLite change to an R2 bucket. Restore point is seconds old, at any time. This is the
  backup story SQLite otherwise lacks.
- **backup** copies new uploads to R2 nightly (rclone). Uploads are write-once, so nightly is enough.

Why this works without downtime: SQLite in WAL mode is safe for **multiple processes on the same machine** (it is only
unsafe across a network filesystem). During a deploy, old and new api containers share the same database file and the
same uploads directory for a few seconds, both fully working. That is exactly what Railway's volume model forbids and a
plain Docker host allows.

### The deploy, step by step (what `deploy.sh` does)

1. Pull the new image (built by CI, tagged with the git commit).
2. Run `db:migrate` against the live database **while the old colour is still serving**. Rule this imposes: migrations
   must be additive (new tables, new nullable columns, new indexes). Every migration so far is. A destructive change
   (drop/rename) needs the two-deploy pattern: add the new shape, deploy, migrate data, drop the old shape next deploy.
   CI enforces the rule by scanning new migration SQL for `DROP` and `RENAME` and failing unless the PR is labelled to
   allow it.
3. Start the other colour, wait for its `/health` to pass.
4. Reload Caddy pointing at the new colour. New requests go there immediately; in-flight requests on the old one finish.
5. Wait ~10 s, stop the old colour. WebSocket clients attached to it reconnect (the client already retries every 3 s)
   and refetch. The only visible effect is a broadcast made in that ~10 s window not reaching clients still on the old
   process; they catch up on reconnect.
6. Keep the previous image tagged `rollback`. Rolling back is the same script with that tag: under a minute, no build.

### Sentry, environments, releases

Railway currently supplies `RAILWAY_ENVIRONMENT_NAME` and `RAILWAY_GIT_COMMIT_SHA`, which the SDKs use for the
environment and release. Compose sets `SENTRY_ENVIRONMENT=production` and `SENTRY_RELEASE=<git sha>` explicitly (the sha
is a build arg baked into the image; the client's `__SENTRY_RELEASE__`/`__SENTRY_ENVIRONMENT__` defines gain the same
fallbacks). Source-map upload keeps working from the CI build. A Sentry **uptime monitor** on `https://tectonic.cc/health`
(free, one minute interval) replaces watching Railway by hand.

## Deployment stack and why

| Choice | Picked | Considered and rejected |
| --- | --- | --- |
| Host | **Hetzner Cloud VPS, US location (Ashburn)**, CPX31 (4 vCPU, 8 GB, 160 GB NVMe) or CPX21 (3 vCPU, 4 GB) to start. Dedicated-vCPU CCX13/23 if OCR latency under load isn't good enough. | **Railway**: can't overlap containers on a volume, so no zero-downtime without leaving SQLite; per-vCPU pricing makes OCR headroom expensive. **Fly.io**: closest managed option (LiteFS keeps SQLite), but LiteFS adds a FUSE layer and a lease service to operate, and dedicated CPU costs more than Hetzner. **Render/DO App Platform**: same volume limitation as Railway or no persistent disk at all. |
| Runtime | **Docker Compose** on the box, one image with two commands (api, ocr). | Kubernetes/Nomad: nothing here needs an orchestrator. |
| Proxy/TLS | **Caddy** (automatic Let's Encrypt, one-line reverse proxy, config reload without dropping connections). | nginx + certbot: more moving parts for the same job. |
| Images | Built in **GitHub Actions**, pushed to **GHCR**, tagged with the commit sha. | Building on the VPS: works as a fallback, but a build spikes CPU on the production box. Note GHCR's private-package storage quota (500 MB on GitHub Free); if the image (Node + onnxruntime + sharp) exceeds it, use the build-on-box fallback or a paid tier. |
| Data safety | **Litestream → R2** for the database (continuous), **rclone → R2** nightly for uploads, plus Hetzner's snapshot backups. | Relying on Hetzner backups alone: daily granularity loses up to a day of picks and submissions. |
| Object storage | **Cloudflare R2** (no egress fees, free tier well above our size). | S3: egress fees for a restore. |
| Front door | Optionally **Cloudflare proxy** (free) in front of Caddy for DDoS absorption. Not required; WebSockets work through it. | — |
| Deploy trigger | **GitHub Environment "production" with a required reviewer.** Merging to `main` builds the image and stages a deploy; a person approves it; the deploy job SSHes to the box and runs `deploy.sh`. Deliberate, but one click. | Deploy on every merge: with zero-downtime it's now *possible*, and can be switched on later by removing the reviewer; start deliberate. A `production` branch: no longer needed. |

Prices aren't quoted here because Hetzner renders them dynamically; check https://www.hetzner.com/cloud/ when
ordering. Expect the whole setup to land in the low tens of euros a month: the VPS is the only real line item, R2 and
Litestream are free at our size, GHCR is free unless the quota bites.

## What changes in the code

Small. Everything below is additive; the app keeps running on Railway until cutover.

1. **`server/src/ocrServer.ts`** (new): Express app with `POST /recognize` (raw image bytes, size-limited) and
   `GET /health`; wraps the existing `getOcrService()`, the limiter and warm-up moved from `ocr.ts`. Not reachable from
   outside the Compose network.
2. **`server/src/ocr.ts`**: `recognizeText()` becomes an HTTP call to `OCR_URL` with a 20 s timeout when `OCR_URL` is
   set, and stays in-process when it isn't (local development, tests). The text cache keyed by image hash stays in the
   API, so the modal's analysis is still reused by the submission's. A failed or timed-out call takes the existing
   "analysis failed" path; a submission never waits on OCR (it already doesn't).
3. **`Dockerfile`** (multi-stage: build shared/server/client, runtime image with prebuilt better-sqlite3, sharp and
   onnxruntime), **`docker-compose.yml`**, **`Caddyfile`**, **`deploy/deploy.sh`**, **`deploy/litestream.yml`**.
4. **`instrument.ts` (both)**: read `SENTRY_ENVIRONMENT`/`SENTRY_RELEASE` first (already the case on the server; the
   client gains the same build args).
5. **CI**: a `deploy.yml` (build → push → wait for approval → ssh → `deploy.sh`), the migration-safety check, and the
   existing `ci.yml` unchanged. `railway-plan.yml` and `.railway/` go away after cutover.
6. **Ops on the box** (once): Ubuntu LTS, Docker, unattended security upgrades, SSH keys only, firewall (22, 80, 443),
   a deploy user, Hetzner backups on. Written down in `deploy/README.md` so the second person can rebuild it.

## Phases and effort

| Phase | What | Done when | Effort |
| --- | --- | --- | --- |
| 0 | Decide and provision: who owns the Hetzner account and pays; who controls DNS for `tectonic.cc`; create the R2 bucket; order the VPS. | Box reachable, bucket exists. | 1–2 h of decisions |
| 1 | Containerise: Dockerfile, Compose, Caddy. Runs locally with a copy of the dev database. | `docker compose up` serves the site on localhost with TLS off. | ~1 day |
| 2 | OCR service split, with tests for the HTTP boundary and the fallback path. | Local Compose: analysis works via the `ocr` container; killing `ocr` degrades gracefully. | ~1 day |
| 3 | Data safety: Litestream, uploads backup, and a **restore drill** (rebuild from R2 onto a scratch box). | Restore drill passes; the doc says how. | ~half a day |
| 4 | CI/CD: build/push, approval-gated deploy, `deploy.sh` with blue/green and rollback, migration-safety check. | Deploying `main` to the VPS is one approval click; rolling back is one command. | ~1 day |
| 5 | Rehearsal: run the real image on the VPS with a **copy** of production data (dev-login off, real Discord app but a test callback URL), deploy twice in a row while clicking around, watch for dropped WebSocket updates. | Two consecutive deploys with no user-visible interruption. | ~half a day |
| 6 | Cutover (below). | `tectonic.cc` served from the VPS; Railway still running as fallback. | ~2 h, quiet window |
| 7 | Decommission: after 48 h clean, stop the Railway service, remove `.railway/` and `railway-plan.yml`, update docs and the privacy policy's "hosting provider" line. | — | ~1 h |

About five working days end to end, plus waiting on decisions. Phases 1–5 can all happen while the event runs on
Railway; only phase 6 touches players, and it goes in a quiet window.

## Cutover

1. Days before: lower the DNS TTL for `tectonic.cc` to 60 s.
2. Announce a short freeze (submissions during the window are the only thing that could be lost; picks and reviews
   too, so pick a dead hour).
3. On Railway: nothing to change. On the VPS: `litestream restore` from a fresh copy of the Railway database
   (download via `railway ssh`/volume export), `rsync` the uploads, start the stack, check `/health`, log in with
   Discord, open a board, submit a screenshot on a test team.
4. Switch DNS. Traffic moves within a minute.
5. Watch Sentry (release tag shows the new box), Caddy logs, and the uptime monitor for an hour.
6. Rollback if needed: switch DNS back; Railway is untouched. Anything written to the VPS in between is lost, which is
   why the window is a quiet one.
7. Keep Railway up for 48 hours, then phase 7.

## What you take on that Railway did for you

Be clear-eyed about this: it's the price of the control.

- **A machine to keep patched.** Unattended upgrades cover security; a reboot every few months for the kernel (blue/green
  doesn't help with a reboot; schedule it).
- **Backups are yours to prove.** Phase 3's restore drill is not optional, and repeating it every few months is how you
  know the backups are real.
- **One box.** A hardware failure is downtime until you rebuild from R2 (an hour, following the doc), not a
  transparent failover. For an event of this size that's an acceptable risk; it's the one to revisit first if the site
  becomes something people depend on daily.
- **Secrets live in Compose's env file on the box**, not a dashboard. Keep the file out of git (it is already ignored)
  and back it up somewhere sane (a password manager), or a rebuild means re-collecting every key.

## Open questions

- Who owns the Hetzner account and the R2 bucket (you, Mico, a shared clan account)? Whoever it is also owns the bill.
- Who controls DNS for `tectonic.cc`, and is Cloudflare already in front of it?
- Is the Discord application's OAuth callback tied to anything Railway-specific? (It shouldn't be; the domain doesn't
  change.)
- Does the clan API (`TECTONIC_API_URL`) allow-list callers by IP? If so, the VPS's IP needs adding before cutover.
- GitHub plan: Free or Pro? Decides whether GHCR's private-image quota is a concern.
