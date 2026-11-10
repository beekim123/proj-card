import { describe, expect, it } from 'vitest';
import {
  abandonRun, chooseLoot, cloneRun, createRecords, createRun as createUnselectedRun, chooseRelic, endRunTurn,
  playRunCard, skipLoot, undoRun, updateRecords,
} from './run';
import type { RunState } from './run-types';

/** Existing battle scenarios explicitly choose a non-numeric-changing relic. */
function createRun(seed: number): RunState {
  const run = createUnselectedRun(seed);
  run.relicOptions = ['same', 'once', 'white'];
  chooseRelic(run, 0);
  return run;
}

function breakMonster(run: RunState): void {
  run.monster.hp = 1;
  run.monster.turnStartHp = 1;
  while (!run.monster.broken && run.game.hand.length) playRunCard(run, 0);
}

function inventory(run: RunState): void {
  const live = [...run.game.hand, ...run.game.deck, ...run.game.discard, ...run.game.row];
  expect(live.map((card) => card.id).sort((a, b) => a - b))
    .toEqual(run.cards.map((card) => card.id).sort((a, b) => a - b));
  expect(new Set(live.map((card) => card.id)).size).toBe(run.cards.length);
  expect(run.hist.length).toBe(run.game.hist.length);
}

describe('冒险命令边界与跨阶段守恒', () => {
  it('非法手牌、战利品索引和跨阶段命令不会部分修改状态', () => {
    const run = createRun(61);
    let before = JSON.stringify(run);
    expect(() => playRunCard(run, -1)).toThrow();
    expect(() => chooseLoot(run, 0)).toThrow();
    expect(JSON.stringify(run)).toBe(before);
    breakMonster(run);
    endRunTurn(run);
    before = JSON.stringify(run);
    expect(() => chooseLoot(run, run.loot.length)).toThrow();
    expect(() => playRunCard(run, 0)).toThrow();
    expect(() => endRunTurn(run)).toThrow();
    expect(undoRun(run)).toBe(false);
    expect(JSON.stringify(run)).toBe(before);
  });

  it('致败回合不摸新牌、不推进随机数，也不多开一回合', () => {
    const run = createRun(62);
    run.hearts = 1;
    run.monster.countdown = 1;
    playRunCard(run, 0);
    const hand = run.game.hand.map((card) => ({ ...card }));
    const deck = run.game.deck.map((card) => ({ ...card }));
    const rng = run.game.rngState;
    endRunTurn(run);
    expect(run.phase).toBe('defeat');
    expect(run.game.turn).toBe(1);
    expect(run.game.hand).toEqual(hand);
    expect(run.game.deck).toEqual(deck);
    expect(run.game.rngState).toBe(rng);
    expect(run.game.row).toHaveLength(0);
    expect(run.result?.totalTurns).toBe(1);
    inventory(run);
  });

  it('精英奖励先加冒险手牌上限，不在战利品画面补牌', () => {
    const run = createRun(63);
    for (let fight = 1; fight <= 3; fight += 1) {
      breakMonster(run);
      const handSize = run.game.hand.length;
      endRunTurn(run);
      expect(run.game.hand).toHaveLength(handSize);
      if (fight < 3) skipLoot(run);
    }
    expect(run.handLimit).toBe(8);
    expect(run.game.opts.hand).toBe(7);
    skipLoot(run);
    expect(run.game.opts.hand).toBe(8);
    expect(run.game.hand).toHaveLength(8);
    inventory(run);
  });

  it('胜利只结算一次，重复放弃或更新纪录不重复计局', () => {
    const run = createRun(64);
    for (let fight = 1; fight <= 6; fight += 1) {
      breakMonster(run);
      endRunTurn(run);
      inventory(run);
      if (fight < 6) chooseLoot(run, 0);
    }
    const records = createRecords();
    updateRecords(records, run);
    expect(records).toMatchObject({ played: 1, wins: 1, farthest: 7 });
    expect(run.result).toMatchObject({ totalTurns: 6, recordsApplied: true });
    expect(run.result?.extraCards).toHaveLength(5);
    expect(run.stats.fights.map((fight) => fight.turns)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(run.stats.fights.reduce((sum, fight) => sum + fight.damage, 0)).toBe(run.stats.totalDamage);
    const before = JSON.stringify({ run, records });
    abandonRun(run);
    updateRecords(records, run);
    expect(() => endRunTurn(run)).toThrow();
    expect(JSON.stringify({ run, records })).toBe(before);
  });

  it('纪录相同不标新纪录，战利品阶段放弃不重复加回合', () => {
    const run = createRun(65);
    breakMonster(run);
    endRunTurn(run);
    const turns = run.stats.turns;
    abandonRun(run);
    expect(run.result?.totalTurns).toBe(turns);
    const records = {
      played: 2, wins: 0, farthest: run.fight,
      bestTurn: run.stats.bestTurn, maxOverkill: run.stats.maxOverkill,
    };
    updateRecords(records, run);
    expect(records.played).toBe(3);
    expect(run.result?.newRecords).toEqual({ farthest: false, bestTurn: false, maxOverkill: false });
    expect(run.stats.fights).toHaveLength(1);
  });

  it('深拷贝完全隔离牌、历史和结算，且等价于JSON复制', () => {
    const run = createRun(66);
    playRunCard(run, 0);
    const cloned = cloneRun(run);
    expect(cloned).toEqual(JSON.parse(JSON.stringify(run)));
    cloned.game.hist[0]!.xp[0] = 999;
    cloned.hist[0]!.monster.hp = 123;
    cloned.hist[0]!.stats.fights.push({ fight: 99, monster: 'bear', won: false, turns: 0, damage: 0, overkill: 0 });
    expect(run.game.hist[0]!.xp[0]).toBe(0);
    expect(run.hist[0]!.monster.hp).toBe(20_000);
    expect(run.hist[0]!.stats.fights).toHaveLength(0);
    abandonRun(run);
    const ended = cloneRun(run);
    ended.result!.gemForms[0] = 2;
    ended.result!.newRecords.bestTurn = true;
    expect(run.result!.gemForms[0]).toBe(0);
    expect(run.result!.newRecords.bestTurn).toBe(false);
  });

  it('多种子贯穿出牌、撤回、回合与战利品，始终保持身份守恒', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const run = createRun(seed);
      for (let action = 0; action < 200 && !run.result; action += 1) {
        if (run.phase === 'loot') {
          if (action % 3 === 0) skipLoot(run);
          else chooseLoot(run, action % run.loot.length);
        } else if (action % 9 === 0 && run.hist.length > 0) undoRun(run);
        else if (run.game.hand.length === 0 || action % 7 === 6) endRunTurn(run);
        else playRunCard(run, action % run.game.hand.length);
        inventory(run);
        expect(run.stats.totalDamage).toBe(run.game.total);
        expect(run.monster.hp).toBeGreaterThanOrEqual(0);
        expect(run.hearts).toBeGreaterThanOrEqual(0);
        expect(run.hearts).toBeLessThanOrEqual(3);
      }
    }
  });
});
