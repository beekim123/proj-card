import type { FightConfig, NormalMonster } from './run-types';
import type { GemIndex } from './types';

/** All adventure tuning and authored monster text from 01 §10. */
export const RUN = {
  fights: [
    { type: 'normal', hp: 20_000, countdown: 3, toughness: 6 },
    { type: 'normal', hp: 40_000, countdown: 3, toughness: 6 },
    { type: 'elite', monster: 'clock', hp: 100_000, countdown: 3, toughness: 8, handUp: 1 },
    { type: 'normal', hp: 300_000, countdown: 3, toughness: 6 },
    { type: 'normal', hp: 600_000, countdown: 3, toughness: 6 },
    { type: 'boss', monster: 'dragon', hp: 1_500_000, countdown: 4, toughness: 10 },
  ] as readonly FightConfig[],
  normalMonsters: ['chest', 'soldier', 'bear'] as readonly NormalMonster[],
  hearts: 3,
  handStart: 7,
  handMax: 8,
  lootCount: 3,
  lootBonusCount: 4,
  lootBonusOverkill: 10,
  skipHeal: 1,
  /** 破防：这回合剩下的出牌伤害 ×guardDamage。guardDelay 是破防时倒计时加几（试过 1：机器人通关 99%，太简单，2026-11-09 定为 0）。 */
  guardDelay: 0,
  guardDamage: 1.5,
  /** 血条显示几层（只是显示，不影响数值）。 */
  hpLayers: { normal: 1, elite: 2, boss: 3 },
} as const;

export const MONSTERS = {
  chest: { name: '宝箱怪', line: '谁碰它的宝石，它就咬谁。', weak: 1 as GemIndex },
  soldier: { name: '发条兵', line: '拧一圈，走三步，扎一下。', weak: 2 as GemIndex },
  bear: { name: '布偶熊', line: '死死抱着一颗宝石，谁也不给。', weak: 0 as GemIndex },
  clock: { name: '老座钟', line: '钟一响，它就打人。', weak: 2 as GemIndex },
  dragon: { name: '宝石龙', line: '吞下了古堡里最大的那颗宝石。', weak: 0 as GemIndex },
} as const;
