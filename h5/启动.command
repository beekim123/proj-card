#!/bin/bash
# 双击启动宝石卡牌 demo：自动装依赖、启动本地服务、打开浏览器。关掉这个窗口就停止。
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-8780}"
URL="http://localhost:$PORT/"

# 双击运行时不会读终端配置：优先用 nvm 的 Node（Vite 要 Node 20.19+），再找常见安装位置
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "当前 Node.js 版本是 $(node -v 2>/dev/null || echo 无)，游戏需要 20.19 以上。请升级 Node.js 后再双击。"
  read -r -p "按回车关闭…" _
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "没找到 npm。请先安装 Node.js（https://nodejs.org/），再双击这个文件。"
  read -r -p "按回车关闭…" _
  exit 1
fi

# 已经开着就直接打开浏览器
if curl -s -o /dev/null "$URL"; then
  echo "游戏已经在运行：$URL"
  open "$URL"
  exit 0
fi

if [ ! -d node_modules ]; then
  echo "第一次运行，正在安装依赖…"
  npm install || { read -r -p "安装失败，按回车关闭…" _; exit 1; }
fi

echo "正在启动：$URL"
echo "横屏 ${URL}?layout=landscape　竖屏 ${URL}?layout=portrait　测试入口 ${URL}?debug=1　素材检查 ${URL}?page=art"
echo "关掉这个窗口就停止。"
( for i in $(seq 1 40); do curl -s -o /dev/null "$URL" && { open "$URL"; break; }; sleep 0.5; done ) &
npm run dev -- --port "$PORT" --strictPort
