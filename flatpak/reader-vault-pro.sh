#!/bin/sh
set -eu
exec /app/main/node_modules/electron/dist/electron /app/main \
  --no-sandbox \
  --enable-features=UseOzonePlatform \
  --ozone-platform=wayland \
  "$@"
