#!/bin/sh
set -eu
exec zypak-wrapper /app/extra/electron /app/main \
  --enable-features=UseOzonePlatform \
  --ozone-platform=wayland \
  "$@"
