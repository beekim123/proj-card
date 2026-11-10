/** All tunable gameplay numbers live here. No UI or platform dependencies. */
export const CONFIG = {
  gemValue: [100, 150, 200] as const,
  formAt: [0, 15, 45] as const,
  deck: [
    { v: 1, count: 5 }, { v: 2, count: 5 }, { v: 4, count: 5 },
    { v: 3, count: 4 }, { v: 6, count: 4 }, { v: 5, count: 4 },
    { v: 7, count: 2 }, { v: 0, count: 1 },
  ],
  reactionMultiplier: { plain: 1, same: 2, shun: 2, white: 5 },
  multiplierStart: 1,
  multiplierIncrement: 1,
  multiplierDouble: 2,
  rainbowMultiplier: 10,
  rainbowColors: [1, 3, 2, 6, 4, 5] as readonly number[],
  handLimits: [6, 7, 8] as const,
  defaultHandLimit: 6 as const,
} as const;

export const GEMS = [
  { bit: 1, name: '红宝石', shortName: '红', key: 'red', shape: 'circle' },
  { bit: 2, name: '绿宝石', shortName: '绿', key: 'green', shape: 'square' },
  { bit: 4, name: '蓝宝石', shortName: '蓝', key: 'blue', shape: 'triangle' },
] as const;

export const FORMS = ['原石', '切好', '闪光'] as const;
export const FORM_KEYS = ['rough', 'cut', 'shine'] as const;
export const CARD_NAMES: Readonly<Record<number, string>> = {
  0: '空托', 1: '红宝石', 2: '绿宝石', 3: '黄宝石',
  4: '蓝宝石', 5: '品红宝石', 6: '青宝石', 7: '白宝石',
};
export const REACTION_NAMES = {
  plain: '普通', same: '同色', shun: '顺色', white: '凑白',
} as const;

/** Extra-card values, text and effect strengths share one source of truth. */
export const TOOLS = {
  bag: { name: '口袋', v: 2, text: '摸 2 张', draw: 2 },
  lens: { name: '放大镜', v: 4, text: '倍率再 ×2', multiplier: 2 },
  hammer: { name: '锤子', v: 1, text: '这回合伤害 ×2', turnMultiplier: 2 },
  mirror: { name: '镜子', v: 0, text: '变成上一张缺的宝石' },
  stone: { name: '磨石', v: 0, text: '三颗宝石各长 5 次', xp: 5 },
} as const;
export const TOOL_TYPES = ['bag', 'lens', 'hammer', 'mirror', 'stone'] as const;
