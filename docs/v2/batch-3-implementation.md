# 本体第3批：实现与接续证据

## 版本与范围

起点为已审核的74fddbe7763f613981560b42ddf17e2b1511f19e，包含第二批，从远端feature/body-batch-2快进后创建feature/body-batch-3。工作树初始干净，24项开发包指纹全部匹配。未reset/clean、未强推、未合并main。

前置独立提交21220fd6b6de8fe0b843784928ff6e4df4a280db：修debug补牌身份递增与原生文字/容器/限六张提示几何。真实节点→现场→文件→新持久化实例恢复测试通过；L01–L04视觉解除未做。冻结两幕f63c4b4，核心a837437，UI/回归a2bc390，黄金辅助测试冻结c79090a。最后一个提交只明确旧黄金迁移在冻结第二批运行，未改312份黄金原文、比较器或投影。

实现入口：rules/run_config.gd（冻结模式/三幕/加码）、effects.gd与index.gd（四宝物/两规矩）、run.gd（幕生命周期/终局）、progression.gd（派生进度）、save_state.gd（v6及旧档迁移）、scripts/app/persistence.gd（records v3原子提交）、scripts/app/game.gd及scripts/ui（原生接入）。详细测试边界见batch-3-test-migration.md。

## 实际检查记录

所有Godot长测试使用nice10，数值库线程1，单worker顺序。没有安装SDK/JDK或插件。每次启动前检查可见进程，未发现其他计算进程；容器进程命名空间不保证能看到其他聊天的全机进程，不能将此写成全机审计证明。

- 基线tools/import.sh、tools/check.sh均退出0，5277通过/0失败；本轮独立实测，不是复制旧回执。
- 前置定向109/0，旧UI59/0、save80/0；前置全量在黄金275/312时会话丢失，退出码未知，部分日志保留，不算通过。
- 第三批定向effects35/0、run21/0、progression21/0、save109/0、UI47/0；旧UI120/0、Art209/0、Inspector238/0。
- 首次干净检出完整检查退出1，5452通过/1失败：黄金迁移辅助测试把当前三幕误当旧两幕，首例18!=12。失败日志及JSON保留为artifacts/batch-3/clean-check-first-failed.log、clean-report-first-failed.json。修复冻结模式，不重烤黄金。
- 最终干净检出受测代码c79090a19f6742ee9dfdafc8fccabe168e49d21e：import退出0，check退出0，5764通过/0失败，无未解释SCRIPT ERROR/ERROR。312黄金37575步、400历史60223命令、H5 1044项全部通过。原始JSON与两份日志同时存入docs/v2/evidence/batch-3-final-*。命令为设置GODOT_BIN指向4.7.2 stable，顺序bash tools/import.sh及bash tools/check.sh。最终日志位于artifacts/batch-3/clean-import-final.log、clean-check-final.log、clean-report-final.json。

第三批自然seed1–100按tier=(seed-1)%6，合法解锁fixture显式声明，普通tuningScale=1。100/0，9840命令，每步真实写档/恢复和下一命令全字段比较。96局第一幕失败、4局第二幕失败，无自然完整通关，不调整数值追求胜率。六档终龙检查点另列staged，不算自然通关。原命令与实际活动档JSONL约110MiB，位于artifacts/batch-3/replay/，不提交运行产物到Git。12份冻结v5语料和来源/hash已入Git。

## 04验收清单证据索引

G01/G02/G04：起点/前置提交、test_batch_three_preflight；G03仅代码与几何，视觉未验。
A01–A10：test_batch_three_effects/run/save及冻结两幕回归；A11仅自动无副作用/非法输入与UI节点覆盖，真实hint/拖动体验仍待本地。
B01–B08：test_batch_three_run/progression/save/ui，原子失败和同runId重试。C01–C09：冻结v5语料、v4/v5/v6文件迁移与故障注入、严格字段/历史测试。C10最终完整门禁5764/0退出0。C11/C12：自然与staged分列的replay/report.json。
D01/D02：节点/业务与键盘函数测试；D03：占位catalog/文本与集合测试。D01–D03不等于实际渲染可读性已通过。D04–D08全部本地待验。E01/E02最终干净检出5764/0退出0；E03如上述资源边界；E04/E05以最终交接为准。

## GPU与实际交互：未验，明确本地接续

本环境无DISPLAY/WAYLAND与GPU设备。bash tools/capture-batch-three.sh实际退出2，无PNG；不能用headless场景JSON冒充GPU检查。未做Windows、真实触屏、Android及主观声音/手感验收。当前是候选实现，不是正式发布或用户体验通过。

执行人：具备用户Mac访问权限的本地接续代理。先拉feature/body-batch-3，设置GODOT_BIN为本机4.7.2 stable，检查已有计算任务，数值线程1、默认单worker；隔离导入并完整check。Mac内屏必须由tools/run.sh动态识别和验证，不写死坐标；识别失败则停止图形启动，不占用副屏。

1. 按07逐一重现L01–L04：横竖、选中放大、长说明、末端滚动、限六张、顶部/底栏；同时真实操作L05补牌并检查现场、保存文件与重启。
2. 执行bash tools/capture-batch-three.sh，生成20张真实图、同名状态JSON/日志；脚本顺序运行每个场景并验证侧车，但仍须逐张人工看图，特别是持6件终龙/胜利、19件滚动末端和持续失败的待保存结算。
3. 真实鼠标、Tab/Enter/Space、连点、焦点/拖放失焦、关闭恢复、横竖切换；核对guard/cap/regrow/rbheal提示、声音和动画。记录设备、尺寸、执行人、命令与退出码，将未覆盖项继续留空。
4. 本地视觉/交互解除后再交用户主观体验验收；未获用户明确通过不写全体验通过。H5保持只读，不自动并main。
