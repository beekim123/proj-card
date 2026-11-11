# 第二版规则验证

所有命令从 `gemcard-demo/` 工程根执行，辅助执行器需要 Node 24。

## 实际执行结果

- 第一阶段额外牌迁移：原基础/工具/冒险/存档/韧性测试源码共 268 项，经辅助 Node 严格断言执行通过。
- 第一阶段差分：250 种子、每种 80 回合，共 168,084 张牌，预览、出牌、撤回、完整状态与原项目一致（只忽略新增 effects 元数据）。
- 最终规则＋存档：335 项测试源码经辅助 Node 严格断言执行，335 通过、0 失败。
- 新规则精确用例单独用 Node 原生测试执行：31 项通过、0 失败，覆盖 01 第 9 节 11–27、31–38、41–48、51–63。最后两条采用用户更正后的青/品红与青/黄场景，每次出牌均比较完整预览与实际 RowEntry，且验证预览不改变原状态。

**这不是 npm test/Vitest、TypeScript 类型检查或 Vite 构建的通过结果。** 原项目依赖安装受到 npm registry HTTP 403 阻挡，未改动依赖版本。辅助执行器只适配本工程使用的同步断言，并加载真实 TypeScript 源码。依赖恢复后仍须正式执行 `npm test`、`npm run typecheck`、`npm run build`。

## 复跑

```sh
# 新规则，用Node自身的test runner和strict assert
node --import ./verification/v2/rules/native-loader.mjs --test ./src/rules/v2-rules.test.ts

# 最终规则和存档测试源码的补充断言检查
node --import ./verification/v2/rules/assert-loader.mjs ./verification/v2/rules/run-assert-sources.mjs src/rules/rules.test.ts src/rules/extra-cards.test.ts src/rules/number-rounding.test.ts src/rules/run.test.ts src/rules/run-invariants.test.ts src/rules/integration.test.ts src/rules/save-state.test.ts src/save.test.ts src/rules/v2-rules.test.ts

# 仅五张额外牌迁移阶段的全状态差分
node --import ./verification/v2/rules/migration-stage/loader.mjs ./verification/v2/rules/migration-stage/differential.mjs
```

`migration-stage/baseline/` 是附件原规则只读归档，`migration-stage/rules/` 是只迁移五张额外牌的中间阶段。两者保留旧机制仅供回归比较，不参与应用构建。现行应用 `src/rules/` 已移除韧性。

## 旧用例的必要迁移

旧冒险测试明确先选宝物（固定 same 作为不改变其顺色数字的测试夹具）；与新版直接冲突的断言按新规范调整：发条兵倒计时2、不拿不回心、旧档标记outdated。纯基础牌和额外牌测试数字未改。删去专门韧性测试；原文件保留在上述原项目归档中。新增测试负责覆盖五条规矩、六宝物以及全部变化，不用旧的无规矩假设验证新玩法。

用例47的规则状态和存储适配器清除行为均有测试；真正浏览器刷新删除及首页中文提示仍需UI验收。机器人比较证据在 `../simulation/`，不与上述单元断言混称。
