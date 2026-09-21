#!/usr/bin/env bash
# Puts the backup credentials tofu created onto the box, as /srv/tectonic/env/staging.backup.env and production.backup.env.
# The last step of a build or rebuild (infra/README.md), and safe to run again: a BACKUP_PING_URL already set on the box is
# kept, because tofu does not know it.
#
#   infra/push-backup-env.sh [--identity FILE]      FILE: the admin private key (default ~/.ssh/tectonic_box)
#
# Trusts the server by the host key tofu generated (output known_hosts_line), never by what the network answers.
set -euo pipefail
export MSYS_NO_PATHCONV=1

here="$(cd "$(dirname "$0")" && pwd)"
identity="$HOME/.ssh/tectonic_box"
while [ $# -gt 0 ]; do
  case "$1" in
    --identity) identity="${2:?--identity needs a file}"; shift 2 ;;
    -h|--help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done
command -v tofu >/dev/null || { echo "tofu is not installed" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required (it reads tofu's output)" >&2; exit 1; }
[ -f "$identity" ] || { echo "no private key at $identity (--identity FILE)" >&2; exit 1; }

outputs="$(cd "$here" && tofu output -json)"
host="$(jq -r '.server_ipv4.value' <<<"$outputs")"
known_hosts_line="$(jq -r '.known_hosts_line.value' <<<"$outputs")"
[ -n "$host" ] && [ "$host" != null ] || { echo "tofu has no server_ipv4 output: has it been applied?" >&2; exit 1; }

known_hosts="$(mktemp)"; trap 'rm -f "$known_hosts"' EXIT
printf '%s\n' "$known_hosts_line" >"$known_hosts"
box() { ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$known_hosts" -i "$identity" "deploy@$host" "$@"; }

echo "checking the box at $host has finished its first boot"
box 'test -f /srv/tectonic/state/.bootstrapped' || { echo "the box has not finished bootstrapping yet (or cloud-init failed: see /var/log/cloud-init-output.log on it)" >&2; exit 1; }

for env in staging production; do
  content="$(jq -r --arg e "$env" '.backup_env.value[$e]' <<<"$outputs")"
  # Keep a ping URL someone set by hand.
  existing_ping="$(box "sed -n 's/^BACKUP_PING_URL=//p' /srv/tectonic/env/$env.backup.env 2>/dev/null" || true)"
  if [ -n "$existing_ping" ]; then content="$(sed "s|^BACKUP_PING_URL=.*|BACKUP_PING_URL=$existing_ping|" <<<"$content")"; fi
  printf '%s\n' "$content" | box "umask 077 && cat > /srv/tectonic/env/$env.backup.env.tmp && chmod 640 /srv/tectonic/env/$env.backup.env.tmp && mv /srv/tectonic/env/$env.backup.env.tmp /srv/tectonic/env/$env.backup.env"
  echo "wrote /srv/tectonic/env/$env.backup.env${existing_ping:+ (kept its BACKUP_PING_URL)}"
done

echo "checking the box can write to the bucket (a test object, removed again)"
box 'cd /srv/tectonic/env && for e in staging production; do
  docker run --rm --env-file "$e.backup.env" -v /srv/tectonic/deploy:/deploy:ro --entrypoint sh rclone/rclone:1.75.1 -c "
    . /deploy/rclone-env.sh && t=backup:\$BACKUP_BUCKET/\$BACKUP_PREFIX/_connection-test.txt &&
    printf hello | rclone rcat \$t 2>/dev/null && [ \"\$(rclone cat \$t 2>/dev/null)\" = hello ] && rclone deletefile \$t 2>/dev/null &&
    echo \"  $e: ok\"" || { echo "  $e: FAILED"; exit 1; }
done'
echo "done"
