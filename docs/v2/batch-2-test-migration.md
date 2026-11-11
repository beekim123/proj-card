# 本体第2批测试迁移记录

## 基线可移植性修正（功能开发前）

基准提交 `18aece3`，Godot `4.7.2.stable.official.ed1daf0bf`，隔离导入成功。完整基线实测4866通过、1失败：`tests/test_historical.gd` 读取未入Git的 `artifacts/historical/report.json`，干净云端检出不存在该作者机器报告。312黄金37575步、400历史60223命令本身全部一致。

保留此失败证据于 `artifacts/batch-2/baseline-check.log` 与 `baseline-report.json`。修正入口不再依赖未跟踪报告：仍完整执行400历史轨迹并逐字段比对冻结终局，再逐行核对已提交的 `h5/verification/batch-one-bot-results.json` 的seed、胜负、房间、回合、宝物和牌数，并独立汇总胜率，与归档production/reference的原±10个百分点门槛比较。没有改动H5、oracle、golden或历史原始数据，没有制造空failures报告。

边界：独立参考模拟器原路径位于作者Mac，未在云端重新运行；归档参考统计只作为历史证据，不宣称新鲜模拟结果。本批不需要重跑昂贵规划模拟。

## 旧规则与v5边界

`tests/run_all.gd` 先切换冻结 `LEGACY_RUN`，运行原core/oracle/run/save/layout/art/persistence/golden/historical与精度测试，再切回当前两幕，运行新增六组测试及原UI/Inspector。旧oracle输入补充龙的layerRules；比较只去掉 `tests/legacy_projection.gd` 写死的 runId、relicPurpose、contentVersion、layerRules、startingRelics，未放宽其他字段。

旧312轨迹、37,575步仍逐步执行原命令并比较完整旧状态和v4存档。每个非空冒险step.save另以当前模式迁移：保持原牌序、RNG和当前结果，只按规范附加第二幕六个未进入占位、当前心数历史、版本新字段。测试不会用实现重烤旧期望。旧JSON/H5数据不变。

原UI smoke的第一幕龙终点由直接victory改为领取宝物→act_choice→retreat；原八条结算信息仍保留，允许追加收藏行。第一幕原交互、布局、动画、声音和Inspector断言仍运行。历史参考统计使用仓库内冻结数据，不宣称重跑了缺失的原外部参考程序。

旧UI“两枚效果标签”测试原先隐含开局第0候选必为特定宝物。v5初始池有意改为六件后，测试显式通过现有debug加入start2，与抱红同时触发两枚效果；布局预期保持不变，不依赖新池随机索引。

首次干净最终门禁在5254通过后，仅Inspector“工具拼装数=9”旧断言失败：实际已创建12种，另外三种手牌动画/桌牌暂停断言通过。将该断言迁移为明确的冻结旧9种＋新3种完整key集合及总数12，不删除旧覆盖；其余Inspector断言不放宽。随后重新运行完整门禁。
