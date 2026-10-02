#!/usr/bin/env bash
# Puts the backup credentials tofu created (r2.tf) onto the box, as /srv/tectonic/env/staging.backup.env and
# production.backup.env: the last step of a build or rebuild (infra/README.md), and safe to run again. Like push-env, it only
# CHECKS by default: for each file it lists, by name and never by value, which settings are the same as the box's, different,
# new or only on the box. Those are kept, so a BACKUP_PING_URL (or any optional setting) set on the box survives. --write then
# replaces the files, keeping each previous one as FILE.bak, and checks the box can write to the bucket (a test object,
# removed again).
#
#   infra/push-backup-env.sh [--write] [--identity FILE]
#
#   --write          replace the files (without it, nothing on the box changes)
#   --identity FILE  the admin private key (default ~/.ssh/tectonic_box)
#
# Run from a shell where infra/env.ps1's credentials are set (it reads `tofu output`). Needs jq. Reaches the box through box.sh,
# which trusts it by the host key tofu generated and sends every secret over ssh's standard input.
set -euo pipefail
export MSYS_NO_PATHCONV=1

here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=infra/box.sh
. "$here/box.sh"
identity="$HOME/.ssh/tectonic_box"
mode="check"
while [ $# -gt 0 ]; do
  case "$1" in
    --write) mode="write"; shift ;;
    --identity) identity="${2:?--identity needs a file}"; shift 2 ;;
    -h|--help) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done
box_init "$identity"
[ "$(jq -r '.backup_env.value.staging // empty' <<<"$outputs")" ] || { echo "tofu has no backup_env output: has it been applied?" >&2; exit 1; }

box_require_bootstrapped
echo "== the box at $host ($mode)"

for environment in staging production; do
  box_sync "$mode" "$environment.backup.env" "$(jq -r --arg e "$environment" '.backup_env.value[$e]' <<<"$outputs")"
done

if [ "$mode" = check ]; then
  echo
  echo "Nothing was changed. Run again with --write to replace the files."
  exit 0
fi

echo "checking the box can write to the bucket (a test object, removed again)"
box 'cd /srv/tectonic/env && for e in staging production; do
  docker run --rm --env-file "$e.backup.env" -v /srv/tectonic/deploy:/deploy:ro --entrypoint sh rclone/rclone:1.75.1 -c "
    . /deploy/rclone-env.sh && t=backup:\$BACKUP_BUCKET/\$BACKUP_PREFIX/_connection-test.txt &&
    printf hello | rclone rcat \$t 2>/dev/null && [ \"\$(rclone cat \$t 2>/dev/null)\" = hello ] && rclone deletefile \$t 2>/dev/null &&
    echo \"  $e: ok\"" || { echo "  $e: FAILED"; exit 1; }
done'
echo "done"
