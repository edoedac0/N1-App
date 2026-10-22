#!/bin/sh
set -eu

PROFILE="${1:-}"
if [ -z "$PROFILE" ]; then
  echo "Usage: ./build.sh <Tizen certificate profile>" >&2
  exit 2
fi

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
STAGE="$ROOT/.tizen-stage"
OUTPUT="$ROOT/dist"

rm -rf "$STAGE"
mkdir -p "$STAGE" "$OUTPUT"
cp "$ROOT/config.xml" "$ROOT/index.html" "$ROOT/style.css" "$ROOT/app.js" "$ROOT/settings.js" "$ROOT/icon.png" "$ROOT/n1-logo.svg" "$STAGE/"

tizen build-web -- "$STAGE" -out .tizen-build
tizen package -t wgt -s "$PROFILE" -- "$STAGE/.tizen-build" -o "$OUTPUT"

echo "Packaged app: $OUTPUT/N1 TV.wgt"
echo "channels.json was intentionally excluded from the package."
