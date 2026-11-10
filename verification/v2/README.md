# 第二版第1批验证证据

本目录只记录本批结果。根 HANDOFF.md 和 04-验收清单.md 为完整汇总。

## 已执行

- 源码基线指纹：baseline-sha256.json。
- 规则/存档335项辅助断言、新规则31项精确测试、迁移268项与168,084次差分：rules/。
- UI虚拟DOM14组、独立UI12项、几何与滚分1,534断言：ui-flow-*、ui-geometry-*、independent/。
- 素材11组契约：../v2-art/；手感与声音API16组：../feel-sound-check.json。
- 生产规则300/60局机器人与参考差值均不超过10个百分点：simulation/。

## 未通过的正式门槛

锁定依赖获取返回HTTP403。npm test、npm run typecheck、npm run build退出127，未进入实际测试/编译阶段；原始输出见npm-test-output.txt、typecheck-output.txt、build-output.txt和required-checks.json。

真实浏览器未能打开本地游戏。截图、音色、性能、录像和浏览器控制台未测，不得以虚拟DOM、纯函数或API模拟替代。

辅助TypeScript loader使用Node24内置转译，并不执行TypeScript类型检查。所有模拟输出均明确标识验证范围。迁移阶段保存的旧规则是复查夹具，不参与应用构建。
