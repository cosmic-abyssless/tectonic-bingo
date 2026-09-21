#!/bin/sh
# Copies every uploaded file that isn't in the bucket yet, checks that all of them are, and checks that the database is still
# being replicated. Runs inside the rclone container (deploy/compose.backup.yml) with the uploads and the database directory
# mounted read-only at /data. Its success (or failure) is what the dead-man's-switch URL is told, so ONE alert covers both
# halves of the backup.
#
# Uploads: a new file has a new name and is never changed afterwards (server/src/middleware/upload.ts), which is why a plain
# copy is enough and why it never deletes anything from the bucket: a file removed from the site stays in the backup.
# Two guards make that assumption safe:
#   - `--min-age`: an upload is written straight to its final name, so a file still being written when this runs would be
#     copied truncated, and `--immutable` would then refuse to ever repair it. Anything modified in the last few minutes is
#     left for the next run.
#   - `--immutable` turns a changed file into an error instead of a silent overwrite of the good copy.
# `wiki-icons/*.miss` are empty "no icon found" markers the app rewrites in place every week; they are a cache, not data.
#
# Database: Litestream replicates continuously and writes only when something changes, so a quiet database legitimately has
# no new files. What is not acceptable is the database having changed while nothing newer reached the bucket. That is what
# a revoked token, a wrong endpoint or a crashed Litestream looks like, and it would otherwise go unnoticed for weeks.
set -eu

. /deploy/rclone-env.sh

source_dir="${UPLOADS_DIR:-/data/uploads}"
db_path="${DB_PATH:-/data/sqlite/bingo.db}"
min_age="${BACKUP_MIN_AGE:-2m}"
max_lag="${BACKUP_DB_MAX_LAG:-600}"

ping() {
  # Never let a failing monitor fail (or hang) the backup itself.
  [ -n "${BACKUP_PING_URL:-}" ] && wget -q -T 10 -O /dev/null "$BACKUP_PING_URL$1" 2>/dev/null || true
}

# Succeeds if the database has not changed since (within max_lag seconds of) the newest object Litestream put in the bucket.
database_replicated() {
  if [ ! -f "$db_path" ]; then
    echo "database replication: no database file yet, nothing to check"
    return 0
  fi
  changed="$(stat -c %Y "$db_path")"
  if [ -f "$db_path-wal" ]; then
    wal="$(stat -c %Y "$db_path-wal")"
    [ "$wal" -le "$changed" ] || changed="$wal"
  fi
  newest="$(rclone lsf -R --files-only --format t "$BACKUP_DB_REMOTE" 2>/dev/null | sort | tail -1)"
  if [ -z "$newest" ]; then
    echo "database replication: FAILED. The database exists but nothing is in $BACKUP_DB_REMOTE: Litestream is not replicating (check its container, the bucket and the credentials)." >&2
    return 1
  fi
  replicated="$(date -u -d "$newest" +%s)"
  lag=$((changed - replicated))
  if [ "$lag" -gt "$max_lag" ]; then
    echo "database replication: FAILED. The database last changed at $(date -u -d "@$changed" '+%Y-%m-%d %H:%M:%S') UTC but the newest object in the bucket is from $newest (${lag}s earlier). Litestream has stopped replicating: check its container and the credentials." >&2
    return 1
  fi
  echo "database replication: current (newest replica object $newest, database last changed $(date -u -d "@$changed" '+%H:%M:%S'))"
}

started="$(date +%s)"
echo "uploads backup: $source_dir -> $BACKUP_UPLOADS_REMOTE (files newer than $min_age wait for the next run)"

ok=1
rclone copy "$source_dir" "$BACKUP_UPLOADS_REMOTE" --immutable --min-age "$min_age" --exclude 'wiki-icons/*.miss' \
  --transfers 8 --checkers 16 --stats-one-line -v || ok=0
if [ "$ok" = 1 ]; then
  rclone check "$source_dir" "$BACKUP_UPLOADS_REMOTE" --one-way --size-only --min-age "$min_age" --exclude 'wiki-icons/*.miss' --checkers 16 || ok=0
fi
[ "$ok" = 1 ] || echo "uploads backup: FAILED" >&2
database_replicated || ok=0

if [ "$ok" = 1 ]; then
  echo "backup: complete in $(($(date +%s) - started)) s"
  ping ""
else
  echo "backup: FAILED" >&2
  ping "/fail"
  exit 1
fi
