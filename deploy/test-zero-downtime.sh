#!/usr/bin/env bash
# Proves the deploy really is zero-downtime, on this machine with nothing but Docker and Node 22+: runs the real
# deploy.sh, Caddy and containers, and judges a series of deploys by what a continuous stream of requests saw.
#
#   deploy/test-zero-downtime.sh [IMAGE]        IMAGE defaults to tectonic-bingo:local
#
# What it does, while a probe keeps requesting the site (deploy/zero-downtime-probe.js):
#   1. deploys the image (blue), then deploys it again under a new tag (green), then rolls back (blue);
#   2. tries a build whose api never becomes healthy, and one whose migration fails: each deploy must fail and leave
#      the live version serving and untouched;
#   3. checks two guards that protect production: it refuses an image staging is not running, and staging's password
#      protects everything except /health;
#   4. deploys with backups switched on, against a local S3 stand-in, and checks the deploy starts Litestream and the
#      backup service and that the backup's first run confirms the database is being replicated;
#   5. checks the behaviours that keep a deploy honest: the screenshot service gets its settings from the environment's
#      env file, a deploy whose new screenshot service will not start puts the previous one back, Caddy (not the state
#      file) decides which colour is live, the emergency path deploys an image staging has not run, and staging refuses to
#      go back to an older commit.
# It passes only if the probe saw zero failed requests throughout, both colours served traffic, and the live version
# after every step was the one expected. Also run in CI (.github/workflows/ci.yml).
set -euo pipefail
export MSYS_NO_PATHCONV=1

here="$(cd "$(dirname "$0")" && pwd)"
image="${1:-tectonic-bingo:local}"
port="${ZD_PORT:-18080}"
# CI runs the two halves as separate jobs, side by side: "probe" is the deploys under load, "guards" is the checks after
# them. Run with neither set (the default, "all"), it does both, as it always has.
part="${ZD_PART:-all}"
case "$part" in all|probe|guards) ;; *) echo "ZD_PART must be all, probe or guards" >&2; exit 2 ;; esac
native() { (cd "$1" && { pwd -W 2>/dev/null || pwd; }); }
here_n="$(native "$here")"
root="$(native "$(mktemp -d)")"
stop_file="$root/probe.stop"; result_file="$root/probe.json"
probe_pid=""
s3="tb-zd-s3-$$"; s3vol="tb-zd-s3-$$"; extra_tags=""

# The overrides a real deploy never sets: serve plain HTTP on a local port, no password, no backups (there is no bucket).
export TB_ROOT="$root" TB_HOSTS_OVERRIDE="http://localhost" TB_BASIC_AUTH_OVERRIDE=0 TB_BACKUP_OVERRIDE=0
export TB_HTTP_PORT="$port" TB_HTTPS_PORT="$((port + 1))" TB_VERIFY_URL="http://localhost:$port"

deploy() { bash "$here/deploy.sh" "$@"; }
step() { printf '\n== %s\n' "$*"; }
fail() { echo "ZERO-DOWNTIME TEST FAILED: $*" >&2; exit 1; }

cleanup() {
  [ -z "$probe_pid" ] || { touch "$stop_file"; kill "$probe_pid" 2>/dev/null || true; }
  # Removed by label rather than with `compose down`: down needs every variable the stack file requires, and a cleanup that
  # quietly does nothing leaves containers, networks and volumes behind.
  local project ids
  for project in tectonic-staging tectonic-production tectonic-edge; do
    ids="$(docker ps -aq --filter "label=com.docker.compose.project=$project")"
    if [ -n "$ids" ]; then docker rm -f $ids >/dev/null 2>&1 || true; fi
  done
  docker rm -f "$s3" >/dev/null 2>&1 || true
  for project in tectonic-staging tectonic-production tectonic-edge; do
    docker network rm "${project}_default" >/dev/null 2>&1 || true
  done
  docker network rm tectonic-edge >/dev/null 2>&1 || true
  docker volume rm -f "$s3vol" tectonic-edge_caddy_data tectonic-edge_caddy_config >/dev/null 2>&1 || true
  docker rmi tectonic-bingo:zd-a tectonic-bingo:zd-b tectonic-bingo:zd-unhealthy tectonic-bingo:zd-badmigration tectonic-bingo:zd-badocr $extra_tags >/dev/null 2>&1 || true
  # The containers created files here as uid 1000, which this script's user may not be allowed to delete.
  docker run --rm -v "$root:/r" alpine:3 rm -rf /r/data >/dev/null 2>&1 || true
  rm -rf "$root"
}
trap cleanup EXIT

service_id() { docker ps -q --filter "label=com.docker.compose.project=tectonic-staging" --filter "label=com.docker.compose.service=$1" | head -1; }
live_image() { deploy staging --status | sed -n 's/^live image: *//p'; }
live_colour() { deploy staging --status | sed -n 's/^live colour: *//p'; }
expect_live() { # image colour
  [ "$(live_image)" = "$1" ] || fail "expected $1 to be live, but it is $(live_image)"
  [ "$(live_colour)" = "$2" ] || fail "expected the $2 colour to be live, but it is $(live_colour)"
  echo "live: $1 ($2)"
}

step "Setting up a staging environment under $root"
# Both environments' directories are made up front: once the app's uid owns them, this script's own user cannot add more
# (which is how it runs on a Linux CI runner; on Docker Desktop the difference is invisible).
mkdir -p "$root/env" "$root/data/staging/sqlite" "$root/data/staging/uploads" "$root/data/production/sqlite" "$root/data/production/uploads"
cat >"$root/env/staging.env" <<EOF
NODE_ENV=development
DEV_LOGIN_ENABLED=true
SESSION_SECRET=zero-downtime-test
CLIENT_URL=http://localhost:$port
DISCORD_CLIENT_ID=test
DISCORD_CLIENT_SECRET=test
DISCORD_GUILD_ID=test
DISCORD_CALLBACK_URL=http://localhost:$port/auth/discord/callback
SENTRY_ENVIRONMENT=zero-downtime-test
PLAYER_STATS_FETCH_DISABLED=true
WOM_COMPETITION_SYNC_DISABLED=true
SENTRY_DSN=https://key@example.invalid/1
OCR_THREADS=1
LOG_LEVEL=info
EOF
# The app runs as uid 1000 and must own its data directories (deploy/bootstrap-box.sh does this on the real box).
docker run --rm -v "$root/data:/d" alpine:3 chown -R 1000:1000 /d

docker tag "$image" tectonic-bingo:zd-a
docker tag "$image" tectonic-bingo:zd-b
if [ "$part" != guards ]; then
# An image whose api dies at once (migrations pass), and one whose migration fails. Both keep the real image otherwise.
printf 'FROM %s\nENTRYPOINT ["sh","-c","if [ \\"$1\\" = migrate ]; then exit 0; fi; exit 1","--"]\n' "$image" | docker build -q -t tectonic-bingo:zd-unhealthy - >/dev/null
printf 'FROM %s\nENTRYPOINT ["sh","-c","if [ \\"$1\\" = migrate ]; then echo migration exploded >&2; exit 1; fi; exec docker-entrypoint.sh \\"$@\\"","--"]\n' "$image" | docker build -q -t tectonic-bingo:zd-badmigration - >/dev/null

# An image whose api is fine but whose screenshot service exits at once.
printf 'FROM %s\nENTRYPOINT ["sh","-c","if [ \\"$1\\" = ocr ]; then exit 1; fi; exec docker-entrypoint.sh \\"$@\\"","--"]\n' "$image" | docker build -q -t tectonic-bingo:zd-badocr - >/dev/null
fi

if [ "$part" = guards ]; then
  # The guards start from the state the probe half leaves staging in: the front door up and the first version live.
  step "Starting the front door and putting staging on the first version"
  deploy edge
  deploy staging tectonic-bingo:zd-a --skip-smoke
  expect_live tectonic-bingo:zd-a blue
else
step "Starting the front door and deploying the first version"
deploy edge
deploy staging tectonic-bingo:zd-a --skip-smoke
expect_live tectonic-bingo:zd-a blue
curl -fsS "http://localhost:$port/health" >/dev/null || fail "the site does not answer after the first deploy"
ocr_env="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$(service_id ocr)")"
grep -q '^SENTRY_DSN=https://key@example.invalid/1$' <<<"$ocr_env" || fail "the screenshot service did not receive SENTRY_DSN from the environment's env file"
grep -q '^OCR_THREADS=1$' <<<"$ocr_env" || fail "the screenshot service did not receive OCR_THREADS"
echo "the screenshot service received SENTRY_DSN and OCR_THREADS from the env file"

step "Starting the probe (a stand-in for users) and deploying under load"
node "$here_n/zero-downtime-probe.js" "http://localhost:$port" "$stop_file" "$result_file" &
probe_pid=$!
sleep 4

step "Deploy 2: a new version, blue -> green"
deploy staging tectonic-bingo:zd-b --drain 6
expect_live tectonic-bingo:zd-b green
sleep 3

step "A version whose api never becomes healthy must fail and change nothing"
if deploy staging tectonic-bingo:zd-unhealthy --skip-smoke; then fail "a deploy of a broken image succeeded"; fi
expect_live tectonic-bingo:zd-b green
curl -fsS "http://localhost:$port/health" >/dev/null || fail "the site stopped answering after a failed deploy"

step "A version whose migration fails must fail and change nothing"
if deploy staging tectonic-bingo:zd-badmigration --skip-smoke; then fail "a deploy with a failing migration succeeded"; fi
expect_live tectonic-bingo:zd-b green
sleep 3

step "A version whose screenshot service will not start must fail, and the previous service must be put back"
if deploy staging tectonic-bingo:zd-badocr --skip-smoke; then fail "a deploy whose screenshot service cannot start succeeded"; fi
expect_live tectonic-bingo:zd-b green
ocr_id="$(service_id ocr)"
[ -n "$ocr_id" ] || fail "there is no screenshot service running after the failed deploy"
[ "$(docker inspect -f '{{.Config.Image}}' "$ocr_id")" = tectonic-bingo:zd-b ] || fail "the screenshot service is on $(docker inspect -f '{{.Config.Image}}' "$ocr_id"), not the live version's image"
[ "$(docker inspect -f '{{.State.Health.Status}}' "$ocr_id")" = healthy ] || fail "the restored screenshot service is not healthy"
echo "the previous screenshot service is back and healthy"

step "Rolling back: green -> blue, to the previous version"
deploy staging --rollback --drain 6
expect_live tectonic-bingo:zd-a blue

step "Caddy, not the state file, decides which colour is live"
# Simulate a deploy killed at the wrong moment: the state file names the wrong colour.
sed -i "s/^LIVE_COLOR=.*/LIVE_COLOR='green'/" "$root/state/staging.state"
[ "$(live_colour)" = blue ] || fail "the state file said green and deploy.sh believed it, although Caddy routes to blue"
echo "state said green, Caddy routes to blue: deploy.sh trusts Caddy"
sleep 3

step "Stopping the probe and judging what the users saw"
touch "$stop_file"
wait "$probe_pid" || true
probe_pid=""
[ -f "$result_file" ] || fail "the probe left no result"
cat "$result_file"
node -e '
const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const colours = Object.keys(r.servedBy).filter((c) => c !== "unknown");
const problems = [];
if (r.requests < 200) problems.push(`only ${r.requests} requests were made: the probe did not run long enough to prove anything`);
if (r.failed > 0) problems.push(`${r.failed} of ${r.requests} requests failed`);
// A handful of connections reset in the instant Caddy swaps configuration is the keep-alive race that browsers absorb by
// retrying; a deploy that resets many is dropping traffic.
if (r.retried > 10) problems.push(`${r.retried} requests needed a retry after a connection reset: a deploy should not reset connections`);
if (!colours.includes("staging-blue") || !colours.includes("staging-green")) problems.push(`traffic was not served by both colours: ${JSON.stringify(r.servedBy)}`);
if (r.websocket.opened < 1) problems.push("the WebSocket never connected");
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log(`\n${r.requests} requests, 0 failed (${r.retried} retried once after a connection reset, as a browser would). Served by: ${JSON.stringify(r.servedBy)}. WebSocket: ${r.websocket.opened} connections, ${r.websocket.closed} closes (its clients reconnect on their own).`);
' "$result_file" || fail "users would have noticed"

fi

if [ "$part" != probe ]; then
# ---- guards that protect production, checked here because a real production deploy can't be rehearsed on a laptop ----

step "Production only accepts the image staging is running"
cp "$root/env/staging.env" "$root/env/production.env"
# Staging is running zd-a (after the rollback), so zd-b must be refused, before anything is started.
refusal="$(deploy production tectonic-bingo:zd-b 2>&1)" && fail "production accepted an image staging is not running"
grep -q "staging is running 'tectonic-bingo:zd-a'" <<<"$refusal" || fail "production refused, but not for the right reason: $refusal"
if docker ps -q --filter "label=com.docker.compose.project=tectonic-production" | grep -q .; then fail "the refused production deploy started containers"; fi
echo "refused: staging is running zd-a, not zd-b, and nothing was started"

step "Staging asks for a password everywhere except /health"
hash="$(docker run --rm caddy:2 caddy hash-password --plaintext zdpass | tr -d '\r\n')"
echo "zduser $hash" >"$root/env/staging.basic-auth"
TB_BASIC_AUTH_OVERRIDE=1 deploy staging tectonic-bingo:zd-b --skip-smoke --drain 2 >/dev/null
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
[ "$(code "http://localhost:$port/")" = 401 ] || fail "the page did not ask for a password"
[ "$(code "http://localhost:$port/health")" = 200 ] || fail "/health should stay open for uptime checks"
[ "$(code -u zduser:wrong "http://localhost:$port/")" = 401 ] || fail "a wrong password was accepted"
[ "$(code -u zduser:zdpass "http://localhost:$port/")" = 200 ] || fail "the right password was not accepted"
echo "/ asks for a password (401), /health is open (200), a wrong password is refused, the right one works"

step "An environment with backups starts Litestream and the backup service with the deploy"
docker volume create "$s3vol" >/dev/null
docker run --rm -v "$s3vol:/s3" rclone/rclone:1.75.1 mkdir /s3/zd-bucket >/dev/null 2>&1
docker run -d --name "$s3" --network tectonic-staging_default -v "$s3vol:/s3" rclone/rclone:1.75.1 serve s3 /s3 --auth-key zdkey,zdsecret --addr :9000 >/dev/null
cat >"$root/env/staging.backup.env" <<EOF
BACKUP_ENDPOINT=http://$s3:9000
BACKUP_BUCKET=zd-bucket
BACKUP_PREFIX=staging
BACKUP_ACCESS_KEY_ID=zdkey
BACKUP_SECRET_ACCESS_KEY=zdsecret
BACKUP_S3_PROVIDER=Other
BACKUP_START_DELAY=8
EOF
TB_BACKUP_OVERRIDE=1 deploy staging tectonic-bingo:zd-a --skip-smoke --drain 2 >/dev/null
[ -n "$(service_id litestream)" ] || fail "the deploy did not start Litestream"
[ -n "$(service_id backup)" ] || fail "the deploy did not start the backup service"
backup_log=""
for _ in $(seq 1 45); do
  backup_log="$(docker logs "$(service_id backup)" 2>&1 || true)"
  if grep -q "backup: complete" <<<"$backup_log"; then break; fi
  if grep -q "backup: FAILED" <<<"$backup_log"; then fail "the first backup run failed: $backup_log"; fi
  sleep 2
done
grep -q "backup: complete" <<<"$backup_log" || fail "the backup service never completed a run: $backup_log"
grep -q "database replication: current" <<<"$backup_log" || fail "the backup service did not confirm the database replica: $backup_log"
replica="$(docker run --rm --network tectonic-staging_default --env-file "$root/env/staging.backup.env" -v "$here_n:/deploy:ro" --entrypoint sh rclone/rclone:1.75.1 -c '. /deploy/rclone-env.sh && rclone lsf -R --files-only "$BACKUP_DB_REMOTE"')"
grep -q '\.ltx' <<<"$replica" || fail "Litestream has put nothing in the bucket"
echo "Litestream is replicating to the bucket and the backup service's first run confirmed it"

step "An emergency deploy to production of an image staging has not run"
# Staging runs zd-a now, so zd-b would normally be refused. The emergency flag lets it through, and the log says so. (A
# different address for this site, so it doesn't collide with staging's in the same Caddy.)
TB_HOSTS_OVERRIDE="http://127.0.0.1" TB_VERIFY_URL="http://127.0.0.1:$port" deploy production tectonic-bingo:zd-b --skip-staging-check --skip-smoke --drain 2 >/dev/null
[ "$(deploy production --status | sed -n 's/^live image: *//p')" = tectonic-bingo:zd-b ] || fail "the emergency deploy did not make zd-b live on production"
curl -sI "http://127.0.0.1:$port/health" | grep -qi '^x-served-by: production-blue' || fail "production is not being served by its own colour"
grep -q "staging check skipped" "$root/state/production.log" || fail "the emergency deploy was not marked in production's log"
echo "production runs an image staging had not run, and the log records that the check was skipped"

step "Staging does not go back to an older commit"
# Images are named after their commit; with the repository on the box, an ancestor of what staging runs is skipped.
git init -q "$root/repo"
commit() { git -C "$root/repo" -c user.name=t -c user.email=t@example.invalid -c commit.gpgsign=false commit -q --allow-empty -m "$1" && git -C "$root/repo" rev-parse HEAD; }
sha_a="$(commit older)"; sha_b="$(commit newer)"
extra_tags="tectonic-bingo:$sha_a tectonic-bingo:$sha_b"
docker tag tectonic-bingo:zd-a "tectonic-bingo:$sha_a"
docker tag tectonic-bingo:zd-a "tectonic-bingo:$sha_b"
deploy staging "tectonic-bingo:$sha_b" --skip-smoke --drain 2 >/dev/null
[ "$(live_image)" = "tectonic-bingo:$sha_b" ] || fail "the newer commit did not deploy"
skipped="$(deploy staging "tectonic-bingo:$sha_a" --skip-smoke 2>&1)" || fail "deploying an older commit should be a quiet skip, not a failure: $skipped"
grep -q "not going back to an older commit" <<<"$skipped" || fail "the older commit was not skipped: $skipped"
[ "$(live_image)" = "tectonic-bingo:$sha_b" ] || fail "staging went back to the older commit"
echo "the older commit's deploy was skipped and staging still runs the newer one"

fi

printf '\nZERO-DOWNTIME TEST PASSED\n'
