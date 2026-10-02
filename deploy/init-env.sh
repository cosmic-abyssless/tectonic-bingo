#!/usr/bin/env bash
# Creates the backup env files a new server needs in /srv/tectonic/env/ (staging.backup.env, production.backup.env) from the
# template in this repository, each with its own BACKUP_PREFIX. It never asks for anything and never overwrites a file that
# exists, so it is safe to run again (and cloud-init runs it on a rebuilt box).
#
#   deploy/init-env.sh            run as the deploy user, on the box
#
# The values in them come from OpenTofu: infra/push-backup-env.sh writes the R2 credentials. The app's own files
# (staging.env, production.env, staging.basic-auth) are not made here at all: infra/push-env.sh writes them whole from
# OpenTofu (infra/app-env.tf), and until it has, deploy.sh refuses to start an environment rather than run it with blank
# secrets. See "App settings and secrets" in infra/README.md.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="${TB_ROOT:-/srv/tectonic}"
env_dir="$root/env"

die() { printf 'INIT-ENV FAILED: %s\n' "$*" >&2; exit 1; }
say() { printf '%s\n' "$*"; }

[ -d "$env_dir" ] || die "$env_dir does not exist: run deploy/bootstrap-box.sh first"
[ -w "$env_dir" ] || die "cannot write to $env_dir: run this as the deploy user"

# Copies a template (with any Windows line endings removed) unless the target already exists.
make_from_template() { # template target
  if [ -f "$2" ]; then say "kept $2 (already exists)"; return; fi
  [ -f "$1" ] || die "missing template $1"
  tr -d '\r' <"$1" >"$2"; chmod 640 "$2"
  say "created $2"
}

# Sets KEY=value in a file (the value may contain any character).
set_value() { # file key value
  local out
  out="$(F="$1" K="$2" V="$3" awk 'BEGIN{FS=OFS="="} $1==ENVIRON["K"]{print $1"="ENVIRON["V"]; f=1; next} {print} END{if(!f)print ENVIRON["K"]"="ENVIRON["V"]}' "$1")"
  printf '%s\n' "$out" >"$1"
}

for environment in staging production; do
  target="$env_dir/$environment.backup.env"
  existed=0; [ -f "$target" ] && existed=1
  make_from_template "$here/backup.env.example" "$target"
  # Each environment has its own history in the bucket; they must never share a prefix.
  [ "$existed" = 1 ] || set_value "$target" BACKUP_PREFIX "$environment"
done
