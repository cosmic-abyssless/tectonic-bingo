#!/usr/bin/env bash
# Tests infra/env-sync.sh (the box's half of push-env) against a temporary directory: what it reports, that it never prints
# a value, that check mode writes nothing, and that settings only the box has are kept.
#
#   bash infra/test-env-sync.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
fails=0

# Runs env-sync.sh the way push-env does: the variables in front, the script on standard input. A failure is reported in
# the output ("(exit N)") rather than stopping the tests, so the expectations below say what went wrong.
sync() { # mode target contents
  local desired status=0; desired="$(printf '%s' "$3" | base64 | tr -d '\n')"
  { printf 'MODE=%q ENV_DIR=%q TARGET=%q DESIRED=%q\n' "$1" "$dir" "$2" "$desired"; cat "$here/env-sync.sh"; } | bash -s 2>&1 || status=$?
  [ "$status" = 0 ] || echo "(exit $status)"
}
expect() { # description haystack needle
  if grep -qF -- "$3" <<<"$2"; then echo "ok   $1"; else echo "FAIL $1: expected \"$3\" in:"; sed 's/^/       /' <<<"$2"; fails=$((fails + 1)); fi
}
refute() { # description haystack needle
  if grep -qF -- "$3" <<<"$2"; then echo "FAIL $1: did not expect \"$3\" in:"; sed 's/^/       /' <<<"$2"; fails=$((fails + 1)); else echo "ok   $1"; fi
}

v1=$'# comment\nA=one\nSECRET=hunter2\nURL=https://x.test/a=b'

out="$(sync check staging.env "$v1")"
expect "a missing file is new" "$out" "staging.env: new file"
expect "every key is new" "$out" "3 new"
[ ! -e "$dir/staging.env" ] && echo "ok   check mode writes nothing" || { echo "FAIL check mode wrote the file"; fails=$((fails + 1)); }

out="$(sync write staging.env "$v1")"
expect "write writes" "$out" "wrote $dir/staging.env"
refute "no backup for a file that did not exist" "$out" ".bak"
[ "$(cat "$dir/staging.env")" = "$v1" ] && echo "ok   the file is exactly what was sent" || { echo "FAIL contents differ"; fails=$((fails + 1)); }
if [ "$(uname -s)" = Linux ]; then
  [ "$(stat -c %a "$dir/staging.env")" = 640 ] && echo "ok   mode 640" || { echo "FAIL mode is $(stat -c %a "$dir/staging.env")"; fails=$((fails + 1)); }
fi

out="$(sync check staging.env "$v1")"
expect "the same file is all same" "$out" "3 same, 0 different, 0 new, 0 only on the box"

# A value changes, one key is new, and the box has a setting OpenTofu does not know.
printf 'BOX_ONLY=keepme\n' >>"$dir/staging.env"
v2=$'A=one\nSECRET=correct-horse\nURL=https://x.test/a=b\nNEW=1'
out="$(sync check staging.env "$v2")"
expect "a changed value is named" "$out" "different: SECRET"
expect "a new key is named" "$out" "new: NEW"
expect "a box-only key is named" "$out" "only on the box (kept as they are): BOX_ONLY"
refute "no old value is printed" "$out" "hunter2"
refute "no new value is printed" "$out" "correct-horse"

out="$(sync write staging.env "$v2")"
expect "writing keeps a backup" "$out" "the previous one is staging.env.bak"
grep -q '^SECRET=correct-horse$' "$dir/staging.env" && echo "ok   the new value is written" || { echo "FAIL new value missing"; fails=$((fails + 1)); }
grep -q '^BOX_ONLY=keepme$' "$dir/staging.env" && echo "ok   the box-only setting is kept" || { echo "FAIL box-only setting lost"; fails=$((fails + 1)); }
grep -q '^SECRET=hunter2$' "$dir/staging.env.bak" && echo "ok   the backup is the previous file" || { echo "FAIL backup wrong"; fails=$((fails + 1)); }

# Writing again changes nothing, and the kept setting is not doubled.
sync write staging.env "$v2" >/dev/null
[ "$(grep -c '^BOX_ONLY=' "$dir/staging.env")" = 1 ] && echo "ok   a kept setting is not repeated" || { echo "FAIL kept setting repeated"; fails=$((fails + 1)); }
out="$(sync check staging.env "$v2")"
expect "after writing, all the same" "$out" "4 same, 0 different, 0 new, 1 only on the box"

# A box file with lines that aren't settings (whitespace only, a stray word) is read past, not choked on.
printf 'A=one\n   \nstray\nSECRET=correct-horse\n' >"$dir/production.env"
out="$(sync check production.env $'A=one\nSECRET=correct-horse')"
expect "lines without a setting are not settings" "$out" "2 same, 0 different, 0 new, 0 only on the box"
out="$(sync write production.env $'A=one\nSECRET=correct-horse')"
expect "and writing past them works" "$out" "wrote $dir/production.env"

# A box file with Windows line endings compares by its values, not as different everywhere.
printf 'A=one\r\nSECRET=correct-horse\r\n\r\nBOX_ONLY=keepme\r\n' >"$dir/production.env"
out="$(sync check production.env $'A=one\nSECRET=correct-horse')"
expect "a CRLF box file compares by value" "$out" "2 same, 0 different, 0 new, 1 only on the box"
sync write production.env $'A=one\nSECRET=correct-horse' >/dev/null
grep -q $'\r' "$dir/production.env" && { echo "FAIL a kept CRLF line brought its carriage return"; fails=$((fails + 1)); } || echo "ok   kept lines arrive without carriage returns"

# Keys are compared as text, never as patterns.
printf 'A.B=1\nAxB=2\n' >"$dir/production.env"
out="$(sync check production.env 'A.B=1')"
expect "a key with a regex character matches only itself" "$out" "1 same, 0 different, 0 new, 1 only on the box"

# Windows line endings on the way in are removed.
out="$(sync write production.env $'K=v\r\nL=w\r')"
grep -q $'\r' "$dir/production.env" && { echo "FAIL a carriage return was written"; fails=$((fails + 1)); } || echo "ok   carriage returns removed"

# staging.basic-auth is compared whole.
out="$(sync check staging.basic-auth 'team $2a$10$abc')"
expect "a missing password file is new" "$out" "staging.basic-auth: new"
sync write staging.basic-auth 'team $2a$10$abc' >/dev/null
out="$(sync check staging.basic-auth 'team $2a$10$abc')"
expect "the same hash is same" "$out" "staging.basic-auth: same"
out="$(sync check staging.basic-auth 'team $2a$10$xyz')"
expect "another hash changes" "$out" "staging.basic-auth: changes"

# A file that would come out identical is left alone: no write, no new .bak, the same mtime.
rm -f "$dir/staging.env.bak"
touch -d '2001-01-01 00:00:00' "$dir/staging.env"
before="$(stat -c %Y "$dir/staging.env")"
out="$(sync write staging.env "$v2")"
expect "an identical file is unchanged" "$out" "unchanged: left $dir/staging.env as it is"
refute "and not written" "$out" "wrote"
[ "$(stat -c %Y "$dir/staging.env")" = "$before" ] && echo "ok   its mtime is the same" || { echo "FAIL the identical file was rewritten"; fails=$((fails + 1)); }
[ ! -e "$dir/staging.env.bak" ] && echo "ok   no .bak for an unchanged file" || { echo "FAIL a .bak was made for an unchanged file"; fails=$((fails + 1)); }
out="$(sync write staging.basic-auth 'team $2a$10$abc')"
expect "an identical password file is unchanged too" "$out" "unchanged: left $dir/staging.basic-auth as it is"

# The backup env files go through the same path, and a BACKUP_PING_URL set on the box (tofu renders none) is kept.
b1=$'# Written by infra/push-backup-env\nBACKUP_BUCKET=bucket\nBACKUP_PREFIX=production\nBACKUP_SECRET_ACCESS_KEY=s3cret'
printf 'BACKUP_BUCKET=bucket\nBACKUP_PREFIX=production\nBACKUP_SECRET_ACCESS_KEY=old\nBACKUP_PING_URL=https://hc.test/ping-id\n' >"$dir/production.backup.env"
out="$(sync check production.backup.env "$b1")"
expect "a backup env file is compared by key" "$out" "production.backup.env: 2 same, 1 different, 0 new, 1 only on the box"
expect "its ping URL is kept" "$out" "only on the box (kept as they are): BACKUP_PING_URL"
refute "no backup secret is printed" "$out" "s3cret"
out="$(sync write production.backup.env "$b1")"
expect "a backup env file is written with a backup" "$out" "the previous one is production.backup.env.bak"
grep -q '^BACKUP_PING_URL=https://hc.test/ping-id$' "$dir/production.backup.env" && echo "ok   the ping URL survives the write" || { echo "FAIL the ping URL was lost"; fails=$((fails + 1)); }
grep -q '^BACKUP_SECRET_ACCESS_KEY=s3cret$' "$dir/production.backup.env" && echo "ok   the new credential is written" || { echo "FAIL new credential missing"; fails=$((fails + 1)); }
out="$(sync write production.backup.env "$b1")"
expect "writing it again leaves it as it is" "$out" "unchanged: left $dir/production.backup.env as it is"
out="$(sync check staging.backup.env "$b1")"
expect "staging's backup env file is allowed too" "$out" "staging.backup.env: new file"

# Anything else is refused.
out="$(sync write ../etc/passwd 'x')"
expect "an unknown file is refused" "$out" "will not touch"
out="$(sync delete staging.env 'x')"
expect "an unknown mode is refused" "$out" "MODE must be check or write"

echo
if [ "$fails" -gt 0 ]; then echo "$fails failed"; exit 1; fi
echo "all passed"
