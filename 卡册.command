#!/bin/zsh
set -eu
cd -- "${0:A:h}"
exec env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron src/album/launch.cjs "$@"
