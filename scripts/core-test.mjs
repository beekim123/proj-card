import assert from 'node:assert/strict';
import * as R from '../src/rules.js';
import { RULES as CFG } from '../src/config.js';
import { autoCardIndex } from '../src/dev/auto-line.js';

const gem = (col) => {
  const m = CFG.masks[col] || 0;
  return { id: 'gem', name: CFG.colors[col] + '宝石', col, vals: [m & 1 ? 1 : 0, m & 2 ? 1 : 0, m & 4 ? 1 : 0] };
};
const extra = (id) => ({ id, ...CFG.extras[id] });

// 1. 起始牌组 29 张配比 & 补牌 / 手牌上限 12 溢出进弃牌堆
{
  const run = R.newRun(1200);
  assert.equal(run.deck.length, 29);
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const c of run.deck) counts[c.col]++;
  assert.deepEqual(counts, [5, 4, 5, 4, 5, 4, 2]);
  const b = R.startFight(run);
  assert.equal(b.hand.length, 8);
  assert.equal(b.draw.length, 21);
  // 抽到超过 12 张上限：多余的进弃牌堆
  R.drawCards(b, 6);
  assert.equal(b.hand.length, 12);
  assert.equal(b.discard.length, 2);
}

// 2. 补色白光（红 → 青）：倍率 ×2，灯全灭只留青(8)，青本身绿/蓝各 2 发 + 白光红/绿/蓝各 2 发 = 10 发 × 5 = 50
{
  const b = { cursor: 0, lamps: 0b000111, gems: [{ level: 1, exp: 0 }, { level: 1, exp: 0 }, { level: 1, exp: 0 }] };
  const p = R.preview(b, [gem(3)]);
  assert.equal(p.states[0].relation, '补色');
  assert.equal(p.multiplier, 2);
  assert.equal(p.hops, 1);
  assert.equal(p.lamps, 1 << 3);
  assert.equal(p.shotCount, 10);
  assert.equal(p.total, 50);
  // 厚皮挡白光，提可躲光按回合初 3 灯减伤 30%（5 * 0.7 = 3.5 → 4）
  const whiteBatch = p.batches.find(x => x.white);
  assert.equal(R.segmentDamage({ value: whiteBatch.raw, white: true, pure: false }, 'badom', 0b000111), 0);
  assert.equal(R.segmentDamage({ value: whiteBatch.raw, white: true, pure: false }, 'tiko', 0b000111), 4);
}

// 3. 彩虹整回合 ×3（含出彩虹之前已经打出去的牌！）
{
  // 回合初已亮 4 灯 (红黄绿青 = 0b001111)，当前色=青(3)
  // 出 蓝(4, 邻色 ×2, 亮第 5 灯)，再出 紫(5, 邻色 ×4, 亮第 6 灯触发彩虹！)
  // 第 1 张蓝：2 发 × (5 * 3) = 30（原本是 2 * 5 = 10，因后面出彩虹整回合 ×3！）
  // 第 2 张紫(红蓝)：2 颗 × 4 发 × (5 * 3) = 120
  // 总保底 = 150，彩虹后灯全灭只留紫 (1 << 5 = 32)
  const b = { cursor: 3, lamps: 0b001111, gems: [{ level: 1, exp: 0 }, { level: 1, exp: 0 }, { level: 1, exp: 0 }] };
  const p = R.preview(b, [gem(4), gem(5)]);
  assert.equal(p.rainbow, true);
  assert.equal(p.states[0].rainbow, false);
  assert.equal(p.states[1].rainbow, true);
  assert.equal(p.lamps, 1 << 5);
  assert.equal(p.states[0].total, 30);
  assert.equal(p.states[1].total, 120);
  assert.equal(p.total, 150);
  // startCast 出来的第一张牌的发也乘了 3
  const fight = { ...b, line: [gem(4), gem(5)], rng: R.seededRandom(7), target: 0 };
  const plan = R.startCast(fight);
  const firstCardShots = plan.segments.filter(s => s.cardIndex === 0);
  assert.equal(firstCardShots.length, 2);
  for (const s of firstCardShots) assert(s.value >= 15);
}

// 4. 断色灭灯（红 → 绿：倍率不变，灯全灭只留绿 1<<2）
{
  const b = { cursor: 0, lamps: 0b000011, gems: [{ level: 1, exp: 0 }, { level: 1, exp: 0 }, { level: 1, exp: 0 }] };
  const p = R.preview(b, [gem(2)]);
  assert.equal(p.states[0].relation, '断色');
  assert.equal(p.multiplier, 1);
  assert.equal(p.lamps, 1 << 2);
  assert.equal(p.total, 5);
}

// 5. 不限张数出牌 + 撤销一步 / 撤销全部
{
  const run = R.newRun(42);
  const b = R.startFight(run);
  // 手牌 8 张全部排进序列（超过旧版 5 张上限）
  for (let i = 0; i < 8; i++) assert.equal(R.queueCard(b, 0), true);
  assert.equal(b.line.length, 8);
  assert.equal(b.hand.length, 0);
  // 撤销上一步：只退最后一张
  const lastCard = b.line.at(-1);
  assert.equal(R.undoLast(b), true);
  assert.equal(b.line.length, 7);
  assert.equal(b.hand.at(-1), lastCard);
  // 撤销全部：全部退回手牌
  assert.equal(R.undoAll(b), true);
  assert.equal(b.line.length, 0);
  assert.equal(b.hand.length, 8);
  assert.equal(R.undoLast(b), false);
  assert.equal(R.undoAll(b), false);
}

// 6. 宝石回合末升级（10/20/30…，每级 ×1.2；施法中途不变；白牌三色各 +1，白光不算）
{
  const run = R.newRun(99);
  const b = R.startFight(run);
  b.monsters = [{ kind: 'badom', name: '巴多姆', countdown: 5, attackDamage: 1, maxHp: 99999, hp: 99999, attacks: 0 }];
  // 排 10 张红牌（正好 10 颗红宝石）+ 1 张白牌（红绿蓝各 +1）
  b.hand = [];
  b.line = [...Array.from({ length: 9 }, () => gem(0)), gem(6)];
  const plan = R.startCast(b);
  // 施法前和施法中红宝石仍为 Lv 1（每发基础 5，未乘 1.2）
  assert.equal(run.gems[0].level, 1);
  for (let i = 0; i < plan.segments.length; i++) R.applyHit(run, b, plan, i);
  R.endCast(run, b, plan);
  assert.equal(run.gems[0].level, 1); // endCast 时还没升级
  R.finishTurn(run, b);
  // 回合末结算升级：红 10 次 → Lv 2 (exp=0)，绿 1 次 → Lv 1 (exp=1)，蓝 1 次 → Lv 1 (exp=1)
  assert.equal(run.gems[0].level, 2);
  assert.equal(run.gems[0].exp, 0);
  assert.equal(run.gems[1].level, 1);
  assert.equal(run.gems[1].exp, 1);
  assert.equal(run.gems[2].level, 1);
  assert.equal(run.gems[2].exp, 1);
  assert.equal(b.lastLevelUps.length, 1);
  // 下一回合红宝石单发威力 ×1.2 → 5 * 1.2 = 6
  const nextP = R.preview(b, [gem(0)]);
  assert.equal(nextP.batches[0].perShot, 6);
  // 验证白光不算宝石经验：合白（红 → 青）只加青的绿/蓝各 1，不加红
  b.cursor = 0;
  b.line = [gem(3)];
  const p2 = R.startCast(b);
  for (let i = 0; i < p2.segments.length; i++) R.applyHit(run, b, p2, i);
  R.endCast(run, b, p2);
  R.finishTurn(run, b);
  assert.equal(run.gems[0].exp, 0); // 白光里的红不算
  assert.equal(run.gems[1].exp, 2); // 青的绿 +1
  assert.equal(run.gems[2].exp, 2); // 青的蓝 +1
}

// 7. 目标倒下顺延（从左到右）、一发打穿多出来的不转给下一只
{
  const run = R.newRun(7);
  const b = R.startFight(run);
  b.monsters = [
    { kind: 'badom', name: 'A', countdown: 3, attackDamage: 1, maxHp: 100, hp: 20, attacks: 0 },
    { kind: 'badom', name: 'B', countdown: 3, attackDamage: 1, maxHp: 100, hp: 100, attacks: 0 },
  ];
  b.target = 0;
  // 冰锥 1 发 60 固定伤害打 A (20 HP)：打穿多出来的 40 不转给 B！
  b.line = [extra('ice'), gem(0)];
  const plan = R.startCast(b);
  // 强制无暴击测试精确值
  for (const s of plan.segments) { s.crit = false; s.value = s.pure ? 60 : 5; }
  R.applyHit(run, b, plan, 0);
  assert.equal(b.monsters[0].hp, 0);
  assert.equal(b.monsters[1].hp, 100); // 溢出 40 没转给 B
  // 下一发红宝石 (5) 自动顺延打 B
  R.applyHit(run, b, plan, 1);
  assert.equal(b.monsters[1].hp, 95);
  assert.equal(b.target, 1);
}

// 8. 护盾立即释放（不进序列、不改倍率/色灯/当前色、撤不回、挡掉怪的下一次攻击）
{
  const run = R.newRun(11);
  const b = R.startFight(run);
  b.cursor = 0;
  b.lamps = 1;
  b.hand = [extra('shield'), gem(0)];
  // queueCard 拒绝立即释放牌
  assert.equal(R.queueCard(b, 0), false);
  // playInstant 立即生效并进弃牌堆
  const res = R.playInstant(b, 0);
  assert(res);
  assert.equal(b.shield, 1);
  assert.equal(b.line.length, 0);
  assert.equal(b.discard.length, 1);
  assert.equal(b.cursor, 0);
  assert.equal(b.lamps, 1);
  assert.equal(R.undoLast(b), false); // 撤不回
  // 挡掉怪的攻击
  const atk = R.attack(run, b, 0);
  assert.equal(atk.blocked, true);
  assert.equal(run.hearts, 3);
  assert.equal(b.shield, 0);
}

// 9. 提可半颗心攻击、倒计时递减与狂怒、异能牌新效果、中文大数
{
  const run = R.newRun(15);
  const b = R.startFight(run);
  b.monsters = [{ kind: 'tiko', ...CFG.monsters.tiko, maxHp: 3000, hp: 3000, attacks: 0 }];
  const a1 = R.attack(run, b, 0);
  assert.equal(a1.damage, 0.5);
  assert.equal(run.hearts, 2.5);
  assert.equal(b.monsters[0].countdown, 3); // 4 - 1 = 3
  const a2 = R.attack(run, b, 0);
  assert.equal(run.hearts, 2);
  assert.equal(b.monsters[0].countdown, 1); // 攻击两次以后每回合攻击

  // 异能牌：放大镜、火雨、点灯、镜子、冰锥、封印·大巴多姆
  const p = R.preview({ cursor: 0, lamps: 1, gems: run.gems }, [
    extra('lens'),   // 蓝(断色, 倍率1, 打1发蓝=5, 之后倍率×2→2, 灯=蓝 1<<4)
    extra('light'),  // 点亮蓝两边：青(3)、紫(5) → lamps = 0b111000
    extra('mirror'), // 当前色蓝(4) → 变黄(1, 补色! 倍率×2→4, 黄2颗×4=8发 + 白光3颗×4=12发 = 20发×5=100, hops=1)
    extra('rain'),   // 红(邻色! 倍率×2→8, 红1颗×8=8发×5=40 + 火雨4×8=32发×3=96)
    extra('seal'),   // 无色(4×8=32发×6=192 + 合白1次×8=8发×6=48)
  ]);
  assert.equal(p.multiplier, 8);
  assert.equal(p.hops, 1);
  assert.equal(p.states[0].total, 5);
  assert.equal(p.states[1].lamps, (1 << 4) | (1 << 3) | (1 << 5));
  assert.equal(p.states[2].card.col, 1);
  assert.equal(p.states[2].total, 100);
  assert.equal(p.states[3].total, 40 + 96);
  assert.equal(p.states[4].total, 192 + 48);

  // 中文大数
  assert.equal(R.formatChineseNumber(12000), '12000');
  assert.equal(R.formatChineseNumber(145320000), '14532 万');
  assert.equal(R.formatChineseNumber(1232400000000), '12324 亿');
  assert.equal(R.formatChineseNumber(12432000000000000), '12432 兆');
}

console.log('新规则核心测试全部通过：29张起手、补色白光、彩虹整回合×3、断色灭灯、不限张数、撤销、宝石回合末升级、顺延不转溢出、护盾立即释放、半心倒计时、异能牌与中文大数。');

// 10. 跨区世界再生 & 十回合上限
const { createWorld, moveWorld } = await import('../src/world.js');
const world = createWorld(1200);
const bank = JSON.stringify(world.chunks.get('0,0').pool);
const size = world.chunks.size;
for (let i = 0; i < 200; i++) moveWorld(world, 0.8, 0);
assert(!world.chunks.has('0,0'));
assert.equal(world.chunks.size, size);
world.yaw = Math.atan2(-world.x, -world.z);
moveWorld(world, Math.hypot(world.x, world.z), 0);
assert.equal(JSON.stringify(world.chunks.get('0,0').pool), bank);
const ending = R.newRun(2);
const fight = R.startFight(ending);
fight.turn = 10;
assert.equal(R.finishTurn(ending, fight), 'limit');
console.log('十回合上限及跨区再生通过；常驻块', size);

// 11. 练习模式 & 六种选怪 & 正式局隔离
const { createGame, act, step, worldView } = await import('../src/game.js');
const { moonIndex } = await import('../src/explore/night-air.js');
const { CREATURES } = await import('../src/battle/creature-catalog.js');
const { practiceDeal } = await import('../src/battle/practice.js');
assert.equal(new Set([0, 4, 8, 12].map(seed => createWorld(seed).z)).size, 4);
for (const kind of Object.keys(CREATURES)) {
  const { b } = practiceDeal(22, [kind]);
  assert.equal(b.monsters[0].name, CREATURES[kind].name);
  assert(b.monsters[0].hp > 0);
}
const collected = [];
const g = createGame(28, { collect: id => collected.push(id) });
const home = g.world;
const formal = g.run;
assert.equal(new Set([0, 10, 20].map(t => moonIndex(home, t))).size, 3);
act(g, 'practice');
act(g, 'practiceRemove', 0);
act(g, 'practiceGo');
assert.equal(g.phase, 'practiceMenu');
act(g, 'practiceAdd', 'tiko');
act(g, 'practiceGo');
while (g.phase === 'encounter') step(g, {}, 1 / 120);
const first = g.b.hand.map(c => JSON.stringify(c));
for (let ticks = 0; ticks < 48000 && g.phase !== 'practiceResult'; ticks++) {
  if (g.phase === 'battle') {
    assert.equal(worldView(g).circle, 0);
    while (g.b.hand.length) {
      const idx = autoCardIndex(g.b);
      if (idx < 0) break;
      act(g, 'play', idx);
    }
    act(g, 'cast');
    assert.equal(worldView(g).circle, 1);
  }
  assert(!['elite', 'loot', 'route', 'choose', 'result'].includes(g.phase));
  step(g, {}, 1 / 120);
}
assert.equal(g.phase, 'practiceResult');
assert.match(g.practice.reason, /击破/);
act(g, 'practiceGo');
assert.deepEqual(g.b.hand.map(c => JSON.stringify(c)), first);
act(g, 'practiceSetup');
act(g, 'practiceLeave');
assert.equal(home, g.world);
assert.equal(formal, g.run);
assert.equal(g.run.fights, 0);
assert.deepEqual(collected, []);
console.log('六种选怪、同手重练、练习胜利不掉落、正式局隔离、四处起点与视觉月相通过。');
