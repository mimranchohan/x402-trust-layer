#!/bin/sh
set -e
DATA="${DATA_DIR:-/app/data}"
mkdir -p "$DATA"
# Railway volumes mount as root; app user needs write access for SQLite
chown -R app:app "$DATA" 2>/dev/null || true
exec su-exec app:app "$@"
