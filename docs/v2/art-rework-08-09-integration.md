# 第08、09包返修接入记录（2026-11-12）

状态：本地候选接入、最终技术复验及两平台刷新完成；接着 `codex/body-batch-3-new-art` 的现有未提交工作。本轮不提交、不推送、不合并。

需求：`../design/新卡牌/美术/新画法全量重制/第08包-细节重做/接入包-给GPT/需求.md` 第3–5节。

执行清单（由当前代理依次执行，单worker）：

- [x] 保存本轮前3232文件指纹与Git状态，核对分支。
- [x] 接收脚本顺序加入08的14件、09的3件白名单覆盖；写入前检查完整SHA及原有接口；非白名单列出跳过，基础包重复仍拒绝。
- [x] 17源SVG的完整SHA及provenance与需求逐项一致；其余101件未变。
- [x] 重导全部25套染色、92动作、2412段帧、117张PNG；其余101件registry及PNG字节未变，所选ID无旧PNG残留。
- [x] 生成原生资源，准备隔离镜像。
- [x] Godot导入及资源预检取得真实退出码：均0。
- [x] 最终完整 `bash tools/check.sh`：6129通过、0失败、真实退出0；冻结3234个输入在出包后仍未变。
- [x] 30张需求GPU图全部落盘、逐张打开复核，另有1张实际Mac发行包首页图；问题仅记录。
- [x] 刷新macOS/Windows本地包，结构、Mac签名、两平台实际PCK新来源/资源核对均退出0；Mac实际包从项目外启动截图退出0。
- [x] 本记录、status.md及机器摘要记录候选/技术/用户验收边界。

证据目录：`artifacts/art-rework-08-09/`。截图脚本单独位于tests/tools，不改生产UI、规则、数值、SVG、H5参照或黄金数据。尚无写死旧指纹断言需要更新。

已知交付边界：现有收藏室只显示“大宝石·已收藏”文字，不渲染大宝石原画；需求禁止修改UI，因此将截图现状并明确记录此缺项。30fps帧截图将同时记录请求毫秒与实际离散采样帧。

本轮代理授权工作已结束，当前无需你操作。用户主观验收未进行，后续可选范围见文末。

## 逐件来源与重导清单

下列完整SHA均与需求表及原稿字节一致。PNG包含静止图和动画图集；帧段数包含去重后连续帧段，不等于独立图像数。

| ID | provenance.package | SHA-256 | 套数 | 帧段 | 独立帧 | PNG |
|---|---|---|---:|---:|---:|---:|
| `mon_tree` | 08-细节重做 | `7c92db6de196e72fec128136b92c6c459093643822af2b98e324382b09384ca4` | 1 | 200 | 179 | 9 |
| `mon_chest` | 08-细节重做 | `9c0b837815ca75dbeafcecd050e701a06c02bcd974485acca126a563c454bd57` | 1 | 183 | 162 | 9 |
| `card_art_mirror` | 08-细节重做 | `2a0d6ad02c27f9a8fb7a5b429348de2a5e007948507c0d2c1585a872cf5e8156` | 9 | 558 | 369 | 27 |
| `card_art_lens` | 08-细节重做 | `b18a2f222a22517ab10f2c95e9135f6a1101224e02f58054214353a0471d4239` | 1 | 62 | 41 | 3 |
| `card_art_hammer` | 08-细节重做 | `dccddb00ab67f67f3670f60ee316f5e483ffab948350db8249f9d9db30256972` | 1 | 62 | 41 | 3 |
| `card_art_diamond` | 08-细节重做 | `15142acc9823fef6e068a888c07aa22a3094b82720d77a94f1c8dbad786aa7b7` | 1 | 62 | 41 | 3 |
| `card_art_whistle` | 08-细节重做 | `dd5289557d200895734a908488712d13eabe2e2f567f2393163f5cf5fa1c9f44` | 1 | 62 | 41 | 3 |
| `mon_soldier` | 08-细节重做 | `3de1f2b3832433c0362834d37c44a43298a078ef18d7c563aee47f437801d8e1` | 1 | 203 | 203 | 10 |
| `mon_portrait` | 08-细节重做 | `851ebb9862af31d11c2cfef5dc85934fc89052bf5914dae57ab776c2e73a13c1` | 1 | 182 | 161 | 9 |
| `mon_lock` | 08-细节重做 | `4f605e96653412adad60e7f9683c6134e3824490046d0d2901344dbad7ef5cc9` | 1 | 199 | 178 | 10 |
| `dummy` | 08-细节重做 | `8201129301327f29b0f98b4359495cc4ba5bbf0aebd73160140411ce6796f3c4` | 1 | 76 | 55 | 4 |
| `mon_clock` | 08-细节重做 | `4c397e17e350b60778bf1b688755c24d2bf6a83371bd7acc8910af33c21dcf73` | 1 | 201 | 180 | 10 |
| `mon_box` | 08-细节重做 | `3a3936e3f44a900460bc08d662fa5f5ed6a3ccfb3e93f6822916cef4d4467b76` | 1 | 186 | 186 | 9 |
| `title_emblem` | 08-细节重做 | `ef5e1379974aadbb1a7fa7b6a52d8d348db0de54aa97b49c95d7b5191404b03f` | 1 | 44 | 37 | 2 |
| `relic_biggem` | 09-第08包返修 | `5440a4724a7a738e7a369803101504f387f6b79ff52387f1c86fc1045dd8d504` | 1 | 44 | 23 | 2 |
| `prop_coins` | 09-第08包返修 | `1019cfe8141048fd4d426d46c0c4b45b66568d640e2fae5966e8d821dd01d308` | 1 | 44 | 23 | 2 |
| `card_art_empty` | 09-第08包返修 | `6b712f96ddfcfa13b2840e49903d0adf144144b79157df25b286de50e6e14652` | 1 | 44 | 23 | 2 |

共25套、92动作、2412帧段、1943独立导出帧、117张PNG；所选ID旧PNG残留0。完整来源路径在 `art/new-art-provenance.json` 与 `artifacts/art-rework-08-09/source-verification.json`。

## GPU截图自查（已落盘，用户尚未验收）

本次 `bash tools/capture-art-rework.sh` 真实退出0，共30张1600×900 PNG及逐张JSON，均由Apple M3 / OpenGL 4.1 Metal / gl_compatibility真实viewport在frame_post_draw后写入，save_png均0、业务状态均未变。实时内屏0，原点(0,0)、3600×2338，窗口(1000,719或720)、1600×900；每张前刷新原生探针并核对窗口完整位于内屏。入口 [30图浏览](../../artifacts/art-rework-08-09/index.html)，原图在 `artifacts/art-rework-08-09/screens/run-20261112-103453-71268/`。

主代理实际打开01–05、20–30共16图；只读代理实际打开06–19共14图，主代理另复看09。无旧图替代。

- 01–05摇钱树：idle0、hit50、hit_big60、attack250/330ms。所列帧未见明显枝根与树干分离。实际PNG采样分别0、33.333、33.333、233.333、300ms；播放时间不等于SVG连续原始时刻，精确播放段写在旁车。
- 06–19：宝箱、发条兵、画像、挂锁、座钟、弹簧盒、木桩，静止各一及大幅动作各一。除弹簧盒duck外选hit_big100ms；根据SVG CSS关键帧人工选强变形姿态，不是穷举全部动作的客观最大值。所选100ms均对应99.99–133.32ms播放段。
- 20手牌总览，21–26镜子、放大镜、锤子、钻石、哨子、空托的现有牌面预览，均可看到对应新原画；27首页徽记；28完整第三幕胜利结果滚到底，大宝石标签/原画均在可见区域内，六宝物及落盘fullWins1已核对；29收藏室现状；30宝库金币。

需交回而未修改的问题：

1. **美术疑点**：09发条兵 `hit_big 100ms` 躯干下沿与画面左腿顶部可见背景色窄隙，有上身与腿脱开的观感。两代理均实际复看，交美术/用户复核；不据此自行修改源SVG。图 [09](../../artifacts/art-rework-08-09/screens/run-20261112-103453-71268/09-mon_soldier-large-hit_big.png)。
2. **截图缺项原因**：当前收藏室只渲染“大宝石·已收藏”文字，不创建relic_biggem原画节点，因此无法交出收藏室大宝石原画截图。29保留真实现状；需求禁止改UI，本轮不补显示、不用检查器冒充。
3. **既有UI观察**：21镜子、25哨子的放大牌说明框顶边超出窗口上沿；原画自身完整可见。本轮未改UI，留作后续范围明确后的处理项。

这是指定单帧自查与debug检查点，不是动作全过程、自然通关或用户主观验收。

## 导入元数据范围复核

首次完整check真实退出0，6129通过/0失败，回执另存 `pre-uid-restore-check.*` / `pre-uid-restore-test-report.json`。随后范围检查发现现有import-sprites流程会重写非目标PNG的UID：379个`.import`出现UID变更，SVG/PNG及实际导入参数未变。使用此前真实旧候选PCK只读取回UID，逐个验证恢复候选完整SHA与本轮前基线一致后恢复379文件；自动生成版另存 `generated-imports-before-uid-restore/`。未用HEAD覆盖现有未提交工作。

已重新同步隔离镜像并完整重跑check：最终6129通过、0失败、真实退出0，且出包后3234个冻结输入逐项未变。首轮和最终日志分别保留，不相加为测试总数。

## 最终技术回执与发布包

- 最终完整命令：`bash tools/check.sh`，**6129通过 / 0失败 / 退出0**。日志 [final-check.log](../../artifacts/art-rework-08-09/final-check.log)，[完整JSON](../../artifacts/art-rework-08-09/final-test-report.json)，真实退出码文件 `final-check.exit-code`。各套件通过数之和与总数一致。312黄金轨迹/37575步、400历史/60223步、第二批100种子/13941命令、第三批100种子/9840命令及H5 1044项前后指纹均通过。
- 原有测试断言修改：**0条**。未删除测试、放宽比较器或重烤黄金；本轮新增的截图驱动不加入run_all，不改变生产UI/规则。接收器新增17项完整SHA及白名单/缺稿检查，见本记录逐件表。
- 来源/重导/资源预检/准备/导入均实际完成且退出0。日志 `receive.log`、`export-sprites.log`、`native-resources.log`、`prepare.log`、`import.log`、`import-after-uid-restore.log`、`final-preflight.log` 均在 `artifacts/art-rework-08-09/`。所选ID PNG/import及旧动作资源清理由check-new-art与完整门禁再次核对；scope-verification.json确认其他101件连同.import字节未变，现有规则/UI/测试未动。
- `GEMCARD_SKIP_IMPORT=1 bash tools/export.sh` 顺序更新macOS app/zip和Windows x86_64 exe，真实退出0，日志 `export.log`。Mac deep/strict签名验证和Windows PE/嵌入PCK结构验证退出0，回执 `export-verification.json`。
- 从项目外顺序读取两个实际PCK：清单、provenance、sprites.json与最终工作区全文一致；118项原生来源指纹、182套精灵、365动作及全部纹理/字体/音频存在性通过，两个真实退出码均0，日志 `pack-macos.log`、`pack-windows.log`。Windows是在Mac宿主核对实际PCK，不代表Windows OS实机通过。
- 新Mac实际app从 `/private/tmp` 启动、经包内实时屏幕探针定位内屏，Apple M3实际渲染首页并退出0。额外截图 [发行包首页](../../artifacts/art-rework-08-09/packaged-smoke/package-home.png) 已实际打开复核；独立存档及真实日志在同目录。需求30图及此附加图共31张。
- 出包后再次核对：17源SVG与需求完整SHA一致；3234个最终冻结输入均未变；当前分支仍为codex/body-batch-3-new-art。未提交、未推送、未合main。机器摘要 [summary](evidence/art-rework-08-09-summary.json)。

发布文件：`exports/macos/新卡牌.app`、`exports/macos/新卡牌.zip`、`exports/windows/新卡牌.exe`。具体字节数/SHA见export-verification.json。

## 阶段、未完成项与下一步执行人

阶段：本轮17件已接入本地候选，最终完整自动技术门禁、所列GPU单帧自查和本地两平台刷新完成；不是正式Git入库，不代表美术或用户主观验收通过。未解决项是上文发条兵接口疑点、收藏室原画缺项和两个预览说明框UI观察；本轮依约未修改原稿SVG字节或生产UI。

本项已结束，无需后续操作，当前无需你操作。最近可选的一步是美术方复核09发条兵图；若确认返修，由美术方提供新原稿与新SHA，接续代理再按新清单接入。收藏室原画/UI说明框若要处理，先由用户明确另行授权UI范围，再由接续代理实施。Windows OS实机和主观体验验收可由具备对应设备/用户本人后续执行。

若你要开启后续，可在本聊天复制：`请按docs/v2/art-rework-08-09-integration.md的未完成项准备下一轮，先整理发条兵接口给美术复核；收藏室大宝石和预览说明框先给出UI修改方案。` 这是可选新范围，不是本轮结束所需操作。

结束检查：本轮导出、导入、两次完整门禁、截图、包核对和实际Mac包进程均已退出，无遗留计算进程需要终止；未按名称杀进程或触碰其他应用。
