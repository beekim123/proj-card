import { describe, expect, it } from 'vitest';
import {
  cloneGame, createGame, createToolCard, endTurn, formatCardHint, formatFormula, gemForm,
  playCard, previewCard, seededRng, undo, updateSettings,
} from './index';
import type { Card, GameState, RowEntry, ToolType } from './index';

// Test fixtures rearrange real cards and explicitly add only the requested tools.
// They do not call the production debug-deal helper.
function fixture(sequence: readonly (number | ToolType)[], grow = true): GameState {
  const state = createGame(seededRng(73421), { hand: 7, grow });
  const pool: Card[] = [...state.deck, ...state.hand];
  let nextId = 31;
  for (const value of sequence) {
    if (typeof value === 'string') pool.push(createToolCard(value, nextId++));
  }
  state.hand = sequence.map((value) => {
    const i = pool.findIndex((card) => typeof value === 'number'
      ? !card.type && card.v === value : card.type === value);
    if (i < 0) throw new Error(`Invalid test fixture: ${value}`);
    return pool.splice(i, 1)[0]!;
  });
  state.deck = pool;
  return state;
}

function inventory(state: GameState): number[] {
  return [...state.deck, ...state.hand, ...state.row, ...state.discard].map((c) => c.id).sort((a, b) => a - b);
}

function sequence(values: readonly (number | ToolType)[]): { state: GameState; cards: RowEntry[] } {
  const state = fixture(values);
  const before = inventory(state);
  const cards = values.map(() => {
    const entry = playCard(state, 0);
    expect(inventory(state)).toEqual(before);
    return entry;
  });
  return { state, cards };
}

const rainbow = [1, 3, 2, 6, 4, 5] as const;

describe('新01 §11.1 额外牌 · #1–#18', () => {
  const cases: {
    id: number; values: (number | ToolType)[]; damage: number[];
    multiplier: number; total: number; rainbow?: number; hammer?: number[];
  }[] = [
    { id: 1, values: [1, 'lens'], damage: [100, 200], multiplier: 6, total: 300 },
    { id: 2, values: [3, 'lens'], damage: [200, 1000], multiplier: 8, total: 1200 },
    { id: 3, values: [1, 3, 'hammer'], damage: [100, 800, 800], multiplier: 8, total: 3400, hammer: [0, 0, 1700] },
    { id: 4, values: [...rainbow, 'hammer'], damage: [100, 800, 800, 3200, 3200, 12800, 12800], multiplier: 128, total: 443600, rainbow: 188100, hammer: [0, 0, 0, 0, 0, 0, 221800] },
    { id: 5, values: [1, 3, 2, 6, 'lens', 5], damage: [100, 800, 800, 3200, 3200, 25600], multiplier: 128, total: 337000, rainbow: 303300 },
    { id: 6, values: [1, 'mirror'], damage: [100, 2000], multiplier: 4, total: 2100 },
    { id: 7, values: [0, 'mirror'], damage: [0, 3000], multiplier: 4, total: 3000 },
    { id: 8, values: ['mirror'], damage: [0], multiplier: 2, total: 0 },
    { id: 9, values: [7, 'mirror'], damage: [300, 0], multiplier: 4, total: 300 },
    { id: 10, values: [1, 'mirror', 1], damage: [100, 2000, 2000], multiplier: 8, total: 4100 },
    { id: 12, values: ['hammer', 'hammer'], damage: [100, 400], multiplier: 3, total: 1200, hammer: [100, 600] },
    { id: 14, values: [1, 3, 2, 6, 4, 'mirror'], damage: [100, 800, 800, 3200, 3200, 32000], multiplier: 64, total: 40100 },
  ];
  for (const c of cases) {
    it(`#${c.id}: ${c.values.join(' → ')}`, () => {
      const { state, cards } = sequence(c.values);
      expect(cards.map((card) => card.dmg)).toEqual(c.damage);
      expect(state.m).toBe(c.multiplier);
      expect(state.turnDmg).toBe(c.total);
      expect(state.total).toBe(c.total);
      expect(cards.reduce((sum, card) => sum + card.rainbow, 0)).toBe(c.rainbow ?? 0);
      expect(cards.map((card) => card.hammer)).toEqual(c.hammer ?? c.values.map(() => 0));
      expect(cards.reduce((sum, card) => sum + card.damage, 0)).toBe(c.total);
      if (c.id === 1) expect(cards[1]!.k).toBe('plain');
      if (c.id === 2) expect(cards[1]!.k).toBe('white');
      if (c.id === 5) expect(cards[4]!.rb).toBe(true);
      if (c.id === 6) {
        expect(cards[1]!.v).toBe(6);
        expect(state.xp).toEqual([1, 1, 1]);
      }
      if (c.id === 7) expect(cards[1]!.v).toBe(7);
      if (c.id === 8) {
        expect(cards[0]!.v).toBe(0);
        expect(state.xp).toEqual([0, 0, 0]);
      }
      if (c.id === 9) expect(cards[1]!.v).toBe(0);
      if (c.id === 10) expect(cards[2]!.k).toBe('white');
      if (c.id === 14) {
        expect(cards[5]!.v).toBe(3);
        expect(cards[5]!.k).toBe('white');
        expect(state.rainbow).toBe(false);
      }
    });
  }

  it('#11: 磨石先把红从10次升到15次，下一张红使用150底数', () => {
    const state = fixture(['stone', 1]);
    state.xp = [10, 0, 0];
    const stone = playCard(state, 0);
    expect(stone.dmg).toBe(0);
    expect(stone.grown).toEqual([0]);
    expect(gemForm(state, 0)).toBe(1);
    expect(playCard(state, 0).dmg).toBe(600);
    expect(state.m).toBe(4);
    expect(state.turnDmg).toBe(600);
    expect(state.xp).toEqual([16, 5, 5]);
  });

  it('#13: 口袋从牌库末尾摸两张，出一摸二，手牌净增一', () => {
    const state = fixture([1, 'bag']);
    playCard(state, 0);
    const hand = state.hand.length;
    const deck = [...state.deck];
    const ids = inventory(state);
    const bag = playCard(state, 0);
    expect(bag.dmg).toBe(200);
    expect(bag.k).toBe('plain');
    expect(state.m).toBe(3);
    expect(state.turnDmg).toBe(300);
    expect(state.hand).toHaveLength(hand + 1);
    expect(state.deck).toEqual(deck.slice(0, -2));
    expect(state.hand.slice(-2)).toEqual([deck.at(-1), deck.at(-2)]);
    expect(inventory(state)).toEqual(ids);
  });

  it('#15: 口袋牌库1张、弃牌3张时先摸1再洗弃牌摸1，卡牌守恒', () => {
    const state = fixture(['bag']);
    state.discard = state.deck.splice(0, 3);
    state.hand.push(...state.deck.splice(0, state.deck.length - 1));
    const top = state.deck[0]!;
    const discards = state.discard.map((c) => c.id);
    const ids = inventory(state);
    const handCount = state.hand.length;
    playCard(state, 0);
    expect(state.hand).toHaveLength(handCount + 1);
    expect(state.hand.at(-2)).toEqual(top);
    expect(discards).toContain(state.hand.at(-1)!.id);
    expect(state.deck).toHaveLength(2);
    expect(state.discard).toHaveLength(0);
    expect(inventory(state)).toEqual(ids);
  });

  it('#16: 彩虹之后的锤子撤回，回到64倍率、209000伤害，彩虹保留', () => {
    const { state } = sequence([...rainbow, 'hammer']);
    expect(undo(state)).toBe(true);
    expect(state.m).toBe(64);
    expect(state.turnDmg).toBe(209000);
    expect(state.total).toBe(209000);
    expect(state.rainbow).toBe(true);
    expect(state.row.every((entry) => entry.rb)).toBe(true);
    expect(state.hand[0]!.type).toBe('hammer');
  });

  it('#17: 口袋撤回复原两张牌的位置，再打摸到同样的牌', () => {
    const state = fixture([1, 'bag']);
    playCard(state, 0);
    const before = cloneGame(state);
    playCard(state, 0);
    const after = cloneGame(state);
    expect(undo(state)).toBe(true);
    expect(state).toEqual(before);
    playCard(state, 0);
    expect(state).toEqual(after);
  });

  it('#18: 磨石同时使红44→49闪光、绿14→19切好，蓝0→5', () => {
    const state = fixture(['stone']);
    state.xp = [44, 14, 0];
    expect(playCard(state, 0).grown).toEqual([0, 1]);
    expect(state.xp).toEqual([49, 19, 5]);
    expect([0, 1, 2].map((i) => gemForm(state, i))).toEqual([2, 1, 0]);
  });
});

describe('额外牌 · 结算顺序、完整撤回和练习兼容', () => {
  it('口袋洗弃牌后撤回也恢复随机数，再次出牌结果完全相同', () => {
    const state = fixture(['bag']);
    state.discard = state.deck.splice(0, 6);
    state.hand.push(...state.deck.splice(0));
    const before = cloneGame(state);
    playCard(state, 0);
    const after = cloneGame(state);
    expect(after.rngState).not.toBe(before.rngState);
    expect(undo(state)).toBe(true);
    expect(state).toEqual(before);
    playCard(state, 0);
    expect(state).toEqual(after);
  });

  it('镜子桌面使用有效宝石，进弃牌时恢复无宝石，撤回回到手牌原样', () => {
    const state = fixture([1, 'mirror']);
    playCard(state, 0);
    const before = cloneGame(state);
    playCard(state, 0);
    expect(state.row.at(-1)!.v).toBe(6);
    expect(undo(state)).toBe(true);
    expect(state).toEqual(before);
    expect(state.hand[0]!.v).toBe(0);
    const mirrorId = state.hand[0]!.id;
    playCard(state, 0);
    endTurn(state, seededRng(8));
    expect(state.discard.find((c) => c.id === mirrorId)?.v).toBe(0);
  });

  it('磨石升级可完整撤回，成长关闭仍增加次数而不提升底数或升级特效', () => {
    const state = fixture(['stone', 1], false);
    state.xp = [44, 14, 0];
    const before = cloneGame(state);
    expect(playCard(state, 0).grown).toEqual([]);
    expect(state.xp).toEqual([49, 19, 5]);
    expect(playCard(state, 0).dmg).toBe(400);
    undo(state);
    undo(state);
    expect(state).toEqual(before);
  });

  it('锤子恰好触发彩虹时先算彩虹再翻倍，预览包含二者且不改变状态', () => {
    const state = fixture([5, 4, 6, 2, 3, 'hammer']);
    for (let i = 0; i < 5; i += 1) playCard(state, 0);
    const before = cloneGame(state);
    const preview = previewCard(state, state.hand[0]!);
    expect(preview.rainbow).toBeGreaterThan(0);
    expect(preview.hammer).toBe((state.turnDmg + preview.dmg) * 10);
    expect(preview.damage).toBe(preview.dmg + preview.rainbow + preview.hammer);
    expect(state).toEqual(before);
    expect(playCard(state, 0)).toEqual(preview);
    const formula = formatFormula(preview);
    expect(formula.indexOf('彩虹！')).toBeLessThan(formula.indexOf('锤子！'));
  });

  it('所有额外牌预览与实际结算一致，预览不摸口袋牌、不改成长或随机数', () => {
    for (const tool of ['bag', 'lens', 'hammer', 'mirror', 'stone'] as const) {
      const state = fixture([1, tool]);
      playCard(state, 0);
      const before = cloneGame(state);
      const expected = previewCard(state, state.hand[0]!);
      expect(state).toEqual(before);
      expect(playCard(state, 0)).toEqual(expected);
    }
  });

  it('两堆均空时口袋少摸，桌面牌不回收', () => {
    const state = fixture(['bag']);
    state.hand.push(...state.deck.splice(0));
    const beforeCount = state.hand.length;
    playCard(state, 0);
    expect(state.hand).toHaveLength(beforeCount - 1);
    expect(state.row).toHaveLength(1);
    expect(state.deck).toHaveLength(0);
  });

  it('口袋可越过手牌上限，下一回合保留超出的手牌且不再补牌', () => {
    const state = fixture(['bag']);
    while (state.hand.length < 8) state.hand.push(state.deck.pop()!);
    playCard(state, 0);
    expect(state.hand).toHaveLength(9);
    const hand = [...state.hand];
    const deck = [...state.deck];
    endTurn(state, seededRng(1));
    expect(state.hand).toEqual(hand);
    expect(state.deck).toEqual(deck);
  });

  it('练习支持手牌7及每种额外牌1张，空过回合不增加回合数', () => {
    const state = createGame(seededRng(123), { hand: 7, tools: true });
    const all = [...state.deck, ...state.hand];
    expect(all).toHaveLength(35);
    expect(all.filter((c) => c.type)).toHaveLength(5);
    expect(new Set(all.filter((c) => c.type).map((c) => c.type)).size).toBe(5);
    expect(state.hand).toHaveLength(7);
    endTurn(state, seededRng(1));
    expect(state.turn).toBe(1);
  });

  it('§3.5算式完整展示工具、变色和加成，并固定出牌时的底数', () => {
    const bag = sequence([6, 3, 'bag']).cards[2]!;
    expect(formatFormula(bag)).toBe('口袋：绿 100 × 倍率 3 × 顺色 2 = 600　摸 2 张');
    const lens = sequence([1, 'lens']).cards[1]!;
    expect(formatFormula(lens)).toBe('放大镜：蓝 100 × 倍率 2 = 200　倍率再 ×2 → 6');
    const hammer = sequence([1, 3, 'hammer']).cards[2]!;
    expect(formatFormula(hammer)).toBe('锤子：红 100 × 倍率 4 × 顺色 2 = 800　锤子！这回合 ×2　+1,700');
    const mirror = sequence([1, 'mirror']).cards[1]!;
    expect(formatFormula(mirror)).toBe('镜子（变成青宝石）：绿 100 + 蓝 100 = 200 × 倍率 2 × 凑白 5 = 2,000');
    expect(formatFormula(sequence(['mirror']).cards[0]!)).toBe('镜子：0 × 倍率 1 = 0');
    expect(formatFormula(sequence([1, 'stone']).cards[1]!)).toBe('磨石：0 × 倍率 2 × 顺色 2 = 0　三颗宝石各 +5 次');
  });
});


describe('额外牌 · 提示、设置重开与随机流', () => {
  it('提示沿用反应名并接上工具效果，镜子只显示凑白', () => {
    const examples: [(number | ToolType)[], string][] = [
      [[6, 'bag'], '顺色 · 摸 2'],
      [[3, 'lens'], '凑白 · 倍率 ×2'],
      [[3, 'hammer'], '顺色 · 这回合 ×2'],
      [[1, 'mirror'], '凑白'],
      [[1, 'stone'], '顺色 · 宝石 +5'],
    ];
    for (const [values, expected] of examples) {
      expect(formatCardHint(sequence(values).cards.at(-1)!)).toBe(expected);
    }
  });

  it('练习切换额外牌后重开，清除旧伤害、成长、桌面和撤回', () => {
    const state = fixture([1]);
    playCard(state, 0);
    updateSettings(state, { tools: true });
    expect(inventory(state)).toHaveLength(35);
    expect(state.turn).toBe(1);
    expect(state.total).toBe(0);
    expect(state.turnDmg).toBe(0);
    expect(state.xp).toEqual([0, 0, 0]);
    expect(state.row).toEqual([]);
    expect(state.hist).toEqual([]);
    expect(state.hand).toHaveLength(7);
    updateSettings(state, { tools: false });
    expect(inventory(state)).toHaveLength(30);
    expect([...state.deck, ...state.hand].every((card) => !card.type)).toBe(true);
  });

  it('种子随机整数状态可取出和恢复，之后100次抽样逐个一致', () => {
    const rng = seededRng(123456);
    for (let i = 0; i < 17; i += 1) rng();
    const saved = rng.getState();
    expect(Number.isInteger(saved)).toBe(true);
    expect(saved).toBeGreaterThanOrEqual(0);
    expect(saved).toBeLessThan(2 ** 32);
    const restored = seededRng(0);
    restored.setState(JSON.parse(JSON.stringify(saved)));
    for (let i = 0; i < 100; i += 1) expect(restored()).toBe(rng());
  });
});
