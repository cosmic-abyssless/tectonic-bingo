#!/usr/bin/env bash
# The restore drill, run on this machine with nothing but Docker: proves the backups are real by destroying the data and
# getting it back. Not a unit test of the scripts: it runs the same containers, config and commands production uses, with
# a local S3-compatible server standing in for the bucket.
#
#   deploy/restore-drill.sh [IMAGE]        IMAGE defaults to tectonic-bingo:local
#
# What it does:
#   1. seeds a database with the real schema and starts Litestream on it;
#   2. writes rows while Litestream replicates them, puts files in the uploads directory and backs them up (checking that a
#      file still being written and the .miss cache markers are left out), and that the backup FAILS when Litestream has
#      stopped and the database has changed;
#   3. destroys the data, restores everything from the "bucket" with deploy/restore.sh, and checks that the database
#      passes verification, holds every row that was written, and that every upload is byte-identical;
#   4. restores the database again as of a moment in the middle of the writes and checks it holds exactly what existed then.
#
# CI runs it on every pull request, as a step of the `image` job in .github/workflows/ci.yml. Repeat the same against the real bucket every few
# months, into a scratch directory, as described in deploy/README.md: the drill proves the tooling, that one proves the
# bucket and the credentials.
set -euo pipefail
export MSYS_NO_PATHCONV=1

here="$(cd "$(dirname "$0")" && pwd)"
image="${1:-tectonic-bingo:local}"
id="$$"
net="tb-drill-$id"; s3="tb-drill-s3-$id"; ls_name="tb-drill-ls-$id"
v_s3="tb-drill-s3data-$id"; v_src="tb-drill-src-$id"; v_full="tb-drill-full-$id"; v_pit="tb-drill-pit-$id"
# `pwd -W` gives Git Bash the Windows form of the path, which is what docker.exe needs; elsewhere it fails and plain pwd is used.
tmp="$(cd "$(mktemp -d)" && { pwd -W 2>/dev/null || pwd; })"; env_file="$tmp/backup.env"

cleanup() {
  docker rm -f "$s3" "$ls_name" >/dev/null 2>&1 || true
  docker volume rm -f "$v_s3" "$v_src" "$v_full" "$v_pit" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

step() { printf '\n== %s\n' "$*"; }
fail() {
  echo "RESTORE DRILL FAILED: $*" >&2
  if docker inspect "$ls_name" >/dev/null 2>&1; then docker logs "$ls_name" >"$tmp/litestream.log" 2>&1 || true; fi
  if [ -s "$tmp/litestream.log" ]; then echo "--- litestream log:" >&2; tail -20 "$tmp/litestream.log" >&2; fi
  exit 1
}
# The value of one table's row count from a verify-db report (pretty-printed JSON, so one `"name": N` per line).
rows() { sed -n "s/.*\"$2\": \([0-9][0-9]*\).*/\1/p" <<<"$1" | head -1; }
# One checksum over every file's path and content, for comparing two upload directories.
upload_hash() { docker run --rm -v "$1:/x:ro" alpine:3 sh -c 'cd /x/uploads && find . -type f ! -name "*.miss" | sort | xargs sha256sum | sha256sum'; }

step "Setting up a local bucket"
docker network create "$net" >/dev/null
docker volume create "$v_s3" >/dev/null; docker volume create "$v_src" >/dev/null
docker run --rm -v "$v_s3:/s3" rclone/rclone:1.75.1 mkdir /s3/drill-bucket >/dev/null 2>&1
cat >"$env_file" <<EOF
BACKUP_ENDPOINT=http://$s3:9000
BACKUP_BUCKET=drill-bucket
BACKUP_PREFIX=drill
BACKUP_ACCESS_KEY_ID=drillkey
BACKUP_SECRET_ACCESS_KEY=drillsecret
BACKUP_S3_PROVIDER=Other
EOF
docker run -d --name "$s3" --network "$net" -v "$v_s3:/s3" rclone/rclone:1.75.1 serve s3 /s3 --auth-key drillkey,drillsecret --addr :9000 >/dev/null
ready=0
for _ in $(seq 1 30); do
  if docker run --rm --network "$net" --env-file "$env_file" -v "$here:/deploy:ro" --entrypoint sh rclone/rclone:1.75.1 -c '. /deploy/rclone-env.sh && rclone lsd backup:' >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ "$ready" = 1 ] || fail "the local bucket never came up"

step "Seeding a database with the real schema and starting Litestream"
docker run --rm -v "$v_src:/data" "$image" migrate >/dev/null
docker run -d --name "$ls_name" --user 1000:1000 --network "$net" --env-file "$env_file" -v "$v_src:/data" \
  -v "$here/litestream.yml:/etc/litestream.yml:ro" litestream/litestream:0.5.17 replicate -config /etc/litestream.yml >/dev/null
sleep 2

writer() { docker run --rm -v "$v_src:/data" -v "$here:/deploy:ro" -e NODE_PATH=/app/node_modules --entrypoint node "$image" /deploy/drill-writer.js "$@"; }

step "Writing while Litestream replicates"
first="$(writer 40 100 30)"
echo "rows after the first burst: $first"
sleep 3
# The clock that matters is the one Litestream stamps its files with, which is the containers', not this machine's.
midpoint="$(docker run --rm alpine:3 date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "midpoint: $midpoint"
sleep 2
writer 20 100 30 >/dev/null
sleep 3

step "Putting files in the uploads directory and backing them up"
# Files are aged so the backup's --min-age (which leaves anything modified in the last two minutes for the next run) treats
# them as finished, except one that is deliberately still "being written". A .miss marker is a cache the backup skips.
docker run --rm -v "$v_src:/data" --entrypoint sh "$image" -c '
  mkdir -p /data/uploads/wiki-icons
  for i in $(seq 1 25); do head -c $((10000 + i * 7919)) /dev/urandom > "/data/uploads/17718780324$i-drill$i.png"; done
  for i in 1 2 3; do head -c 900 /dev/urandom > "/data/uploads/wiki-icons/icon$i.png"; done
  : > /data/uploads/wiki-icons/unknown-item.miss
  find /data/uploads -type f -exec touch -d "10 minutes ago" {} +
  head -c 4000 /dev/urandom > /data/uploads/1771878032499-still-being-written.png'
backup() { docker run --rm --network "$net" --env-file "$env_file" -e BACKUP_DB_MAX_LAG="${1:-10}" -v "$v_src:/data:ro" -v "$here:/deploy:ro" --entrypoint sh rclone/rclone:1.75.1 /deploy/backup-uploads.sh; }
bucket_files() { docker run --rm --network "$net" --env-file "$env_file" -v "$here:/deploy:ro" --entrypoint sh rclone/rclone:1.75.1 -c '. /deploy/rclone-env.sh && rclone lsf -R --files-only "$BACKUP_UPLOADS_REMOTE"'; }
backup
listing="$(bucket_files)"
grep -q "unknown-item.miss" <<<"$listing" && fail "a wiki-icons .miss marker was backed up"
grep -q "still-being-written" <<<"$listing" && fail "a file modified seconds ago was backed up, and would be copied truncated"
[ "$(grep -c "drill" <<<"$listing")" -ge 25 ] || fail "the finished uploads were not all backed up"
echo "OK: finished uploads are in the bucket; the .miss marker and the file still being written are not"
echo "once that file is old enough, the next run must pick it up:"
docker run --rm -v "$v_src:/data" --entrypoint sh "$image" -c 'touch -d "10 minutes ago" /data/uploads/1771878032499-still-being-written.png'
backup
grep -q "still-being-written" <<<"$(bucket_files)" || fail "the file was not backed up once it was old enough"
echo "OK: it was"
echo "running the backup again must be a no-op that still succeeds:"
backup

step "Stopping Litestream (it makes a final sync on the way out)"
docker stop -t 30 "$ls_name" >/dev/null
docker logs "$ls_name" >"$tmp/litestream.log" 2>&1
# A stopped container still holds its volumes, which would stop the next step from destroying the data.
docker rm "$ls_name" >/dev/null
if grep -i -E "error|fail" "$tmp/litestream.log"; then fail "litestream logged errors"; fi

step "Recording what the restore must reproduce"
before="$(docker run --rm -v "$v_src:/data" "$image" verify-db /data/sqlite/bingo.db)"
expected_rows="$(rows "$before" drill_marker)"
# Everything the backup is meant to hold: all uploads except the .miss cache markers.
expected_hash="$(upload_hash "$v_src")"
echo "rows: $expected_rows (first burst: $first)   uploads hash: ${expected_hash%% *}"
[ "$expected_rows" -gt "$first" ] || fail "the second burst of writes didn't happen"

step "The backup must notice when Litestream has stopped replicating"
# Litestream is stopped, so anything written now is not reaching the bucket. (These rows are not part of what the restore
# must reproduce: the expected values above were recorded first.)
sleep 8
writer 1 10 0 >/dev/null
if stale_output="$(backup 5 2>&1)"; then fail "the backup passed although the database changed and Litestream is not running"; fi
grep -q "database replication: FAILED" <<<"$stale_output" || fail "the backup failed, but not because of the stale replica: $stale_output"
echo "OK: the backup fails (and would ping /fail) when the database has changed and nothing newer reached the bucket"

step "Destroying the data"
docker volume rm "$v_src" >/dev/null
echo "the source volume is gone; the only copy is in the bucket"

step "Restoring everything with deploy/restore.sh"
"$here/restore.sh" --into "$v_full" --env-file "$env_file" --network "$net" --image "$image" >"$tmp/restore.log" 2>&1 || { cat "$tmp/restore.log" >&2; fail "restore.sh failed"; }
tail -8 "$tmp/restore.log"
after="$(docker run --rm -v "$v_full:/data" "$image" verify-db /data/sqlite/bingo.db)"
[ "$(rows "$after" drill_marker)" = "$expected_rows" ] || fail "the restored database has $(rows "$after" drill_marker) rows, expected $expected_rows"
[ "$(upload_hash "$v_full")" = "$expected_hash" ] || fail "the restored uploads differ from the originals"
echo "OK: $expected_rows rows and every upload restored exactly"

step "Restoring the database as of the midpoint ($midpoint)"
"$here/restore.sh" --into "$v_pit" --env-file "$env_file" --network "$net" --image "$image" --at "$midpoint" --no-uploads >"$tmp/pit.log" 2>&1 || { cat "$tmp/pit.log" >&2; fail "the point-in-time restore failed"; }
pit="$(docker run --rm -v "$v_pit:/data" "$image" verify-db /data/sqlite/bingo.db)"
[ "$(rows "$pit" drill_marker)" = "$first" ] || fail "the point-in-time restore has $(rows "$pit" drill_marker) rows, expected exactly $first (what existed at $midpoint)"
echo "OK: the midpoint restore holds exactly the $first rows that existed then, not the $expected_rows that exist now"

step "Refusing to overwrite existing data"
# Exit code 3 is the one restore.sh uses for this refusal: any other failure (the bucket down, a typo) must not pass for it.
refusal_code=0
refusal="$("$here/restore.sh" --into "$v_full" --env-file "$env_file" --network "$net" --image "$image" --no-uploads 2>&1)" || refusal_code=$?
[ "$refusal_code" != 0 ] || fail "restore.sh overwrote an existing database without --force"
[ "$refusal_code" = 3 ] && grep -q "REFUSING" <<<"$refusal" || fail "restore.sh failed for the wrong reason (exit $refusal_code): $refusal"
echo "OK: restore.sh refuses (exit 3) a target that already has a database"

printf '\nRESTORE DRILL PASSED\n'
