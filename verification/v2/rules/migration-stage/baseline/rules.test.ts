import { describe, expect, it } from 'vitest';
import {
  CARD_NAMES, CONFIG, baseValue, cloneGame, createDeck, createGame, endTurn,
  formatFormula, formatNumber, gemForm, makeDebugGame, playCard, previewCard,
  reaction, resetGrowth, seededRng, setHandLimit, shuffle, snapshot, undo, updateSettings,
} from './index';
import type { GameState, RowEntry } from './index';

const rainbow = [1, 3, 2, 6, 4, 5];
const rng = () => seededRng(271828);

function sequence(values: number[]): { state: GameState; cards: RowEntry[] } {
  const state = makeDebugGame(values, rng());
  const cards = values.map(() => playCard(state, 0));
  return { state, cards };
}

function expectInventory(state: GameState): void {
  const all = [...state.deck, ...state.hand, ...state.row, ...state.discard];
  expect(all).toHaveLength(30);
  expect(new Set(all.map((card) => card.id)).size).toBe(30);
  for (const { v, count } of CONFIG.deck) {
    expect(all.filter((card) => card.v === v)).toHaveLength(count);
  }
}

describe('01 §10 · 1–13 出牌与彩虹', () => {
  const cases = [
    { id: 1, values: [1], damage: [100], multiplier: 2, total: 100 },
    { id: 2, values: [1, 1], damage: [100, 400], multiplier: 3, total: 500 },
    { id: 3, values: [1, 3], damage: [100, 800], multiplier: 4, total: 900 },
    { id: 4, values: [1, 6], damage: [100, 2000], multiplier: 4, total: 2100 },
    { id: 5, values: [1, 2], damage: [100, 200], multiplier: 3, total: 300 },
    { id: 6, values: [0, 1], damage: [0, 400], multiplier: 4, total: 400 },
    { id: 7, values: [7, 0], damage: [300, 0], multiplier: 4, total: 300 },
    { id: 8, values: [3, 6], damage: [200, 400], multiplier: 3, total: 600 },
    { id: 9, values: rainbow, damage: [100, 800, 800, 3200, 3200, 12800], multiplier: 64, total: 209000, bonus: 188100 },
    { id: 10, values: [...rainbow, 5, 2], damage: [100, 800, 800, 3200, 3200, 12800, 25600, 32500], multiplier: 130, total: 267100, bonus: 188100 },
    { id: 11, values: [1, 3, 7, 3, 2, 6, 4, 5], damage: [100, 800, 2400, 3200, 3200, 12800, 12800, 51200], multiplier: 256, total: 865000, bonus: 778500 },
    { id: 12, values: [1, 3, 2, 5, 4, 6], damage: [100, 800, 800, 8000, 3200, 12800], multiplier: 64, total: 25700 },
    { id: 13, values: [...rainbow, 4, 6, 2, 3, 1, 5], damage: [100, 800, 800, 3200, 3200, 12800, 12800, 51200, 51200, 204800, 204800, 819200], multiplier: 4096, total: 1553000, bonus: 188100 },
  ];

  for (const item of cases) {
    it(`#${item.id}: ${item.values.map((v) => CARD_NAMES[v]).join(' → ')}`, () => {
      const { state, cards } = sequence(item.values);
      expect(cards.map((card) => card.dmg)).toEqual(item.damage);
      expect(state.m).toBe(item.multiplier);
      expect(state.turnDmg).toBe(item.total);
      expect(state.total).toBe(item.total);
      expect(cards.reduce((sum, card) => sum + card.rainbow, 0)).toBe(item.bonus ?? 0);
      expect(cards.filter((card) => card.rainbow > 0)).toHaveLength(item.bonus ? 1 : 0);
      expect(state.rainbow).toBe(Boolean(item.bonus));
      if (item.id === 9 || item.id === 10 || item.id === 13) expect(cards[5]!.rainbow).toBe(188100);
      if (item.id === 11) {
        expect(cards[7]!.rainbow).toBe(778500);
        expect(state.chainIdx).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        expect(state.row.every((card) => card.rb)).toBe(true);
      }
      if (item.id === 12) expect(state.chain).toEqual([5, 4, 6]);
      if (item.id === 13) expect(cards.slice(6).every((card) => card.k === 'shun')).toBe(true);
      expectInventory(state);
    });
  }
});

describe('01 §10 · 14–17 宝石成长', () => {
  it('#14: 第 15 次红宝石先按 100 结算，再变切好', () => {
    const state = makeDebugGame([1], rng());
    state.xp[0] = 14;
    expect(gemForm(state, 0)).toBe(0);
    const card = playCard(state, 0);
    expect(card.dmg).toBe(100);
    expect(card.gemValues[0]).toBe(100);
    expect(card.grown).toEqual([0]);
    expect(state.xp[0]).toBe(15);
    expect(gemForm(state, 0)).toBe(1);
  });

  it('#15: 红 15、绿 0，黄底数 250', () => {
    const state = makeDebugGame([3], rng());
    state.xp = [15, 0, 0];
    expect(playCard(state, 0).b).toBe(250);
    expect(state.xp).toEqual([16, 1, 0]);
  });

  it('#16: 红 15、绿 45、蓝 0，白底数 450', () => {
    const state = makeDebugGame([7], rng());
    state.xp = [15, 45, 0];
    const card = playCard(state, 0);
    expect(card.b).toBe(450);
    expect(card.gemValues).toEqual([150, 200, 100]);
    expect(state.xp).toEqual([16, 46, 1]);
  });

  it('#17: 同 #16，成长关闭时按原石算，次数仍累计', () => {
    const state = makeDebugGame([7], rng(), { grow: false });
    state.xp = [15, 45, 0];
    const card = playCard(state, 0);
    expect(card.b).toBe(300);
    expect(card.grown).toEqual([]);
    expect(state.xp).toEqual([16, 46, 1]);
    expect([0, 1, 2].map((index) => gemForm(state, index))).toEqual([0, 0, 0]);
  });
});

describe('01 §10 · 18–23 撤回、回合、牌库', () => {
  it('#18: 用例 3 撤回黄色，整个状态恢复', () => {
    const state = makeDebugGame([1, 3], rng());
    playCard(state, 0);
    const before = cloneGame(state);
    const yellow = state.hand[0];
    playCard(state, 0);
    expect(undo(state)).toBe(true);
    expect(state).toEqual(before);
    expect(state.row.map((card) => card.v)).toEqual([1]);
    expect(state.m).toBe(2);
    expect(state.turnDmg).toBe(100);
    expect(state.xp).toEqual([1, 0, 0]);
    expect(state.hand[0]).toEqual(yellow);
  });

  it('#19: 开局牌库 24、手牌 6、回合 1，所有数值清零', () => {
    const state = createGame(rng());
    expect(state.deck).toHaveLength(24);
    expect(state.hand).toHaveLength(6);
    expect(state.turn).toBe(1);
    expect(state.total).toBe(0);
    expect(state.best).toBe(0);
    expect(state.last).toBe(0);
    expect(state.xp).toEqual([0, 0, 0]);
    expectInventory(state);
  });

  it('#20: 出 3 张结束回合，弃牌 3、手牌 6、牌库 21、回合 2', () => {
    const random = rng();
    const state = createGame(random);
    playCard(state, 0); playCard(state, 0); playCard(state, 0);
    const retained = state.hand.map((card) => card.id);
    const damage = state.turnDmg;
    endTurn(state, random);
    expect(state.discard).toHaveLength(3);
    expect(state.hand).toHaveLength(6);
    expect(state.deck).toHaveLength(21);
    expect(state.turn).toBe(2);
    expect(state.hand.slice(0, 3).map((card) => card.id)).toEqual(retained);
    expect(state.last).toBe(damage);
    expect(undo(state)).toBe(false);
    expectInventory(state);
  });

  it('#21: 空回合不加回合数，不摸多余牌', () => {
    const random = rng();
    const state = createGame(random);
    const initial = cloneGame(state);
    endTurn(state, random);
    expect(state).toEqual(initial);
  });

  it('#22: 牌库空后只洗实际弃牌，长期 300 回合始终同一组 30 张', () => {
    const random = rng();
    const state = createGame(random);
    let recycled = 0;
    for (let turn = 0; turn < 300; turn += 1) {
      while (state.hand.length > 0) {
        playCard(state, 0);
        expectInventory(state);
      }
      if (state.deck.length === 0) recycled += 1;
      endTurn(state, random);
      expectInventory(state);
      expect(state.hand).toHaveLength(6);
    }
    expect(recycled).toBeGreaterThan(1);
    expect(state.turn).toBe(301);
  });

  it('#23: 彩虹回合结算上回合/最高 209,000，下一回合可以再触发', () => {
    const random = rng();
    const state = makeDebugGame([...rainbow, ...rainbow], random);
    for (let i = 0; i < 6; i += 1) playCard(state, 0);
    expect(state.turnDmg).toBe(209000);
    endTurn(state, random);
    expect(state.last).toBe(209000);
    expect(state.best).toBe(209000);
    expect(state.m).toBe(1);
    expect(state.rainbow).toBe(false);
    expect(state.chain).toEqual([]);
    expect(state.chainIdx).toEqual([]);
    expect(state.hist).toEqual([]);
    for (let i = 0; i < 6; i += 1) playCard(state, 0);
    expect(state.row[5]!.rainbow).toBe(188100);
    expect(state.turnDmg).toBe(209000);
    expect(state.total).toBe(418000);
    expectInventory(state);
  });
});

describe('01 §8 · 大数字表全部用例', () => {
  it.each([
    [0, '0'], [9999, '9,999'], [10000, '1万'], [12000, '1.2万'],
    [267100, '26.71万'], [1000000, '100万'], [12300000, '1230万'],
    [99990000, '9999万'], [123456789, '1.235亿'], [1e12, '1兆'], [2.5e16, '2.5京'],
  ])('%s → %s', (input, expected) => {
    expect(formatNumber(input as number)).toBe(expected);
  });
});

describe('额外边界与可移植性', () => {
  it('牌组数量、宝石位、唯一标识严格符合配置', () => {
    expect(createDeck()).toHaveLength(30);
    expectInventory(createGame(rng()));
  });

  it('相同种子能复现开局与回收洗牌', () => {
    const randomA = seededRng(1234);
    const randomB = seededRng(1234);
    const a = createGame(randomA);
    const b = createGame(randomB);
    for (let round = 0; round < 12; round += 1) {
      expect(a).toEqual(b);
      while (a.hand.length) { playCard(a, 0); playCard(b, 0); }
      endTurn(a, randomA); endTurn(b, randomB);
    }
    expect(a).toEqual(b);
    expect(createGame(seededRng(1235)).hand).not.toEqual(createGame(seededRng(1234)).hand);
  });

  it('64 种有前牌的反应都符合异或分类，第一张始终普通', () => {
    for (let a = 0; a <= 7; a += 1) {
      expect(reaction(null, a)).toBe('plain');
      for (let b = 0; b <= 7; b += 1) {
        const count = (a ^ b).toString(2).replace(/0/g, '').length;
        const expected = ['same', 'shun', 'plain', 'white'][count];
        expect(reaction(a, b)).toBe(expected);
      }
    }
  });

  it('空托能通过顺色留在链里，不增加颜色且不打断彩虹', () => {
    const { state, cards } = sequence([1, 0, 2, 3, 7, 5, 4, 6]);
    expect(cards.slice(1).every((card) => card.k === 'shun')).toBe(true);
    expect(state.chain).toHaveLength(6);
    expect(state.chainIdx).toHaveLength(8);
    expect(state.rainbow).toBe(true);
    expect(cards[1]!.dmg).toBe(0);
    expect(cards[7]!.rainbow).toBeGreaterThan(0);
  });

  it('同色及普通会重置顺色链，不能跨越反应拼彩虹', () => {
    const same = sequence([1, 3, 3, 2]).state;
    expect(same.chain).toEqual([3, 2]);
    expect(same.chainIdx).toEqual([2, 3]);
    const plain = sequence([1, 3, 6, 4]).state;
    expect(plain.chain).toEqual([6, 4]);
    expect(plain.chainIdx).toEqual([2, 3]);
  });

  it('预览包含彩虹和成长、无任何副作用，和实算完全一致', () => {
    const state = makeDebugGame(rainbow, rng());
    for (let i = 0; i < 5; i += 1) playCard(state, 0);
    state.xp[0] = 14;
    const before = cloneGame(state);
    const preview = previewCard(state, state.hand[0]!);
    expect(state).toEqual(before);
    expect(preview.rainbow).toBe(188100);
    expect(preview.grown).toEqual([0]);
    expect(playCard(state, 0)).toEqual(preview);
    expect(gemForm(state, 0)).toBe(1);
  });

  it('彩虹后可逐张撤回至回合开始，所有字段及历史逐次相等', () => {
    const state = makeDebugGame([...rainbow, 5, 2], rng());
    state.xp = [13, 44, 14];
    const checkpoints: GameState[] = [];
    while (state.hand.length) {
      checkpoints.push(cloneGame(state));
      playCard(state, 0);
    }
    while (checkpoints.length) {
      expect(undo(state)).toBe(true);
      expect(state).toEqual(checkpoints.pop());
      expectInventory(state);
    }
    expect(undo(state)).toBe(false);
    expect(state.row).toEqual([]);
  });

  it('快照不共享引用，普通 JSON 完整复制状态', () => {
    const state = sequence([1, 3]).state;
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    const copy = cloneGame(state);
    copy.row[0]!.gemValues[0] = 999;
    copy.hist[0]!.hand[0]!.v = 0;
    copy.opts.hint = false;
    expect(state.row[0]!.gemValues[0]).toBe(100);
    expect(state.hist[0]!.hand[0]!.v).toBe(1);
    expect(state.opts.hint).toBe(true);
    expect(snapshot(state)).not.toHaveProperty('hist');
  });

  it('手牌上限增大即补，减小不弃，之后只补到新上限', () => {
    const random = rng();
    const state = createGame(random);
    setHandLimit(state, 8, random);
    expect(state.hand).toHaveLength(8);
    expect(state.deck).toHaveLength(22);
    setHandLimit(state, 6, random);
    expect(state.hand).toHaveLength(8);
    playCard(state, 0); playCard(state, 0); playCard(state, 0);
    endTurn(state, random);
    expect(state.hand).toHaveLength(6);
    expect(state.deck).toHaveLength(21);
    expectInventory(state);
  });

  it('手牌上限减小或不变不会在回合中补牌，只在下回合补到新上限', () => {
    const random = rng();
    const state = createGame(random, { hand: 8 });
    for (let i = 0; i < 7; i += 1) playCard(state, 0);
    setHandLimit(state, 6, random);
    expect(state.hand).toHaveLength(1);
    updateSettings(state, { hand: 6 }, random);
    expect(state.hand).toHaveLength(1);
    endTurn(state, random);
    expect(state.hand).toHaveLength(6);
    expectInventory(state);
    const other = createGame(random, { hand: 8 });
    playCard(other, 0); playCard(other, 0); playCard(other, 0);
    updateSettings(other, { hand: 6 }, random);
    expect(other.hand).toHaveLength(5);
  });

  it('成长 44 → 45 先按切好结算；成长开关及清零不丢计数', () => {
    const random = rng();
    const state = makeDebugGame([7], random);
    state.xp = [44, 14, 45];
    const card = playCard(state, 0);
    expect(card.b).toBe(450);
    expect(card.grown).toEqual([0, 1]);
    expect([0, 1, 2].map((i) => gemForm(state, i))).toEqual([2, 1, 2]);
    updateSettings(state, { grow: false, hint: false }, random);
    expect(baseValue(state, 7)).toBe(300);
    expect(state.xp).toEqual([45, 15, 46]);
    updateSettings(state, { grow: true }, random);
    expect(baseValue(state, 7)).toBe(550);
    resetGrowth(state);
    expect(state.xp).toEqual([0, 0, 0]);
    expect(baseValue(state, 7)).toBe(300);
  });

  it('撤回也恢复出牌前设置和牌堆（设置变化后仍是整个状态恢复）', () => {
    const random = rng();
    const state = createGame(random);
    const before = cloneGame(state);
    playCard(state, 0);
    updateSettings(state, { hand: 8, hint: false, grow: false }, random);
    resetGrowth(state);
    undo(state);
    expect(state).toEqual(before);
  });

  it('没有可摸牌时不制造牌、不陷入循环', () => {
    const state = makeDebugGame(createDeck().map((card) => card.v), rng());
    while (state.hand.length > 0) playCard(state, 0);
    setHandLimit(state, 8, rng());
    expect(state.hand).toHaveLength(0);
    expect(state.row).toHaveLength(30);
    endTurn(state, rng());
    expect(state.hand).toHaveLength(8);
    expectInventory(state);
  });

  it('非法输入明确报错且非法出牌不会增加撤回历史', () => {
    const state = createGame(rng());
    const before = cloneGame(state);
    for (const index of [-1, 6, 0.5, Number.NaN]) expect(() => playCard(state, index)).toThrow(RangeError);
    expect(state).toEqual(before);
    expect(() => previewCard(state, 8)).toThrow(RangeError);
    expect(() => makeDebugGame([0, 0], rng())).toThrow(RangeError);
    expect(() => shuffle([1, 2], () => 1)).toThrow(RangeError);
    // 新版允许手牌 7；仍检查规格范围外的上限被拒绝。
    expect(() => createGame(rng(), { hand: 9 as 6 })).toThrow(RangeError);
  });
});

describe('01 §9 · 算式行', () => {
  it('单颗、普通、空托及预计算式', () => {
    const single = sequence([1]).cards[0]!;
    expect(formatFormula(single)).toBe('红宝石：100 × 倍率 1 = 100');
    expect(formatFormula(single, true)).toBe('预计 红宝石：100 × 倍率 1 = 100');
    const empty = sequence([1, 0]).cards[1]!;
    expect(formatFormula(empty)).toBe('空托：0 × 倍率 2 × 顺色 2 = 0');
  });

  it('混色拆分是出牌前底数，后续成长不能改写旧算式', () => {
    const state = makeDebugGame([3], rng());
    state.xp = [15, 14, 0];
    state.m = 4;
    state.row.push({ ...previewCard(state, 1), id: -1 });
    const card = playCard(state, 0);
    expect(formatFormula(card)).toBe('黄宝石：红 150 + 绿 100 = 250 × 倍率 4 × 顺色 2 = 2,000');
    expect(gemForm(state, 1)).toBe(1);
    expect(card.gemValues[1]).toBe(100);
  });

  it('白牌与彩虹末尾所有数字统一采用 §8 单位', () => {
    const state = makeDebugGame([7], rng());
    state.xp = [15, 0, 45];
    state.m = 8;
    state.row.push({ ...previewCard(state, 0), id: -1 });
    const white = playCard(state, 0);
    expect(formatFormula(white)).toBe('白宝石：红 150 + 绿 100 + 蓝 200 = 450 × 倍率 8 × 凑白 5 = 1.8万');
    const last = sequence(rainbow).cards[5]!;
    expect(formatFormula(last)).toBe('品红宝石：红 100 + 蓝 100 = 200 × 倍率 32 × 顺色 2 = 1.28万　彩虹！这回合 ×10　+18.81万');
  });
});
