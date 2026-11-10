# 第二版第 1 批验收入口

本批以根目录 `04-验收清单.md` 和 `HANDOFF.md` 为准。附件中的 01/02/03 为实施规格，用户对提示用例 61/62/63 的最新更正优先于附件原表格。

- 本批规则、模拟器、虚拟 DOM 与几何证据：`verification/v2/`。
- 75 项素材契约和替换夹具：`verification/v2-art/`。
- 声音与手感 API 辅助检查：`verification/feel-sound-check.json`。
- Node 辅助检查不等同于 Vitest、TypeScript 类型检查、Vite 构建或真实浏览器测试。
- 开发依赖获取返回 HTTP 403；规定的三个 npm 命令未进入实际测试/编译阶段。
- 真实浏览器画面、声音听感、性能、截图和录像未完成，不能勾作通过。没有正式构建的 dist 或运行包。
