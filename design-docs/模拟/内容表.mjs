// 本体的内容表和几套配置。数值改这里。
// 血量、倒计时照《本体内容方案》；这里是模拟器用的那一份。

export const MONSTERS = {
  chest: { rule: 'bite' },                 // 宝箱怪 · 咬手
  bear: { rule: 'hug' },                   // 布偶熊 · 抱红
  soldier: { rule: 'wind', cd: 2, wind: 4 }, // 发条兵 · 上发条
  clock: { rule: 'bell' },                 // 老座钟 · 敲钟
  box: { rule: 'duck' },                   // 弹簧盒 · 缩头
  portrait: { rule: 'picky' },             // 画像 · 挑食
  lock: { rule: 'six' },                   // 大挂锁 · 限六张
  plant: { rule: 'regrow' },               // 盆栽 · 长回去
  armor: { rule: 'cap' },                  // 盔甲 · 压倍率
  dragon: {},                              // 宝石龙 · 三层脾气（每幕三条不一样）
};

// 第二版（现在线上的 6 仗小样）：用来核对这个模拟器和 sim.mjs 对得上
export const V2 = {
  bot: 'hint', planNodes: 60000, hearts: 3, handStart: 7, handMax: 8,
  monsters: MONSTERS, doors: false,
  acts: [{
    name: '小样', normals: ['chest', 'soldier', 'bear'],
    rooms: [
      { t: 'normal', hp: 20000, cd: 3 }, { t: 'normal', hp: 40000, cd: 3 },
      { t: 'elite', mon: 'clock', hp: 100000, cd: 3, handUp: 1 },
      { t: 'normal', hp: 300000, cd: 3 }, { t: 'normal', hp: 600000, cd: 3 },
      { t: 'boss', mon: 'dragon', hp: 1500000, cd: 4, layers: ['hug', 'bite', 'bell'] },
    ],
  }],
  relicPool: ['same', 'once', 'white8', 'rainbow5', 'heart', 'grow'],
  toolPool: ['bag', 'lens', 'hammer', 'mirror', 'stone'],
  startRelic: true, eliteRelic: false, eliteCard: true, bossRelic: false,
  policy: { relic: 'random', loot: 'pri', lootPri: ['hammer', 'lens', 'bag', 'mirror', 'stone'] },
};
export const V2_PLAN = { ...V2, bot: 'plan', policy: { ...V2.policy, relic: 'pri', relicPri: ['white8', 'once', 'same', 'grow', 'rainbow5', 'heart'] } };

// ---------- 本体：三幕 ----------
export const RELIC_POOL = ['same', 'once', 'white8', 'rainbow5', 'heart', 'grow', 'shun3', 'same4', 'start2', 'slow', 'twice1', 'x2_0', 'x2_1', 'x2_2', 'whitelink', 'first2', 'shine300', 'guard', 'rbheal'];
export const TOOL_POOL = ['bag', 'lens', 'hammer', 'mirror', 'stone', 'shadow', 'palette', 'hourglass', 'potion', 'seal', 'diamond', 'whistle'];
export const EXPERT = {
  relic: 'pri', relicPri: ['rainbow5', 'twice1', 'first2', 'same', 'once', 'white8', 'start2', 'slow', 'x2_1', 'x2_2', 'x2_0', 'heart', 'guard', 'grow', 'shine300', 'same4', 'shun3', 'whitelink', 'rbheal'],
  loot: 'pri', lootPri: ['bag', 'whistle', 'palette', 'seal', 'hourglass', 'lens', 'mirror', 'hammer', 'stone', 'diamond', 'shadow', 'potion'],
  door: 'smart', doorPri: ['card', 'shop', 'heal'], healAt: 1, shop: 'copy', shopTarget: 'smart',
};
export const NOVICE = { relic: 'random', loot: 'random', door: 'random', shop: 'random', shopTarget: 'random' };
const rooms = (hps, boss, eliteMon, layers) => [
  { t: 'normal', hp: hps[0], cd: 3 }, { t: 'door', hp: hps[1], cd: 3 },
  { t: 'elite', mon: eliteMon, hp: hps[2], cd: 3, ...(boss.handUp ? { handUp: 1 } : {}) },
  { t: 'door', hp: hps[3], cd: 3 }, { t: 'door', hp: hps[4], cd: 3 },
  { t: 'boss', mon: 'dragon', hp: hps[5], cd: 4, layers },
];
export function makeFull(hp1, hp2, hp3, extra = {}) {
  return {
    bot: 'hint', planNodes: 60000, hearts: 3, handStart: 7, handMax: 8, hammerX: 3,
    monsters: MONSTERS, doors: true, doorRewards: ['card', 'shop', 'heal'],
    acts: [
      { name: '门厅', normals: ['chest', 'soldier', 'bear'], rooms: rooms(hp1, { handUp: 1 }, 'clock', ['hug', 'bite', 'bell']) },
      { name: '长廊', normals: ['box', 'portrait', 'chest', 'soldier', 'bear'], rooms: rooms(hp2, {}, 'lock', ['picky', 'duck', 'six']) },
      { name: '宝库', normals: ['plant', 'box', 'portrait', 'chest', 'bear'], rooms: rooms(hp3, {}, 'armor', ['bell', 'duck', 'cap']) },
    ],
    relicPool: RELIC_POOL, toolPool: TOOL_POOL,
    startRelic: true, eliteRelic: true, bossRelic: true,
    policy: NOVICE, ...extra,
  };
}
