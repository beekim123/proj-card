# 卡牌与素材检查页验证

- `dom-results.json`：9 组 Happy DOM 检查已通过，覆盖旧基础牌 API、工具牌、静止素材 URL、镜子颜色/底数、工具 play 后恢复暂停、重复播放、63 项素材过滤、stay 恢复、怪物锚点、老钟数字槽、组合 UI 和 SVG ID 隔离。
- 这是 DOM 模拟，不是真实浏览器渲染、布局截图或性能通过证明。
- 本环境 Chromium 启动失败：`process_singleton_posix.cc socket() failed: Operation not permitted`。没有生成伪截图或帧率数据。

## 复跑 DOM 检查

在项目根目录运行：

```sh
npm ci
npm install --prefix ../qa-tools happy-dom
node verification/art-inspector/dom-checks.mjs
```

可用 `HAPPY_DOM_PATH` 指定已安装的 `happy-dom/lib/index.js`。该测试工具安装在项目外，不随项目打包。

## 有浏览器环境后的补测

启动 `npm run dev -- --port 4197`，另开终端运行：

```sh
python verification/art-inspector/browser_checks.py --url http://127.0.0.1:4197
```

需安装 Python Playwright 与 `/usr/bin/chromium`。脚本会检查深浅底、stay/slot、工具原画实际 CSS 播放状态、静态 Blob 内容，并生成桌面/手机宽度截图及 `browser-results.json`。目前此脚本没有在真实浏览器完成执行。

## 无重 build 美术替换（已通过，DOM 模拟）

`replacement-dom-results.json` 记录了直接运行现有 `dist/assets/*.js` 的测试，不是重新编译源码：临时将 `dist/art/mon_chest.svg` 的三处棕色替换为 `#13F17D`，GameUI 和检查页 5 个缩放预览都加载到了新颜色。加载器均使用 `cache: no-store`。dist JS、index.html 与 public 源素材没有变化，结束后恢复 dist SVG，并核对恢复前后 SHA-256 一致。

复跑：`node verification/art-inspector/replacement-dom-check.mjs`。需要已存在的 dist；运行期间不要同时 build。此项证明的是 DOM 层重新加载同名素材，无真实浏览器刷新或截图证据。
