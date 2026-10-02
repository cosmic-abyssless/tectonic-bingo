#!/usr/bin/env bash
# Puts the app's settings and secrets OpenTofu renders (app-env.tf) onto the box: /srv/tectonic/env/staging.env,
# production.env and staging.basic-auth. By default it only CHECKS: for each file it lists, by name and never by value, which
# settings are the same as the box's, different, new or only on the box (those are kept), and it checks the staging password
# in OpenTofu logs in to the live staging site. --write then replaces the files, keeping each previous one as FILE.bak.
#
# The containers read these files when they start, so a written change reaches the app with each environment's next deploy
# (zero-downtime, as always). Nothing running is touched.
#
#   infra/push-env.sh [--write] [--only staging|production] [--new-staging-password] [--identity FILE]
#
#   --write                 replace the files (without it, nothing on the box changes)
#   --only ENV              just one environment
#   --new-staging-password  write staging.basic-auth even though the password in OpenTofu was not confirmed against the live
#                           site (refused, or the site could not be reached): you are changing it on purpose. A box with no
#                           staging.basic-auth yet gets it without this.
#   --identity FILE         the admin private key (default ~/.ssh/tectonic_box)
#
# Run from a shell where infra/env.ps1's credentials are set (it reads `tofu output`). Needs jq and curl. Reaches the box
# through box.sh, which trusts it by the host key tofu generated and sends every secret over ssh's standard input.
set -euo pipefail
export MSYS_NO_PATHCONV=1

here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=infra/box.sh
. "$here/box.sh"
identity="$HOME/.ssh/tectonic_box"
mode="check"
only=""
new_password=0
while [ $# -gt 0 ]; do
  case "$1" in
    --write) mode="write"; shift ;;
    --only) only="${2:?--only needs staging or production}"; shift 2 ;;
    --new-staging-password) new_password=1; shift ;;
    --identity) identity="${2:?--identity needs a file}"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done
case "$only" in "" | staging | production) ;; *) echo "--only is staging or production" >&2; exit 1 ;; esac
command -v curl >/dev/null || { echo "curl is required (it checks the staging password)" >&2; exit 1; }
box_init "$identity"
[ "$(jq -r '.app_env.value.staging // empty' <<<"$outputs")" ] || { echo "tofu has no app_env output: run tofu apply first (README.md, \"App settings and secrets\")" >&2; exit 1; }

box_require_bootstrapped
echo "== the box at $host ($mode)"

for environment in staging production; do
  [ -z "$only" ] || [ "$only" = "$environment" ] || continue
  app_env="$(jq -r --arg e "$environment" '.app_env.value[$e] // empty' <<<"$outputs")"
  [ -n "$app_env" ] || { echo "tofu has no app_env for $environment: run tofu apply first" >&2; exit 1; }
  box_sync "$mode" "$environment.env" "$app_env"

  if [ "$environment" = staging ]; then
    # The password itself, against the live site: a 401 with it means Bitwarden's password is not the one staging uses.
    url="$(jq -r '.staging_login.value.url' <<<"$outputs")"
    status="$(jq -r '.staging_login.value | "user = " + ((.user + ":" + .password) | @json)' <<<"$outputs" | curl -s -o /dev/null -w '%{http_code}' -K - "$url/" || true)"
    case "$status" in
      2??|3??) login=ok; echo "staging password: logs in to $url" ;;
      401) login=wrong; echo "staging password: does NOT log in to $url (the live one is different)" ;;
      *) login=unknown; echo "staging password: could not check ($url answered ${status:-nothing})" ;;
    esac
    # Written only when the password is known to be right (it logs in), when the box has none yet (a new box), or when it is
    # being changed on purpose; never on a guess, since a site that cannot be reached proves nothing about a typo.
    has_auth=1
    box 'test -f /srv/tectonic/env/staging.basic-auth' || has_auth=0
    if [ "$mode" = check ] || [ "$login" = ok ] || [ "$has_auth" = 0 ] || [ "$new_password" = 1 ]; then
      box_sync "$mode" staging.basic-auth "$(jq -r '.staging_basic_auth.value' <<<"$outputs")"
    else
      echo "  left staging.basic-auth as it is (the password was not confirmed): pass --new-staging-password to change it on purpose"
    fi
  fi
done

if [ "$mode" = check ]; then
  echo
  echo "Nothing was changed. Run again with --write to replace the files."
else
  echo
  echo "Each environment's containers pick these up at its next deploy."
fi
