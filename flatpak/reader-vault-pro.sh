#!/bin/sh
set -eu
exec /app/lib/electron/electron /app/main \
  --no-sandbox \
  --enable-features=UseOzonePlatform \
  --ozone-platform=wayland \
  "$@"
