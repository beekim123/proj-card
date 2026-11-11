#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
node tools/prepare-project.mjs
nice -n 10 "$GODOT_BIN" --headless --path "$GEMCARD_ROOT/artifacts/godot-project" --editor --import --log-file "$GEMCARD_ROOT/artifacts/logs/import.log"
if [[ "${GEMCARD_SKIP_SYNC:-0}" != 1 ]]; then python3 tools/sync-imports.py; fi
