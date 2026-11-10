# 独立第二版审查

本目录是可复跑的辅助验收，不是 npm test、TypeScript 类型检查、Vite 正式构建，也不是真浏览器验收。

从工程根目录执行：

```sh
node verification/v2/independent/ui-audit.mjs
node verification/v2/independent/rules-audit.mjs
```

需要 Node 24 的 registerHooks / stripTypeScriptTypes；不安装第三方依赖。UI 审查复用了基础虚拟 DOM 测试设施，另写独立场景断言，实际导入当前 GameUI 和规则源码。假 DOM、ArtStore、WAAPI、定时器不能验证像素布局、真声音、帧率或实际触屏手感。

## 检查内容

- 12 项独立 UI 场景：用户确认的 61–63、咬手中途不扣心、回合末至多扣一心、撤回、警告不受提示开关影响、打穿绿牌安全、龙换层及撤回、8 张快出、重复宝物选择。
- 修复回归：发条松完时 2 → 2 仍绿闪，咬手在 0 → 0 仍红闪。
- 240 种子属性检查：预览纯函数、预览等于实出、出牌与立即撤回/重放完全一致、每次操作前存读档一致、提示不包含 attack、总伤害等于牌下总数、中途不扣心。
- 随机策略只是属性覆盖，不是规范要求的跟提示/整手规划通关率对照。完整计数和覆盖见 rules-audit-results.json。

## 安全审查范围

生产逻辑未发现 eval、Function 构造、innerHTML 注入、运行时第三方联网、真实支付或敏感信息处理。资源由本地相对路径加载，声音由 WebAudio 合成。现有 SVG 素材未发现主动脚本或外链。SVG 校验器只适用于可信美术交付，不应宣称可安全处理任意不可信 SVG：CSS 转义及 SMIL 动态引用不是完整白名单校验。没有运行网络攻击或对浏览器安全行为作通过声明。

## 未验证

锁定依赖安装受 npm registry 403 阻塞，未重试或绕过；真实 Chromium 启动已由主任务确认因 socket 权限失败，本审查没有重复启动。npm test/typecheck/build、真实浏览器多尺寸截图、4 倍 CPU 性能图、10 秒录像、实际 WebAudio 和移动触屏仍需单列未测。
