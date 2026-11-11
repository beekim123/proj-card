# 第二版素材契约与检查页

## 已实现

- `public/art-manifest.json` 与本批 `素材清单.json` 完全一致：版本 3，共 75 项。
- 原有 63 份 SVG 未修改；`original-art-sha256.json` 记录输入项目的 SHA-256。
- 12 项新素材仍由 `generatePlaceholder` 在缺图时生成。规矩图标写名称首字、宝物写前两字；规矩牌包括空的文字及图标槽；彩虹为六色可染圆槽。
- 怪物占位支持 `bite`、`unwind`、`wound_down`、`ring`、`layer`。真图缺少新事件 CSS 时，播放器仍按清单计时完成，不等待 `animationend`。
- 检查页可按第二版「全部 / 第 1 批 / 第 2 批」筛选，能与「返修 / 重画 / 新画」筛选组合；规矩牌预填「咬手」及 `rule_bite`；彩虹并排展示六种颜色。
- `ArtStore.setSlotIcon(svg, 'icon_slot', 'rule_bite')` 按素材坐标 `[20,16,56,56]` 填入图标，可传第四参数覆盖该框；图标引用当前加载的 SVG，后续换图无需改代码。
- `play` 和 `effect` 在清单计时结束后仍会等待尚未完成的有限动画，避免顿帧/慢放剪掉尾部；无限待机不参与等待，没有对应事件动画则照清单计时完成。
- 彩虹退出持久亮灯的调用顺序：`store.setStay(slot, null)`，然后 `store.play(slot, 'out')`。这保留原有「临时动画结束后恢复 stay」契约。

## 已执行验证

运行 `node verification/v2-art/run-contract.mjs`。

`contract-result.json`、`contract-output.txt` 记录 11 组通过：75 项尺寸/部件/slot/事件/时长/tint、XML、ID 隔离、名称占位、批次筛选、全部缺图回退、图标槽、真实旧宝箱缺 bite 的精确 300ms 完成与重播、持久事件和灭灯、顿帧/慢放后的有限动画尾部与旧回调保护、原图 SHA-256 保留。

该脚本使用 Node 24 原生 TypeScript 去类型、断言及 Python XML 解析，**不是** TypeScript 类型检查、Vitest 或真实浏览器测试。新的 Vitest 用例在 `src/art/v2-art.test.ts`；原 `src/art/art.test.ts` 的素材总数及加载次数已升级为 75 项。

## 仍需在完整构建后验证

依赖安装及真实浏览器由整包集成验证。此处不将未执行项标为通过。

1. 打开 `?page=art`，确认显示 75 项；第 1 批 3 项、第 2 批 16 项。反复切换批次和状态后恢复全部仍为 75 项。
2. 确认规矩牌上「咬手」与左侧图标可见、翻牌正常；六色圆槽初始亮灯，`out` 后不再恢复亮灯，再按 `light` 可亮；发条兵在 `daze` 与 `wound_down` 间切换时只有当前持久事件按钮为开启。
3. 现有真图下点击宝箱 `bite`：300ms 后属性清除，无异常；真图不会因为缺新事件而回退。
4. 测试替换文件：
   - 先记录 `dist/assets/` 和 `dist/index.html` 的 SHA-256。
   - 仅将 `verification/v2-art/mon_chest.with-bite.svg` 复制为 `dist/art/mon_chest.svg`，不要重建。
   - 刷新游戏和检查页，应看到 `BITE V2 CHECK`；游戏咬手和检查页 `bite` 都会播放夹具的动画。
   - 复核 JS 与 index 哈希不变，记录截图及结果。
   - 将 `public/art/mon_chest.svg` 拷回 `dist/art/mon_chest.svg`，刷新确认原图恢复。交付包不得留下测试夹具作为正式宝箱图。
