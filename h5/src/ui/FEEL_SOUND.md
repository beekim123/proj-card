# 第二版手感与声音接线

`feel.ts` / `feel.css` 只负责 DOM 动画，`sound.ts` 只负责合成声音，不读取或修改规则状态。全部手感数值在 `FEEL`；合成调音和音阶在 `SOUND`。没有音效文件、外部资源和 `Math.random()`。

## 初始化与设置

- `new SoundSystem(prefs)`，随后 `sound.bindUnlock(document)`。第一次 pointerdown 或 click 才创建 AudioContext；后台停止现有声部并 suspend，前台只恢复已解锁的上下文。`configure(prefs)` 接 `sound`、`volume: 1 | 2 | 3`。
- `new FeelSystem({ stage, fxLayer }, prefs)`。`configure(prefs)` 接 `shake`、`animationSpeed: 'normal' | 'fast'`。
- 设置由界面统一通过 `saveSettings` 持久化在 `gemcard.settings`，两个模块不另占存储键。
- 切画面、撤回或重建舞台时 `feel.reset()`。销毁时两个系统各 `dispose()`。

## 出牌反馈

1. 同步创建桌牌与本张特效，播放素材事件。
2. `sound.playCard(index)`：index 是本回合已打出牌中这张的零起始位置，下一回合自然回到 0，撤回不会使音阶漂移。
3. `feel.cardDrop(rowCard)`。牌落地用 additive transform 压 6px、120ms，不覆盖布局 transform。
4. `feel.hit({ monster: monsterMotion, big, pierce })`：monsterMotion 是怪外层。自动对已有怪、fx 动画顿帧，并立即闪白/打退/三档震屏。普通 60ms，大击 120ms；快速模式减半。
5. 打穿时，等本张所有动画创建后再 `feel.slow([monsterMotion, rowCard, ...本张动画节点])`，包括倍率、数字或特效等由调用方确定的本张节点；此方法重复调用不再次除以 2，300ms 后恢复原速。快速模式不慢放。
6. `feel.number(innerText, damage)`：传漂浮容器内的文本节点，让外层漂浮与 280ms 弹跳独立。显示大小是 44/60/80px，100 万以上金色斜体。给虹字保留 `.rainbow`，渐变会压过 `.big` 金色。
7. `feel.multiplier(badge, doubled)` + `sound.double(index)`。翻倍使用 300ms 的 X 轴 0→180→360 和 1.25 倍；非翻倍只 1.1 倍。
8. `sound.hit(big)` / `sound.pierce()`、`sound.white()`、`sound.rainbow()` 与规则结果同一调用栈播放，不等待动画。凑白素材由 UI 在两牌之间创建并使用 `FEEL.whiteScale`。

## 其他反馈

- 规矩：同一调用栈触发素材事件、`feel.rule(sign, id)`、`sound.rule(id)`、倒计时更新。id：`bite / hug / unwind / wound_down / bell / layer`。龙牌子的文字由 UI 在 `FEEL.rule.changeMs` 中点替换；若使用素材的 flip，不再额外调用 `feel.rule(sign, 'layer')`，避免双翻。
- 宝物：`feel.relic(icon)`，200ms 放大 1.3 并提亮。标签由 UI 使用规则结果显示。
- 彩虹：`feel.rainbow(chainNodes, callback)` 每张间隔 60ms 提亮，完成后大震屏并回调。UI 在 callback 创建全屏素材并使用 `FEEL.rainbow.effectScale`（2）。六格两次闪烁/保持亮由 UI 同步规则状态。
- 怪出手：同一调用栈素材 `attack` 和 `feel.attack(monsterMotion, onImpact)`；330ms 回调、暗边和大震屏同时发生，回调内播放原位心碎和 `sound.heartLose()`，800ms 退回。reset 会取消未到的回调。
- 回心：`feel.heal(heart)` + `sound.heal()`；多颗以 `FEEL.heal.gapMs`（150）间隔。素材 gain/heal 由 UI 播放。
- 按钮：`sound.button()`。

## 验证范围

`feel.test.ts` 验证八连发、三档震屏/开关、330ms 打中、reset 取消、数字分档、倍率、彩虹顺序、顿帧重叠和暂停归属、慢放原速恢复与快速模式。`sound.test.ts` 验证首次手势、前后台、静音/音量、单回合五声音阶、全部合成音、八连发和声部上限。音色听感、真浏览器流畅度及 4 倍 CPU 降速需要浏览器实测，单元测试不能替代。
