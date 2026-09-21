#!/usr/bin/env bash
# Tests deploy/ssh-entry.sh, the wrapper that is the only thing the CI deploy key can do. It stands in for deploy.sh and
# docker, so it needs neither: what it checks is that every allowed request reaches the right command with the right
# arguments, that everything else, including every attempt to smuggle something in, is refused, and that the deploy scripts
# can only ever come from a commit on main (it uses a real git repository, on this machine).
#
#   deploy/test-ssh-entry.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
root="$work/tectonic"
mkdir -p "$root/deploy" "$work/bin"

# A fake deploy.sh that records what it was called with, and a fake docker.
cat >"$root/deploy/deploy.sh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >"$TB_ROOT/called"
EOF
cat >"$work/bin/docker" <<'EOF'
#!/usr/bin/env bash
echo "docker $*" >"$TB_ROOT/called"
cat >"$TB_ROOT/loaded"
EOF
chmod +x "$root/deploy/deploy.sh" "$work/bin/docker"
cp "$here/ssh-entry.sh" "$root/deploy/ssh-entry.sh"

failures=0
run() { # command [stdin file] -> sets status; leaves "$root/called" if something ran
  rm -f "$root/called" "$root/loaded"
  set +e
  if [ -n "${2:-}" ]; then
    SSH_ORIGINAL_COMMAND="$1" TB_ROOT="$root" PATH="$work/bin:$PATH" bash "$here/ssh-entry.sh" <"$2" >"$work/out" 2>&1
  else
    SSH_ORIGINAL_COMMAND="$1" TB_ROOT="$root" PATH="$work/bin:$PATH" bash "$here/ssh-entry.sh" </dev/null >"$work/out" 2>&1
  fi
  status=$?
  set -e
}
expect_runs() { # command expected-arguments
  run "$1"
  if [ "$status" -ne 0 ] || [ "$(cat "$root/called" 2>/dev/null)" != "$2" ]; then
    echo "FAIL: '$1' should have run deploy.sh with: $2 (status $status, called: $(cat "$root/called" 2>/dev/null || echo nothing))"; failures=$((failures + 1))
  else
    echo "ok:   $1"
  fi
}
expect_denied() {
  run "$1"
  if [ "$status" -eq 0 ] || [ -e "$root/called" ]; then
    echo "FAIL: '$1' should have been refused (status $status, called: $(cat "$root/called" 2>/dev/null || echo nothing))"; failures=$((failures + 1))
  else
    echo "ok:   refused: $1"
  fi
}

echo "-- allowed requests"
expect_runs "deploy staging tectonic-bingo:abc123" "staging tectonic-bingo:abc123"
expect_runs "deploy production tectonic-bingo:0123456789abcdef0123456789abcdef01234567 --skip-smoke" "production tectonic-bingo:0123456789abcdef0123456789abcdef01234567 --skip-smoke"
expect_runs "deploy production tectonic-bingo:v1.2_rc-3 --skip-staging-check --force --drain 20" "production tectonic-bingo:v1.2_rc-3 --skip-staging-check --force --drain 20"
expect_runs "rollback production" "production --rollback"
expect_runs "status staging" "staging --status"
expect_runs "edge" "edge"

echo "-- refused requests"
expect_denied ""
expect_denied "bash"
expect_denied "bash -c id"
expect_denied "deploy"
expect_denied "deploy staging"
expect_denied "deploy dev tectonic-bingo:abc"
expect_denied "deploy staging nginx:latest"
expect_denied "deploy staging tectonic-bingo:abc;id"
expect_denied "deploy staging tectonic-bingo:abc && id"
expect_denied 'deploy staging tectonic-bingo:$(id)'
expect_denied "deploy staging tectonic-bingo:../../etc"
expect_denied "deploy staging tectonic-bingo:abc --privileged"
expect_denied "deploy staging tectonic-bingo:abc --drain"
expect_denied "deploy staging tectonic-bingo:abc --drain 1;id"
expect_denied "deploy staging tectonic-bingo:abc --drain 99999"
expect_denied "rollback"
expect_denied "rollback staging extra"
expect_denied "rollback ../production"
expect_denied "status"
expect_denied "load-image extra"
expect_denied "edge extra"
expect_denied "docker run --privileged alpine"
expect_denied "rm -rf /"

echo "-- load-image passes the image through to docker load"
printf 'image bytes' >"$work/image.tar"
run "load-image" "$work/image.tar"
if [ "$status" -eq 0 ] && [ "$(cat "$root/called")" = "docker load" ] && [ "$(cat "$root/loaded")" = "image bytes" ]; then echo "ok:   load-image"; else echo "FAIL: load-image (status $status)"; failures=$((failures + 1)); fi

echo "-- sync-deploy: the scripts come from main on the box, never from the client"
command -v git >/dev/null || { echo "FAIL: git is required for this test"; exit 1; }
origin="$work/origin.git"; src="$work/src"
git init -q --bare "$origin"; git -C "$origin" symbolic-ref HEAD refs/heads/main
git init -q "$src"; git -C "$src" symbolic-ref HEAD refs/heads/main
g() { git -C "$src" -c user.name=test -c user.email=test@example.invalid -c commit.gpgsign=false "$@"; }
mkdir -p "$src/deploy"
commit_deploy() { # message deploy.sh-body -> prints the new commit's sha
  printf '%s\n' "$2" >"$src/deploy/deploy.sh"
  cp "$here/ssh-entry.sh" "$src/deploy/ssh-entry.sh"
  printf 'services: {}\n' >"$src/deploy/stack.yml"
  g add -A >/dev/null; g commit -q -m "$1"; g rev-parse HEAD
}
printf '%s\n' "$origin" >"$root/repo.url"

sha1="$(commit_deploy one '#!/usr/bin/env bash
echo version one')"
g remote add origin "$origin"; g push -q origin main
run "sync-deploy $sha1"
if [ "$status" -eq 0 ] && grep -q "version one" "$root/deploy/deploy.sh" && [ -x "$root/deploy/deploy.sh" ] && [ -d "$root/deploy.old" ]; then echo "ok:   a commit on main is cloned, installed and made executable (the old scripts are kept)"; else echo "FAIL: sync-deploy of a commit on main (status $status): $(cat "$work/out")"; failures=$((failures + 1)); fi

sha2="$(commit_deploy two '#!/usr/bin/env bash
echo version two')"
g push -q origin main
run "sync-deploy $sha2"
if [ "$status" -eq 0 ] && grep -q "version two" "$root/deploy/deploy.sh"; then echo "ok:   a later commit on main replaces it"; else echo "FAIL: second sync-deploy (status $status): $(cat "$work/out")"; failures=$((failures + 1)); fi

expect_sync_refused() { # description sha expected-message
  before="$(cat "$root/deploy/deploy.sh")"
  run "sync-deploy $2"
  if [ "$status" -ne 0 ] && [ "$(cat "$root/deploy/deploy.sh")" = "$before" ] && grep -q -E "$3" "$work/out"; then echo "ok:   refused, nothing replaced: $1"; else echo "FAIL: sync-deploy accepted: $1 (status $status)"; failures=$((failures + 1)); fi
}

# A commit that exists but is on another branch, even though its objects are present in the box's clone.
g checkout -q -b feature
sha_feature="$(commit_deploy evil '#!/usr/bin/env bash
echo the attacker was here')"
g push -q origin feature
git -C "$root/repo" fetch -q origin feature
g checkout -q main
expect_sync_refused "a commit that is not on main (its objects are on the box)" "$sha_feature" "is not on main"
expect_sync_refused "a commit the repository has never seen" "0000000000000000000000000000000000000000" "is not in the repository"
run "sync-deploy"; if [ "$status" -ne 0 ]; then echo "ok:   refused: sync-deploy with no commit"; else echo "FAIL: sync-deploy needs a commit"; failures=$((failures + 1)); fi
expect_denied "sync-deploy main"
expect_denied "sync-deploy $sha1;id"
expect_denied "sync-deploy $sha1 extra"

# A symlink in deploy/ (made without needing symlink support on this platform).
blob="$(printf '/etc/passwd' | g hash-object -w --stdin)"
g update-index --add --cacheinfo "120000,$blob,deploy/sneaky"
sha_link="$(g commit -q -m "a symlink" && g rev-parse HEAD)"
g push -q origin main
expect_sync_refused "a commit whose deploy/ contains a symlink" "$sha_link" "something other than files|ymlink|Cannot"

g rm -q -f --cached deploy/sneaky
sha_broken="$(commit_deploy broken 'if then fi (')"
g push -q origin main
expect_sync_refused "a commit whose deploy.sh does not parse" "$sha_broken" "does not parse"

echo
if [ "$failures" -gt 0 ]; then echo "$failures check(s) FAILED"; exit 1; fi
echo "ssh-entry: all checks passed"
