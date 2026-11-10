# 本体第一批规则引擎

规则入口为 `src/rules/index.ts`。不依赖 DOM、存储、时钟或全局随机数。数值集中在 `config.ts`、`run-config.ts` 和 `effects.ts`，状态都是可 JSON 序列化的数据。

## 冒险

```ts
const run = createRun(123); // phase: relic，3个固定选项。
chooseRelic(run, 0);       // 零基选项，必须选，之后不能撤回。
const preview = previewRunCard(run, run.game.hand[0]!);
const entry = playRunCard(run, 0);
undoRun(run);             // 恢复宝物一次机会、血、倒计时、发条、龙层和随机流。
endRunTurn(run);          // 空过也推进时间；打穿后才进入战利品。
chooseLoot(run, 0);       // 或skipLoot(run)，不回血。
```

`run.relic` 是主宝物，`run.relics` 按获得先后保存多件宝物；开局和精英后各必选一件。`maxHearts` 表示心上限。精英战胜利时恢复全部心并增加后续手牌上限。

`monster.rule` 是 bite/hug/wind/bell/layers，`currentRule(run)` 返回当前实际作用的四种规则之一，打穿后没有规则。`layer` 是龙当前1–3层，边界属于下一层；`wind/maxWind/woundDown` 只用于发条兵。非发条怪对应值为0/0/false。

## 效果表与扩展

9张额外牌、5条怪规矩、10个宝物都在 `effects.ts` 的 `EFFECTS` 中以id、名字、文本、hook登记。数值配置和显示文案来自对应配置表。结算函数不按具体牌型或怪型分支。

加效果：
1. 在相应配置表添加ID、文案和数值；若新ID属于类型联合，补对应ID类型和候选清单。
2. 在 `EFFECTS` 加一项，为需要的时点实现hook；结算流水线无需修改。
3. 为新效果补预览/真出牌、撤回、存读档测试；需要素材时另加清单与UI呈现。

出牌挂钩依次为 mask、reaction、gemValues、reactionMultiplier、multiplier、rainbowNeed/rainbow、hammer、扣血、afterMonster、growthThresholds/成长、afterCard、afterGrowth、afterLayer。每张牌使用出牌前选定的怪规矩；龙层到最后才更新。afterMonster在打出前后任一时点已打穿时均不生效。afterCard负责口袋、放大镜、磨石，不在界面结算。

生命周期挂钩为 runStart、fightStart、turnStart、turnEnd、fightWon。预览与实际出牌经过同一套计算与hook；冒险预览使用完整状态副本，实际状态和随机流不变。

`RowEntry.effects` 保存触发的 `{id,text}`。wind可以同时有“松发条”“发条松完”，layers标记“换规矩”。`damage = dmg + rainbow + hammer`，界面和统计都用总伤害；算式捕获出牌时的gemValues，抱红为0，升级不追溯改伤害。

## UI只显示规则层结果

- `cardWarnings(run,card)`：attack只表示这张牌使回合结束由不攻击变为攻击；不是所有带绿牌都危险。unwind按有效宝石位，包括镜子和白牌。
- `bestHintCard(run|game)`：先排除attack，再按凑白/顺色/同色、倍率、伤害排序，只返回一个ID。没有安全反应牌时返回undefined。
- `rainbowStatus(run|game)`：need、lit、ready、readyIds。ready仅表示颜色齐全，不承诺可以排出连续顺色。
- `previewCountdown(run,card)`：预览后的倒计时。
- `growthThresholds(run|game)`：成长门槛，含宝物修正。

练习 `createGame` 不带宝物，不带怪规矩；基础牌不变；新增四张额外牌，锤子改为 ×3，所有摸牌限制为12张。

## 存档和debug

`encodeRunSave` 生成 version 4，保存 relic/battle/loot/doors/shop 阶段；终局返回null。`decodeRunSave` 对旧版返回 `state:null, clear:true, reason:'outdated'`，浏览器适配器删除并显示指定提示，纪录不变。完整快照包含随机数、onceUsed、效果与新怪字段。

debugGiveRelic支持多个宝物；debugSetMonsterHp同步龙层；debugSetCountdown只允许0..满值；debugSetWind同步woundDown。debugRelicSelection重新创建合法选宝物局，会重置当前调试局。所有debug修改清除成对撤回记录。

验证结果、已运行与未运行项目见 `verification/v2/rules/README.md`。原项目依赖403导致本环境没有正式Vitest/tsc/Vite通过记录，辅助Node严格断言不能替代这些正式检查。

## 第一批幕、门与工坊

`RUN.acts` 是唯一关卡配置。`RUN.fights` 是动态扁平兼容视图，不能独立编辑。
`act`、`room` 从1开始，`fight` 是跨幕累计间数。`previousNormal` 只由小怪战斗更新。
`doorOptions` 返回固定门选项副本；`chooseDoor` 锁定怪与 pendingReward。
工坊使用 `shopState`、`canCopyCard`、`shopDrop`、`shopCopy`、`shopSkip`。
`nextCardId` 递增且不会复用扔掉的身份。`shopsVisited` 记录进入次数。
`ruleSealed` 和 `displayedRule` 分别提供封条状态和原规矩，`currentRule` 只返回生效规矩。
`canDoubleTool` 提供手牌角标条件。times由prepare挂钩设置，具体额外牌自行倍增效果。

添加后续幕：向 `RUN.acts` 加幕和rooms，必要时扩展怪类型、MONSTERS/RULES/EFFECTS及素材清单；不改结算管线和存档形状。每幕的小怪池至少要有3只，才能排除上一只后生成两扇不同门。
