# 新卡牌 · Godot 4.7.2

当前开发分支新增两幕12仗、幕末带走、收藏室及v5存档。见 [本体第2批记录](docs/v2/batch-2-implementation.md) 和 [HANDOFF](HANDOFF.md)。图形截图及用户体验尚未验收；第三幕与加码未开放，H5仍为只读参照。


双击根目录 **启动.command**，或运行：

```sh
tools/run.sh
tools/run.sh --art
tools/run.sh --debug
tools/run.sh --layout=portrait
tools/run.sh --layout=landscape
tools/check.sh
```

`GODOT_BIN` 可指定另一份 **4.7.2 正式版** 引擎。默认使用根目录 `Godot.app`。Compatibility 渲染；图形窗口每次实时识别、校验并放在 Mac 内屏，不使用历史固定坐标。

横屏逻辑布局为 1920×1080。经本轮确认，竖屏保留 H5 的 1080×2160 原布局，在 1080×1920 的逻辑窗口等比留边。默认随窗口方向切换，也可在设置固定；命令行 layout 参数优先。

`h5/` 保存全部原 H5 文件与原有未提交改动，作为冻结只读参照，不参与 Godot 运行或打包。参考服务可以在 `h5/` 运行 `npm run dev -- --port 8780`。本轮自动截图使用独立 18780 端口，避免碰到已有的 8780 服务；缓存写入 `artifacts/`。

Godot 编辑器会自动生成导入旁文件。为保护 H5，本项目工具先在 `artifacts/godot-project/` 建只含原生资源的镜像，再导入和出包，最后同步原生导入缓存；保留 H5 期间请用这些工具，避免直接对根目录执行 `--editor` 扫描。

```sh
npm run export:sprites                  # 全部SVG逐帧导出，参数与H5一致
npm run export:sprites mon_clock        # 指定素材
npm run import:sprites                  # 生成原生资源及导入策略
npm run record:audio                    # Chrome离线录制原合成器
tools/import.sh                         # 单worker隔离导入
tools/export.sh                         # macOS和Windows
node tools/screens.mjs                  # 配对截图；顺序运行Chrome和Godot
```

素材工作源在 `art/svg/`；美术原件仍在 `art-source/`。占位图生成器与离线音效合成源码已逐字复制到 `tools/`，验收后删除 H5 不会破坏导图、录音或原生测试。重新生成黄金/源用例基准仍需原 H5，仅在确实更新基准时执行 `tools/golden/` 工具。

交付范围、完整验证结果、与 H5 的区别和平台限制见 [HANDOFF.md](HANDOFF.md)，当前执行阶段见 [docs/v2/status.md](docs/v2/status.md)。

## 本体第2批：交给Dot开发

历史交接（2026-11-11，开发前）：当时Godot基线完整检查4866项通过、0失败。第二批在该次交接时尚未实现；开发要求、数值、存档迁移、实施计划及验收在 [第二批开发包](docs/development/body-batch-2/00-开发说明.md)，可复制的开工提示词见 [给Dot的提示词](docs/development/body-batch-2/06-给Dot的提示词.md)。

本批做第二幕、去留、收藏室、3张新牌和5件宝物；新美术先占位，第三幕和加码留到第3批。引擎二进制不在Git中，接收方提供Godot4.7.2并设GODOT_BIN，先 `bash tools/import.sh`，再 `bash tools/check.sh`。

## 本体第3批：编码包已准备

第三幕、最后4件普通宝物、完整通关/大宝石、加码1–5及存档/纪录的 [第三批开发包](docs/development/body-batch-3/00-开发说明.md) 已整理；[开工提示词](docs/development/body-batch-3/06-给Dot的提示词.md) 可交接执行。运行代码仍为第二批，第三批尚未实现。须从第二批开发分支继承并先处理包内07的L01–L05，不能从旧main直接开始；技术、视觉与用户验收分别记录。
