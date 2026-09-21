#!/usr/bin/env bash
# Tests deploy/ssh-entry.sh, the wrapper that is the only thing the CI deploy key can do. It stands in for deploy.sh and
# docker, so it needs neither: what it checks is that every allowed request reaches the right command with the right
# arguments, and that everything else, including every attempt to smuggle something in, is refused.
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
expect_denied "sync-deploy extra"
expect_denied "edge extra"
expect_denied "docker run --privileged alpine"
expect_denied "rm -rf /"

echo "-- load-image passes the image through to docker load"
printf 'image bytes' >"$work/image.tar"
run "load-image" "$work/image.tar"
if [ "$status" -eq 0 ] && [ "$(cat "$root/called")" = "docker load" ] && [ "$(cat "$root/loaded")" = "image bytes" ]; then echo "ok:   load-image"; else echo "FAIL: load-image (status $status)"; failures=$((failures + 1)); fi

echo "-- sync-deploy"
mkdir -p "$work/src/deploy"
printf '#!/usr/bin/env bash\necho new deploy.sh\n' >"$work/src/deploy/deploy.sh"
cp "$here/ssh-entry.sh" "$work/src/deploy/ssh-entry.sh"
printf 'services: {}\n' >"$work/src/deploy/stack.yml"
tar -czf "$work/good.tgz" -C "$work/src" deploy
run "sync-deploy" "$work/good.tgz"
if [ "$status" -eq 0 ] && grep -q "new deploy.sh" "$root/deploy/deploy.sh" && [ -x "$root/deploy/deploy.sh" ] && [ -d "$root/deploy.old" ]; then echo "ok:   a good archive replaces the deploy directory (the old one is kept)"; else echo "FAIL: sync-deploy of a good archive (status $status): $(cat "$work/out")"; failures=$((failures + 1)); fi

# Restore the fake deploy.sh for the remaining checks.
printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$*" >"$TB_ROOT/called"\n' >"$root/deploy/deploy.sh"; chmod +x "$root/deploy/deploy.sh"

before="$(cat "$root/deploy/deploy.sh")"
if ln -s /etc/passwd "$work/src/deploy/sneaky" 2>/dev/null && [ -L "$work/src/deploy/sneaky" ]; then
  tar -czf "$work/symlink.tgz" -C "$work/src" deploy
  rm "$work/src/deploy/sneaky"
  run "sync-deploy" "$work/symlink.tgz"
  if [ "$status" -ne 0 ] && [ "$(cat "$root/deploy/deploy.sh")" = "$before" ]; then echo "ok:   an archive containing a symlink is refused and nothing is replaced"; else echo "FAIL: sync-deploy accepted a symlink (status $status)"; failures=$((failures + 1)); fi
else
  echo "skip: this platform can't create symlinks (the CI run does this check)"
fi

mkdir -p "$work/junk/notdeploy"; echo hi >"$work/junk/notdeploy/readme"
tar -czf "$work/junk.tgz" -C "$work/junk" notdeploy
run "sync-deploy" "$work/junk.tgz"
if [ "$status" -ne 0 ] && [ "$(cat "$root/deploy/deploy.sh")" = "$before" ]; then echo "ok:   an archive that is not a deploy/ directory is refused"; else echo "FAIL: sync-deploy accepted a wrong archive (status $status)"; failures=$((failures + 1)); fi

printf 'if then fi (\n' >"$work/src/deploy/deploy.sh"
tar -czf "$work/broken.tgz" -C "$work/src" deploy
run "sync-deploy" "$work/broken.tgz"
if [ "$status" -ne 0 ] && [ "$(cat "$root/deploy/deploy.sh")" = "$before" ]; then echo "ok:   a deploy.sh that does not parse is refused"; else echo "FAIL: sync-deploy accepted a broken deploy.sh (status $status)"; failures=$((failures + 1)); fi

echo
if [ "$failures" -gt 0 ]; then echo "$failures check(s) FAILED"; exit 1; fi
echo "ssh-entry: all checks passed"
