# 素材与字体来源

美术源、SVG 和 PNG 来自本项目原 H5 素材（`h5/public/`），按原导出器参数逐帧迁移，未重画。`art-source/` 保留原始交付记录。

`art/svg/` 是原已交付的 82 个 SVG；`art/placeholders/svg/` 的 7 个 SVG 是只读 `h5/src/art/placeholders.ts` 的 `generatePlaceholder` 原样输出：`card_art_shadow`、`card_art_whistle`、`relic_start2`、`relic_slow`、`relic_first2`、`relic_twice`、`ui_node_door`。H5 本来就没有这 7 个正式 SVG；Godot 保留其原占位外观及动画，没有替换成新画稿。

素材页“两扇门组合”另按 H5 原示例使用两只占位怪：`mon_chest`、`mon_bear`。仍由同一原始生成器导出全动画，保存于 `art/inspector/svg/` 与 `art/inspector/sprites.json`，17张图以 `inspector_` 前缀放在 `art/sprites/`。它们仅供原检查组合使用，不覆盖正常游戏的正式怪或145套素材registry；导出参数同主工具。生成命令：`node tools/export-inspector-samples.mjs`。

字体为 **Noto Sans CJK SC Regular / Bold 2.004**（简体中文），版权所有者见字体元数据，按 **SIL Open Font License 1.1** 分发。两个字体文件位于 `fonts/`，完整许可证位于 `fonts/OFL.txt`。下载使用官方仓库固定版本：

- [官方字体文件（Sans2.004）](https://github.com/notofonts/noto-cjk/blob/Sans2.004/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf)
- [官方粗体文件（Sans2.004）](https://github.com/notofonts/noto-cjk/blob/Sans2.004/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf)
- [官方许可证（Sans2.004）](https://github.com/notofonts/noto-cjk/blob/Sans2.004/LICENSE)

`audio/*.wav` 是只读 `h5/src/ui/sound.ts` 原代码在 Chrome `OfflineAudioContext` 中录制的合成音效，没有外部采样。68 种声音各录制原音量 1/2/3，保留原 master gain 与压缩器，48 kHz、立体声、16-bit PCM。`audio/sounds.json` 记录源代码 SHA-256、音量、帧数及长度。每条独立录音重置原合成器噪声种子；H5 原版共享噪声/混响种子在特定首次调用顺序下可能产生不同噪声波形，静态 WAV 不携带该跨音效状态。播放时机与音阶仍由原 UI 调用参数决定。

纹理的无损例外清单位于 `art/resources/lossless-assets.json`（40 项）：文字/细线界面、小图标、宝物以及暗色砖墙细纹理使用无损，其余怪、特效及牌面大图使用 VRAM 压缩；全部关闭 mipmap。逐动作的原生 `SpriteFrames` 按路径延迟加载，ArtResource 保留每帧区域、裁边偏移、毫秒数、stay进场/循环和槽矩阵。

重新生成：`npm run export:sprites`（也生成原 H5 占位图）、`npm run import:sprites`、`npm run record:audio`。两个浏览器工具均使用独立临时 profile、单 renderer / 单 raster 线程，只终止自己启动的 Chrome。
