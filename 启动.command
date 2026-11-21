#!/bin/zsh
cd "${0:A:h}" || exit 1
if ! command -v npm >/dev/null && [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
fi
if [[ ! -x node_modules/.bin/electron ]]; then npm ci || exit 1; fi
exec npm start
