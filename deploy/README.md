# Deploying Tectonic Bingo

How the site is packaged, run, deployed and backed up. The reasoning is in `docs/zero-downtime-deploy-plan.md`; this
folder is the how-to. It grows phase by phase, and everything needed to rebuild the server from nothing belongs here.

## The image

`Dockerfile` builds one image per commit. It contains the built client, the built server, the migrations and production
dependencies only. It is run unchanged in every environment: nothing environment-specific is baked in at build time.

The entrypoint picks a role from the first argument:

| Command | What the container does |
| --- | --- |
| `api` (default) | Applies pending migrations, then serves the site on port 8080. |
| `migrate` | Applies pending migrations and exits. |
| `ocr` | Serves the screenshot reader over HTTP (see below). Needs no database and no secrets. |
| `verify-db [path]` | Prints a read-only health report for a database file and exits non-zero if it isn't fit to start on (see Backups and restoring). |

Settings and secrets arrive as environment variables (`.env.docker.example` lists them). The browser gets its own Sentry
settings from the server when it loads the page (`window.__APP_CONFIG__`, see `server/src/runtimeConfig.ts`), which is
what lets the same image report as "staging" in one place and "production" in another.

Build arguments and secrets:

- `SENTRY_RELEASE` (build arg): the commit, used as the Sentry release name for the client's source maps.
- `sentry_auth_token` (BuildKit secret, optional): uploads the client's source maps. Never pass it as a build arg.

```bash
docker build --build-arg SENTRY_RELEASE=$(git rev-parse HEAD) \
  --secret id=sentry_auth_token,env=SENTRY_AUTH_TOKEN -t tectonic-bingo:$(git rev-parse --short HEAD) .
```

## Screenshot analysis (the `ocr` service)

Reading the text in a screenshot is CPU-heavy, so it runs in its own container instead of inside the site's process.
The api sends each image to it (`OCR_URL=http://ocr:8080`) and the service answers with the lines it read. The contract
is in `server/src/ocrProtocol.ts`; the service is `server/src/ocrServer.ts`.

- It uses the same image as the api (one build, so the two can never disagree about the protocol). The models (~30 MB)
  are downloaded into the image at build time, so the container needs no network and is ready about a second after it
  starts.
- Only the Compose network can reach it: no port is published, and it has no authentication.
- **Failure behaviour.** If the service is down, slow (`OCR_TIMEOUT_MS`, default 20 s) or erroring, screenshot analysis
  answers `503` and the submission form carries on without it; submissions, mod review and everything else are
  unaffected. The api never falls back to reading in its own process, which would put the load back on the site. When
  the service comes back the next screenshot works, with no restart. (Docker's DNS takes several seconds to give up on
  a stopped container's name, so during an outage the analysis fails after about 8 s rather than instantly.) An outage
  is logged as a warning and not reported to Sentry as a bug: it is expected whenever the service restarts, and it is
  watched through the container's health instead. An image the engine cannot read (truncated, not an image) is a `422`
  for that one upload, not an outage.
- **Backlog.** When the api gives up on a screenshot (its timeout) it hangs up, and the service drops the reading if it
  was still waiting in the queue, so abandoned work never piles up behind live work. A reading that has already
  started runs to the end.
- **Startup.** If the model cannot be loaded the `ocr` process exits, so Docker restarts it (a container that merely
  reports unhealthy is not restarted).
- **Sizing.** `OCR_CPUS` (default 2) caps how much of the machine it can use, so a burst of screenshots slows analysis and
  never the site. `OCR_MEMORY` (default 2g; it uses about 1 GB). `OCR_CONCURRENCY` (default 1) is how many screenshots are
  read at once, each using all of the allotted CPUs. The engine sizes its threads to the container's CPU limit
  (`OCR_THREADS` overrides): left to count the host's CPUs it ran 6x slower under a 2-CPU limit, so do not remove that.
  A 1500x1000 screenshot takes about 2-3 s at 2 CPUs on a fast laptop; re-measure on the real server (it is the number
  to tune) with `docker compose logs ocr | grep recognized`, which logs the milliseconds for every screenshot.
- Locally, running the api outside Docker (`npm run dev`) leaves `OCR_URL` unset and reads screenshots in-process as before.
- Sentry: the service reports under the environment `ocr`, using the server's DSN (`SENTRY_DSN`). Compose passes it only
  that one setting rather than the whole env file, since it needs no secrets. That setting is interpolated by Compose
  (from the shell or from `--env-file`), not read from the service's own env file, so start the stack with
  `--env-file .env.docker` when Sentry should be on.

## Running the whole stack locally

```bash
cp .env.docker.example .env.docker      # once; the defaults work for a local run
docker compose up --build               # then open http://localhost:8080
```

- This Compose file is the **local stack only** (plain HTTP on port 8080, no certificate). Production and staging use the
  same image but their own definitions (with ports 80 and 443, the backup services and blue/green switching), which
  arrive in a later phase.
- The database and uploads live in `.docker-data/` (created on first run, ignored by git). A one-shot `init-data`
  container makes them writable by the app's user, which matters on Linux (the daemon creates missing bind-mount
  directories as root); on Docker Desktop it changes nothing. To try the stack against
  realistic data, put a copy of a database at `.docker-data/sqlite/bingo.db` (use SQLite's `.backup`, not a file copy,
  if the source is being written to) and uploads in `.docker-data/uploads/`.
- With `NODE_ENV=development` and `DEV_LOGIN_ENABLED=true` (the example's defaults) the login page lists accounts to
  sign in as. The image itself defaults to `NODE_ENV=production`, where dev-login is off.
- Caddy is the front door (`Caddyfile`), the same one production uses. Locally it serves plain HTTP; in production
  `SITE_ADDRESS` is the domain and Caddy handles the certificate.
- Stop with `docker compose down`; add `-v` to also forget Caddy's certificates. The data directory is never removed.

## Backups and restoring

What is backed up, where, and how fresh:

| Data | How | Where | How far behind, at worst |
| --- | --- | --- | --- |
| The database (`bingo.db`) | Litestream (`litestream` container) ships every change | Cloudflare R2, `<prefix>/db` | about a second |
| Uploads (screenshots, tile images, wiki icons) | `rclone copy` (`backup` container), on start and daily at 03:15 UTC | R2, `<prefix>/uploads` | up to a day (uploads never change once written, and the copy never deletes) |
| Everything on the box | Hetzner's own snapshot backups (switch them on when the server is ordered) | Hetzner | up to a day; a second layer, not the plan |

Litestream keeps a full snapshot every day and every change for 30 days, so the database can be restored to **any moment
in the last 30 days**, not just to "latest". The bucket is a different provider from the server on purpose.

### One-time setup (for each environment)

1. In the Cloudflare dashboard create an R2 bucket (one bucket serves every environment). Create an **R2 API token
   limited to that bucket** with Object Read & Write: never a token for the whole account.
2. `cp deploy/backup.env.example deploy/backup.env` (on the server it lives outside the repo, next to the app's env
   file) and fill it in: the endpoint is `https://<account id>.r2.cloudflarestorage.com`, and `BACKUP_PREFIX` is
   `production` or `staging`. **Never let two environments share a prefix**: they would overwrite each other's history.
   Keep the master copy in the team's password manager; a rebuild needs it before anything else can be restored.
3. Make a check at healthchecks.io (or similar), put its URL in `BACKUP_PING_URL`, and have it alert by email if it
   isn't pinged for 36 hours. That is what turns "the backup stopped" from a surprise into an alert.
4. Start the stack with the overlay:
   `docker compose -f docker-compose.yml -f deploy/compose.backup.yml up -d`. It refuses to start without the backup
   env file, so a stack can't run unprotected without anyone noticing. (Phase 4's production stack includes it.)

### Checking that it is working

- `docker compose logs litestream` shows `snapshot complete` / `compaction complete` lines; `ERROR` lines are not normal.
  Litestream only writes when the database changes, so a quiet database legitimately has no new files.
- `docker compose logs backup` ends each run with `uploads backup: complete`, and says when the next one is.
- The dead-man's-switch check from step 3 is the one that tells you when nobody is looking.
- To see what is in the bucket:
  `docker run --rm --env-file deploy/backup.env -v "$PWD/deploy:/deploy:ro" --entrypoint sh rclone/rclone:1.75.1 -c '. /deploy/rclone-env.sh && rclone size backup:$BACKUP_BUCKET/$BACKUP_PREFIX'`

### Restoring

`deploy/restore.sh` needs only Docker and the backup env file, so it is the same command on a scratch machine, on a
rebuilt server and in the drill. It restores the database, restores the uploads, and then runs the image's `verify-db`
role on the result (SQLite's integrity and foreign-key checks, that the migration history is one this build can
continue, and a row count per table). It exits non-zero unless the database passes.

```bash
# The latest state, into a scratch directory (safe to try at any time; it touches nothing else):
deploy/restore.sh --into /tmp/restore-check --env-file deploy/backup.env --image tectonic-bingo:local

# The database as it was at a moment (an accident, a bad migration): RFC 3339, in UTC.
deploy/restore.sh --into /tmp/restore-check --env-file deploy/backup.env --at 2026-09-21T14:30:00Z --no-uploads
```

`--into` takes a directory or a Docker volume name, and ends up with `sqlite/bingo.db` and `uploads/`, the layout the
stack mounts (point `DATA_DIR` at it). The script refuses to overwrite a database that is already there unless given
`--force`, and it hands the files to uid 1000, the user the app runs as.

**Disaster recovery (the server is gone).** On a new machine: install Docker, clone the repo, put the env files back
from the password manager, then

```bash
deploy/restore.sh --into /srv/tectonic/production --env-file deploy/backup.env --image <image tag>
# then start the stack with DATA_DIR=/srv/tectonic/production
```

The site is back with data as of about a second before the failure (uploads as of the last night's copy: any file newer
than that is gone, and the submissions that referenced it show a missing image).

### The restore drill

A backup nobody has restored is a hope, not a backup. There are two drills, and both matter:

1. **The automated drill**, `deploy/restore-drill.sh [IMAGE]`, needs only Docker and takes under a minute. It runs the
   real containers and config against a local S3-compatible server standing in for R2: it seeds a database with the real
   schema, writes rows while Litestream replicates them, backs up some files, **destroys the data**, restores it with
   `deploy/restore.sh`, and checks that every row and every file came back identically. It also restores to a moment in
   the middle of the writes and checks it holds exactly what existed then, and that `restore.sh` refuses to overwrite
   existing data. CI runs it on every pull request, so a change that breaks the backup tooling can't merge.
2. **The real-bucket drill**, by hand, **every few months and after any change to the credentials or the bucket**: run
   the first `restore.sh` command above against the real bucket on a scratch machine (or your laptop), then compare
   with production: `docker compose exec api node server/dist/verifyDb.js` prints the live database's row counts, and the
   restored one should match to within the last few seconds of writes. This is the one that proves the bucket, the token
   and the endpoint are still right. Note the date you last did it in the release notes or the team channel.

### What this does not protect against

- **A compromised server.** The box holds a token that can write to (and, because Litestream enforces retention,
  delete from) the bucket. Whoever owns the box can destroy the backups. Hetzner's snapshots are the second layer for
  that reason; turning on R2's bucket lock or versioning is worth considering later.
- **Uploads newer than the last nightly copy** (see above).
- **One bucket, one provider.** Cloudflare being unreachable at the moment of a disaster is a delay, not a loss, but it
  is a delay.

## Windows checkouts

`.gitattributes` keeps shell scripts and container files as LF so they run inside Linux containers. A checkout that
existed before that file landed keeps CRLF copies until it is normalised, and a CRLF `docker-entrypoint.sh` or
`smoke-test.sh` fails with `no such file or directory` or `$'\r': command not found`. Fix an existing clone once with
`git add --renormalize . && git checkout -- .` (commit or stash your work first); a fresh clone is fine.

## Migrations and zero-downtime deploys

Every deploy runs migrations while the previous version is still serving, so **a migration must be additive** (new
tables, new nullable or defaulted columns, new indexes). A change that removes or renames something needs two deploys:
add the new shape and deploy, move the data, then drop the old shape in the next deploy. Drizzle applies migrations in
the order of their journal timestamps and silently skips any dated earlier than one already applied, so migrations must
also be generated and merged in order.
