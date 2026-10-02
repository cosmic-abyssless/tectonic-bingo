# shellcheck shell=bash
# Shared by infra/push-env.sh and push-backup-env.sh (dot-sourced, not run): reading OpenTofu's outputs, reaching the box
# over ssh, and sending one env file through env-sync.sh. Trusts the server by the host key tofu generated (output
# known_hosts_line), never by what the network answers, and sends every secret over ssh's standard input.
#
#   box_init IDENTITY        checks the tools and the key, reads `tofu output -json` into $outputs and the server's address
#                            into $host, and writes tofu's host key to a temporary known_hosts file (removed on exit)
#   box COMMAND...           runs a command on the box as the deploy user
#   box_require_bootstrapped stops unless the box has finished its first boot
#   box_sync MODE TARGET CONTENTS
#                            runs env-sync.sh on the box for /srv/tectonic/env/TARGET: MODE is check or write

box_here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

box_init() { # identity
  box_identity="$1"
  command -v tofu >/dev/null || { echo "tofu is not installed" >&2; exit 1; }
  command -v jq >/dev/null || { echo "jq is required (it reads tofu's output)" >&2; exit 1; }
  [ -f "$box_identity" ] || { echo "no private key at $box_identity (--identity FILE)" >&2; exit 1; }
  outputs="$(cd "$box_here" && tofu output -json)"
  host="$(jq -r '.server_ipv4.value' <<<"$outputs")"
  [ -n "$host" ] && [ "$host" != null ] || { echo "tofu has no server_ipv4 output: has it been applied?" >&2; exit 1; }
  box_known_hosts="$(mktemp)"
  trap 'rm -f "$box_known_hosts"' EXIT
  jq -r '.known_hosts_line.value' <<<"$outputs" >"$box_known_hosts"
}

box() {
  ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$box_known_hosts" -i "$box_identity" "deploy@$host" "$@"
}

box_require_bootstrapped() {
  box 'test -f /srv/tectonic/state/.bootstrapped' || { echo "the box at $host has not finished its first boot (see /var/log/cloud-init-output.log on it)" >&2; exit 1; }
}

# The variables in front of the script, all on standard input, so no secret is ever on a command line.
box_sync() { # mode target contents
  local desired; desired="$(printf '%s' "$3" | base64 | tr -d '\n')"
  { printf 'MODE=%q ENV_DIR=/srv/tectonic/env TARGET=%q DESIRED=%q\n' "$1" "$2" "$desired"; cat "$box_here/env-sync.sh"; } | box 'bash -s'
}
