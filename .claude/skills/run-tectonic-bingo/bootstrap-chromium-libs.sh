#!/bin/bash
# Idempotent. Makes Playwright's downloaded Chromium runnable on a rootless
# Arch container: `npx playwright install-deps` needs apt+sudo, neither of
# which exists here (this box has no apt-get, and `sudo` has no password
# configured). Instead we pull just the .so files chromium is missing
# straight out of the Arch package files, via `pacman -Sp` (prints the
# current download URL — no root, no local db write) + curl + tar, and
# point LD_LIBRARY_PATH at them. Safe to re-run; skips work if already done.
#
# On a container that DOES have apt+sudo, skip this entirely and use
# `sudo npx playwright install-deps chromium` instead (untested here, no
# apt on this box — see SKILL.md Prerequisites).
set -euo pipefail

CACHE_DIR="${CHROMIUM_LIBS_DIR:-$HOME/.cache/tectonic-bingo/chromium-libs}"
MARKER="$CACHE_DIR/.ready"

if [ -f "$MARKER" ]; then
  echo "chromium libs already bootstrapped: $CACHE_DIR"
  exit 0
fi

if ! command -v pacman >/dev/null 2>&1; then
  echo "no pacman on this system - can't auto-bootstrap. On Ubuntu/Debian run:" >&2
  echo "  sudo apt-get install -y libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 \\" >&2
  echo "    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \\" >&2
  echo "    libxrandr2 libxrender1 libxi6 libgbm1 libasound2" >&2
  exit 1
fi

mkdir -p "$CACHE_DIR"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# Packages that, between them, cover every .so chrome-headless-shell needs
# beyond the base system - found by iterating `ldd .../chrome-headless-shell
# | grep "not found"` and resolving each with `pacman -Ss`. gtk3 alone pulls
# in libatk-1.0.so.0 AND libatk-bridge-2.0.so.0 (Arch's gtk3 build bundles
# both rather than shipping a separate "atk" package).
PKGS="nspr nss gtk3 at-spi2-core libxcomposite libxdamage libxfixes libxrandr libxkbcommon alsa-lib libxrender libxi"

echo "resolving download URLs via pacman -Sp (no root needed)..."
# shellcheck disable=SC2086
urls=$(pacman -Sp $PKGS)

echo "$urls" | while IFS= read -r url; do
  fname=$(basename "$url")
  case "$url" in
    file://*) cp "${url#file://}" "$WORK/$fname" ;;
    *) curl -sL -o "$WORK/$fname" "$url" ;;
  esac
done

for f in "$WORK"/*.pkg.tar.zst; do
  tar --zstd -xf "$f" -C "$WORK" --wildcards 'usr/lib/*.so*' 2>/dev/null || true
done

# -L dereferences symlinks into real files, which matters here: the SONAME
# symlink (e.g. libatk-1.0.so.0 -> libatk-1.0.so.0.26016.1) is what ldd
# actually looks up, and `find -type f` (an earlier version of this script)
# silently excluded it, leaving ldd unable to find the lib despite its
# versioned target sitting right next to it.
cp -Ln "$WORK"/usr/lib/*.so* "$CACHE_DIR/" 2>/dev/null || true

touch "$MARKER"
echo "bootstrapped $(ls "$CACHE_DIR" | grep -c '\.so') libs into $CACHE_DIR"
