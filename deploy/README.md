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
