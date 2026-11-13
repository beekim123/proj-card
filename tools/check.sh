#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
node tools/reference-integrity.mjs --check
node tools/check-new-art.mjs
export GEMCARD_SAVE_DIR="$GEMCARD_ROOT/artifacts/check-save"
nice -n 10 "$GODOT_BIN" --headless --path "$GEMCARD_ROOT" --script tests/run_all.gd --log-file "$GEMCARD_ROOT/artifacts/logs/check.log"
if rg -n 'SCRIPT ERROR|^ERROR:' artifacts/logs/check.log; then
  echo 'Godot reported runtime errors; verification failed' >&2
  exit 1
fi
node tools/reference-integrity.mjs --check
echo '全部通过'
