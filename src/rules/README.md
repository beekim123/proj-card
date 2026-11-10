# 规则引擎交接 · 第 1 步

入口：`src/rules/index.ts`。全部是纯 TypeScript，状态为普通 JSON 对象。无 DOM、存储、时钟或全局随机数依赖。基础／工具数值在 `config.ts`，冒险数值和怪物文案在 `run-config.ts`。

## 冒险最小用法

```ts
import {
  createRun, playRunCard, undoRun, endRunTurn, chooseLoot, skipLoot,
  encodeRunSave, decodeRunSave, createRecords, updateRecords,
} from './rules';

const run = createRun(123); // 种子由调用方提供。
playRunCard(run, 0);        // 原地修改，返回 RowEntry，不是 RunState。
undoRun(run);              // 恢复出牌前所有状态，含随机进度。
endRunTurn(run);           // 冒险空过也算回合并减倒计时。

if (run.phase === 'loot') {
  chooseLoot(run, 0);       // 零基选项索引；下一仗开始。
  // 或 skipLoot(run)：回 1 心（最多 3），不拿牌。
}

const raw = encodeRunSave(run); // 活跃状态为 version 2 JSON，终局为 null。
const restored = decodeRunSave(raw); // { state, clear, reason }。

if (run.result) {
  const records = createRecords(); // 实际接线时应使用已读出的本机纪录。
  updateRecords(records, run);
}
```

所有命令由调用方检查当前阶段并处理异常。`playRunCard`、`endRunTurn`、`chooseLoot`、`skipLoot` 在错误阶段抛错；`undoRun` 没有可撤回记录或不在战斗时返回 `false`。

## 状态与结算

- `run.cards` 是整局牌身份清单，基础牌 id 1–30；每次拿额外牌新增最大 id +1。
- `run.game` 包含牌库、手牌、桌面、弃牌、倍率、成长、回合伤害、随机状态、出牌前历史。
- `run.monster` 包含当前血、满血、倒计时、是否打穿、回合起始血和原始超杀。
- `phase` 为 `battle | loot | victory | defeat`。打穿后仍处于 `battle`，可以继续出牌、撤回，直到结束回合。
- `game.turn` 为当前仗从 1 开始的回合号；`stats.turns` 累计已结束回合，放弃战斗时再计入当前回合。
- `hist` 与 `game.hist` 成对保存。不要从 UI 单独删改其中一份。
- `cloneRun` 深拷贝整个局；JSON 序列化／恢复保留随机状态与撤回。
- `abandonRun` 将活跃局结算为失败；在战利品阶段不会重复记录刚结束的回合／战斗。
- `updateRecords` 只针对已结算状态，原地更新纪录并标记 `recordsApplied`。刷新时的持久化事务顺序仍由后续存储适配层负责。

## 练习与兼容

```ts
import { createGame, playCard, previewCard, undo, endTurn, updateSettings } from './rules';
const game = createGame(123, { hand: 7, hint: true, grow: true, tools: true });
const preview = previewCard(game, game.hand[0]!);
playCard(game, 0);
undo(game);
endTurn(game);
updateSettings(game, { tools: false }); // 切换是否带额外牌会重新开始练习。
```

手牌支持 6／7／8。`tools: true` 给每种额外牌各 1 张，总共 35 张。练习空过不增加回合号；冒险必须使用 `endRunTurn`。

`createGame` 兼容旧随机函数参数，也接受整数种子。传入有状态的 `seededRng` 时复制其当前状态；普通旧随机函数只调用一次用作局内随机流种子。此后全部随机进度保存在 `game.rngState`。`endTurn`、`setHandLimit`、`updateSettings` 为兼容签名保留可选旧随机参数，但不再使用它。推荐新调用方直接传整数种子，不在 UI 维护另一份随机进度。

`seededRng(seed)` 仍可调用，并增加 `getState()` / `setState()`；`randomFromState(state)` 直接适配状态中的 32 位整数。不要用 `Math.random` 绕开局内流。

## 额外牌和预览

`Card` 在 `{ id, v }` 外增加可选 `type`：`bag | lens | hammer | mirror | stone`。镜子只在桌面记录变色后的宝石位；进入弃牌／牌库时用 `copyCard` 恢复原本 0 位，不污染整局牌身份。

`RowEntry` 的 `dmg` 为本牌基本伤害，`rainbow` 为彩虹额外伤害，`hammer` 为锤子加成，`damage = dmg + rainbow + hammer` 为本次总伤害。冒险用 `damage` 扣怪血。

`m`／`m2` 为出牌前／后倍率，后者包含放大镜；`gemValues` 固定在伤害计算时；`grown` 包含本张和磨石触发的形态变化。`formatFormula` 与 `formatCardHint` 输出新增工具的算式／提示。

`previewCard(state, cardOrMask)` 无副作用，不预览口袋摸到的牌。第二个参数是完整 Card 或宝石位，不是手牌索引；额外牌必须传完整 Card 才能预览效果。

## 显示和存储边界

`formatNumber` 维持原 4 位有效数字四舍五入和万／亿／兆／京。`formatOverkill` 先按规范向下舍，再用原大数字规则，故 `12345.6` 为 `×1.235万`。战利品数量使用原始超杀，不使用格式化结果。

`encodeRunSave`／`decodeRunSave` 不读写 localStorage。坏档返回 `state: null, clear: true, reason: 'invalid'`，由下一步适配层删除并显示提示；空档 `clear: false`。终局不生成可继续存档。内存／JSON 测试通过不等于浏览器刷新或手机恢复已验收。

## 复测和精度

运行根目录 README 的 6 项复测命令。最终日志在 `verification/step1/`；旧基础规则脚本与新增冒险 Vitest 的覆盖范围见 `HANDOFF.md`。

使用 JavaScript `number`；超出安全整数范围后不保证每个整数精确。未增加伤害上限，未改成 BigInt。
