# 新卡牌完整冒险交接 · 2026-11-09

## 做了什么

在附件现有工程上续做剩余三批内容，没有重写项目。`src/rules/` 的 17 个文件保持与已验收版本字节一致，`package.json` 和 lockfile 不变，仍只有 Vite、TypeScript、Vitest 三项开发依赖。

- 首页、新开确认、继续、完整 6 仗、3 心与倒计时、打穿后继续刷超杀、3/4 选 1 战利品、精英手牌上限 7→8、胜败/放弃/再来一局/本机纪录。
- 保留练习与 Pointer Events，手牌 6/7/8、成长和每种工具一张可切换。战利品二次确认，1–4/Enter/0、Space、Z 键盘输入。
- `save.ts` 处理三个 localStorage key。有效局刷新自动进入原战斗或战利品；正常新打开仍先显示首页与继续入口。坏档提示后清除。终局写纪录成功才退休活跃存档，写失败允许同页重试，避免重复计数及误清新局。
- 02 指定的新布局字段全部加入两张表和 fit；保留附件现有长屏、2:1 竖屏和桌面两行逻辑。界面不另算伤害或洗牌，没有 UI `Math.random`。
- 63 项清单完整接线，37 份真实文件保留，缺失 26 项使用完整占位。动态/静止双地址、stay、slots、命名空间、怪物打击点、9宫格、镜子染色、工具牌和 11 项特效均已接线。
- 素材检查页含状态筛选、idle双格、stay开关、怪物多倍数/锚点/打击点/老钟数字、5工具动态与暂停、镜子颜色、牌背/横幅/血条/三心组合。
- 规则同步结算，表现层按事件安排。连续出牌不等待动画；转屏、撤回、换场会清除过期表现。补齐镜子200ms变色、磨石600ms跨阶段圆环、口袋300ms后120ms间隔飞牌、逐行结算数字。

## 如何使用交付包

交付一个总 ZIP：

- `gemcard-demo/index.html`、`assets/`、`art/`、`art-manifest.json`：可直接放静态服务器。
- `gemcard-demo/project/`：完整源码与本轮验证脚本/日志，不含 node_modules。
- `gemcard-demo/gemcard-demo-runtime.zip`：单独的运行包，最外层同样为 `gemcard-demo/`，里面直接有 index.html，可用于 TapTap H5 上传准备。
- 顶层 `HANDOFF.md`、`04-验收清单.md`：交接及逐项验收状态。

源码开发进入 `project/` 后运行 `npm ci`、`npm run dev`。构建执行 `npm run build`。不能直接用 file:// 打开，需要静态 HTTP 服务。

替换美术：直接把相同 ID 的 SVG 放入运行目录 `art/`，刷新即可；开发目录对应 `public/art/`。不需要重打包。已对真实 dist 包做不重build改色再重读的 DOM 验证，游戏与检查页均读取新文件，测试后恢复原美术。

## 已执行的验证

最终统计：11个Vitest文件、376项测试通过；类型检查与构建通过；52组DOM/契约集成检查通过。以下均有记录，不能和浏览器/真机结果混为一谈：

- 完整 Vitest、TypeScript strict、生产构建：`verification/full/vitest-output.txt`、`typecheck-output.txt`、`build-output.txt`。
- 规则独立编译、10,000回合/80,000次出牌压力、411,004断言、独立评分30,080断言：`portable-output.txt`、`stress-output.txt`、`oracle-output.txt`。
- 63项清单、37真实SVG及63生成占位的XML/尺寸/parts/slots/events/currentColor/唯一ID；25项素材测试：`art-contract.json`、`art-output.txt`。
- 主流程 Happy DOM：6仗到胜利、失败、14指定用例与算式渲染、出牌/撤回、刷新battle/loot、键盘选牌、练习选项、7尺寸横竖状态保持、clock数字、debug隔离。见 `dom-game-results.json`。
- 独立中断/重复输入/存储失败 Happy DOM：新开取消、放弃幂等、首次打穿只播一次、攻击中出牌/转屏、loot换向、奖励不重复、死亡与pagehide、结算写失败恢复、跨门槛圆环、heal完整时长、镜子过渡中撤回等。见 `independent-ui-dom-results.json`。
- 卡牌与检查页9组DOM，以及生产包美术替换4组DOM：`verification/art-inspector/dom-results.json`、`replacement-dom-results.json`。
- 艺术接线11组虚拟时钟/DOM：hitPoint、clock、stay、11特效、lose/gain、镜子200ms、stone跨14→19、heal700ms；见 `art-wiring-results.json`。
- `delivery-check.json`：规则基线SHA256、三项依赖、三个存储key、63项清单、相对路径、构建资源与外置美术完整性。

Happy DOM 使用模拟几何、加速或虚拟计时、动画API替身，只证明 DOM/状态/事件契约，不证明实际动画帧、字体、遮挡、视觉或性能。它是工程外测试工具，未添加到项目依赖。

## 没做什么

没有添加怪物技能、商店、金币、删牌/升级牌、局外成长、解锁、多路线地图、音效、账号、联网、排行榜、分享或广告。未发布站点、未上传 TapTap、未操作用户电脑，也未替换美术团队尚未交付的26份定稿。

## 没测什么与剩余交付缺口

云端 Chromium 在启动时失败：`socket() failed: Operation not permitted`，尚未进入游戏页面。两次启动尝试均失败，记录见 `browser-status.json`。

因此下列项目**没有测，也没有相应截图**：

- 7种尺寸×9类场景的63张真实画面、实际字体可读性与遮挡。
- 真实浏览器Pointer拖放、动画外观、帧率、连续出牌的真实手感。
- Chrome性能面板CPU×4录屏和FPS截图。
- 中档安卓、iPhone Safari、手机切App/锁屏恢复、真实转屏。
- TapTap上传及平台内运行。

交付内附 `verification/full/browser_acceptance.py`，语法检查通过但本轮未运行。它用于可启动Chromium的环境采集63张画面、刷新/键盘检查和CPU×4 trace；trace仍需在Chrome DevTools打开检查并截取FPS面板。素材专项浏览器脚本在 `verification/art-inspector/browser_checks.py`。没有用设计图或DOM模拟图伪装浏览器截图。

浏览器拒绝localStorage时无法保证关闭页面后仍保存内存中的进度或未写成的纪录；界面会提示，恢复写权限时可重试。已测试同页临时失败后的恢复，不能保证浏览器彻底禁用存储时跨页面恢复。

## 维护入口

- `src/ui/game.ts`：完整流程和表现。
- `src/save.ts`：读写/校验/结算事务。
- `src/ui/card.ts`、`card.css`：基础牌和工具牌。
- `src/layout/`：所有舞台位置及长屏适配。
- `src/art/`：素材载入、静止版、stay、slots、占位及检查页。
- `src/rules/README.md`：原已验收规则API，保持原样。

`verification/step1/` 及原有 verification 根日志是历史证据；本轮结果以 full 和 art-inspector 文件夹为准。`04-验收清单.md` 未勾的视觉/真机条目不是已通过。
