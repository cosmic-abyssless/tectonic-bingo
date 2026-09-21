#!/bin/sh
# Picks what this container does from its first argument. `exec` everywhere, so node (not this shell) is the process that
# receives the stop signal and can finish in-flight work before it exits.
set -e

case "$1" in
  api)
    node server/dist/migrate.js
    exec node --enable-source-maps server/dist/index.js
    ;;
  migrate)
    exec node server/dist/migrate.js
    ;;
  ocr)
    exec node --enable-source-maps server/dist/ocrServer.js
    ;;
  verify-db)
    # Read-only health report for a database file (a restored backup, say); exits non-zero if it isn't fit to start on.
    shift
    exec node server/dist/verifyDb.js "$@"
    ;;
  *)
    exec "$@"
    ;;
esac
