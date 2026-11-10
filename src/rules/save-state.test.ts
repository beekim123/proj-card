import { describe, expect, it } from 'vitest';
import {
  abandonRun, chooseLoot, createRun, chooseRelic, createToolCard, decodeRunSave, encodeRunSave,
  endRunTurn, isActiveRunState, playRunCard, undoRun,
} from './index';
import type { RunState } from './run-types';

function battle(seed: number) {
  const run = createRun(seed);
  chooseRelic(run, 0);
  return run;
}

function save(run = battle(123)): string {
  return encodeRunSave(run)!;
}
function mutate(change: (run: RunState) => void): string {
  const run = battle(123);
  change(run);
  return JSON.stringify({ version: 3, state: run });
}
function loot(): RunState {
  const run = battle(321);
  run.monster.hp = 1;
  run.monster.turnStartHp = 1;
  while (!run.monster.broken && run.game.hand.length) playRunCard(run, 0);
  endRunTurn(run);
  return run;
}

describe('存档纯数据边界', () => {
  it('完整v3活跃状态往返，包括可继续撤回与RNG状态', () => {
    const run = battle(123);
    playRunCard(run, 0);
    playRunCard(run, 0);
    const decoded = decodeRunSave(save(run));
    expect(decoded.reason).toBe('ok');
    expect(decoded.clear).toBe(false);
    expect(decoded.state).toEqual(run);
    expect(undoRun(decoded.state!)).toBe(true);
    expect(undoRun(run)).toBe(true);
    expect(decoded.state).toEqual(run);
    playRunCard(run, 0);
    playRunCard(decoded.state!, 0);
    expect(decoded.state).toEqual(run);
  });
  it('读取产生独立对象，不与原状态共享数组', () => {
    const run = battle(1);
    const restored = decodeRunSave(save(run)).state!;
    restored.game.hand.pop();
    expect(run.game.hand).toHaveLength(7);
  });
  it('战利品和选牌后的随机流不因读档改变', () => {
    const run = loot();
    const restored = decodeRunSave(save(run)).state!;
    expect(restored.loot).toEqual(run.loot);
    chooseLoot(run, 0);
    chooseLoot(restored, 0);
    expect(restored).toEqual(run);
    expect(isActiveRunState(run)).toBe(true);
  });
  it('桌面镜子可保留有效宝石位，牌组镜子仍为空白', () => {
    const run = battle(2);
    const mirror = createToolCard('mirror', 31);
    run.cards.push({ ...mirror });
    run.game.hand.push({ ...mirror });
    const previousMask = run.game.hand[0]!.v;
    playRunCard(run, 0);
    playRunCard(run, run.game.hand.findIndex((card) => card.type === 'mirror'));
    expect(run.game.row.at(-1)?.v).toBe(7 - previousMask);
    expect(decodeRunSave(save(run)).state).toEqual(run);
  });
  it('空存档不要求清除', () => {
    expect(decodeRunSave(null)).toEqual({ state: null, clear: false, reason: 'empty' });
  });
  it.each(['', 'broken JSON', 'null', '[]', '{"version":3,"state":{}}'])('损坏或版本不符返回清除指令：%s', (raw) => {
    expect(decodeRunSave(raw)).toEqual({ state: null, clear: true, reason: 'invalid' });
  });
  it('重复或丢失卡牌身份拒绝，不能载入破坏守恒的状态', () => {
    const duplicate = mutate((run) => { run.game.hand[0] = { ...run.game.hand[1]! }; });
    const missing = mutate((run) => { run.game.deck.pop(); });
    expect(decodeRunSave(duplicate).clear).toBe(true);
    expect(decodeRunSave(missing).clear).toBe(true);
  });
  it('随机数必须为32位可保存整数', () => {
    expect(decodeRunSave(mutate((run) => { run.game.rngState = -1; })).clear).toBe(true);
    expect(decodeRunSave(mutate((run) => { run.game.rngState = 2 ** 32; })).clear).toBe(true);
  });
  it('损坏或不成对的撤回记录拒绝', () => {
    const run = battle(4);
    playRunCard(run, 0);
    run.hist.pop();
    expect(decodeRunSave(JSON.stringify({ version: 3, state: run })).clear).toBe(true);
  });
  it('非有限数值不可保存，不让JSON把它静默变为null', () => {
    const run = battle(7);
    run.game.total = Infinity;
    expect(() => encodeRunSave(run)).toThrow();
  });
  it('终局不保存，意外残留的终局档要求清除', () => {
    const run = battle(10);
    abandonRun(run);
    expect(encodeRunSave(run)).toBeNull();
    expect(decodeRunSave(JSON.stringify({ version: 3, state: run })).clear).toBe(true);
  });
});


describe('v3 fields', () => {
  it('round-trips relic choices before the first battle', () => {
    const run = createRun(42);
    expect(run.phase).toBe('relic');
    const restored = decodeRunSave(save(run)).state!;
    expect(restored).toEqual(run);
    chooseRelic(run, 1); chooseRelic(restored, 1);
    expect(restored).toEqual(run);
  });
  it.each([0, 1, 2])('distinguishes outdated version %i from corruption', (version) => {
    expect(decodeRunSave(JSON.stringify({ version, state: {} }))).toEqual({ state: null, clear: true, reason: 'outdated' });
  });
  it('requires once-used and effect records, including undo snapshots', () => {
    const run = battle(42);
    playRunCard(run, 0);
    for (const change of [
      (state: Record<string, any>) => { delete state.game.onceUsed; },
      (state: Record<string, any>) => { delete state.game.hist[0].onceUsed; },
      (state: Record<string, any>) => { delete state.game.row[0].effects; },
      (state: Record<string, any>) => { state.game.row[0].effects = [{ id: 1, text: 'bad' }]; },
      (state: Record<string, any>) => { state.game.hist[0].relic = 'invalid'; },
    ]) {
      const altered = JSON.parse(JSON.stringify(run)); change(altered);
      expect(decodeRunSave(JSON.stringify({ version: 3, state: altered })).reason).toBe('invalid');
    }
  });
  it('validates relic ownership and heart capacity', () => {
    expect(decodeRunSave(mutate(run => { run.maxHearts = 5; })).reason).toBe('invalid');
    expect(decodeRunSave(mutate(run => { run.game.relic = undefined; })).reason).toBe('invalid');
    const run = createRun(42); run.relicOptions[1] = run.relicOptions[0]!;
    expect(decodeRunSave(JSON.stringify({ version: 3, state: run })).reason).toBe('invalid');
  });
});
