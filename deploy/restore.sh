#!/usr/bin/env bash
# Rebuilds the site's data from the backups: the database from Litestream's replica, the uploads from the bucket, then
# checks the database is one the app can start on. It needs only Docker and the backup env file, so it is the same
# command on a scratch machine, on a rebuilt server and in the automated drill.
#
#   deploy/restore.sh --into TARGET [options]
#
#   --into TARGET     where to put the data: a host directory (created if missing) or a Docker volume name.
#                     It ends up as TARGET/sqlite/bingo.db and TARGET/uploads, the layout the stack mounts.
#   --env-file FILE   backup settings (default deploy/backup.env; see deploy/backup.env.example)
#   --at TIMESTAMP    restore the database as it was at this moment (RFC 3339, e.g. 2026-09-21T14:30:00Z) instead of
#                     the latest state. The uploads are always the latest.
#   --image IMAGE     the app image, used to verify the restored database (default tectonic-bingo:local)
#   --network NAME    Docker network to run in (only the local drill needs this)
#   --no-uploads      restore the database only
#   --force           overwrite a database that is already at TARGET. Without it the script refuses, so pointing it at a
#                     live data directory by mistake cannot destroy anything.
#
# Exits non-zero unless the restored database passes verification.
set -euo pipefail

# Git Bash on Windows rewrites paths that look like /something into Windows paths, which breaks `docker run -v`.
export MSYS_NO_PATHCONV=1

here="$(cd "$(dirname "$0")" && pwd)"
target=""; env_file="$here/backup.env"; at=""; image="tectonic-bingo:local"; network=""; uploads=1; force=0

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-1}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --into) target="${2:?--into needs a value}"; shift 2 ;;
    --env-file) env_file="${2:?--env-file needs a value}"; shift 2 ;;
    --at) at="${2:?--at needs a value}"; shift 2 ;;
    --image) image="${2:?--image needs a value}"; shift 2 ;;
    --network) network="${2:?--network needs a value}"; shift 2 ;;
    --no-uploads) uploads=0; shift ;;
    --force) force=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "unknown option: $1" >&2; usage ;;
  esac
done
[ -n "$target" ] || { echo "--into is required" >&2; usage; }
[ -f "$env_file" ] || { echo "no backup settings at $env_file (copy deploy/backup.env.example and fill it in)" >&2; exit 1; }
command -v docker >/dev/null || { echo "docker is required" >&2; exit 1; }

# A path (contains a slash or starts with a dot) is a host directory; anything else is a Docker volume name.
case "$target" in
  # `pwd -W` gives Git Bash the Windows form of the path, which docker.exe needs (otherwise Docker Desktop quietly mounts a
  # directory inside its own VM and the host directory stays empty); elsewhere it fails and plain pwd is used.
  */*|.*) mkdir -p "$target"; target="$(cd "$target" && { pwd -W 2>/dev/null || pwd; })" ;;
esac

net_args=(); [ -z "$network" ] || net_args=(--network "$network")
mount="$target:/restore"

step() { printf '\n==> %s\n' "$*"; }

step "Preparing $target"
# A new directory or volume is owned by root; the app (and Litestream) run as uid 1000 and must own what is restored.
docker run --rm -v "$mount" alpine:3 sh -c '
  mkdir -p /restore/sqlite /restore/uploads
  if [ -e /restore/sqlite/bingo.db ] && [ "'"$force"'" != 1 ]; then
    echo "REFUSING: /restore/sqlite/bingo.db already exists. Restore into an empty place, or pass --force to overwrite it." >&2
    exit 3
  fi
  rm -f /restore/sqlite/bingo.db /restore/sqlite/bingo.db-wal /restore/sqlite/bingo.db-shm
  rm -rf /restore/sqlite/bingo.db-litestream
  chown -R 1000:1000 /restore
'

step "Restoring the database from the replica${at:+ as of $at}"
ls_args=(restore -config /etc/litestream.yml -o /restore/sqlite/bingo.db)
[ -z "$at" ] || ls_args+=(-timestamp "$at")
# The database path is the one in litestream.yml; that is how Litestream finds this environment's replica.
docker run --rm --user 1000:1000 ${net_args[@]+"${net_args[@]}"} --env-file "$env_file" -v "$mount" \
  -v "$here/litestream.yml:/etc/litestream.yml:ro" litestream/litestream:0.5.17 "${ls_args[@]}" /data/sqlite/bingo.db

if [ "$uploads" = 1 ]; then
  step "Restoring the uploads"
  docker run --rm --user 1000:1000 ${net_args[@]+"${net_args[@]}"} --env-file "$env_file" -v "$mount" -v "$here:/deploy:ro" \
    --entrypoint sh rclone/rclone:1.75.1 -c '. /deploy/rclone-env.sh && rclone copy "$BACKUP_UPLOADS_REMOTE" /restore/uploads --transfers 8 --stats-one-line -v'
fi

step "Verifying the restored database"
# The image's verify-db role opens the file read-only. It sees the data where the app would: /data/sqlite/bingo.db.
# (Not a read-only mount: SQLite needs to be able to create the WAL index next to a WAL-mode database, even to read it.)
docker run --rm -v "$target:/data" "$image" verify-db /data/sqlite/bingo.db

if [ "$uploads" = 1 ]; then
  files="$(docker run --rm -v "$mount:ro" alpine:3 sh -c 'find /restore/uploads -type f | wc -l')"
  echo "uploads restored: $(echo "$files" | tr -d '[:space:]') file(s)"
fi

step "Restore complete: $target"
echo "Start the stack against it by pointing DATA_DIR at that directory (or mounting that volume)."
