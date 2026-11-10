# 界面交接

- `game.ts`：复用原生 DOM 舞台和 Pointer Events，实现首页、练习、冒险、战利品、结算、弹窗、键盘输入和 debug 入口。所有伤害、随机、战利品和结算均调用 `src/rules/`。
- `card.ts` / `card.css`：`createCard(store, maskOrCard, growth?, growthEnabled?, options?)` 保留数字 mask 兼容，支持完整工具牌；`options` 为 `static`、`resolved`、`play`。`playCardArt` 播工具事件；`setCardPaused` 控制静止和暂停。
- `geometry.ts`：原有手牌扇形、桌牌压缩与两行换行纯函数。
- `../layout/`：原有坐标保持，新冒险字段及长屏分配按附件 02；界面从布局表取位置。
- `../save.ts`：浏览器存储边界，只用约定的三个 localStorage key。终局调用 `recordResult`，记录成功后清活跃存档。

## 输入

Pointer capture、pointercancel、失焦、转屏、撤回、结束回合、弹窗都会取消拖牌。拖牌持续移动只改 transform；预览只在进入或离开可放区域时重建。规则同步结算，普通连续出牌不等动画结束。

Space：结束回合/拿战利品；Z：撤回；战利品 1–4 选中、Enter 拿走、0 不拿。鼠标或触摸选牌需连续选中同一张两次；选择别张只换选中。Esc 关闭弹窗，Tab 在弹窗内循环。

## 调试与定位

只有 `?debug=1` 暴露 `window.__gemcard`：

`snapshot/runSnapshot/screen/startAdventure/practice/goHome/resume/debugJumpFight/setMonsterHp/setHearts/giveTool/dealCards/scenario/deal/play/undo/end/endTurn/selectLoot/chooseLoot/skipLoot/records`。

`scenario(1..14)` 使用附件 01 §11.1 顺序；测试 11 设置红宝石已有 10 次成长。调试发牌可以明确补入指定额外牌，普通游戏仍完全由规则层管理牌身份和数量。

定位符包括 `#stage[data-layout]`、`.hand-card`、`.row-card`、`.loot-card[data-loot-index]`、`.turn-damage[data-value]`、`.result-panel`、`[data-action]`。

## 证据边界

本轮逻辑、素材契约、静态构建与 DOM 模拟通过记录见根 `HANDOFF.md`。没有真实浏览器、像素、动画帧率或真机验证，未提供这些项目的截图；不得由模拟结果推断视觉或手感通过。
