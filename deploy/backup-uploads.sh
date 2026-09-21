#!/bin/sh
# Copies every uploaded file that isn't in the bucket yet, then checks that all of them are. Runs inside the rclone
# container (deploy/compose.backup.yml) with the uploads mounted read-only at /data/uploads.
#
# Uploads are write-once (a new file has a new name, see server/src/middleware/upload.ts), which is why a plain copy is
# enough and why the copy never deletes anything from the bucket: a file removed from the site stays in the backup.
# `--immutable` turns a changed file into an error instead of a silent overwrite of the good copy.
set -eu

. /deploy/rclone-env.sh

source_dir="${UPLOADS_DIR:-/data/uploads}"

ping() {
  # Never let a failing monitor fail (or hang) the backup itself.
  [ -n "${BACKUP_PING_URL:-}" ] && wget -q -T 10 -O /dev/null "$BACKUP_PING_URL$1" 2>/dev/null || true
}

started=$(date +%s)
echo "uploads backup: $source_dir -> $BACKUP_UPLOADS_REMOTE"

if rclone copy "$source_dir" "$BACKUP_UPLOADS_REMOTE" --immutable --transfers 8 --checkers 16 --stats-one-line -v \
  && rclone check "$source_dir" "$BACKUP_UPLOADS_REMOTE" --one-way --size-only --checkers 16; then
  echo "uploads backup: complete in $(($(date +%s) - started)) s"
  ping ""
else
  echo "uploads backup: FAILED" >&2
  ping "/fail"
  exit 1
fi
