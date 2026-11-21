# 卡册（第三版，2026-11-20）

照 30 包 Neo 交的「深林碑廊」接进来：单独一页、通用背景；一排牌左右滚（拖动带惯性、滚轮、左右键、点两侧的牌、拖底部卷轴条），正中那张放大，脚下法阵，地面有倒影。上面换章：全部 / 色光 / 法术 / 封印。点正中的牌拿出来细看（跟着鼠标微转、可看牌背）。封印牌下面有「试演」，不用收录也能试，不是奖励。一进来停在第一张。

- **背景按卡集换**：`module.js` 的 `SETS` 一个卡集一项，现在只有夜林，背景先用通用的（`view.js` 的 `background()`：暗青底、冷雾光、横雾、光尘，不放树和柱子）。以后加别的场景，加一项、配它自己的背景。卡册是不透明的一页（`a.opaque`），展开后主程序不画后面的世界。
- **牌面** 一律用石板牌 `../draw/slate-ui.js` 的 `drawSlateCard`，跟战斗同一套；没收录的画牌背压暗 + 章的徽记。
- [状态与输入](module.js)：`openAlbum`、`albumAction`（`category`（-1 = 全部）/ `step` / `wheel` / `folio` / `inspect` / `flip` / `putback` / `study` / `back`）、`updateAlbum`、`albumPointer`（拖走廊、拖卷轴条）。声音写进 `a.sfx`，`a.exitReady` 为真时回宿主。
- [画面](view.js)：Cover-Flow 式伪 3D（绕竖轴转 = 横向压扁 + 错切、厚边、扫光、远处沉进雾）、倒影、卷轴条、细看。
- 独立打开：双击 [卡册.command](../../卡册.command)（[album.html](../../album.html)、[launch.cjs](launch.cjs)）。
- 旧的三本小册子版本存档在 `CURRGO/存档/2026-11-20-card-web卡册旧版-三本小册子.zip`。
