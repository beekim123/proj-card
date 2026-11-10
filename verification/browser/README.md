# 本地浏览器验收（本轮未运行）

`browser_smoke.py` 是交付后可选的浏览器回归脚本。本轮只通过 Python 语法编译检查，没有成功启动浏览器、执行交互或生成截图，不能把它当成已通过的浏览器测试。

当前验证环境的限制：本地 Chromium 启动时报告 `socket() failed: Operation not permitted`；受支持的独立云浏览器也无法连接开发容器本地端口。规则、几何、素材纯函数测试不受此限制。

## 运行

1. 在工程目录运行 `npm ci`，然后 `npm run build`。
2. 另开终端运行 `npm run preview -- --port 4173`。
3. 建议在工程外建立 Python 虚拟环境。安装可选测试工具：
   - `python -m pip install playwright`
   - `python -m playwright install chromium`
4. 运行 `python verification/browser/browser_smoke.py --url http://127.0.0.1:4173`。如果脚本放在别的位置，替换脚本相对路径即可。
   - 可选：`--output <结果目录>`。
   - 可选：`--browser-executable <本机 Chromium 路径>`，否则使用 Playwright 安装的 Chromium。
5. 查看 `local-browser-results/browser-results.json` 和 PNG。失败项会使脚本退出码为 1。

这些工具不属于游戏运行依赖，也不需要加入 package.json；游戏仍只使用规范要求的三项开发依赖。

## 脚本覆盖

- 三种竖屏尺寸的舞台边界与截图。
- 调试用例 9/10/11/13、快速出牌、彩虹一次、最终数值。
- 真实鼠标事件拖拽、Z 撤回、空格结束回合。
- 规则/成长/牌库/设置弹窗、Esc 关闭、手牌设置刷新保留。
- 窗口横竖切换及布局设置保持当前回合。
- 素材检查页 34 项、24 张卡样、成长方案、双实例 ID、深浅背景。
- Chromium 触控事件仿真（不等于真机）。
- 捕获浏览器运行时 JavaScript 异常。缺失美术引发的预期 404 不算应用异常。

脚本使用独立浏览器上下文，只改变其中的测试局与本地设置。

## 必须人工补测

- 真实 iPhone Safari、安卓 Chrome 拖牌和中档安卓帧率。
- 与原竖/横屏 SVG 参考并排对照，检查实际字体、牌面、遮挡、缩放、动画时序。
- 取消拖拽、松手到按钮、提示关闭的预览、快速结束回合、按住牌时转屏、弹窗触屏滚动。
- 在构建后 `dist/art/` 放入保持原 viewBox/parts/events 约定的不同颜色 `dummy.svg`，重新加载游戏和检查页确认显示“美术”；此操作不执行 npm build。测试后移走测试 SVG。
- TapTap H5 上传及平台行为。

脚本不能自动证明上述项目通过。它也不代替真实审美/手感验收。
