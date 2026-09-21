#!/usr/bin/env bash
# Creates the env files a new server needs in /srv/tectonic/env/, from the templates in this repository, and generates
# everything that can be generated: the two session secrets and the staging password. It never asks for anything and never
# overwrites a file that exists, so it is safe to run again (and cloud-init runs it on a rebuilt box).
#
#   deploy/init-env.sh            run as the deploy user, on the box
#
# What it leaves for a person: the values only they have (Discord, the clan APIs, the R2 credentials), which
# deploy/fill-secrets.sh asks for, and infra/push-backup-env.sh writes the R2 ones from OpenTofu. See "Setting up the
# server" in deploy/README.md.
#
# The staging password is printed ONCE, at the end of the run that creates it. Put it in the team's password manager: only its
# hash is kept on the box. (Under cloud-init it lands in /var/log/cloud-init-output.log, readable by root only; move it and
# clear the log line.)
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="${TB_ROOT:-/srv/tectonic}"
env_dir="$root/env"
# Replaceable so this can be tested without Docker; on the box it is Caddy's own hasher.
hash_command="${TB_HASH_COMMAND:-docker run --rm caddy:2 caddy hash-password --plaintext}"

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

make_from_template "$here/env/staging.env.example" "$env_dir/staging.env"
make_from_template "$here/env/production.env.example" "$env_dir/production.env"
for environment in staging production; do
  target="$env_dir/$environment.backup.env"
  existed=0; [ -f "$target" ] && existed=1
  make_from_template "$here/backup.env.example" "$target"
  # Each environment has its own history in the bucket; they must never share a prefix.
  [ "$existed" = 1 ] || set_value "$target" BACKUP_PREFIX "$environment"
done

# A different session secret per environment, generated here so it never passes through anyone's hands.
for environment in staging production; do
  file="$env_dir/$environment.env"
  if grep -q '^SESSION_SECRET=$' "$file"; then
    set_value "$file" SESSION_SECRET "$(openssl rand -hex 32)"
    say "generated the $environment SESSION_SECRET"
  fi
done

# Staging asks for a shared password on everything except /health (Caddy basic auth; deploy/environments/staging.conf).
auth="$env_dir/staging.basic-auth"
if [ -f "$auth" ]; then
  say "kept $auth (already exists)"
else
  password="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)"
  hash="$($hash_command "$password")"
  [ -n "$hash" ] || die "could not hash the staging password"
  printf 'team %s\n' "$hash" >"$auth"; chmod 640 "$auth"
  say "created $auth"
  say
  say "STAGING PASSWORD (username: team): $password"
  say "Save it in the team's password manager now. It is not stored anywhere on this machine."
fi
