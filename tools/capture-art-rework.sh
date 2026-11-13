#!/usr/bin/env bash
# One real renderer, sequential scenes, no compilation/import/export in this tool.
source "$(dirname "$0")/common.sh"
if [[ "$(uname -s)" != Darwin ]]; then
  echo '此入口需要Mac真实图形会话及可实时识别的内置屏幕。' >&2
  exit 2
fi
probe="${GEMCARD_DISPLAY_PROBE:-$GEMCARD_ROOT/artifacts/tools/display-probe}"
if [[ ! -x "$probe" ]]; then
  echo "缺少已有display-probe：$probe；本截图入口不会编译，请先完成项目现有导入/启动准备。" >&2
  exit 2
fi
output="${GEMCARD_CAPTURE_OUTPUT:-$GEMCARD_ROOT/artifacts/art-rework-08-09/screens/run-$(date -u +%Y%m%d-%H%M%S)-$$}"
mkdir -p "$output"
export GEMCARD_CAPTURE_OUTPUT="$output"
export GEMCARD_DISPLAY_PROBE="$probe"
export GEMCARD_DISPLAY_JSON="$output/display.json"
"$probe" > "$GEMCARD_DISPLAY_JSON"
screen_index="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d["builtin_count"]==1; print(d["builtin_index"])' "$GEMCARD_DISPLAY_JSON")"
log="$output/capture.log"
nice -n 10 "$GODOT_BIN" --path "$GEMCARD_ROOT" --screen "$screen_index" --resolution "${GEMCARD_RESOLUTION:-1600x900}" --max-fps 30 --log-file "$log" --script res://tests/capture_art_rework.gd -- --debug --layout=landscape --seed=1979
if rg -n 'SCRIPT ERROR|^ERROR:|ART_REWORK_CAPTURE_FAILED' "$log"; then
  echo "截图失败；已有PNG/JSON和日志保留于 $output" >&2
  exit 1
fi
python3 - "$output" <<'PY'
import json, pathlib, sys
output = pathlib.Path(sys.argv[1])
report = json.loads((output / 'report.json').read_text())
assert report.get('complete') is True and not report.get('failure'), '截图报告未完成'
assert report.get('expected_captures') == len(report.get('captures', [])) == 30, '截图未齐30张'
for capture in report['captures']:
    png, state = pathlib.Path(capture['png']), pathlib.Path(capture['state'])
    assert png.parent == state.parent == output and png.stat().st_size > 0 and state.stat().st_size > 0
    with png.open('rb') as source:
        assert source.read(8) == b'\x89PNG\r\n\x1a\n', png
    proof = json.loads(state.read_text())['captureProof']
    assert proof['save_png_result'] == 0 and proof['business_state_unchanged'] is True
    assert proof['png_bytes'] == png.stat().st_size
print('30张PNG及JSON完整，真实save_png结果均为0。')
PY
printf '本次真实GPU截图及状态旁车：%s\n' "$output"
