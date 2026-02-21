#!/bin/sh
set -eu
exec zypak-wrapper /app/lib/electron/electron /app/main \
  --enable-features=UseOzonePlatform \
  --ozone-platform=wayland \
  "$@"
