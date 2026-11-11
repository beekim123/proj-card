#!/usr/bin/env bash
# Sequential real-render captures. No headless stand-ins; saves stay isolated.
source "$(dirname "$0")/common.sh"
if [[ "$(uname -s)" == Linux && -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
  echo '需要真实可用的图形显示会话；headless不能代替截图。' >&2
  exit 2
fi
output="$GEMCARD_ROOT/artifacts/batch-2/screens-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$output"
for layout in landscape portrait; do
  resolution=1920x1080
  [[ "$layout" == portrait ]] && resolution=1080x1920
  for scenario in relic corridor act1-choice act2-choice collection retreat defeat; do
    name="$layout-$scenario"
    export GEMCARD_SAVE_DIR="$output/saves-$name"
    export GEMCARD_RESOLUTION="$resolution" GEMCARD_LOG_FILE="$output/$name.log"
    bash tools/run.sh --debug --seed=1979 --layout="$layout" --scenario="$scenario" --capture="$output/$name.png"
    if rg -n 'SCRIPT ERROR|^ERROR:' "$GEMCARD_LOG_FILE"; then exit 1; fi
    test -s "$output/$name.png" && test -s "$output/$name.json"
    grep -F "GEMCARD_SCREENSHOT $output/$name.png" "$GEMCARD_LOG_FILE"
  done
done
printf '14张实际渲染截图和状态旁车：%s\n这些是debug定位的验收页面，不是完整真人通关证据。\n' "$output"
