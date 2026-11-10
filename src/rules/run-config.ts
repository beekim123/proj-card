import type { FightConfig, NormalMonster, RelicId, RuleId } from './run-types';
/** All adventure tuning and authored text from second-edition 01. */
export const RUN = {
  fights: [
    { type: 'normal', hp: 20_000, countdown: 3 },
    { type: 'normal', hp: 40_000, countdown: 3 },
    { type: 'elite', monster: 'clock', hp: 100_000, countdown: 3, handUp: 1, healFull: true },
    { type: 'normal', hp: 300_000, countdown: 3 },
    { type: 'normal', hp: 600_000, countdown: 3 },
    { type: 'boss', monster: 'dragon', hp: 1_500_000, countdown: 4 },
  ] as readonly FightConfig[],
  normalMonsters: ['chest', 'soldier', 'bear'] as readonly NormalMonster[],
  hearts: 3, handStart: 7, handMax: 8,
  lootCount: 3, lootBonusCount: 4, lootBonusOverkill: 10,
  relicOptions: 3,
  hpLayers: { normal: 1, elite: 2, boss: 3 },
} as const;
export const MONSTERS = {
  chest: { name: '宝箱怪', line: '谁碰它的宝石，它就咬谁。', rule: 'bite' },
  soldier: { name: '发条兵', line: '拧一圈，走三步，扎一下。', rule: 'wind', countdown: 2, wind: 4 },
  bear: { name: '布偶熊', line: '死死抱着一颗宝石，谁也不给。', rule: 'hug' },
  clock: { name: '老座钟', line: '钟一响，它就打人。', rule: 'bell' },
  dragon: { name: '宝石龙', line: '吞下了古堡里最大的那颗宝石。', rule: 'layers', rules: ['hug', 'bite', 'bell'] as readonly RuleId[] },
} as const;
export const RULES = {
  bite: { name: '咬手', text: '每打一张带绿的牌，它出手提前 1 回合。', gem: 1, countdown: -1 },
  hug: { name: '抱红', text: '红宝石打它算 0。倍率、反应、成长照旧。', gem: 0 },
  wind: { name: '上发条', text: '打出带蓝的牌，它的发条松一圈；松完 4 圈，这次出手作废。', gem: 2 },
  bell: { name: '敲钟', text: '每凑白一次，它出手提前 1 回合。', countdown: -1 },
  layers: { name: '三层脾气', text: '血每掉一层，换一条规矩：抱红 → 咬手 → 敲钟。' },
} as const;
export const RELICS = {
  same: { name: '同色也翻倍', text: '同色也让倍率翻倍。' },
  once: { name: '断一次不算', text: '每回合第一次没反应，算作顺色。' },
  white: { name: '凑白 ×8', text: '凑白的伤害 ×8（原来 ×5）。', whiteMultiplier: 8 },
  rainbow: { name: '五色彩虹', text: '顺色连满 5 种颜色就出彩虹。', rainbowColors: 5 },
  heart: { name: '多一颗心', text: '心的上限变成 4。', hearts: 1 },
  grow: { name: '宝石长得快', text: '宝石用 8 次切好、24 次闪光。', formAt: [0, 8, 24] as const },
} as const;
export const RELIC_IDS = Object.keys(RELICS) as RelicId[];
