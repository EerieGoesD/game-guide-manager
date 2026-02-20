#!/bin/sh
set -eu

exec zypak-wrapper /app/bin/electron /app/main \
  --enable-features=UseOzonePlatform \
  --ozone-platform=wayland \
  "$@"
