#!/usr/bin/env bash
# The box's half of infra/push-env.sh and push-env.ps1: compares one env file on the box with what OpenTofu renders, and
# (in write mode) replaces it. It runs on the box, sent over ssh's standard input with these variables set in front of it,
# so no secret is ever on a command line:
#
#   MODE      check (report only) or write
#   ENV_DIR   the directory the file is in, normally /srv/tectonic/env
#   TARGET    the file's name in it: staging.env, production.env or staging.basic-auth
#   DESIRED   the new contents, base64-encoded
#
# For an env file it reports, by name only, never a value: keys that are the same, different, new (only in OpenTofu) or
# kept (only on the box: written back at the end of the file, so a setting OpenTofu does not know yet is never lost). For
# staging.basic-auth it reports whether the file changes (a new bcrypt hash is expected the first time, even for the same
# password: push-env checks the password itself against the live site). Writing keeps the previous file as TARGET.bak.
#
# Tested by infra/test-env-sync.sh, which runs it against a temporary directory.
set -euo pipefail

: "${MODE:?MODE is check or write}" "${ENV_DIR:?}" "${TARGET:?}" "${DESIRED:?}"
case "$MODE" in check | write) ;; *) echo "ENV-SYNC FAILED: MODE must be check or write, not $MODE" >&2; exit 1 ;; esac
case "$TARGET" in staging.env | production.env | staging.basic-auth) ;; *) echo "ENV-SYNC FAILED: will not touch $TARGET" >&2; exit 1 ;; esac
[ -d "$ENV_DIR" ] || { echo "ENV-SYNC FAILED: $ENV_DIR does not exist" >&2; exit 1; }

file="$ENV_DIR/$TARGET"
kept=()
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
chmod 700 "$work"
# Whatever the sender's platform added on the way (a Windows line ending) goes.
printf '%s' "$DESIRED" | base64 -d | tr -d '\r' >"$work/desired"
[ -s "$work/desired" ] || { echo "ENV-SYNC FAILED: nothing to write to $TARGET" >&2; exit 1; }
# Ends with a line break, so a line someone adds by hand never joins the last one.
[ -z "$(tail -c 1 "$work/desired")" ] || echo >>"$work/desired"

# KEY<TAB>sha256 of the value, one line per setting, for comparing without ever showing a value. Comments and blank lines
# are not settings; for a repeated key the last one wins, as it does for Compose.
digests() { # file
  local line key value
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in '' | '#'*) continue ;; esac
    key="${line%%=*}"
    value="${line#*=}"
    printf '%s\t%s\n' "$key" "$(printf '%s' "$value" | sha256sum | cut -d' ' -f1)"
  done <"$1" | awk -F'\t' '{d[$1]=$2} END {for (k in d) print k "\t" d[k]}' | sort
}

if [ "$TARGET" = staging.basic-auth ]; then
  if [ ! -f "$file" ]; then
    echo "$TARGET: new"
  elif cmp -s "$work/desired" <(tr -d '\r' <"$file"); then
    echo "$TARGET: same"
  else
    echo "$TARGET: changes (a new hash; whether the password itself changes is the login check's job)"
  fi
else
  digests "$work/desired" >"$work/want"
  if [ -f "$file" ]; then digests "$file" >"$work/have"; else : >"$work/have"; fi
  same=() changed=() added=()
  while IFS=$'\t' read -r key digest; do
    have="$(awk -F'\t' -v k="$key" '$1==k {print $2}' "$work/have")"
    if [ -z "$have" ]; then added+=("$key")
    elif [ "$have" = "$digest" ]; then same+=("$key")
    else changed+=("$key"); fi
  done <"$work/want"
  while IFS=$'\t' read -r key _; do
    grep -q "^$key	" "$work/want" || kept+=("$key")
  done <"$work/have"
  [ -f "$file" ] || echo "$TARGET: new file"
  echo "$TARGET: ${#same[@]} same, ${#changed[@]} different, ${#added[@]} new, ${#kept[@]} only on the box"
  [ ${#changed[@]} -eq 0 ] || echo "  different: ${changed[*]}"
  [ ${#added[@]} -eq 0 ] || echo "  new: ${added[*]}"
  [ ${#kept[@]} -eq 0 ] || echo "  only on the box (kept as they are): ${kept[*]}"

  # The box's own settings go back in at the end, exactly as they were.
  if [ ${#kept[@]} -gt 0 ]; then
    {
      echo
      echo "# Only on the box, not in OpenTofu (infra/app-env.tf): kept as they were."
      for key in "${kept[@]}"; do grep "^$key=" "$file" | tail -n 1; done
    } >>"$work/desired"
  fi
fi

[ "$MODE" = write ] || exit 0

umask 027
backup=""
if [ -f "$file" ]; then cp -p "$file" "$file.bak"; backup="; the previous one is $TARGET.bak"; fi
cp "$work/desired" "$file.tmp"
chmod 640 "$file.tmp"
mv "$file.tmp" "$file"
echo "  wrote $file$backup"
