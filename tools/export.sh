#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
if [[ "${GEMCARD_SKIP_IMPORT:-0}" != 1 ]]; then tools/import.sh; fi
mkdir -p exports/macos exports/windows
for platform in macOS Windows; do
  if [[ "$platform" == macOS ]]; then output="$GEMCARD_ROOT/exports/macos/新卡牌.zip"; else output="$GEMCARD_ROOT/exports/windows/新卡牌.exe"; fi
  nice -n 10 "$GODOT_BIN" --headless --path "$GEMCARD_ROOT/artifacts/godot-project" --export-release "$platform" "$output" --log-file "$GEMCARD_ROOT/artifacts/logs/export-$platform.log"
done
python3 tools/finish-macos-export.py
