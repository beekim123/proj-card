#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
engine_args=(--path "$GEMCARD_ROOT")
if [[ "$(uname -s)" == Darwin ]]; then
  probe="$GEMCARD_ROOT/artifacts/tools/display-probe"
  if [[ ! -x "$probe" || tools/display_probe.m -nt "$probe" ]] || ! /usr/bin/lipo -info "$probe" 2>/dev/null | /usr/bin/grep -q x86_64; then
    nice -n 10 /usr/bin/clang -x objective-c -fobjc-arc -O0 -mmacosx-version-min=11.0 -arch arm64 -arch x86_64 -framework AppKit -framework CoreGraphics tools/display_probe.m -o "$probe"
  fi
  export GEMCARD_DISPLAY_PROBE="$probe"
  display_file="${GEMCARD_DISPLAY_JSON:-$GEMCARD_ROOT/artifacts/display-$$.json}"
  "$probe" > "$display_file"
  screen_index="$(python3 -c 'import json,sys; r=json.load(open(sys.argv[1])); assert r["builtin_count"]==1; print(r["builtin_index"])' "$display_file")"
  engine_args+=(--screen "$screen_index")
fi
if [[ -n "${GEMCARD_RESOLUTION:-}" ]]; then engine_args+=(--resolution "$GEMCARD_RESOLUTION"); fi
engine_args+=(--log-file "${GEMCARD_LOG_FILE:-$GEMCARD_ROOT/artifacts/logs/game.log}" --)
exec nice -n 10 "$GODOT_BIN" "${engine_args[@]}" "$@"
