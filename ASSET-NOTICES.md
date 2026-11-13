# 素材与字体来源

当前118份新画法SVG来自用户的设计画风库：Fable包11件、Carbon包11件、重制03–07包96件。逐ID来源路径、交付SHA-256记录于 `art/new-art-provenance.json`；`art/svg/` 保留交付原文字节，包含原件本身的格式和注释。项目按事件30fps、循环15fps逐帧生成 `art/sprites/` 的182套、496张PNG，再生成365个原生动作资源。

正常游戏和素材检查器均使用这些新稿，不再使用旧H5图稿、29项占位别名或独立占位怪示例。`art-source/` 和只读 `h5/` 保留历史参考，不参与当前原生包。

`art/svg/` 是项目工作源；其`.gdignore`使原SVG不进入运行PCK。运行包携带PNG、原生资源及来源/帧指纹；完整原件SHA在工作源检查，包内另核对原生和精灵指纹。

字体为 **Noto Sans CJK SC Regular / Bold 2.004**（简体中文），版权所有者见字体元数据，按 **SIL Open Font License 1.1** 分发。两个字体文件位于 `fonts/`，完整许可证位于 `fonts/OFL.txt`。下载使用官方仓库固定版本：

- [官方字体文件（Sans2.004）](https://github.com/notofonts/noto-cjk/blob/Sans2.004/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf)
- [官方粗体文件（Sans2.004）](https://github.com/notofonts/noto-cjk/blob/Sans2.004/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf)
- [官方许可证（Sans2.004）](https://github.com/notofonts/noto-cjk/blob/Sans2.004/LICENSE)

`audio/*.wav` 是只读 `h5/src/ui/sound.ts` 原代码在 Chrome `OfflineAudioContext` 中录制的合成音效，没有外部采样。68 种声音各录制原音量 1/2/3，保留原 master gain 与压缩器，48 kHz、立体声、16-bit PCM。`audio/sounds.json` 记录源代码 SHA-256、音量、帧数及长度。每条独立录音重置原合成器噪声种子；H5 原版共享噪声/混响种子在特定首次调用顺序下可能产生不同噪声波形，静态 WAV 不携带该跨音效状态。播放时机与音阶仍由原 UI 调用参数决定。

纹理的无损例外清单位于 `art/resources/lossless-assets.json`（55 项）：文字/细线界面、小图标、宝物以及暗色砖墙细纹理使用无损，其余怪、特效及牌面大图使用 VRAM 压缩；全部关闭 mipmap。生成的原生 `SpriteFrames` 可按路径延迟加载，ArtResource保留每帧区域、裁边偏移、毫秒数、stay进场/循环和槽矩阵；当前游戏实际以 `sprites.json` 和 `SpriteArt` 自绘当前帧，按需加载对应PNG纹理，不在启动时加载全部SpriteFrames。

重新生成：`npm run export:sprites`、`npm run import:sprites`、`npm run record:audio`。新版缺稿时直接报错，禁止回退到旧占位生成器。两个浏览器工具均使用独立临时 profile、单 renderer / 单 raster 线程，只终止自己启动的 Chrome。
