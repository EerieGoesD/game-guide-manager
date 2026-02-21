#!/bin/sh
set -eu
exec /app/extra/electron /app/main \
  --no-sandbox \
  --enable-features=UseOzonePlatform \
  --ozone-platform=wayland \
  "$@"
