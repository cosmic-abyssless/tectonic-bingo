#!/usr/bin/env bash
# The only thing the CI deploy key can do. authorized_keys pins the key to this script (deploy/bootstrap-box.sh writes the
# line): `restrict,command="/srv/tectonic/deploy/ssh-entry.sh" ssh-ed25519 AAAA... github-actions`. Whatever the client
# asks for arrives in $SSH_ORIGINAL_COMMAND and is checked here: no shell, no arbitrary docker or file access, no port
# forwarding. The deploy user is in the docker group, which is root-equivalent, so this wrapper is the boundary that matters.
#
# WHAT A LEAKED KEY CAN STILL DO, plainly. The deploy scripts are not under the key's control: `sync-deploy` takes only a
# commit sha, and the box fetches that commit's deploy/ directory from the repository itself, after checking the commit is on
# `main`. So the key cannot make the box run its own script. But it can still load an image of its own (`load-image`) and
# deploy it (`deploy`), and a deployed image runs, unprivileged, with that environment's secrets and data mounted. A holder of
# the key can therefore read and change that environment's database and secrets: treat DEPLOY_SSH_KEY as access to production
# data (though not as root on the machine). Closing that last part needs images the box can verify came from `main`
# (building on the box, or signed images); see "What the CI key can do" in deploy/README.md.
#
#   load-image                        docker load, reading the image (gzip or plain tar) from stdin
#   sync-deploy SHA                   replace /srv/tectonic/deploy with the deploy/ directory of commit SHA, fetched from the
#                                     repository on the box, and only if SHA is on main
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
    [ "${#words[@]}" -eq 2 ] || deny
    [[ "${words[1]}" =~ ^[0-9a-f]{40}$ ]] || deny
    sha="${words[1]}"
    repo="$root/repo"
    # The repository is cloned once, from the address bootstrap-box.sh recorded, with a read-only deploy key that only this
    # box holds. Nothing the client sends decides where the scripts come from.
    if [ ! -d "$repo/.git" ]; then
      [ -f "$root/repo.url" ] || { echo "no repository is configured on this box ($root/repo.url; bootstrap-box.sh --repo-url)" >&2; exit 1; }
      git clone --quiet --no-checkout "$(cat "$root/repo.url")" "$repo"
    fi
    git -C "$repo" fetch --quiet origin main
    # Only what main contains: a commit on some other branch (or a made-up one) is refused.
    git -C "$repo" cat-file -e "$sha^{commit}" 2>/dev/null || { echo "commit $sha is not in the repository" >&2; exit 1; }
    git -C "$repo" merge-base --is-ancestor "$sha" origin/main || { echo "commit $sha is not on main: only commits on main are deployed" >&2; exit 1; }

    incoming="$root/deploy.incoming"
    rm -rf "$incoming"; mkdir -p "$incoming"
    git -C "$repo" archive "$sha" deploy | tar -x -C "$incoming" --strip-components=1 --no-same-owner --no-same-permissions
    # Plain files and directories only, and the scripts this wrapper is about to trust.
    if find "$incoming" ! -type f ! -type d | grep -q .; then rm -rf "$incoming"; echo "deploy/ contains something other than files and directories" >&2; exit 1; fi
    [ -f "$incoming/deploy.sh" ] && [ -f "$incoming/ssh-entry.sh" ] && [ -f "$incoming/stack.yml" ] || { rm -rf "$incoming"; echo "commit $sha has no complete deploy/ directory" >&2; exit 1; }
    bash -n "$incoming/deploy.sh" || { rm -rf "$incoming"; echo "deploy.sh does not parse" >&2; exit 1; }
    chmod +x "$incoming"/*.sh
    rm -rf "$root/deploy.old"
    if [ -d "$root/deploy" ]; then mv "$root/deploy" "$root/deploy.old"; fi
    mv "$incoming" "$root/deploy"
    echo "deploy scripts are now those of ${sha:0:12}"
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
