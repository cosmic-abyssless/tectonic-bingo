#!/usr/bin/env bash
# The only thing the CI deploy key can do. authorized_keys pins the key to this script (deploy/bootstrap-box.sh writes the
# line): `restrict,command="/srv/tectonic/deploy/ssh-entry.sh" ssh-ed25519 AAAA... github-actions`. Whatever the client
# asks for arrives in $SSH_ORIGINAL_COMMAND and is checked here, so a stolen key can load an image and run a deploy, and
# nothing else: no shell, no arbitrary docker or file access, no port forwarding.
#
# The deploy user is in the docker group (which is root-equivalent), so this wrapper is the actual security boundary.
# Keep it small, and keep every argument it passes on validated.
#
#   load-image                        docker load, reading the image (gzip or plain tar) from stdin
#   sync-deploy                       replace /srv/tectonic/deploy with the tar.gz on stdin (the deploy/ directory of a commit)
#   deploy ENV IMAGE [flags]          deploy.sh ENV IMAGE ...   (ENV is production or staging; IMAGE is tectonic-bingo:<tag>)
#   rollback ENV                      deploy.sh ENV --rollback
#   status ENV                        deploy.sh ENV --status
#   edge                              deploy.sh edge
set -euo pipefail

root="${TB_ROOT:-/srv/tectonic}"
original="${SSH_ORIGINAL_COMMAND:-}"
read -r -a words <<<"$original"

deny() { echo "not allowed: ${original:-(no command)}" >&2; exit 126; }

is_env() { [ "$1" = production ] || [ "$1" = staging ]; }
is_image() { [[ "$1" =~ ^tectonic-bingo:[A-Za-z0-9._-]{1,128}$ ]]; }

run_deploy() { exec "$root/deploy/deploy.sh" "$@"; }

case "${words[0]:-}" in
  load-image)
    [ "${#words[@]}" -eq 1 ] || deny
    exec docker load
    ;;

  sync-deploy)
    [ "${#words[@]}" -eq 1 ] || deny
    incoming="$root/deploy.incoming"
    rm -rf "$incoming"; mkdir -p "$incoming"
    # The archive holds `deploy/...`; GNU tar refuses members that contain `..` and strips a leading `/`.
    tar -xz -C "$incoming" --strip-components=1 --no-same-owner --no-same-permissions
    # Only plain files and directories, and the scripts this wrapper is about to trust.
    if find "$incoming" ! -type f ! -type d | grep -q .; then rm -rf "$incoming"; echo "the archive contains something other than files and directories" >&2; exit 1; fi
    [ -f "$incoming/deploy.sh" ] && [ -f "$incoming/ssh-entry.sh" ] && [ -f "$incoming/stack.yml" ] || { rm -rf "$incoming"; echo "the archive is not a deploy/ directory" >&2; exit 1; }
    bash -n "$incoming/deploy.sh" || { rm -rf "$incoming"; echo "deploy.sh does not parse" >&2; exit 1; }
    chmod +x "$incoming"/*.sh
    rm -rf "$root/deploy.old"
    if [ -d "$root/deploy" ]; then mv "$root/deploy" "$root/deploy.old"; fi
    mv "$incoming" "$root/deploy"
    echo "deploy scripts updated"
    ;;

  deploy)
    [ "${#words[@]}" -ge 3 ] || deny
    is_env "${words[1]}" || deny
    is_image "${words[2]}" || deny
    flags=("${words[@]:3}")
    i=0
    while [ "$i" -lt "${#flags[@]}" ]; do
      case "${flags[$i]}" in
        --skip-smoke|--skip-staging-check|--force) ;;
        --drain) i=$((i + 1)); [[ "${flags[$i]:-}" =~ ^[0-9]{1,3}$ ]] || deny ;;
        *) deny ;;
      esac
      i=$((i + 1))
    done
    run_deploy "${words[1]}" "${words[2]}" ${flags[@]+"${flags[@]}"}
    ;;

  rollback)
    [ "${#words[@]}" -eq 2 ] || deny
    is_env "${words[1]}" || deny
    run_deploy "${words[1]}" --rollback
    ;;

  status)
    [ "${#words[@]}" -eq 2 ] || deny
    is_env "${words[1]}" || deny
    run_deploy "${words[1]}" --status
    ;;

  edge)
    [ "${#words[@]}" -eq 1 ] || deny
    run_deploy edge
    ;;

  *) deny ;;
esac
