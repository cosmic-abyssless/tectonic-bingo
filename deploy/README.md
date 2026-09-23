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
  same image but their own definitions (`deploy/stack.yml` and `deploy/edge.yml`: ports 80 and 443, the backup services
  and blue/green switching), driven by `deploy/deploy.sh`; see "Environments, and how a change reaches them".
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

## Environments, and how a change reaches them

Two environments run on one server, each a Compose project of its own behind one shared Caddy:

| | Production | Staging |
| --- | --- | --- |
| Address | `tectonic.bingo`, `www.tectonic.bingo` | `staging.tectonic.bingo` |
| Deployed | by a person, from the Actions tab, once CI on `main` passed | automatically, on every merge to `main` |
| Access | public | Caddy's shared password on everything except `/health` |
| Dev-login | off | on (so the test-data generator and "log in as" work) |
| Data | `/srv/tectonic/data/production` | `/srv/tectonic/data/staging` |
| Settings | `deploy/environments/production.conf` + `env/production.env` | `deploy/environments/staging.conf` + `env/staging.env` |

Each environment has its own screenshot service (`ocr`), so a deploy of staging can never change the service production is
talking to, and the two can run different builds of the protocol.

**The pipeline** (`.github/workflows/deploy.yml`):

1. A pull request passes CI (tests, the image build and smoke test, the restore drill, the deploy tests) and merges to `main`.
2. Straight away, alongside CI on `main` rather than after it, the Deploy workflow builds the image (tagged with the commit),
   streams it to the server over SSH (`docker save | ssh ... load-image`; there is no registry to pay for or leak), syncs
   that commit's `deploy/` directory, and runs `deploy.sh staging`. A merge is on staging in about two minutes.
3. To release: **Actions > Deploy > Run workflow**, environment `production`. It first requires CI on `main` to have
   passed for that commit (waiting for a run still going), so code that reached staging without it (an admin push that
   skipped the pull request rules, or two pull requests that pass alone but not together) never reaches production. It
   deploys the image staging is already running. Nothing is rebuilt, so production gets exactly the bytes that were
   tested, and the server refuses to deploy anything else to production. An emergency hotfix ticks "skip_staging_check": that run builds the commit, ships it (it has
   not been through staging, so it is not on the box), and deploys it; the box logs that the check was skipped.
4. To undo a release: the same button with action `rollback`. It takes under a minute and needs no build.

**Approval.** The plan wanted a required reviewer on production. GitHub only enforces environment reviewers on private
repositories on paid plans, and this repository is private on the free plan, so today the gate is that production is
never triggered automatically (only a person with write access clicking Run workflow) and that the server will only
deploy to production what staging is running. If the plan changes, add required reviewers to the `production`
environment under Settings > Environments: the workflow already targets it, so nothing else needs editing.

### What a deploy does (`deploy/deploy.sh`)

```
deploy.sh ENV IMAGE      deploy an image      deploy.sh ENV --rollback    the previous image again
deploy.sh ENV --status   what is live         deploy.sh edge              (re)start the shared Caddy
```

Blue/green: each environment has two identical api services, `api-blue` and `api-green`, sharing one database file and
one uploads directory (SQLite in WAL mode is safe for several processes on one machine). One serves; a deploy starts the
other.

1. Boot the new image on an empty database and check it serves (the same smoke test CI runs; skipped for a rollback).
2. Apply its migrations to the **live** database while the old colour still serves. A failure stops here.
3. Start the other colour on the new image and wait until it is healthy. A crash or a restart loop stops here.
4. Update the environment's screenshot service and its backup services.
5. Point Caddy at the new colour (rewrite one snippet, validate the whole config, graceful reload) and check the public
   address answers from it. Requests already in flight finish on the old colour; open WebSockets stay on it until it stops
   and then reconnect on their own.
6. After a drain (10 s), stop the old colour. It is kept, stopped, so the previous version is one command away.

Anything that fails before step 5 leaves the old colour serving, untouched; a failed check after the switch switches back.
The script says which step failed and shows the new container's log. Only one deploy per environment runs at a time.

State is in `/srv/tectonic/state/<env>.state` (live colour and image, previous image) and `<env>.log` (history). It is
saved the moment the new colour is live, before the drain, and if it ever disagrees with where Caddy actually routes (a deploy
killed at the wrong moment), Caddy wins. A deploy ignores SIGHUP, so a dropped SSH session does not kill it mid-switch. If it
fails after the screenshot service was replaced, the previous one is put back, so "unchanged" is true. Staging deploys can finish
out of commit order, so a deploy of a commit that is an ancestor of what staging runs is
skipped (`--force` to override). The last few images stay on disk for rollbacks; older ones are pruned.

**On a bad release**, roll back first and investigate afterwards. A rollback deploys the previous image through the same
path, so it is as safe as any deploy. It works because migrations are additive: the old code runs happily against the
newer database.

**Building on the server instead of shipping an image** (if GitHub Actions is down or a build is stuck): on the server,
`git clone` the repository, run
`docker build --build-arg SENTRY_RELEASE=$(git rev-parse HEAD) -t tectonic-bingo:$(git rev-parse HEAD) .`
and then `deploy.sh staging tectonic-bingo:<that tag>` as usual. A build uses a lot of CPU, so avoid doing it on
production at a busy moment.

### What the CI key can do (`deploy/ssh-entry.sh`)

The deploy user is in the `docker` group, which is root-equivalent, so the GitHub key is pinned in `authorized_keys` to a
wrapper: `restrict,command="/srv/tectonic/deploy/ssh-entry.sh" ssh-ed25519 ...`. It allows `load-image`, `sync-deploy <sha>`,
`deploy`, `rollback`, `status` and `edge`, with validated arguments (an image must be named `tectonic-bingo:<tag>`, an
environment must be `production` or `staging`), and refuses everything else, including a shell.

**The deploy scripts are not under the key's control.** `sync-deploy` takes only a commit sha. The box keeps its own clone of
the repository (read-only deploy key that only the box holds), fetches `main`, refuses any commit that is not on `main`, and
installs that commit's `deploy/` directory. The key cannot make the box run a script of its own.

**What a leaked `DEPLOY_SSH_KEY` can still do, plainly.** It can load an image of its own and deploy it. A deployed image
runs unprivileged, but with that environment's secrets and data mounted. So whoever holds the key can read and change the
database and the secrets of the environment they deploy to (production included: `--skip-staging-check` is a flag the key may
pass). Treat the key as access to production data. It is **not** root on the machine, and it cannot reach the backups token
or other environments' data except by deploying to them. Closing the rest would need images the box can verify came from
`main` (building on the box, which spends the site's CPU on every merge, or signed images); that is a known limit, not an
oversight. If the key leaks: delete it from the deploy user's `authorized_keys`, rotate it in GitHub, and rotate
production's secrets (`SESSION_SECRET`, the Discord and API keys) and treat the data as read.

`deploy/test-ssh-entry.sh` tests every allowed shape, 24 requests that must be refused, and `sync-deploy` against a real git
repository (a commit that is not on `main`, a made-up commit, a symlink in `deploy/`, a script that does not parse). It runs
in CI.

### Testing the deploy

`deploy/test-zero-downtime.sh [IMAGE]` (needs Docker and Node 22+, and a few minutes; CI runs it) runs the real `deploy.sh`,
Caddy and containers on your machine and judges the deploys by what a continuous stream of requests saw. It deploys a
first version, deploys a second under load, tries a build whose api never becomes healthy and one whose migration fails
(each must fail and change nothing), and rolls back. It passes only if the probe made a few hundred requests, **none failed**,
both colours served traffic, and the live version was right after every step. It then checks two guards (production
refuses an image staging is not running; staging's password protects everything except `/health`) and that a deploy with
backups switched on starts Litestream and the backup service against a local bucket. One detail: the probe retries a GET
once when its connection is reset before any response, as a browser does, and reports how many it retried (none to a
handful of several thousand requests between runs). That is the keep-alive race in the instant Caddy swaps its
configuration: a request sent on a connection Caddy closes at that moment. Browsers retry it transparently, and over
HTTPS they use HTTP/2, which has no such race; a deploy that resets more than ten fails the test.

## Setting up the server

There are two ways, and they end in the same place. **With OpenTofu** (below) the machine, its keys, the GitHub secrets and the
R2 bucket are created by code (`infra/`), so a rebuild is one command and the only manual steps are the ones a person must do.
**By hand** (the numbered list after it) is what the first server was built with, and remains the fallback if OpenTofu is not
available. Everything is written down so that a second person can rebuild the box, and so can you in a year.

### With OpenTofu

The credentials, the state bucket and the commands are in [`infra/README.md`](../infra/README.md). In outline:

1. `. .\infra\env.ps1`, then `tofu init "-backend-config=backend.hcl"` and `tofu apply` (from `infra/`). This creates the server on
   a stable address, the firewall, the CI, repository and host keys, the deploy key and the four `DEPLOY_*` secrets on GitHub,
   and the R2 bucket with its token. First boot runs `deploy/bootstrap-box.sh`, `deploy/init-env.sh` and `deploy/deploy.sh edge`
   by itself (progress: `/var/log/cloud-init-output.log`, which also holds the **staging password, printed once**: move it to the
   password manager and clear that line).
2. `infra/push-backup-env.ps1` (Windows PowerShell; `infra/push-backup-env.sh` elsewhere) writes the two backup env files (the R2 credentials tofu derived) onto the box and checks it
   can write to the bucket.
3. `ssh deploy@<address>`, then `deploy/fill-secrets.sh`: asks for the Discord values (once, for both environments), the
   production clan-API keys and an optional backup alert URL, hiding what you type. `--list` shows what is still blank.
4. DNS (Mico, by hand): `tofu output dns_records_to_ask_for` lists the records, all **DNS only** (grey cloud).
5. Discord: add the two redirect URIs and change the `/terms` and `/privacy` URLs (step 8 below); optional monitoring (step 10).
6. **Actions > Deploy > Run workflow** for staging, check it, then production. Steps 9 and 10 below apply as written.

### By hand

Once, when the server is created (about an hour, most of it waiting). `deploy/bootstrap-box.sh` does the machine-level
steps; the rest is secrets and DNS, which only a person can do.

1. **Create the server** in the Hetzner Cloud console: **CPX31** (4 vCPU, 8 GB), location **Ashburn (US)**, image
   **Ubuntu 24.04**, add your SSH key. Hetzner's own **Backups** (a daily snapshot of the whole machine, about 20% of the price) are optional and can
   be switched on later: the data is protected by R2, and the machine is rebuilt from this runbook. Note the
   IPv4 address.
2. **Generate the CI key**, anywhere: `ssh-keygen -t ed25519 -f deploy_key -C github-actions -N ''`. Keep `deploy_key`
   private (it becomes a GitHub secret); `deploy_key.pub` goes to the server.
3. **Bootstrap the machine.** The repository is private, so the server cannot fetch it yet: send it the `deploy/` directory
   (and the two public keys) from your machine. Use `git archive`, not a copy of your working folder: it sends what is
   committed, and every file a script or the stack reads (scripts, templates, `.conf`, `.yml`, `.env`) is pinned to Unix line
   endings in `.gitattributes`. (Copying a Windows checkout with `scp -r` sends CRLF copies of the templates, and a value that
   ends in a hidden carriage return breaks quietly.) From a clone on `main`:
   `git archive HEAD deploy | ssh root@<address> tar -x -C /root` and `scp deploy_key.pub admins.pub root@<address>:/root/`.
   Then, on the server as root:
   `bash /root/deploy/bootstrap-box.sh --ci-public-key deploy_key.pub --repo-url git@github.com:cosmic-abyssless/tectonic-bingo.git --admin-key-file admins.pub`
   (`admins.pub`: the public keys of the people who administer it, one per line). It installs Docker with log rotation,
   creates the `deploy` user and `/srv/tectonic`, pins the CI key to `ssh-entry.sh`, turns off SSH passwords, enables a
   firewall (SSH, HTTP, HTTPS only) and automatic security updates that never reboot on their own, and makes the box's own
   read-only key for the repository (GitHub's host key is pinned to the fingerprint GitHub publishes). It is safe to run
   again. **Log in with your key in a second terminal before closing the first.** It ends by printing the repository key:
   **add it under the repository's Settings > Deploy keys, with "Allow write access" left OFF.** Until you do, `sync-deploy`
   (and so every deploy from CI) cannot fetch the scripts.
4. **Put the secrets on the server**, as the deploy user, in `/srv/tectonic/env/` (mode 640, never in git; master copies
   in the team's password manager). Two scripts do the typing: `deploy/init-env.sh` creates the files from the templates,
   generates the two different session secrets and the staging password (printed once: save it), and never overwrites a file;
   `deploy/fill-secrets.sh` then asks for the values only you have, hidden as you type. What they produce, if you would
   rather do it by hand:
   - `production.env`, `staging.env`: from `deploy/env/*.env.example`. Use different `SESSION_SECRET`s.
   - `production.backup.env`, `staging.backup.env`: from `deploy/backup.env.example`, with **different `BACKUP_PREFIX`es**
     (`production`, `staging`). The R2 bucket and token are set up as described under "Backups and restoring".
   - `staging.basic-auth`: one line, a username, a space, then a bcrypt hash:
     `echo "team $(docker run --rm caddy:2 caddy hash-password --plaintext 'the-password')" > /srv/tectonic/env/staging.basic-auth`
5. **Start the shared front door:** `/srv/tectonic/deploy/deploy.sh edge`.
6. **Add the GitHub secrets** (Settings > Secrets and variables > Actions): `DEPLOY_HOST` (the address),
   `DEPLOY_USER` (`deploy`), `DEPLOY_SSH_KEY` (the contents of `deploy_key`), `DEPLOY_KNOWN_HOSTS` (the output of
   `ssh-keyscan -t ed25519 <address>`, run from a network you trust: the deploy refuses a host whose key differs), and
   `SENTRY_AUTH_TOKEN` (optional). The optional variables `STAGING_URL` and `PRODUCTION_URL` add a check from outside.
7. **DNS** (Mico controls it): `tectonic.bingo`, `www` and `staging` as A records to the server. Caddy obtains certificates
   on the first request once the names resolve. Until then a deploy warns that the public address is not answering yet
   (it cannot get a certificate), which is expected.
8. **Discord**: add `https://tectonic.bingo/auth/discord/callback` and `https://staging.tectonic.bingo/auth/discord/callback`
   under OAuth2 > Redirects, and change the `/terms` and `/privacy` URLs to the new domain.
9. **First deploy**: merge to `main` (or run the Deploy workflow for staging). Check `https://staging.tectonic.bingo/health`,
   log in with dev-login, and look at Sentry for the `staging` environment. Then run the workflow for production.
10. **Monitoring**: a Sentry uptime monitor on `https://tectonic.bingo/health` (one minute), and the dead-man's-switch
    check for the backups (see "Backups and restoring").

To restore staging with a copy of production's data (the rehearsal): `deploy/refresh-staging.sh`. Production is only read,
and it takes the same lock a deploy does, so it waits for one that is running (and a deploy waits for it).

**Things that cannot be checked before the box exists; look at them in the rehearsal:**

- Staging's password covers `/ws` too. Browsers reuse cached Basic credentials for a same-origin WebSocket upgrade, but confirm
  that live updates work on staging before assuming they do.
- After `refresh-staging.sh`, staging's Litestream resumes against a replica path holding the previous database's history. It
  should start a new generation; the drill exercises restore, not restore-then-resume, so watch `docker compose logs litestream`.
- The first deploy before DNS points at the box (Caddy has no certificate yet), and the first certificate itself.
- Screenshot analysis speed on the real CPUs (`docker compose -p tectonic-production logs ocr | grep recognized`).

### Looking after it

- **Logs**: `docker compose -p tectonic-production logs -f api-blue` (or `api-green`, `ocr`, `litestream`), and
  `docker logs` for Caddy. Each container's logs rotate at 20 MB x 5.
- **Which version is live**: `/srv/tectonic/deploy/deploy.sh production --status`.
- **Rebooting**: a kernel update needs one and none happens by itself. Do it in a quiet window (`sudo reboot`): everything
  restarts on its own (`restart: unless-stopped`), the live colour of each environment comes back and the idle one stays
  stopped. Blue/green does not cover a reboot, so expect about a minute of downtime.
- **Disk**: `docker system df` and `df -h`. Old image tags are pruned by each deploy; Caddy's certificates live in a named
  volume (`tectonic-edge_caddy_data`), which is not disposable.
- **Rebuilding the box from nothing**: repeat this section on a new server, then restore the data as described under
  "Restoring" (`deploy/restore.sh --into /srv/tectonic/data/production ...`) before the first deploy.

## Backups and restoring

What is backed up, where, and how fresh:

| Data | How | Where | How far behind, at worst |
| --- | --- | --- | --- |
| The database (`bingo.db`) | Litestream (`litestream` container) ships every change | Cloudflare R2, `<prefix>/db` | about a second |
| Uploads (screenshots, tile images, wiki icons) | `rclone copy` (`backup` container), on start and daily at 03:15 UTC | R2, `<prefix>/uploads` | up to a day. Uploads never change once written, and the copy never deletes; a file modified in the last 2 minutes waits for the next run (it might still be being written), and the `wiki-icons/*.miss` cache markers are not backed up |
| Everything on the box | Hetzner's own snapshot backups. **Optional, and off by default here** (about 20% of the server price) | Hetzner | up to a day; a second layer, not the plan |

Litestream keeps a full snapshot every day and every change for 30 days, so the database can be restored to **any moment
in the last 30 days**, not just to "latest". The bucket is a different provider from the server on purpose.

### One-time setup (for each environment)

1. In the Cloudflare dashboard create an R2 bucket (one bucket serves every environment). Create an **R2 API token
   limited to that bucket** with Object Read & Write: never a token for the whole account.
2. Copy `deploy/backup.env.example` and fill it in: the endpoint is `https://<account id>.r2.cloudflarestorage.com`, and
   `BACKUP_PREFIX` is `production` or `staging`. **Never let two environments share a prefix**: they would overwrite each
   other's history. Keep the master copy in the team's password manager; a rebuild needs it before anything else can be
   restored. Where the copy lives depends on what is using it: for the local overlay below (and the restore scripts) it is
   `deploy/backup.env`, which git ignores, or any path you name in `BACKUP_ENV_FILE`; on the server each environment has its
   own, outside the repository (`/srv/tectonic/env/<environment>.backup.env`, see "Setting up the server").
3. Make a check at healthchecks.io (or similar), put its URL in `BACKUP_PING_URL`, and have it alert by email if it
   isn't pinged for 36 hours. That is what turns "the backup stopped" from a surprise into an alert. The nightly run pings
   only if **both** halves are healthy: the uploads are copied and verified, **and** the database is still being replicated
   (the newest object Litestream put in the bucket is not older than the database's last change by more than
   `BACKUP_DB_MAX_LAG`, 10 minutes by default). A revoked token or a crashed `litestream` therefore stops the pings within a
   day, instead of leaving the database unprotected for weeks behind a green check.
4. Start the stack with the overlay, naming the backup settings you made in step 2:
   `BACKUP_ENV_FILE=./deploy/backup.env docker compose -f docker-compose.yml -f deploy/compose.backup.yml up -d`
   (the variable can be left out when the file is at that default path). It refuses to start without the backup env file,
   so a stack can't run unprotected without anyone noticing. (The production and staging stacks, `deploy/stack.yml`, run the
   same two services themselves, from each environment's own `<env>.backup.env`.)

### Checking that it is working

- `docker compose logs litestream` shows `snapshot complete` / `compaction complete` lines; `ERROR` lines are not normal.
  Litestream only writes when the database changes, so a quiet database legitimately has no new files.
- `docker compose logs backup` ends each run with `backup: complete` (and a line for the uploads and one for the database
  replica), and says when the next one is. A stopped replica shows as `database replication: FAILED`.
- The dead-man's-switch check from step 3 is the one that tells you when nobody is looking, for the uploads **and** the
  database.
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
  delete from) the bucket. Whoever owns the box can destroy the backups. Hetzner's snapshots would be a second layer
  for that reason, but they are optional and off here, so **R2 is the only copy**: turn on R2's bucket lock or versioning
  (worth doing before real players arrive), and repeat the real-bucket restore drill every few months.
- **The env files.** `/srv/tectonic/env/*` exist only on the server (they hold the secrets, so they are not in R2 or git).
  Their master copies belong in the team's password manager; without them a rebuild means re-collecting every key.
- **Uploads newer than the last nightly copy** (see above).
- **One bucket, one provider.** Cloudflare being unreachable at the moment of a disaster is a delay, not a loss, but it
  is a delay.

## Windows checkouts

`.gitattributes` keeps shell scripts and container files as LF so they run inside Linux containers. A checkout that
existed before that file landed keeps CRLF copies until it is normalised, and a CRLF `docker-entrypoint.sh` or
`smoke-test.sh` fails with `no such file or directory` or `$'\r': command not found`. Fix an existing clone once with
`git add --renormalize . && git checkout -- .` (commit or stash your work first); a fresh clone is fine.

## Migrations

Every deploy runs migrations against the **live** database while the previous version is still serving, so **a migration
must be additive**: new tables, new nullable or defaulted columns, new indexes. Dropping an index is fine (it can slow a
query but never breaks one).

A change that removes or renames something takes **two deploys**:

1. Add the new shape (a new column or table) and deploy. The code writes to both, or reads the new one with a fallback.
2. Move the data, and switch the code to the new shape only. Deploy.
3. In a later deploy, drop the old shape. Nothing running uses it any more.

Two more rules follow from how drizzle works: never edit a migration that is already on `main` (a database that ran it keeps
the old version, so fresh and live databases would drift apart), and generate migrations after merging `main`, because
drizzle applies them in the order of their journal timestamps and **silently skips** any dated earlier than one already
applied.

CI enforces all three (`server/scripts/checkMigrationSafety.ts`, run by `.github/workflows/migration-safety.yml` on every
pull request that touches `server/drizzle`): it fails a pull request whose new migrations contain `DROP TABLE`,
`DROP COLUMN` or a `RENAME`, that edits or removes an existing migration, or whose journal entry is not dated after the
existing ones. drizzle's own rebuild of a table (create new, copy, drop old, rename) counts as a drop and a rename, and
should be split the same way. If you have thought it through and it is safe (a table nothing has ever read, say), add the
**`allow-unsafe-migration`** label: the check then prints what it found and passes, and the reviewer is asked how the change
runs against the live database. Run it yourself before opening a pull request:
`cd server && npx tsx scripts/checkMigrationSafety.ts --base origin/main`.
