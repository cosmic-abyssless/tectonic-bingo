#!/usr/bin/env bash
# Asks for the values only a person has and writes them into the env files in /srv/tectonic/env/, so nobody has to edit
# them by hand. Secret answers are hidden as you type or paste. Press Enter to skip any question: skipped values are left
# as they were, so it is safe to run again and to do in several sittings.
#
#   deploy/fill-secrets.sh            ask, then list what is still blank
#   deploy/fill-secrets.sh --list     only list what is still blank (names, never values)
#
# Run it as the deploy user, on the box, after deploy/init-env.sh (which creates the files). Run it in a terminal you opened
# yourself (ssh deploy@<address>): it reads your keyboard, not a pipe.
#
# The Discord application, guild and admins are the same for staging and production, so they are asked once and written to
# both. The R2 credentials are asked only if they are still blank: with OpenTofu they are written by infra/push-backup-env.sh
# instead, and this script leaves them alone.
set -euo pipefail

root="${TB_ROOT:-/srv/tectonic}"
env_dir="$root/env"
[ -d "$env_dir" ] || { echo "FILL-SECRETS FAILED: $env_dir does not exist" >&2; exit 1; }
cd "$env_dir"

files=(staging.env staging.backup.env production.env production.backup.env)

list_blank() {
  echo "== still blank (names only)"
  local f blanks
  for f in "${files[@]}"; do
    [ -f "$f" ] || { echo "$f: MISSING (run deploy/init-env.sh)"; continue; }
    blanks="$(sed -n 's/^\([A-Z_]*\)=[[:space:]]*$/\1/p' "$f" | tr '\n' ' ')"
    echo "$f: ${blanks:-nothing}"
  done
  echo
  echo "(staging's TECTONIC_*, WOM_API_KEY and RUNEPROFILE_API_KEY are blank on purpose: staging must not call the live clan APIs."
  echo " BACKUP_PING_URL is optional but advised.)"
}

if [ "${1:-}" = "--list" ]; then list_blank; exit 0; fi
[ -t 0 ] || { echo "FILL-SECRETS FAILED: run this in an interactive terminal (ssh deploy@<address>)" >&2; exit 1; }
for f in "${files[@]}"; do [ -f "$f" ] || { echo "FILL-SECRETS FAILED: $f is missing: run deploy/init-env.sh first" >&2; exit 1; }; done

# Sets KEY=value in a file (the value may contain any character; no temporary file ever holds a secret).
set_value() { # file key value
  local out
  out="$(F="$1" K="$2" V="$3" awk 'BEGIN{FS=OFS="="} $1==ENVIRON["K"]{print $1"="ENVIRON["V"]; f=1; next} {print} END{if(!f)print ENVIRON["K"]"="ENVIRON["V"]}' "$1")"
  printf '%s\n' "$out" >"$1"
}
current() { sed -n "s/^$2=//p" "$1" | head -1; }

answer=""
ask() { # label secret(1|0)
  local v
  if [ "$2" = 1 ]; then read -r -s -p "$1 (Enter to skip): " v; echo; else read -r -p "$1 (Enter to skip): " v; fi
  answer="$(printf '%s' "$v" | tr -d '\r\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [ -n "$answer" ] || echo "  skipped"
}
# ask_for label secret key file...   -> asks once, writes the answer to every file
ask_for() {
  local label="$1" secret="$2" key="$3"; shift 3
  ask "$label" "$secret"
  [ -z "$answer" ] || { local f; for f in "$@"; do set_value "$f" "$key" "$answer"; done; }
}

echo "== Discord (the same application for staging and production; from the Railway production variables)"
echo "   Do NOT reset the client secret in the Discord developer portal: that would break login on the live site."
ask_for "DISCORD_CLIENT_ID" 0 DISCORD_CLIENT_ID staging.env production.env
ask_for "DISCORD_CLIENT_SECRET" 1 DISCORD_CLIENT_SECRET staging.env production.env
ask_for "DISCORD_GUILD_ID" 0 DISCORD_GUILD_ID staging.env production.env
ask_for "ADMIN_DISCORD_IDS (comma-separated user ids of the site admins)" 0 ADMIN_DISCORD_IDS staging.env production.env

echo
echo "== Production clan integrations (from the Railway production variables)"
ask_for "TECTONIC_API_URL" 0 TECTONIC_API_URL production.env
ask_for "TECTONIC_API_KEY" 1 TECTONIC_API_KEY production.env
ask_for "TECTONIC_GUILD_ID" 0 TECTONIC_GUILD_ID production.env
ask_for "WOM_API_KEY" 1 WOM_API_KEY production.env
ask_for "RUNEPROFILE_API_KEY" 1 RUNEPROFILE_API_KEY production.env
ask_for "USER_AGENT_CONTACT (a Discord handle or email the APIs can reach you at)" 0 USER_AGENT_CONTACT production.env

echo
echo "== Backup alert (healthchecks.io or similar: a URL the nightly backup pings on success and at <url>/fail on failure)"
ask_for "BACKUP_PING_URL" 0 BACKUP_PING_URL staging.backup.env production.backup.env

if [ -z "$(current production.backup.env BACKUP_ACCESS_KEY_ID)" ]; then
  echo
  echo "== Cloudflare R2 (only needed if OpenTofu is not providing these: infra/push-backup-env.sh normally does)"
  ask_for "R2 endpoint, like https://<account id>.r2.cloudflarestorage.com" 0 BACKUP_ENDPOINT staging.backup.env production.backup.env
  ask_for "R2 bucket name" 0 BACKUP_BUCKET staging.backup.env production.backup.env
  ask_for "R2 Access Key ID" 1 BACKUP_ACCESS_KEY_ID staging.backup.env production.backup.env
  ask_for "R2 Secret Access Key" 1 BACKUP_SECRET_ACCESS_KEY staging.backup.env production.backup.env
fi

echo
list_blank
