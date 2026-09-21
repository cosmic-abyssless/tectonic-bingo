#!/bin/sh
# The `backup` container's main process: runs the uploads backup once at start and then every day at BACKUP_AT (UTC,
# default 03:15). A failed run is logged and retried the next day; the container itself stays up.
set -u

at="${BACKUP_AT:-03:15}"

# A malformed time would make every `date -d` below fail and the loop spin without ever sleeping: refuse to start instead.
if ! date -u -d "$(date -u +%Y-%m-%d) $at:00" >/dev/null 2>&1; then
  echo "BACKUP_AT must be a time of day as HH:MM (UTC), not '$at'" >&2
  exit 1
fi

/deploy/backup-uploads.sh || echo "uploads backup failed (see above); will try again at $at UTC"

while true; do
  now=$(date -u +%s)
  next=$(date -u -d "$(date -u +%Y-%m-%d) $at:00" +%s)
  [ "$next" -le "$now" ] && next=$((next + 86400))
  echo "next uploads backup at $(date -u -d "@$next" '+%Y-%m-%d %H:%M:%S') UTC"
  sleep $((next - now))
  /deploy/backup-uploads.sh || echo "uploads backup failed (see above); will try again at $at UTC"
done
