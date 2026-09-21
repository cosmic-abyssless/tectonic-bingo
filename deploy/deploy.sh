#!/usr/bin/env bash
# Deploys one environment on the box without dropping a request, and rolls it back the same way.
#
#   deploy.sh ENV IMAGE [options]     deploy IMAGE (e.g. tectonic-bingo:<commit>) to ENV (production or staging)
#   deploy.sh ENV --rollback          deploy the previous image again
#   deploy.sh ENV --status            what is live, and since when
#   deploy.sh edge                    (re)start Caddy, the shared front door
#
#   --skip-smoke          don't boot the image on an empty database first (a rollback never does)
#   --drain SECONDS       how long the old colour keeps running after traffic moves (default 10)
#   --skip-staging-check  production only: deploy an image staging is not running (an emergency, and it is logged)
#   --force               redeploy even if IMAGE is already live
#
# How it works (docs/zero-downtime-deploy-plan.md, "The deploy, step by step"):
#   1. optionally boot the new image on an empty database and check it serves (deploy/smoke-test.sh);
#   2. apply the new image's migrations to the LIVE database while the old colour still serves. They must be additive;
#   3. start the other colour (blue/green) with the new image and wait until it is healthy;
#   4. update the environment's screenshot service and backup services;
#   5. point Caddy at the new colour (a graceful reload) and check the site answers from it;
#   6. after a drain period, stop the old colour. It is kept, stopped, so the previous version is one command away.
# Anything that fails before step 5 leaves the old colour serving, untouched. A failed check in step 5 switches back.
#
# Everything lives under TB_ROOT (default /srv/tectonic): env/ (secrets), data/, caddy/sites/, state/. The environment's
# own settings are in deploy/environments/ENV.conf. Run as the deploy user, from the deploy/ directory of the commit
# being deployed (CI syncs it there first).
set -euo pipefail

# Git Bash on Windows (the local test) rewrites paths that look like /something, which breaks `docker` arguments.
export MSYS_NO_PATHCONV=1

here="$(cd "$(dirname "$0")" && pwd)"
# `pwd -W` gives Git Bash the Windows form of a path, which docker.exe needs; elsewhere it fails and plain pwd is used.
native() { (cd "$1" && { pwd -W 2>/dev/null || pwd; }); }
here_n="$(native "$here")"

say() { printf '%s  %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() { printf 'DEPLOY FAILED: %s\n' "$*" >&2; exit 1; }

usage() { sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-1}"; }

# ---- arguments ---------------------------------------------------------------------------------------------------
[ $# -ge 1 ] || usage
env="$1"; shift
image=""; action="deploy"; skip_smoke=0; drain=10; skip_staging_check=0; force=0
while [ $# -gt 0 ]; do
  case "$1" in
    --rollback) action="rollback"; shift ;;
    --status) action="status"; shift ;;
    --skip-smoke) skip_smoke=1; shift ;;
    --drain) drain="${2:?--drain needs a value}"; shift 2 ;;
    --skip-staging-check) skip_staging_check=1; shift ;;
    --force) force=1; shift ;;
    -h|--help) usage 0 ;;
    -*) die "unknown option: $1" ;;
    *) [ -z "$image" ] || die "more than one image given"; image="$1"; shift ;;
  esac
done

root_raw="${TB_ROOT:-/srv/tectonic}"
mkdir -p "$root_raw"
root="$(native "$root_raw")"

# ---- the shared front door ---------------------------------------------------------------------------------------
edge_compose() {
  TB_ROOT="$root" docker compose -p tectonic-edge --project-directory "$here_n" -f "$here_n/edge.yml" "$@"
}

if [ "$env" = edge ]; then
  mkdir -p "$root/caddy/sites"
  say "starting the shared front door (Caddy)"
  edge_compose up -d
  edge_compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 && say "Caddy is up and its config is valid"
  exit 0
fi

case "$env" in production|staging) ;; *) die "the environment must be production or staging (or 'edge')" ;; esac
[ -f "$here/environments/$env.conf" ] || die "no settings for $env (deploy/environments/$env.conf)"
# shellcheck source=/dev/null
. "$here/environments/$env.conf"
# The local test overrides these; a real deploy never sets them.
TB_HOSTS="${TB_HOSTS_OVERRIDE:-$TB_HOSTS}"
TB_BACKUP="${TB_BACKUP_OVERRIDE:-${TB_BACKUP:-1}}"
TB_BASIC_AUTH="${TB_BASIC_AUTH_OVERRIDE:-${TB_BASIC_AUTH:-0}}"

state_dir="$root/state"
state_file="$state_dir/$env.state"
env_file="$root/env/$env.env"
backup_env_file="$root/env/$env.backup.env"
auth_file="$root/env/$env.basic-auth"
data_dir="$root/data/$env"
sites_dir="$root/caddy/sites"
mkdir -p "$state_dir" "$sites_dir"

LIVE_COLOR=""; LIVE_IMAGE=""; PREVIOUS_IMAGE=""; BLUE_IMAGE=""; GREEN_IMAGE=""; DEPLOYED_AT=""
# shellcheck source=/dev/null
[ ! -f "$state_file" ] || . "$state_file"

other_color() { if [ "$1" = blue ]; then echo green; else echo blue; fi; }

save_state() {
  cat >"$state_file.tmp" <<EOF
LIVE_COLOR='$LIVE_COLOR'
LIVE_IMAGE='$LIVE_IMAGE'
PREVIOUS_IMAGE='$PREVIOUS_IMAGE'
BLUE_IMAGE='$BLUE_IMAGE'
GREEN_IMAGE='$GREEN_IMAGE'
DEPLOYED_AT='$DEPLOYED_AT'
EOF
  mv "$state_file.tmp" "$state_file"
}

if [ "$action" = status ]; then
  echo "environment:  $env"
  echo "live colour:  ${LIVE_COLOR:-none yet}"
  echo "live image:   ${LIVE_IMAGE:-none yet}"
  echo "previous:     ${PREVIOUS_IMAGE:-none}"
  echo "deployed at:  ${DEPLOYED_AT:-never}"
  echo "hosts:        $TB_HOSTS"
  [ ! -f "$state_dir/$env.log" ] || { echo "recent:"; tail -5 "$state_dir/$env.log" | sed 's/^/  /'; }
  exit 0
fi

# ---- one deploy at a time ----------------------------------------------------------------------------------------
lock="$state_dir/$env.lock"
if ! mkdir "$lock" 2>/dev/null; then
  holder="$(cat "$lock/pid" 2>/dev/null || true)"
  if [ -n "$holder" ] && kill -0 "$holder" 2>/dev/null; then die "another deploy of $env is running (pid $holder)"; fi
  say "removing a stale lock left by a deploy that died"
  rm -rf "$lock"; mkdir "$lock"
fi
echo $$ >"$lock/pid"
trap 'rm -rf "$lock"' EXIT

# ---- compose plumbing --------------------------------------------------------------------------------------------
export TB_ENV="$env" TB_ROOT="$root" TB_DATA_DIR="$data_dir" TB_ENV_FILE="$env_file" TB_BACKUP_ENV_FILE="$backup_env_file"
export TB_OCR_CPUS TB_OCR_MEMORY TB_OCR_CONCURRENCY
export TB_IMAGE_BLUE="${BLUE_IMAGE:-tectonic-bingo:unset}" TB_IMAGE_GREEN="${GREEN_IMAGE:-tectonic-bingo:unset}"

profiles=(); [ "$TB_BACKUP" != 1 ] || profiles+=(--profile backup)
compose() { docker compose -p "tectonic-$env" --project-directory "$here_n" -f "$here_n/stack.yml" ${profiles[@]+"${profiles[@]}"} "$@"; }
caddy_exec() { edge_compose exec -T caddy "$@"; }

# Waits for a service to report healthy. Returns 1 if it exits, is caught in a restart loop (Docker keeps restarting a
# crashing container, which would otherwise look like "starting" until the time runs out), or the time runs out.
wait_healthy() {
  local service="$1" timeout="$2" id status restarts waited=0
  id="$(compose ps -q "$service" | head -1)"
  [ -n "$id" ] || return 1
  while [ "$waited" -lt "$timeout" ]; do
    status="$(docker inspect -f '{{if .State.Running}}{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}{{else}}exited{{end}}' "$id" 2>/dev/null || echo missing)"
    restarts="$(docker inspect -f '{{.RestartCount}}' "$id" 2>/dev/null || echo 0)"
    case "$status" in healthy) return 0 ;; exited|missing) return 1 ;; esac
    [ "$restarts" -lt 2 ] || return 1
    sleep 2; waited=$((waited + 2))
  done
  return 1
}

show_logs() { compose logs --no-color --tail 40 "$1" 2>&1 | sed 's/^/    /' >&2 || true; }

# ---- the Caddy site for this environment -------------------------------------------------------------------------
write_site() { # colour destination
  local colour="$1" dest="$2" addresses="" auth=""
  local host; for host in $TB_HOSTS; do addresses="${addresses:+$addresses, }$host"; done
  if [ "$TB_BASIC_AUTH" = 1 ]; then
    [ -f "$auth_file" ] || die "$env asks for a password but $auth_file is missing (one line: username, a space, a bcrypt hash from 'caddy hash-password')"
    local user hash; read -r user hash <"$auth_file"
    [ -n "$user" ] && [ -n "$hash" ] || die "$auth_file must contain a username and a bcrypt hash"
    auth="	@protected not path /health
	basic_auth @protected {
		$user $hash
	}
"
  fi
  cat >"$dest" <<EOF
# Generated by deploy/deploy.sh: do not edit. $env is served by the ${colour} colour.
$addresses {
	header X-Served-By ${env}-${colour}
${auth}	reverse_proxy ${env}-${colour}:8080 {
		health_uri /health
		health_interval 5s
	}
}
EOF
}

# Points Caddy at a colour: writes the snippet, validates the whole config and reloads it gracefully. On any failure the
# previous snippet is put back and the reload is not applied.
point_caddy_at() {
  local colour="$1" site="$sites_dir/$env.caddy" prev="$sites_dir/$env.caddy.prev" new="$sites_dir/$env.caddy.new"
  write_site "$colour" "$new"
  if [ -f "$site" ]; then cp "$site" "$prev"; else rm -f "$prev"; fi
  mv "$new" "$site"
  if caddy_exec caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 && caddy_exec caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
    return 0
  fi
  if [ -f "$prev" ]; then mv "$prev" "$site"; else rm -f "$site"; fi
  return 1
}

# Whether the site's public address answers /health from the given colour (Caddy names the colour in X-Served-By).
public_serves() {
  # TB_VERIFY_URL is for the local test only, where the site's published port differs from the address Caddy serves.
  local colour="$1" host="${TB_VERIFY_URL:+_override}" response
  host="${host:-${TB_HOSTS%% *}}"
  for _ in $(seq 1 15); do
    case "$host" in
      _override) response="$(curl -sk -D - -o /dev/null --max-time 5 "$TB_VERIFY_URL/health" 2>/dev/null || true)" ;;
      http://*|https://*) response="$(curl -sk -D - -o /dev/null --max-time 5 "$host/health" 2>/dev/null || true)" ;;
      *) response="$(curl -sk -D - -o /dev/null --max-time 5 --resolve "$host:${TB_HTTPS_PORT:-443}:127.0.0.1" "https://$host:${TB_HTTPS_PORT:-443}/health" 2>/dev/null || true)" ;;
    esac
    if grep -qi "^x-served-by: ${env}-${colour}" <<<"$response" && grep -q ' 200' <<<"$response"; then return 0; fi
    sleep 1
  done
  return 1
}

# ---- deploy ------------------------------------------------------------------------------------------------------
if [ "$action" = rollback ]; then
  [ -n "$PREVIOUS_IMAGE" ] || die "there is no previous image recorded for $env, so there is nothing to roll back to"
  image="$PREVIOUS_IMAGE"; skip_smoke=1; skip_staging_check=1; force=1
  say "rolling $env back to $image"
fi
[ -n "$image" ] || die "which image? (deploy.sh $env IMAGE, or --rollback)"

docker image inspect "$image" >/dev/null 2>&1 || die "$image is not on this machine (CI loads it before calling this; or build it here)"
[ -f "$env_file" ] || die "missing $env_file (see deploy/env/$env.env.example)"
[ -d "$data_dir/sqlite" ] && [ -d "$data_dir/uploads" ] || die "missing $data_dir/sqlite and $data_dir/uploads (deploy/bootstrap-box.sh creates them)"
if [ "$TB_BACKUP" = 1 ]; then
  [ -f "$backup_env_file" ] || die "$env is set to be backed up but $backup_env_file is missing (see deploy/backup.env.example). Backups are not optional for production."
fi
docker network inspect tectonic-edge >/dev/null 2>&1 || die "the front door is not running: run 'deploy.sh edge' first"

if [ "$LIVE_IMAGE" = "$image" ] && [ "$force" != 1 ]; then
  say "$image is already live on $env (${LIVE_COLOR}); nothing to do (--force to redeploy)"
  exit 0
fi

if [ "$env" = production ] && [ "$skip_staging_check" != 1 ]; then
  # Read in a subshell so staging's state doesn't overwrite this environment's.
  staging_image="$( [ ! -f "$state_dir/staging.state" ] || { . "$state_dir/staging.state"; echo "$LIVE_IMAGE"; } )"
  [ "$staging_image" = "$image" ] || die "staging is running '${staging_image:-nothing}', not $image. Production only gets what staging has already run: deploy it to staging first (or --skip-staging-check in an emergency)."
fi

old_color="$LIVE_COLOR"
if [ -n "$old_color" ]; then target="$(other_color "$old_color")"; else target="blue"; fi
say "deploying $image to $env: ${old_color:-nothing live} -> $target"

if [ "$skip_smoke" != 1 ]; then
  say "1/6 booting $image on an empty database to check it serves"
  if ! smoke_output="$(bash "$here/smoke-test.sh" "$image" 2>&1)"; then
    printf '%s
' "$smoke_output" >&2
    die "the smoke test failed; $env is unchanged"
  fi
fi

export TB_IMAGE_NEW="$image" TB_IMAGE_OCR="$image"

say "2/6 applying migrations to the live database (the old colour keeps serving)"
compose --profile tools run --rm --no-deps -T migrate || die "the migration failed; $env is unchanged (the old colour is still serving)"

say "3/6 starting $target on $image"
if [ "$target" = blue ]; then export TB_IMAGE_BLUE="$image"; else export TB_IMAGE_GREEN="$image"; fi
compose up -d --no-deps --force-recreate "api-$target" >/dev/null
if ! wait_healthy "api-$target" 120; then
  show_logs "api-$target"
  compose stop -t 5 "api-$target" >/dev/null 2>&1 || true
  die "$target never became healthy; $env is unchanged (${old_color:-nothing} is still serving)"
fi

if [ "$TB_BACKUP" = 1 ]; then say "4/6 updating the screenshot service and the backup services"; else say "4/6 updating the screenshot service"; fi
compose up -d --no-deps ocr >/dev/null
wait_healthy ocr 90 || { show_logs ocr; compose stop -t 5 "api-$target" >/dev/null 2>&1 || true; die "the screenshot service did not become healthy; $env is unchanged"; }
if [ "$TB_BACKUP" = 1 ]; then compose up -d --no-deps litestream backup >/dev/null; fi

say "5/6 pointing Caddy at $target"
if ! point_caddy_at "$target"; then
  compose stop -t 5 "api-$target" >/dev/null 2>&1 || true
  die "Caddy rejected the new configuration and was left as it was; $env is unchanged"
fi
if ! public_serves "$target"; then
  if [ -n "$old_color" ]; then
    say "the public address is not answering from $target: switching back to $old_color"
    point_caddy_at "$old_color" || say "WARNING: could not switch Caddy back; check it by hand"
    compose stop -t 5 "api-$target" >/dev/null 2>&1 || true
    show_logs "api-$target"
    die "$target did not serve through Caddy; switched back to $old_color"
  fi
  say "WARNING: the public address is not answering yet. That is expected before DNS points here (Caddy cannot get its certificate yet); check https://${TB_HOSTS%% *}/health once it does."
fi

if [ -n "$old_color" ]; then
  say "6/6 draining $old_color for ${drain}s, then stopping it (kept, stopped, for a quick rollback)"
  sleep "$drain"
  compose stop -t 20 "api-$old_color" >/dev/null 2>&1 || true
else
  say "6/6 first deploy: there is no old colour to stop"
fi

PREVIOUS_IMAGE="$LIVE_IMAGE"
LIVE_IMAGE="$image"; LIVE_COLOR="$target"; DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
if [ "$target" = blue ]; then BLUE_IMAGE="$image"; else GREEN_IMAGE="$image"; fi
save_state
note=""; if [ "$action" = deploy ] && [ "$skip_staging_check" = 1 ]; then note="  (staging check skipped)"; fi
printf '%s  %s  %s  %s -> %s%s
' "$DEPLOYED_AT" "$action" "$image" "${old_color:-none}" "$target" "$note" >>"$state_dir/$env.log"

# Keep the disk from filling with old builds: everything a state file still refers to, plus the newest few, stays.
keep="$(cat "$state_dir"/*.state 2>/dev/null | sed -n "s/^\(LIVE_IMAGE\|PREVIOUS_IMAGE\|BLUE_IMAGE\|GREEN_IMAGE\)='\(.*\)'$/\2/p" | sort -u)"
docker image ls tectonic-bingo --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | tail -n +8 | while read -r old; do
  grep -qxF "$old" <<<"$keep" || docker rmi "$old" >/dev/null 2>&1 || true
done
docker image prune -f >/dev/null 2>&1 || true

say "done: $env is live on $image (${target}); previous image kept for --rollback: ${PREVIOUS_IMAGE:-none}"
