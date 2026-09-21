#!/usr/bin/env bash
# Replaces staging's data with a copy of production's, restored from production's backups, so staging can be tried out on
# realistic data (the rehearsal before a cutover, or reproducing a production bug). Run on the box as the deploy user.
#
#   deploy/refresh-staging.sh [--at TIMESTAMP] [--yes]
#
#   --at TIMESTAMP   production's database as of a moment (RFC 3339, e.g. 2026-09-21T14:30:00Z) instead of the latest
#   --yes            don't ask for confirmation
#
# It stops staging's api and backup services, restores production's database and uploads over staging's data (the same
# deploy/restore.sh that proves the backups work), verifies the result, and starts back whatever was running. Production is
# only ever READ: nothing here writes to its data or to its backups. Staging's own sessions become unusable (a different
# SESSION_SECRET signs them), and staging's own backups start a new history from the restored database.
#
# Staging then holds real players' details. It is protected by Caddy's shared password, and dev-login lets anyone who passes
# it act as any account, so keep that password to the people who already administer the site, and do not hand staging
# to anyone else while it holds a production copy.
set -euo pipefail
export MSYS_NO_PATHCONV=1

here="$(cd "$(dirname "$0")" && pwd)"
root="${TB_ROOT:-/srv/tectonic}"
at=""; yes=0
while [ $# -gt 0 ]; do
  case "$1" in
    --at) at="${2:?--at needs a value}"; shift 2 ;;
    --yes) yes=1; shift ;;
    -h|--help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

say() { printf '\n==> %s\n' "$*"; }
die() { printf 'REFRESH FAILED: %s\n' "$*" >&2; exit 1; }

production_backup="$root/env/production.backup.env"
[ -f "$production_backup" ] || die "no $production_backup: production's backup settings are needed to read its backups"
state="$root/state/staging.state"
[ -f "$state" ] || die "staging has never been deployed (no $state)"
# shellcheck source=/dev/null
. "$state"
[ -n "${LIVE_IMAGE:-}" ] || die "staging has no live image recorded"

if [ "$yes" != 1 ]; then
  printf 'This REPLACES staging'"'"'s database and adds production'"'"'s uploads to it.\nProduction is only read. Continue? [y/N] '
  read -r answer
  [ "$answer" = y ] || [ "$answer" = Y ] || { echo "cancelled"; exit 1; }
fi

# The staging containers that are running now, so exactly those are started again at the end (the idle colour stays idle).
services=(api-blue api-green litestream backup)
running=()
for service in "${services[@]}"; do
  id="$(docker ps -q --filter "label=com.docker.compose.project=tectonic-staging" --filter "label=com.docker.compose.service=$service")"
  [ -z "$id" ] || running+=("$id")
done

say "Stopping staging's application and backup services"
[ "${#running[@]}" -eq 0 ] || docker stop -t 30 "${running[@]}" >/dev/null

# Whatever happens next, staging must not be left stopped.
restart() {
  if [ "${#running[@]}" -gt 0 ]; then say "Starting staging again"; docker start "${running[@]}" >/dev/null; fi
}
trap restart EXIT

restore_args=(--into "$root/data/staging" --env-file "$production_backup" --image "$LIVE_IMAGE" --force)
[ -z "$at" ] || restore_args+=(--at "$at")
"$here/restore.sh" "${restore_args[@]}"

say "Staging now holds a copy of production${at:+ as of $at}"
