import { describe, expect, it } from 'vitest';
import { createToolCard, formatNumber, previewCard } from './index';
import type { ToolType } from './types';
import {
  RUN, abandonRun, chooseLoot, cloneRun, createRecords, createRun as createUnselectedRun, chooseRelic, endRunTurn,
  formatMonsterHp, formatOverkill, playRunCard, skipLoot, undoRun, updateRecords,
} from './run';
import type { RunState } from './run-types';

/** Existing battle scenarios explicitly choose a non-numeric-changing relic. */
function createRun(seed: number): RunState {
  const run = createUnselectedRun(seed);
  run.relicOptions = ['same', 'once', 'white'];
  chooseRelic(run, 0);
  return run;
}
import { decodeRunSave, encodeRunSave } from './save-state';

const rainbow = [1, 3, 2, 6, 4, 5] as const;

/** Only sets up a documented scenario. All tested transitions use public commands. */
function deal(run: RunState, sequence: readonly (number | ToolType)[]): void {
  if (run.game.row.length || run.game.hist.length) throw new Error('Fixture requires an untouched turn');
  const pool = [...run.game.deck, ...run.game.hand, ...run.game.discard];
  run.game.hand = sequence.map((value) => {
    const i = pool.findIndex((card) => typeof value === 'number'
      ? !card.type && card.v === value : card.type === value);
    if (i < 0) throw new Error(`Missing fixture card ${value}`);
    return pool.splice(i, 1)[0]!;
  });
  run.game.deck = pool;
  run.game.discard = [];
}

function inventory(run: RunState): void {
  const all = [...run.game.deck, ...run.game.hand, ...run.game.row, ...run.game.discard];
  expect(all).toHaveLength(run.cards.length);
  expect(new Set(all.map((c) => c.id)).size).toBe(run.cards.length);
  expect(all.map((c) => c.id).sort((a, b) => a - b))
    .toEqual(run.cards.map((c) => c.id).sort((a, b) => a - b));
}

function lowHpRun(): RunState {
  const run = createRun(314159);
  deal(run, rainbow);
  run.monster.hp = 1000;
  run.monster.turnStartHp = 1000;
  return run;
}

function winCurrentFight(run: RunState): void {
  deal(run, rainbow);
  run.monster.hp = 1000;
  run.monster.turnStartHp = 1000;
  for (let i = 0; i < rainbow.length; i += 1) playRunCard(run, 0);
  expect(run.monster.broken).toBe(true);
  endRunTurn(run);
  inventory(run);
}

function fight(number: number): RunState {
  const run = createRun(123);
  while (run.fight < number) {
    winCurrentFight(run);
    skipLoot(run);
  }
  return run;
}

function lootAtOverkill(ratio: number): RunState {
  const run = createRun(17);
  deal(run, [1]);
  // The threshold is tested against the raw ratio, independently of its display.
  run.monster.hp = 100 / ratio;
  run.monster.turnStartHp = run.monster.hp;
  playRunCard(run, 0);
  expect(run.monster.overkill).toBeCloseTo(ratio, 10);
  endRunTurn(run);
  return run;
}

function persisted(run: RunState): RunState {
  const encoded = encodeRunSave(run);
  expect(encoded).not.toBeNull();
  const decoded = decodeRunSave(encoded);
  expect(decoded.reason).toBe('ok');
  expect(decoded.clear).toBe(false);
  expect(decoded.state).toEqual(run);
  return decoded.state!;
}

function nextOperation(run: RunState, index: number): void {
  if (run.phase === 'loot') {
    if (index % 4 === 0) skipLoot(run);
    else chooseLoot(run, index % run.loot.length);
  } else if (run.phase === 'battle') {
    if (index % 7 === 3 && run.hist.length) undoRun(run);
    else if (run.monster.broken || index % 5 === 4 || !run.game.hand.length) endRunTurn(run);
    else {
      const best = run.game.hand.reduce((current, card, i) =>
        previewCard(run.game, card).damage > previewCard(run.game, run.game.hand[current]!).damage ? i : current, 0);
      playRunCard(run, best);
    }
  }
  inventory(run);
}

describe('新01 §11.2 一仗 · #21–#32', () => {
  it('#21: 固定种子新局的30张基础牌、心、手牌、倒计时及血量', () => {
    const run = createRun(123);
    expect(run.fight).toBe(1);
    expect(run.phase).toBe('battle');
    expect(run.game.hand).toHaveLength(7);
    expect(run.game.deck).toHaveLength(23);
    expect(run.cards.map((c) => c.id)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(run.cards.every((c) => !c.type)).toBe(true);
    expect(run.hearts).toBe(3);
    expect(run.handLimit).toBe(7);
    expect(run.game.xp).toEqual([0, 0, 0]);
    expect(run.monster.hp).toBe(20000);
    expect(run.monster.countdown).toBe(3);
    expect(['chest', 'soldier', 'bear']).toContain(run.monster.key);
    inventory(run);
  });

  it('#22: 第一张红的100伤害立即从血量扣除', () => {
    const run = createRun(1);
    deal(run, [1]);
    expect(playRunCard(run, 0).damage).toBe(100);
    expect(run.monster.hp).toBe(19900);
    expect(run.game.turnDmg).toBe(100);
    expect(run.monster.broken).toBe(false);
  });

  it('#23: 1000起始血第3张打穿，继续彩虹到209000，超杀209', () => {
    const run = lowHpRun();
    const hps: number[] = [];
    const broken: boolean[] = [];
    for (let i = 0; i < rainbow.length; i += 1) {
      playRunCard(run, 0);
      hps.push(run.monster.hp);
      broken.push(run.monster.broken);
    }
    expect(hps).toEqual([900, 100, 0, 0, 0, 0]);
    expect(broken).toEqual([false, false, true, true, true, true]);
    expect(run.monster.turnStartHp).toBe(1000);
    expect(run.monster.overkill).toBe(209);
    expect(run.game.turnDmg).toBe(209000);
    expect(run.monster.countdown).toBe(run.monster.maxCountdown);
  });

  it('#24: 打穿后能逐张撤回，恢复100血未打穿，再全部恢复1000血', () => {
    const run = lowHpRun();
    const before = cloneRun(run);
    for (let i = 0; i < rainbow.length; i += 1) playRunCard(run, 0);
    for (let i = 0; i < 4; i += 1) expect(undoRun(run)).toBe(true);
    expect(run.game.row.map((card) => card.v)).toEqual([1, 3]);
    expect(run.monster.hp).toBe(100);
    expect(run.monster.broken).toBe(false);
    expect(run.monster.overkill).toBe(0);
    expect(undoRun(run)).toBe(true);
    expect(undoRun(run)).toBe(true);
    expect(run).toEqual(before);
    expect(undoRun(run)).toBe(false);
  });

  it('#25: 非发条怪第3个未打穿回合结束才出手，心减1，倒计时重置', () => {
    const run = createRun(123);
    endRunTurn(run);
    expect([run.monster.countdown, run.hearts]).toEqual([2, 3]);
    endRunTurn(run);
    expect([run.monster.countdown, run.hearts]).toEqual([1, 3]);
    endRunTurn(run);
    expect([run.monster.countdown, run.hearts]).toEqual([3, 2]);
    expect(run.game.turn).toBe(4);
  });

  it('#26: 空过也减倒计时、加回合，手牌不变', () => {
    const run = createRun(123);
    const hand = [...run.game.hand];
    endRunTurn(run);
    expect(run.monster.countdown).toBe(2);
    expect(run.game.turn).toBe(2);
    expect(run.game.hand).toEqual(hand);
    expect(run.stats.turns).toBe(1);
  });

  it('#27: 最后一颗心耗尽失败，停止生成存档并更新纪录', () => {
    const run = createRun(1);
    run.hearts = 1;
    run.monster.countdown = 1;
    endRunTurn(run);
    expect(run.hearts).toBe(0);
    expect(run.phase).toBe('defeat');
    expect(run.result?.reason).toBe('hearts');
    expect(run.result?.totalTurns).toBe(1);
    expect(encodeRunSave(run)).toBeNull(); // UI uses null to remove gemcard.run in step 2.
    const records = createRecords();
    updateRecords(records, run);
    expect(records).toEqual({ played: 1, wins: 0, farthest: 1, bestTurn: 0, maxOverkill: 0 });
  });

  it('#28: 首领有4完整回合，前三回合不出手，第四回合出手', () => {
    const run = fight(6);
    expect(run.monster.key).toBe('dragon');
    expect(run.monster.countdown).toBe(4);
    for (const countdown of [3, 2, 1]) {
      endRunTurn(run);
      expect(run.monster.countdown).toBe(countdown);
      expect(run.hearts).toBe(3);
    }
    endRunTurn(run);
    expect(run.hearts).toBe(2);
    expect(run.monster.countdown).toBe(4);
  });

  it('#29: 打穿后结束回合进入战利品，不再攻击、不改变倒计时', () => {
    const run = lowHpRun();
    run.monster.countdown = 1;
    for (let i = 0; i < rainbow.length; i += 1) playRunCard(run, 0);
    endRunTurn(run);
    expect(run.phase).toBe('loot');
    expect(run.monster.countdown).toBe(1);
    expect(run.hearts).toBe(3);
    expect(run.stats.fights[0]).toMatchObject({ fight: 1, won: true, turns: 1, damage: 209000, overkill: 209 });
    expect(undoRun(run)).toBe(false);
  });

  it('#30: 第6仗打穿后结束为胜利，没有战利品', () => {
    const run = fight(6);
    winCurrentFight(run);
    expect(run.phase).toBe('victory');
    expect(run.loot).toEqual([]);
    expect(run.result?.outcome).toBe('victory');
    expect(run.stats.fights).toHaveLength(6);
    expect(encodeRunSave(run)).toBeNull();
    const records = createRecords();
    updateRecords(records, run);
    expect(records.wins).toBe(1);
    expect(records.farthest).toBe(7);
  });

  it('#31: 打穿后再出2张仍计反应、成长、整回合超杀，血不为负', () => {
    const run = lowHpRun();
    for (let i = 0; i < 3; i += 1) playRunCard(run, 0);
    expect(run.monster.broken).toBe(true);
    const before = [...run.game.xp];
    expect(playRunCard(run, 0).k).toBe('shun');
    expect(playRunCard(run, 0).k).toBe('shun');
    expect(run.monster.hp).toBe(0);
    expect(run.game.xp).toEqual([before[0], before[1]! + 1, before[2]! + 2]);
    expect(run.game.turnDmg).toBe(8100);
    expect(run.monster.overkill).toBe(8.1);
  });

  it('#32: 每仗重洗全部身份并重置桌面、弃牌、倍率，成长整局保留', () => {
    const run = createRun(8);
    for (let n = 1; n <= 5; n += 1) {
      // Have cards in discard and hand as well as the eventual winning row.
      deal(run, [1]);
      playRunCard(run, 0);
      endRunTurn(run);
      winCurrentFight(run);
      const xp = [...run.game.xp];
      const total = run.game.total;
      chooseLoot(run, 0);
      expect(run.fight).toBe(n + 1);
      expect(run.game.row).toEqual([]);
      expect(run.game.discard).toEqual([]);
      expect(run.game.deck.length + run.game.hand.length).toBe(run.cards.length);
      expect(run.game.xp).toEqual(xp);
      expect(run.game.total).toBe(total);
      expect(run.game.m).toBe(1);
      expect(run.game.turn).toBe(1);
      expect(run.game.turnDmg).toBe(0);
      expect(run.monster.hp).toBe(RUN.fights[n]!.hp);
      inventory(run);
    }
  });
});

describe('新01 §11.3 战利品、一局、存档 · #41–#52', () => {
  it('#41: 原始超杀9.999只出3张，不使用显示值判断', () => {
    const run = lootAtOverkill(9.999);
    expect(run.loot).toHaveLength(3);
    expect(formatOverkill(run.monster.overkill)).toBe('×9.9');
  });
  it('#42: 原始超杀正好10出4张', () => {
    expect(lootAtOverkill(10).loot).toHaveLength(4);
  });
  it('#43: 200种种子的每次战利品均不重复且来自5种工具', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const run = createRun(seed);
      for (let f = 1; f <= 5; f += 1) {
        winCurrentFight(run);
        expect(new Set(run.loot).size).toBe(run.loot.length);
        expect(run.loot.every((t) => ['bag', 'lens', 'hammer', 'mirror', 'stone'].includes(t))).toBe(true);
        skipLoot(run);
      }
    }
  });
  it('#44: 选放大镜后新增id31，下一仗31张牌完整重洗', () => {
    let run = createRun(0);
    for (let seed = 0; seed < 100; seed += 1) {
      run = createRun(seed);
      winCurrentFight(run);
      if (run.loot.includes('lens')) break;
    }
    expect(run.loot).toContain('lens');
    chooseLoot(run, run.loot.indexOf('lens'));
    expect(run.cards).toHaveLength(31);
    expect(run.cards.at(-1)).toEqual({ id: 31, v: 4, type: 'lens' });
    expect(run.game.deck.length + run.game.hand.length).toBe(31);
    expect(run.fight).toBe(2);
    expect(undoRun(run)).toBe(false);
    inventory(run);
  });
  it('#45（v2更新）: 不拿战利品时2心保持2心', () => {
    const run = lootAtOverkill(2);
    run.hearts = 2;
    skipLoot(run);
    expect(run.hearts).toBe(2);
    expect(run.cards).toHaveLength(30);
  });
  it('#46: 满心时不拿仍为3心', () => {
    const run = lootAtOverkill(2);
    skipLoot(run);
    expect(run.hearts).toBe(3);
  });
  it('#47: 赢精英立即标记上限8，但到下一仗才补8张', () => {
    const run = fight(3);
    expect(run.handLimit).toBe(7);
    winCurrentFight(run);
    expect(run.phase).toBe('loot');
    expect(run.handLimit).toBe(8);
    expect(run.game.opts.hand).toBe(7);
    skipLoot(run);
    expect(run.fight).toBe(4);
    expect(run.game.hand).toHaveLength(8);
    expect(run.game.opts.hand).toBe(8);
  });
  it('#48: 1000种种子，小怪跨精英仍不重复，精英/首领固定', () => {
    for (let seed = 0; seed < 1000; seed += 1) {
      const run = createRun(seed);
      const m = run.monsters;
      expect(m[1]).not.toBe(m[0]);
      expect(m[3]).not.toBe(m[1]);
      expect(m[4]).not.toBe(m[3]);
      expect(m[2]).toBe('clock');
      expect(m[5]).toBe('dragon');
      expect([m[0], m[1], m[3], m[4]].every((x) => ['chest', 'soldier', 'bear'].includes(x!))).toBe(true);
    }
  });
  it('#49: 战利品保存/恢复后仍是同样选项和随机状态', () => {
    const run = createRun(0);
    winCurrentFight(run);
    const restored = persisted(run);
    expect(restored.loot).toEqual(run.loot);
    expect(restored.game.rngState).toBe(run.game.rngState);
    chooseLoot(run, 0);
    chooseLoot(restored, 0);
    expect(restored).toEqual(run);
  });
  it('#50: 多个时点存档/读档后相同20步操作，状态、撤回和后续随机结果一致', () => {
    const checkpoints: RunState[] = [];
    const run = lowHpRun();
    checkpoints.push(cloneRun(run));
    playRunCard(run, 0);
    playRunCard(run, 0);
    checkpoints.push(cloneRun(run));
    playRunCard(run, 0);
    checkpoints.push(cloneRun(run));
    for (let i = 0; i < 3; i += 1) playRunCard(run, 0);
    endRunTurn(run);
    checkpoints.push(cloneRun(run));
    chooseLoot(run, 0);
    checkpoints.push(cloneRun(run));
    for (const checkpoint of checkpoints) {
      const live = cloneRun(checkpoint);
      const restored = persisted(checkpoint);
      const plainJson = JSON.parse(JSON.stringify(checkpoint)) as RunState;
      for (let i = 0; i < 20; i += 1) {
        nextOperation(live, i);
        nextOperation(restored, i);
        nextOperation(plainJson, i);
        expect(restored).toEqual(live);
        expect(plainJson).toEqual(live);
      }
    }
  });
  it('#51: 同种子同操作的状态全过程一致，包含出牌、撤回、结束和选牌', () => {
    const first = createRun(8484);
    const second = createRun(8484);
    expect(first).toEqual(second);
    for (let i = 0; i < 160; i += 1) {
      nextOperation(first, i);
      nextOperation(second, i);
      expect(first).toEqual(second);
    }
  });
  it('#52: 错误version或坏JSON返回无存档并要求清除', () => {
    for (const raw of ['not JSON', '{', JSON.stringify({ version: 4, state: createRun(1) })]) {
      expect(decodeRunSave(raw)).toEqual({ state: null, clear: true, reason: 'invalid' });
    }
  });
});

describe('新01 §12 显示表 · 全部11项', () => {
  for (const [input, output] of [
    [1.06, '×1'], [2.46, '×2.4'], [9.96, '×9.9'], [10, '×10'],
    [37.6, '×37'], [209, '×209'], [12345.6, '×1.235万'],
  ] as const) {
    it(`超杀 ${input} → ${output}`, () => expect(formatOverkill(input)).toBe(output));
  }
  for (const [hp, max, output] of [
    [20000, 20000, '2万 / 2万'], [19900, 20000, '1.99万 / 2万'],
    [1234567, 1500000, '123.5万 / 150万'], [0, 100000, '0 / 10万'],
  ] as const) {
    it(`怪血 ${hp}/${max} → ${output}`, () => expect(formatMonsterHp(hp, max)).toBe(output));
  }
});

describe('冒险 · 补充边界和用户澄清', () => {
  it('第3仗第2回合放弃，要计入正在打的第2回合', () => {
    const run = fight(3);
    const previousTurns = run.stats.turns;
    endRunTurn(run);
    expect(run.game.turn).toBe(2);
    abandonRun(run);
    expect(run.result?.totalTurns).toBe(previousTurns + 2);
    expect(run.stats.fights.at(-1)).toMatchObject({ fight: 3, turns: 2, won: false });
    expect(run.result?.reason).toBe('abandoned');
    expect(encodeRunSave(run)).toBeNull();
  });

  it('战利品阶段放弃不重复算已经完成的回合或战斗', () => {
    const run = createRun(1);
    winCurrentFight(run);
    const turns = run.stats.turns;
    const fights = run.stats.fights.length;
    abandonRun(run);
    expect(run.result?.totalTurns).toBe(turns);
    expect(run.stats.fights).toHaveLength(fights);
  });

  it('纪录只更新一次，严格超过才标新纪录', () => {
    const run = fight(6);
    winCurrentFight(run);
    const records = createRecords();
    updateRecords(records, run);
    expect(run.result?.newRecords).toEqual({ farthest: true, bestTurn: true, maxOverkill: true });
    const first = { ...records };
    updateRecords(records, run);
    expect(records).toEqual(first);
    const sameRun = fight(6);
    winCurrentFight(sameRun);
    updateRecords(records, sameRun);
    expect(records.played).toBe(2);
    expect(records.wins).toBe(2);
    expect(sameRun.result?.newRecords).toEqual({ farthest: false, bestTurn: false, maxOverkill: false });
  });

  it('口袋触发洗弃牌后，JSON重载再撤回/重打恢复怪、卡牌、随机和统计', () => {
    const run = createRun(12);
    const tool = createToolCard('bag', 31);
    run.cards.push(tool);
    run.game.deck.push({ ...tool });
    deal(run, ['bag']);
    run.game.discard = run.game.deck.splice(0, 4);
    run.game.hand.push(...run.game.deck.splice(0));
    const before = cloneRun(run);
    playRunCard(run, 0);
    const after = cloneRun(run);
    const restored = persisted(run);
    expect(undoRun(restored)).toBe(true);
    expect(restored).toEqual(before);
    playRunCard(restored, 0);
    expect(restored).toEqual(after);
    inventory(restored);
  });

  it('锤子所有追加伤害都即时扣血，超杀使用整回合伤害', () => {
    const run = createRun(1);
    const tool = createToolCard('hammer', 31);
    run.cards.push(tool);
    run.game.deck.push({ ...tool });
    deal(run, [1, 3, 'hammer']);
    run.monster.hp = 1000;
    run.monster.turnStartHp = 1000;
    playRunCard(run, 0);
    playRunCard(run, 0);
    const before = cloneRun(run);
    expect(playRunCard(run, 0).damage).toBe(2500);
    expect(run.monster.hp).toBe(0);
    expect(run.monster.overkill).toBe(3.4);
    expect(run.game.total).toBe(3400);
    expect(undoRun(run)).toBe(true);
    expect(run).toEqual(before);
  });

  it('前回合已削血后，新回合超杀分母取当时剩余血而非满血', () => {
    const run = createRun(1);
    deal(run, [1]);
    playRunCard(run, 0);
    endRunTurn(run);
    expect(run.monster.turnStartHp).toBe(19900);
    deal(run, rainbow);
    for (let i = 0; i < rainbow.length; i += 1) playRunCard(run, 0);
    expect(run.monster.overkill).toBe(209000 / 19900);
  });

  it('结束后不能出牌或选战利品，无效命令不改变状态', () => {
    const run = createRun(3);
    abandonRun(run);
    const before = cloneRun(run);
    expect(() => playRunCard(run, 0)).toThrow();
    expect(() => endRunTurn(run)).toThrow();
    expect(() => chooseLoot(run, 0)).toThrow();
    expect(() => skipLoot(run)).toThrow();
    expect(undoRun(run)).toBe(false);
    expect(run).toEqual(before);
  });

  it('非法出牌与非法战利品索引不增加历史、不改变随机或卡牌', () => {
    const run = createRun(3);
    const before = cloneRun(run);
    expect(() => playRunCard(run, -1)).toThrow();
    expect(run).toEqual(before);
    winCurrentFight(run);
    const loot = cloneRun(run);
    expect(() => chooseLoot(run, run.loot.length)).toThrow();
    expect(run).toEqual(loot);
  });

  it('每仗数值来自配置，发条兵倒计时覆盖为2', () => {
    expect(RUN.fights.map((f) => [f.hp, f.countdown])).toEqual([
      [20000, 3], [40000, 3], [100000, 3], [300000, 3], [600000, 3], [1500000, 4],
    ]);
    for (let seed = 0; seed < 30; seed += 1) {
      const run = createRun(seed);
      expect([run.monster.hp, run.monster.countdown]).toEqual([20000, run.monster.key === 'soldier' ? 2 : 3]);
    }
  });
});


describe('大数字与超杀 · 用户确认的两步舍入边界', () => {
  it('伤害和血量在四位有效数字中点按旧规范四舍五入，不向下截断', () => {
    expect(formatNumber(12345)).toBe('1.235万');
    expect(formatNumber(-12345)).toBe('-1.235万');
    expect(formatNumber(12345000)).toBe('1235万');
    expect(formatMonsterHp(12345, 20000)).toBe('1.235万 / 2万');
  });
  it('超杀只先舍弃原数的小数，之后仍走统一的大数字四舍五入', () => {
    expect(formatOverkill(9.99999)).toBe('×9.9');
    expect(formatOverkill(9999.99)).toBe('×9,999');
    expect(formatOverkill(10000)).toBe('×1万');
    expect(formatOverkill(12349.9)).toBe('×1.235万');
  });
});
