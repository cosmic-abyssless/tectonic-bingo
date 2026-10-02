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
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
chmod 700 "$work"
# Whatever the sender's platform added on the way (a Windows line ending) goes.
printf '%s' "$DESIRED" | base64 -d | tr -d '\r' >"$work/desired"
[ -s "$work/desired" ] || { echo "ENV-SYNC FAILED: nothing to write to $TARGET" >&2; exit 1; }
# Ends with a line break, so a line someone adds by hand never joins the last one.
[ -z "$(tail -c 1 "$work/desired")" ] || echo >>"$work/desired"

# The box's copy, with any Windows line endings removed like the desired one's, so a CRLF file on the box compares by
# its values rather than reading as different everywhere.
if [ -f "$file" ]; then tr -d '\r' <"$file" >"$work/box"; else : >"$work/box"; fi

if [ "$TARGET" = staging.basic-auth ]; then
  if [ ! -f "$file" ]; then
    echo "$TARGET: new"
  elif cmp -s "$work/desired" "$work/box"; then
    echo "$TARGET: same"
  else
    echo "$TARGET: changes (a new hash; whether the password itself changes is the login check's job)"
  fi
else
  # One pass over both files. A setting is a line with an "=" that isn't a comment: blank, whitespace-only and stray lines
  # are not settings. Its key is what comes before the first "=", and for a repeated key the last line wins, as it does for
  # Compose. Values are compared, never printed: the report is "<state> <key>" lines, and the box-only settings' lines go to
  # $work/kept to be written back.
  awk -v desired="$work/desired" -v kept="$work/kept" '
    /^[[:space:]]*#/ { next }
    {
      i = index($0, "=")
      if (i < 2) next
      k = substr($0, 1, i - 1)
      if (FILENAME == desired) want[k] = substr($0, i + 1)
      else { have[k] = substr($0, i + 1); line[k] = $0 }
    }
    END {
      for (k in want) print ((k in have) ? (have[k] == want[k] ? "same" : "different") : "new"), k
      for (k in have) if (!(k in want)) { print "kept", k; print line[k] >kept }
    }' "$work/desired" "$work/box" | sort >"$work/report"
  count() { grep -c "^$1 " "$work/report" || true; }
  names() { awk -v s="$1" '$1 == s { printf "%s%s", sep, $2; sep = " " }' "$work/report"; }

  [ -f "$file" ] || echo "$TARGET: new file"
  echo "$TARGET: $(count same) same, $(count different) different, $(count new) new, $(count kept) only on the box"
  [ "$(count different)" = 0 ] || echo "  different: $(names different)"
  [ "$(count new)" = 0 ] || echo "  new: $(names new)"
  [ "$(count kept)" = 0 ] || echo "  only on the box (kept as they are): $(names kept)"

  # The box's own settings go back in at the end, exactly as they were.
  if [ -s "$work/kept" ]; then
    {
      echo
      echo "# Only on the box, not in OpenTofu (infra/app-env.tf): kept as they were."
      sort "$work/kept"
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
