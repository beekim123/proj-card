# 新卡牌 · 完整冒险实现

在本次附件的现有 Vite + TypeScript + 原生 DOM 项目上续做。已验收的 `src/rules/` 全目录保持字节一致，新增完整冒险界面、存储、63 项素材接线和素材检查页。没有更换技术栈或添加项目依赖。

## 怎么启动

- **双击 `启动.command`**：自动装依赖（第一次）、启动本地服务、打开浏览器 `http://localhost:8780/`。关掉弹出的终端窗口就停止。需要 Node.js 20.19 以上（装了 nvm 会自动用 nvm 的版本）。
- 或者命令行：`npm run dev -- --port 8780`。
- 网址参数：`?layout=landscape` / `?layout=portrait` 指定横竖屏，`?debug=1` 测试入口，`?page=art` 素材检查页。

## 打开

- 开发：`npm ci`，然后 `npm run dev`。
- 生产：`npm run build`，用任意静态服务器打开 `dist/index.html`，或运行 `npm run preview`。
- 素材检查：`?page=art`。
- 测试入口：`?debug=1`，设置里有 1–14 用例、跳仗、设血、设心、给额外牌和指定发牌。
- 固定布局：`?layout=portrait` 或 `?layout=landscape`，优先于设置；默认按窗口方向自动切换。
- 打开 `file://` 不受支持，请通过静态 HTTP 服务运行。游戏只读取同源素材文件，不请求 CDN、在线字体或外部游戏服务。

交付大包最外层 `gemcard-demo/` 直接放了生产 `index.html`；`project/` 是本项目完整源码；`gemcard-demo-runtime.zip` 是单独的运行包，内部也是 `gemcard-demo/index.html`。

## 已接到页面

首页、新开/继续、6 仗冒险、三颗心、怪物血量与倒计时、继续出牌刷超杀、3/4 选 1 战利品、精英扩手、胜负结算、放弃和本机纪录。保留木桩练习，支持 6/7/8 张手牌、成长开关和每种额外牌一张。

存档只使用 `gemcard.run`、`gemcard.records`、`gemcard.settings`。正常新打开先显示首页；有有效存档时刷新自动恢复原战斗或战利品阶段。出牌、撤回、结束回合和选择战利品都持久化。存储失败会提示，不影响当前内存对局。

63 项清单全部接线。37 份现有 SVG 保留原文件，缺失的 26 项生成契约一致的占位图。11 项 idle 素材有动态/静止两个版本，桌面工具原画播放完成后暂停。支持 stay、文字槽、九宫格、锚点、打击点、镜子染色和素材替换。

## 换美术

将清单中相同 ID 的 SVG 放入 `dist/art/<id>.svg`，刷新即可，不需重打包。源开发环境对应 `public/art/`。文件必须保持 viewBox、parts、slots 和事件约定；加载或验证失败会使用占位，并在素材页显示原因。

## 复测

使用 Node.js 22.12+；本次环境 Node.js 24.22.1。

```sh
npm test
npm run typecheck
npx tsc --project src/rules/tsconfig.portable.json
npm run test:stress
npm run test:oracle
npm run build
```

本次结果和证据在 `verification/full/`、`verification/art-inspector/`；原 `verification/step1/` 及根 verification 旧日志是前轮历史，不代表本轮浏览器已通过。

DOM 模拟测试使用工程外安装的 Happy DOM，不是项目或游戏依赖。通过 `GEMCARD_DOM_MODULE` 指定其 `lib/index.js`，运行 `node verification/full/dom-game-check.mjs`。此测试对动画和几何作了模拟，不等价于浏览器画面或性能验收。

真实浏览器补测脚本：`verification/full/browser_acceptance.py`；素材专项：`verification/art-inspector/browser_checks.py`。本轮仅完成这些脚本的语法检查，未执行真实浏览器。

## 验证限制

云端 Chromium 在启动阶段报 `socket() failed: Operation not permitted`，普通和显式升级尝试均未能启动，因此没有真实画面截图、7 尺寸视觉验收、CPU 4 倍性能录制或 FPS 截图。未测中档安卓、iPhone Safari、切 App/锁屏恢复和 TapTap 平台上传。不能把构建、纯函数或 DOM 模拟通过当成这些项目已通过。

详见 `HANDOFF.md` 和 `04-验收清单.md`。
