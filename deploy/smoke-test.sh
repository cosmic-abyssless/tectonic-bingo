#!/usr/bin/env bash
# Proves an image really starts and serves, not just that it built: runs it on an empty database, waits for /health,
# and checks the page, the runtime config and the API's error handling. Then starts the same image as the OCR service
# (with no network, so the models must be baked in) and has it read an image.
#
#   deploy/smoke-test.sh IMAGE          e.g. deploy/smoke-test.sh tectonic-bingo:local
#
# Used by CI on every pull request and by the deploy script before it switches traffic to a new build.
set -euo pipefail

image="${1:?usage: smoke-test.sh IMAGE}"
name="tb-smoke-$$"
ocr_name="tb-smoke-ocr-$$"
volume="tb-smoke-$$"

cleanup() {
  docker rm -f "$name" "$ocr_name" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() {
  echo "SMOKE TEST FAILED: $*" >&2
  echo "--- container log:" >&2
  docker logs "$name" 2>&1 | tail -30 >&2 || true
  if docker inspect "$ocr_name" >/dev/null 2>&1; then
    echo "--- ocr container log:" >&2
    docker logs "$ocr_name" 2>&1 | tail -30 >&2 || true
  fi
  exit 1
}

# Production mode insists on the Discord and URL settings, so the smoke test supplies dummy ones (nothing calls Discord).
# A named volume (not a bind mount) so the container's own user owns the data directory and this works the same on
# Linux, macOS and Windows.
docker run -d --name "$name" \
  -v "$volume:/data" \
  -e SESSION_SECRET=smoke-test \
  -e DISCORD_CLIENT_ID=smoke \
  -e DISCORD_CLIENT_SECRET=smoke \
  -e DISCORD_GUILD_ID=smoke \
  -e DISCORD_CALLBACK_URL=http://localhost/auth/discord/callback \
  -e CLIENT_URL=http://localhost \
  -e SENTRY_ENVIRONMENT=smoke \
  -e SENTRY_RELEASE=smoke-release \
  -e CLIENT_SENTRY_DSN=https://key@example.invalid/1 \
  -p 127.0.0.1::8080 \
  "$image" >/dev/null

port="$(docker port "$name" 8080/tcp | head -1 | sed 's/.*://')"
base="http://127.0.0.1:${port}"

echo "waiting for $image on $base ..."
for _ in $(seq 1 90); do
  if curl -fsS "$base/health" >/dev/null 2>&1; then break; fi
  if [ "$(docker inspect -f '{{.State.Running}}' "$name")" != "true" ]; then fail "the container exited during startup"; fi
  sleep 1
done
curl -fsS "$base/health" >/dev/null 2>&1 || fail "/health never answered"

health="$(curl -fsS "$base/health")"
[ "$health" = '{"ok":true}' ] || fail "/health returned: $health"

page="$(curl -fsS "$base/")"
grep -q '<div id="root">' <<<"$page" || fail "/ is not the app's page"
grep -q 'window.__APP_CONFIG__=' <<<"$page" || fail "the runtime config was not injected into the page"
grep -q '"environment":"smoke"' <<<"$page" || fail "the page carries the wrong environment"
grep -q '"release":"smoke-release"' <<<"$page" || fail "the page carries the wrong release"
grep -q 'key@example.invalid' <<<"$page" || fail "the page carries the wrong browser DSN"

deep="$(curl -fsS "$base/b/some-bingo/mod")"
grep -q 'window.__APP_CONFIG__=' <<<"$deep" || fail "a deep link does not get the app's page"

# `|| true`: on some platforms curl reports a write error for -o /dev/null even though the status was captured.
status="$(curl -s -o /dev/null -w '%{http_code}' "$base/api/no-such-route" || true)"
[ "$status" != "200" ] || fail "an unknown API route answered 200 (the app's page instead of an error)"

# The database was created and migrated on the empty volume.
docker exec "$name" node -e "
  const db = require('better-sqlite3')(process.env.DB_PATH, { readonly: true });
  const n = db.prepare(\"select count(*) n from sqlite_master where type = 'table'\").get().n;
  process.exit(n > 10 ? 0 : 1);
" || fail "the database was not migrated"

# The OCR service: the same image, its own role. No network, so this fails unless the models were baked into the image.
docker run -d --name "$ocr_name" --network none "$image" ocr >/dev/null
for _ in $(seq 1 60); do
  if docker exec "$ocr_name" node -e "fetch('http://127.0.0.1:8080/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))" >/dev/null 2>&1; then break; fi
  if [ "$(docker inspect -f '{{.State.Running}}' "$ocr_name")" != "true" ]; then fail "the OCR container exited during startup"; fi
  sleep 1
done
docker exec "$ocr_name" node -e "fetch('http://127.0.0.1:8080/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))" >/dev/null 2>&1 || fail "the OCR service never became ready"
# A blank image has no text, which is a valid answer: what matters is that the model ran and the service replied.
docker exec "$ocr_name" node -e "
  const sharp = require('sharp');
  (async () => {
    const png = await sharp({ create: { width: 320, height: 120, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const res = await fetch('http://127.0.0.1:8080/recognize', { method: 'POST', body: png, headers: { 'x-ocr-priority': 'background' } });
    const body = await res.json();
    process.exit(res.ok && Array.isArray(body.lines) ? 0 : 1);
  })().catch(() => process.exit(1));
" || fail "the OCR service did not read an image"

echo "smoke test passed: $image"
