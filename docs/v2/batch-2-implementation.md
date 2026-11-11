# 本体第2批实现与验证记录

分支 `feature/body-batch-2`，基于 main `18aece3`。默认配置为门厅和长廊各六仗；第三幕、加码和完整三幕通关不在本批。最初收藏固定六件，未调整初始血量或收藏难度。所有活动阶段均可放弃。

## 实现入口

- `rules/run_config.gd`：当前两幕配置及冻结 `LEGACY_RUN`；新牌、宝物池和开局池均为数据驱动。
- `rules/effects.gd`：调色盘、药水、钻石；缩头、挑食；五件宝物。`rules/run.gd` 负责限六张、消费提交、幕末选择、所有阶段放弃。
- `rules/profile.gd`：纯收藏并集与规范顺序；不读取文件或使用时钟、随机数。
- `rules/save_state.gd`：v5严格校验与v4保留状态迁移。`scripts/app/persistence.gd` 原子写入纪录、收藏和结算回执，以runId区分同种子不同局。
- `scripts/ui/collection_panel.gd`：只接收展示数据；`game.gd` 接入首页收藏、去留、带走、幕内进度、debug隔离档和错误提示。
- `data/body-batch-2-placeholders.json`：显式新key→现有原生素材占位映射；可见中文标签。没有修改美术原件、H5或更换渲染技术。

## 测试入口

`GODOT_BIN=/本机/Godot4.7.2 bash tools/import.sh` 后运行 `bash tools/check.sh`。导入只用原生镜像，不对含H5的根目录使用编辑器导入。`tests/run_batch_two.gd` 可独立运行 cards/run/profile/save/ui；统一入口还包含100种子回放。

旧回归和版本边界详见 `batch-2-test-migration.md`。本批依次保留了功能缺失失败日志，再实现规则、流程、收藏、存档和UI。临时日志与截图在忽略的 `artifacts/batch-2/`，不是运行依赖。

100种子逐步存读档检查曾发现调色盘整数/浮点掩码成员判断不同，以及幕末原因字符串恢复后成为 act1.0；均按实际失败修复并增加回归断言，没有改黄金预期或调低怪物数值。

## 验证边界

自动测试不是用户体验验收。Linux图形截图也不代表Mac内屏、Windows、实机触屏、硬件GPU或Android已验证。未安装SDK/JDK或插件。用户验收尚未通过，不自动合并main或删除H5。

## 当前明确未验

- 图形显示服务启动失败：系统已有Xorg dummy尝试创建本地socket失败，提升执行重试结果相同；没有创建监听端口，也没有安装组件。14张真实横竖屏截图未交付，不能把节点测试写成视觉通过。
- 100局贪心策略自然终局为87次门厅失败、10次长廊失败、3次门厅带走，含10次主动放弃；13,941条命令均完成逐步存读档一致性比较。所有活动阶段和新规矩均有自然覆盖。长廊带走另用明确标记的debug末龙检查点补充奖励/去留恢复回放，不能算作自然策略通关。
- 真实鼠标/触屏硬件、Mac内屏定位、Windows、Android及用户手感/音频主观验收未执行。本批只验证原生节点、输入事件和既有行为回归，不替代上述验收。

## 用户本地接续步骤

1. 拉取 `feature/body-batch-2`，先保留本地未提交工作，不reset/clean。使用本机Godot **4.7.2 stable**，设置 `GODOT_BIN` 为其可执行文件（Mac示例：`export GODOT_BIN="$PWD/Godot.app/Contents/MacOS/Godot"`）。引擎不在Git内。
2. `bash tools/import.sh`，然后 `bash tools/check.sh`。不要对含h5根目录直接启动编辑器导入。
3. 在有图形桌面的会话运行 `bash tools/capture-batch-two.sh`。该脚本单进程顺序截14页，测试存档独立，日志与真实状态JSON同目录。Mac沿用 `tools/run.sh` 的实时内屏探测与坐标校验，不固定屏幕号。窗口受内屏大小限制时保留实际截图尺寸，不冒充1920宽输出。
4. 打开输出目录，逐张确认占位标签、选择与确认按钮、限六张提示、滚动内容和底栏无遮挡；验证portrait逻辑画布仍为1080×2160、1080×1920窗口等比显示。截图场景是明确的debug定位，不能作为完整通关证明。
5. `bash tools/run.sh --debug --layout=landscape` 和 `--layout=portrait` 实际试玩。检查鼠标/触屏、Tab/Enter/Space、连点、失焦、横竖切换；幕末领取前后关闭恢复、选择继续/带走、所有活动阶段放弃；收藏新增只在安全带走落盘后出现。
6. 完成后再记录图形/手感结果和用户验收结论。未验Windows、实机触屏、Android继续单列；本批不要求安装SDK。不要自动合并main或删除H5。

## 计算与环境说明

本任务单worker、顺序运行长测，数值库线程1，Godot长计算使用nice 10。云端进程列表只反映本执行容器可见范围，不能据此宣称已审计其他宿主/聊天的所有进程；可见范围未发现其他游戏模拟器。没有启动4进程模拟、后台积压任务或导入冻结H5。

## 最终门禁补充回归

首轮干净门禁5254通过、1失败，唯一失败为Inspector的旧9工具数量断言。已改为显式旧9+新3的集合及总数验证，保留每种手牌动画与桌面暂停检查。随后补充药水击杀同张/撤回重打、18张合法牌组、三新牌逐种两张上限及工坊限制、单张跨两层龙与封条、非法命令状态不变专项；五组专用入口共308项通过。生产规则未因该旧断言失败改动，完整门禁将按修正后测试重新执行。


## 最终技术回执（2026-11-11）

运行代码提交：`44e58e9af218c6604ed3c0b6ae6126ba6eed59e1`。独立Git干净检出，指定Godot `4.7.2.stable.official.ed1daf0bf`，先隔离import，再完整 `tools/check.sh`，退出码 **0**；**5277项通过、0失败**，输出“全部通过”。日志没有SCRIPT ERROR/ERROR；既有超大指数坏档测试会产生预期的Exponent too high警告。检出前后Git工作区干净，H5 1044项冻结指纹一致。

- 原377个命名oracle用例保留；精度3015项通过。
- 旧黄金312条、37,575步在LEGACY_RUN下逐步比较通过；每个冒险step.save另作v4迁移语料通过。
- 历史400局、60,223命令终局一致。
- 新cards104、run61、profile4、save80、UI59项通过；新100种子共13,941命令逐步恢复一致。
- 原UI smoke120、Inspector209项通过；Inspector保留旧9种工具并增加3种原生占位，全部12种拼装验证。

最终原始报告 `artifacts/batch-2/final-report.json`，日志 `final-import.log` / `final-check.log`，新流程报告 `final-replay-report.json`。这些忽略目录文件是证据，不是运行依赖。图形14张截图尚未执行，按上文脚本交本地接续；不表示用户体验通过。最终文档提交不改变本次通过的运行代码。
