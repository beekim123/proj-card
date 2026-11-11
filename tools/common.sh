#!/usr/bin/env bash
set -euo pipefail
GEMCARD_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GODOT_BIN="${GODOT_BIN:-$GEMCARD_ROOT/Godot.app/Contents/MacOS/Godot}"
export OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 VECLIB_MAXIMUM_THREADS=1
export GOMAXPROCS=1
mkdir -p "$GEMCARD_ROOT/artifacts/logs" "$GEMCARD_ROOT/artifacts/tools"
cd "$GEMCARD_ROOT"
if [[ ! -x "$GODOT_BIN" ]]; then echo "找不到Godot：$GODOT_BIN" >&2; exit 1; fi
if [[ "$("$GODOT_BIN" --version)" != 4.7.2.stable.* ]]; then echo '必须使用Godot 4.7.2正式版' >&2; exit 1; fi
