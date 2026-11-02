#!/bin/sh
set -e
if [ "$(id -u)" = 0 ]; then
  chown -R node:node /data 2>/dev/null || true
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
