# 新卡牌 本体 · 美术 第 1 批（样稿 7 个）制作说明 `notes.md`

本批次共交付 `素材清单.json` 中 `batch: "本体第1批"` 的 7 个 SVG 素材、对应的 8 张 2 倍透明 PNG（含 `ui_door` 关门待机与开门定格各 1 张），全部严格遵循第二版动法硬性规则与哥特画风配色规范：
- **同一动作时间点重合度**：同一个动作内所有运动部件的 `@keyframes` 关键帧百分比完全一致，**不重合次数为 0**。
- **缓动与属性约束**：全程未使用 `steps()`，未在运动层挂载任何 SVG 滤镜，仅使用允许的 4 种缓动（`cubic-bezier(.2,.8,.2,1)`、`ease-in-out`、`cubic-bezier(.34,1.56,.64,1)`、`linear`），且只动画化 `transform` 与 `opacity`。
- **出框与留空检查**：所有动作按每 20ms 逐帧检查，**0 处出框**；`card_art_hourglass` 与 `card_art_seal` 左上角 `x: 0–30, y: 0–90` 区域严格留空。

---

## 1. 各素材动作实际使用的关键时间点与幅度

### 1.1 门 `ui_door`（`320×480`，落地点 `160, 480`）
- **部件**：`#root`、`#frame`、`#dark`、`#leaf`（内含门环子部件 `#door_ring`）。
- **构图说明**：尖拱石门框、拱顶一排铁铆钉、横梁铁箍、左侧上合页与右侧铁门环集中在顶部 `y < 120` 与左右边缘，避开中间 `x: 40–280, y > 120` 怪物与规矩牌子的遮挡区；门框顶部无多余高耸装饰。
- **待机 (`idle`)**：静止不动。
- **事件 `open`（时长 `600ms`，`animation-fill-mode: forwards` 播完停住）**：
  - 运动部件：`#leaf`、`#door_ring`（共 2 个部件，关键时间点 100% 重合）。
  - **关键时间表**：
    | 时间点 (ms) | `@keyframes` 百分比 | `#leaf` 姿势 | `#door_ring` 姿势 | 缓动函数 |
    |---|---|---|---|---|
    | `0ms` | `0%` | `scaleX(1) skewY(0deg)`（关着） | `rotate(0deg) translateY(0px)` | `cubic-bezier(.2,.8,.2,1)` |
    | `100ms` | `16.67%` | `scaleX(0.96) skewY(0.8deg)`（往里一顿） | `rotate(-14deg) translateY(-4px)`（门环颤一下） | `cubic-bezier(.2,.8,.2,1)` |
    | `400ms` | `66.67%` | `scaleX(0.12) skewY(-2.2deg)`（绕左门框 `x=48` 合页转开，横向压到 **12%**） | `rotate(10deg) translateY(2px)` | `linear` |
    | `480ms` | `80%` | `scaleX(0.12) skewY(-2.2deg)`（停住） | `rotate(10deg) translateY(2px)`（停住） | `cubic-bezier(.34,1.56,.64,1)` |
    | `600ms` | `100%` | `scaleX(0.15) skewY(-1.6deg)`（轻轻回弹到 **15%** 并停住，门洞露出 **85%**） | `rotate(4deg) translateY(0px)` | — |

### 1.2 静态奖励图标 ×3（`64×64`，`load: "img"`，静态无事件）
- **`ui_reward_card`**：斜放（`-11°`）的额外牌牌背，采用 `card_frame_tool.svg` 的冷铁灰青底色（`#3B515C` / `#1E2C33`）与骨白/旧银镶边及折角角花（`#E2D6BA` / `#C8B894`），中心简化版八角盾徽与红圆、绿方、蓝三角三色宝石，右上角配粗边小加号。
- **`ui_reward_shop`**：张开双刃的冷铁旧铜剪刀（扔牌）与带分叉缺口的羊皮纸白羽毛笔（抄牌）呈 X 形交叉，粗外框 + 1 层暗面，缩至 `28×28` 仍清晰可辨。
- **`ui_reward_heal`**：照 `ui_heart.svg` 简化的旧铜心形挂坠配右上角小加号；心形红宝石（`#E3263A` / `#FF5C6E`）是全图唯一鲜艳颜色。

### 1.3 老门环 `npc_knocker`（`240×240`，中心 `120, 120`）
- **部件**：`#root`、`#plate`、`#face`（含眉毛子组 `#brows`）、`#eyes`、`#mouth`、`#ring`。
- **配色与细节**：全身采用压暗的旧古铜色（`#9A7B46` / `#6E542B` / `#3B2B14`），唯有两只小眼睛瞳孔各嵌一点绿宝石色（`#1DBF5E` / `#5CE892`）；嘴腔深底向上延伸至上唇后方，张嘴 `16px` 时露出完整暗色嘴腔、门牙与铜环上沿，无任何露缝。
- **待机 (`idle`，两轮 `3000ms` 合成一个 `6000ms` 循环)**：
  - 运动部件：`#ring`、`#eyes`（共 2 个部件，关键时间点 100% 重合）。
  - **关键时间表**：
    | 时间点 (ms) | `@keyframes` 百分比 | `#ring` 姿势 | `#eyes` 姿势 | 缓动函数 |
    |---|---|---|---|---|
    | `0ms` | `0%` | `rotate(-4deg)`（铜环在左 `-4°`） | `scaleY(1)`（睁眼） | `#ring`: `ease-in-out` / `#eyes`: `linear` |
    | `1350ms` | `22.5%` | `rotate(3.7deg)`（向右摆动途中） | `scaleY(1)`（准备眨眼） | `#ring`: `ease-in-out` / `#eyes`: `cubic-bezier(.2,.8,.2,1)` |
    | `1500ms` | `25%` | `rotate(4deg)`（第 1 轮到右 `+4°`） | `scaleY(0.08)`（落在 `1500ms` 眨眼闭合） | `#ring`: `ease-in-out` / `#eyes`: `cubic-bezier(.2,.8,.2,1)` |
    | `1650ms` | `27.5%` | `rotate(3.7deg)`（开始回摆） | `scaleY(1)`（睁开） | `#ring`: `ease-in-out` / `#eyes`: `linear` |
    | `3000ms` | `50%` | `rotate(-4deg)`（回到左 `-4°`） | `scaleY(1)` | `#ring`: `ease-in-out` / `#eyes`: `linear` |
    | `4500ms` | `75%` | `rotate(4deg)`（第 2 轮到右 `+4°`，不眨眼） | `scaleY(1)` | `#ring`: `ease-in-out` / `#eyes`: `linear` |
    | `6000ms` | `100%` | `rotate(-4deg)`（回到左 `-4°`） | `scaleY(1)` | — |
- **事件 `talk`（时长 `1200ms`）**：
  - 运动部件：`#mouth`、`#ring`、`#brows`（共 3 个部件，关键时间点 100% 重合）。
  - **幅度**：嘴张开下移 **16px**（满足 `≥ 14px` 下限）；铜环被带起上移 **12px**（满足 `≥ 10px` 下限）；眉毛同步挑起 **7px**。
  - **关键时间表**：
    | 时间点 (ms) | `@keyframes` 百分比 | `#mouth` 姿势 | `#ring` 姿势 | `#brows` 姿势 | 缓动函数 |
    |---|---|---|---|---|---|
    | `0ms` | `0%` | `translateY(0px)` | `translateY(0px) rotate(-4deg)` | `translateY(0px) rotate(0deg)` | `cubic-bezier(.2,.8,.2,1)` |
    | `150ms` | `12.5%` | `translateY(16px)`（第 1 次张开） | `translateY(-12px) rotate(2deg)`（带起） | `translateY(-7px) rotate(-2.5deg)`（挑眉） | `cubic-bezier(.2,.8,.2,1)` |
    | `300ms` | `25%` | `translateY(0px)`（合上） | `translateY(1px) rotate(-2deg)`（落下） | `translateY(-1px) rotate(0deg)` | `cubic-bezier(.2,.8,.2,1)` |
    | `450ms` | `37.5%` | `translateY(15px)`（第 2 次张开） | `translateY(-11px) rotate(-3deg)` | `translateY(-6px) rotate(2deg)` | `cubic-bezier(.2,.8,.2,1)` |
    | `600ms` | `50%` | `translateY(0px)`（合上） | `translateY(1px) rotate(1deg)` | `translateY(-1px) rotate(0deg)` | `cubic-bezier(.2,.8,.2,1)` |
    | `750ms` | `62.5%` | `translateY(16px)`（第 3 次张开） | `translateY(-12px) rotate(3deg)` | `translateY(-7px) rotate(-2deg)` | `cubic-bezier(.2,.8,.2,1)` |
    | `900ms` | `75%` | `translateY(0px)`（合上） | `translateY(1px) rotate(-1deg)` | `translateY(0px) rotate(0deg)` | `cubic-bezier(.2,.8,.2,1)` |
    | `1050ms` | `87.5%` | `translateY(10px)`（第 4 次小张） | `translateY(-8px) rotate(1.5deg)` | `translateY(-4px) rotate(-1deg)` | `cubic-bezier(.34,1.56,.64,1)` |
    | `1200ms` | `100%` | `translateY(0px)`（回到待机） | `translateY(0px) rotate(-4deg)` | `translateY(0px) rotate(0deg)` | — |

### 1.4 额外牌原画·沙漏 `card_art_hourglass`（`176×188`）
- **配色与留空**：左上角 `x: 0–30, y: 0–90` 完全留空；旧铜架配冷暗玻璃泡，内部流淌鲜艳青色宝石碎粒（`#3FE3F0` / `#A6F9FF`，唯一鲜艳色），上半截剩一大半。
- **待机 (`idle`，周期 `2500ms` 循环)**：
  - 运动部件：`#stream_idle`（4 颗青色宝石碎粒顺滑下落，上下两堆高度不变）。
  - **关键时间表**：`0ms (0%)` → `500ms (20%)` → `2000ms (80%)` → `2500ms (100%)`（`linear`）。
- **事件 `play`（时长 `600ms`）**：
  - 运动部件：`#hourglass_unit`、`#sand_top`、`#sand_bottom`、`#stream_idle`、`#gems_rewind`、`#cyan_flash`（共 6 个部件，关键时间点 100% 重合）。
  - **幅度**：上半截碎粒堆 `#sand_top`（底高 `36px`，以腰部 `y=90` 为轴 `scaleY(1.42)` 加 `translateY(-4px)`）向上长高约 **19px**（满足 `≥ 12px` 下限）；倒飞碎粒组 `#gems_rewind` 共绘制 **8 粒**独立切面青色晶粒（满足 `≥ 6 粒` 下限）。
  - **关键时间表**：
    | 时间点 (ms) | `@keyframes` 百分比 | 动作状态描述 | 缓动函数 |
    |---|---|---|---|
    | `0ms` | `0%` | 待机初始状态 | `cubic-bezier(.2,.8,.2,1)` |
    | `150ms` | `25%` | 整只沙漏下蹲一震（`translateY(5px) rotate(-3.5deg)`），下落碎粒流 `#stream_idle` 停流淡出，倒飞碎粒群 `#gems_rewind` 显现 | `cubic-bezier(.2,.8,.2,1)` |
    | `450ms` | `75%` | 8 粒青色碎粒从下半截倒着飞回上半截（`translateY(-28px)`），上半截碎粒堆明显长高 **19px**，同时 `#cyan_flash` 闪出青光与回溯光弧 | `linear` |
    | `520ms` | `86.67%` | 停住在高点位置 | `cubic-bezier(.34,1.56,.64,1)` |
    | `600ms` | `100%` | 顺滑弹回待机高度 | — |

### 1.5 额外牌原画·封条 `card_art_seal`（`176×188`）
- **配色与留空**：左上角 `x: 0–30, y: 0–90` 完全留空；画面无任何鲜艳宝石色，木牌照怪头顶规矩木牌（双绳悬挂、铁包角、刻有原规矩字迹），交叉贴两条旧羊皮纸封条，正中盖压暗酒红蜡印（`#8C3B45` / `#5E242C`）。
- **待机 (`idle`，周期 `3000ms` 循环)**：
  - 运动部件：`#seal_corner`（右上角封条纸尾轻轻翘起 `-12°` 又落下）。
  - **关键时间表**：`0ms (0%)` → `1500ms (50%)` → `3000ms (100%)`（`ease-in-out`）。
- **事件 `play`（时长 `600ms`）**：
  - 运动部件：`#sign_board`、`#seal_1`、`#seal_2`、`#wax_stamp`（共 4 个部件，关键时间点 100% 重合）。
  - **幅度**：`100ms` 时两条封条与蜡印向上弹起离开牌子 **22px–26px**（远超 `≥ 16px` 下限），完整露出底下木牌字迹。
  - **关键时间表**：
    | 时间点 (ms) | `@keyframes` 百分比 | 动作状态描述 | 缓动函数 |
    |---|---|---|---|
    | `0ms` | `0%` | 待机初始状态 | `cubic-bezier(.2,.8,.2,1)` |
    | `100ms` | `16.67%` | `#seal_1`（上移 `22px`）、`#seal_2`（上移 `22px`）与 `#wax_stamp`（上移 `26px`）一起弹起离开木牌，露出牌面字迹 | `cubic-bezier(.2,.8,.2,1)` / `linear` |
    | `250ms` | `41.67%` | 第一条封条 `#seal_1` 啪地拍回木牌（木牌轻震下沉 `2px`），`#seal_2` 与 `#wax_stamp` 保持悬空 | `cubic-bezier(.2,.8,.2,1)` / `linear` |
    | `400ms` | `66.67%` | 第二条封条 `#seal_2` 啪地拍回木牌与第一条交叉成叉（木牌下沉 `3px`），蜡印悬在正上方蓄势 | `cubic-bezier(.2,.8,.2,1)` |
    | `500ms` | `83.33%` | 蜡印 `#wax_stamp` 重重按下去压扁到位（`scale(1.22, 0.84)`），整块木牌与封条受压下沉 `5px` | `cubic-bezier(.34,1.56,.64,1)` |
    | `600ms` | `100%` | 弹回待机姿势 | — |

---

## 2. 有没有做不到的地方？

- **全部需求均已 100% 实现，没有做不到的地方。**
- **补充细节说明**：在 `npc_knocker` 的 `idle` 待机动画中，为同时满足“每两轮（`6000ms`）在 `1500ms` 眨一次眼”与“同一动作各部件时间点 0 次不重合”，将 `#ring` 与 `#eyes` 统一设为 `6s` 循环，并在两个部件的 `@keyframes` 中共同声明了 `0%, 22.5%, 25%, 27.5%, 50%, 75%, 100%` 七个完全重合的时间点（其中 `22.5% -> 25% -> 27.5%` 对应 `1350ms -> 1500ms -> 1650ms` 的眨眼过程，`#ring` 在 `22.5%` 与 `27.5%` 处取正弦平滑过渡值 `3.7deg`），既保证了铜环 3 秒一轮顺滑摆动，又确保了关键帧时间点 100% 对齐。
