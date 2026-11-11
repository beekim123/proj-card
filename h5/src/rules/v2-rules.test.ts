import { describe, it, expect } from 'vitest';
import {
  createRun, chooseRelic, debugGiveRelic, createToolCard, playRunCard, previewRunCard,
  endRunTurn, undoRun, currentRule, cardWarnings, bestHintCard, rainbowStatus,
  chooseDoor, shopSkip, encodeRunSave, decodeRunSave, skipLoot, gemForm, formatFormula, createGame,
  type RunState, type MonsterKey, type RelicId, type ToolType,
} from './index';

// Real card identities are moved between piles; tool fixtures also update canonical cards.
function hand(run: RunState, sequence: (number | ToolType)[]) {
  const pool = [...run.game.hand, ...run.game.deck];
  run.game.hand = sequence.map(value => {
    let index = pool.findIndex(c => typeof value === 'number' ? !c.type && c.v === value : c.type === value);
    if (index < 0 && typeof value === 'string') {
      const card = createToolCard(value, Math.max(...run.cards.map(c => c.id)) + 1);
      run.cards.push(card); pool.push({ ...card }); index = pool.length - 1;
    }
    if (index < 0) throw new Error(`Missing fixture card ${value}`);
    return pool.splice(index, 1)[0]!;
  });
  run.game.deck = pool;
}
function fixture(key: MonsterKey, sequence: (number | ToolType)[] = [], relic?: RelicId) {
  const run = createRun(1979);
  if (relic) { run.relicOptions = [relic, ...run.relicOptions.filter(r => r !== relic)].slice(0, 3); chooseRelic(run, 0); }
  else run.phase = 'battle'; // no-relic rule scenarios only; never serialized
  run.monsters[0] = key;
  Object.assign(run.monster, { key, rule: ({ chest: 'bite', bear: 'hug', soldier: 'wind', clock: 'bell', dragon: 'layers' } as const)[key],
    hp: 1_500_000, maxHp: 1_500_000, turnStartHp: 1_500_000, broken: false,
    countdown: key === 'soldier' ? 2 : 3, maxCountdown: key === 'soldier' ? 2 : 3,
    wind: key === 'soldier' ? 4 : 0, maxWind: key === 'soldier' ? 4 : 0, woundDown: false, layer: 1 });
  hand(run, sequence); return run;
}
function play(run: RunState) {
  const before = JSON.stringify(run);
  const preview = previewRunCard(run, run.game.hand[0]!);
  expect(JSON.stringify(run)).toBe(before);
  const actual = playRunCard(run, 0);
  expect(actual).toEqual(preview);
  return actual;
}
const texts = (entry: ReturnType<typeof play>) => entry.effects.map(e => e.text);
const damages = (run: RunState, n: number) => Array.from({ length: n }, () => play(run).dmg);
function reload(run: RunState) {
  const raw = encodeRunSave(run)!;
  expect(JSON.parse(raw).version).toBe(4);
  const result = decodeRunSave(raw);
  expect(result.reason).toBe('ok'); expect(result.state).toEqual(run);
  return result.state!;
}

describe('v2 01 §9 exact rule scenarios (preview equals play and is immutable)', () => {
  it('11,26 bite sequence and full undo restore countdown', () => {
    const r = fixture('chest', [2, 3, 1]);
    const initial = JSON.stringify(r);
    expect([play(r).dmg, r.monster.countdown, play(r).dmg, r.monster.countdown, play(r).dmg, r.monster.countdown]).toEqual([100, 2, 800, 1, 800, 1]);
    for (let i = 0; i < 3; i++) expect(undoRun(r)).toBe(true);
    expect(JSON.stringify(r)).toBe(initial);
    damages(r, 3); endRunTurn(r); expect([r.hearts, r.monster.countdown]).toEqual([2, 3]);
  });
  it('12 countdown clamps at zero and attacks only once', () => {
    const r = fixture('chest', [2, 2, 2, 2]);
    expect(Array.from({ length: 4 }, () => { play(r); return r.monster.countdown; })).toEqual([2, 1, 0, 0]);
    endRunTurn(r); expect([r.hearts, r.monster.countdown]).toEqual([2, 3]);
  });
  it('13 killing green does not bite; broken rules stay disabled', () => {
    const r = fixture('chest', [2, 2]); r.monster.hp = 100;
    const entry = play(r); expect(entry.damage).toBe(100); expect(texts(entry)).toEqual([]);
    expect(r.monster.countdown).toBe(3); expect(currentRule(r)).toBe(undefined);
    expect(texts(play(r))).toEqual([]); endRunTurn(r); expect(r.hearts).toBe(3);
  });
  it('14 hug preserves reaction, multiplier, growth and formula', () => {
    const r = fixture('bear', [1, 3, 7]);
    const first = play(r); expect(first.dmg).toBe(0); expect(first.gemValues[0]).toBe(0);
    expect(formatFormula(first).includes('红 0（抱红）')).toBe(true);
    expect(texts(first)).toContain('抱红'); expect(damages(r, 2)).toEqual([400, 1600]);
    expect([r.game.turnDmg, r.game.m, r.game.xp[0]]).toEqual([2000, 8, 3]);
  });
  it('15 hugged red still upgrades at 15 uses', () => {
    const r = fixture('bear', [1]); r.game.xp[0] = 14;
    const e = play(r); expect([e.damage, gemForm(r.game, 0)]).toEqual([0, 1]); expect(e.grown).toEqual([0]);
  });
  it('16 red recovers its full value after the monster breaks', () => {
    const r = fixture('bear', [2, 1]); r.monster.hp = 100;
    expect(damages(r, 2)).toEqual([100, 200]); expect(texts(r.game.row[1]!)).toEqual([]);
  });
  it('17,18,20,27 unwind, ignored later blue, undo and next-turn refill', () => {
    const r = fixture('soldier', [4, 6, 7, 5, 4]);
    expect(damages(r, 3)).toEqual([100, 800, 2400]); expect(r.monster.wind).toBe(1);
    const fourth = play(r); expect(fourth.dmg).toBe(3200); expect(texts(fourth)).toContain('发条松完');
    expect([r.monster.wind, r.monster.countdown, r.monster.woundDown]).toEqual([0, 2, true]);
    expect(undoRun(r)).toBe(true); expect([r.monster.wind, r.monster.countdown, r.monster.woundDown]).toEqual([1, 2, false]);
    play(r); expect(texts(play(r)).includes('松发条')).toBe(false);
    endRunTurn(r); expect([r.hearts, r.monster.countdown, r.monster.wind, r.monster.woundDown]).toEqual([3, 1, 4, false]);
  });
  it('19 normal soldier attacks do not refill partial winding', () => {
    const r = fixture('soldier'); endRunTurn(r); endRunTurn(r);
    expect([r.hearts, r.monster.countdown, r.monster.wind]).toEqual([2, 2, 4]);
    hand(r, [4]); play(r); endRunTurn(r); endRunTurn(r); expect(r.monster.wind).toBe(3);
  });
  it('21 clock only advances on white reactions', () => {
    const r = fixture('clock', [1, 6, 1]); expect(damages(r, 3)).toEqual([100, 2000, 2000]);
    expect(r.monster.countdown).toBe(1); endRunTurn(r); expect(r.hearts).toBe(2);
  });
  it('22 mirror effective gems trigger clock, bite and winding', () => {
    for (const key of ['clock', 'chest', 'soldier'] as const) {
      const r = fixture(key, [1, 'mirror']); play(r); const e = play(r);
      expect([e.v, e.k, e.dmg]).toEqual([6, 'white', 2000]);
      if (key === 'soldier') expect(r.monster.wind).toBe(3);
      else expect(r.monster.countdown).toBe(2);
    }
  });
  it('white card contains all gems, mirror after white resolves blank', () => {
    for (const key of ['chest', 'soldier', 'bear'] as const) {
      const r = fixture(key, [7, 'mirror']); const white = play(r); const mirror = play(r);
      expect([mirror.v, mirror.k, mirror.dmg]).toEqual([0, 'white', 0]);
      expect(white.damage).toBe(key === 'bear' ? 200 : 300);
      if (key === 'chest') expect(r.monster.countdown).toBe(2);
      if (key === 'soldier') expect(r.monster.wind).toBe(3);
    }
  });
  it('23,24 dragon boundary uses old rule for crossing card', () => {
    const r = fixture('dragon', [2, 2]); r.monster.hp = 1_000_100;
    const e = play(r); expect(e.dmg).toBe(100); expect(texts(e)).toContain('换规矩');
    expect([r.monster.hp, r.monster.layer, r.monster.countdown, currentRule(r)]).toEqual([1_000_000, 2, 3, 'bite']);
    expect(play(r).dmg).toBe(400); expect(r.monster.countdown).toBe(2);
    const red = fixture('dragon', [1]); red.monster.hp = 1_000_100;
    expect(play(red).dmg).toBe(0); expect([red.monster.hp, red.monster.layer]).toEqual([1_000_100, 1]);
  });
  it('25 one card crosses two layers, emits once, undo restores everything', () => {
    const r = fixture('dragon', [2]); r.monster.hp = 1_000_100; r.game.m = 6001;
    const before = JSON.stringify(r); const e = play(r);
    expect(e.damage).toBe(600100); expect([r.monster.hp, r.monster.layer, currentRule(r)]).toEqual([400000, 3, 'bell']);
    expect(texts(e).filter(t => t === '换规矩').length).toBe(1);
    undoRun(r); expect(JSON.stringify(r)).toBe(before);
  });
  it('31 same relic doubles multiplier, damage unchanged', () => {
    const r = fixture('clock', [1, 1], 'same'); expect(damages(r, 2)).toEqual([100, 400]);
    expect([r.game.m, r.game.turnDmg]).toEqual([4, 500]); expect(texts(r.game.row[1]!)).toContain('同色也翻倍');
  });
  it('32,33 once excludes first card, consumes once, restores on undo and resets', () => {
    const r = fixture('clock', [1, 4, 2], 'once');
    expect(play(r).k).toBe('plain'); expect(r.game.onceUsed).toBe(false);
    const before = JSON.stringify(r); const e = play(r); expect([e.dmg, e.k, r.game.m]).toEqual([400, 'shun', 4]);
    expect(formatFormula(e).includes('顺色 2（断一次不算）')).toBe(true);
    undoRun(r); expect(JSON.stringify(r)).toBe(before); play(r);
    expect(play(r).dmg).toBe(400); expect([r.game.m, r.game.turnDmg]).toEqual([5, 900]);
    endRunTurn(r); expect(r.game.onceUsed).toBe(false); hand(r, [4, 1]);
    expect(play(r).k).toBe('plain'); expect(r.game.onceUsed).toBe(false); expect(play(r).k).toBe('shun');
  });
  it('34 white relic changes reaction damage to eight', () => {
    const r = fixture('clock', [1, 6], 'white'); expect(damages(r, 2)).toEqual([100, 3200]);
    expect([r.game.m, r.game.turnDmg]).toEqual([4, 3300]); expect(texts(r.game.row[1]!)).toContain('凑白 ×8');
  });
  it('35,36 five-color rainbow exactly once with undo restoration', () => {
    const r = fixture('clock', [1, 3, 2, 6, 4, 5], 'rainbow');
    expect(damages(r, 5)).toEqual([100, 800, 800, 3200, 3200]);
    expect([r.game.row[4]!.rainbow, r.game.turnDmg, r.game.m]).toEqual([72900, 81000, 32]);
    expect(texts(r.game.row[4]!)).toContain('五色彩虹');
    undoRun(r); expect(r.game.rainbow).toBe(false); play(r);
    const last = play(r); expect([last.dmg, last.rainbow, r.game.turnDmg]).toEqual([12800, 0, 93800]);
  });
  it('38 grow upgrades before next card, including threshold 24', () => {
    const r = fixture('clock', [1, 1], 'grow'); r.game.xp[0] = 7;
    const e = play(r); expect(e.grown).toEqual([0]); expect(texts(e)).toContain('宝石长得快');
    expect([e.dmg, play(r).dmg, r.game.turnDmg]).toEqual([100, 600, 700]);
    const high = fixture('clock', [1], 'grow'); high.game.xp[0] = 23; expect(play(high).grown).toEqual([0]); expect(gemForm(high.game, 0)).toBe(2);
  });
  it('41,42,43 fixed selection, mandatory choice and deterministic run', () => {
    const a = createRun(71), b = createRun(71);
    expect(a.phase).toBe('relic'); expect(new Set(a.relicOptions).size).toBe(3); expect(reload(a)).toEqual(b);
    expect(() => playRunCard(a, 0)).toThrow(); expect(undoRun(a)).toBe(false);
    chooseRelic(a, 0); chooseRelic(b, 0); expect(a).toEqual(b);
    expect([a.phase, a.game.hand.length, a.hearts]).toEqual(['battle', 7, a.relic === 'heart' ? 4 : 3]);
    expect(() => chooseRelic(a, 0)).toThrow(); expect(undoRun(a)).toBe(false);
    for (let i = 0; i < 5; i++) {
      for (const r of [a, b]) { r.monster.hp = 0; r.monster.broken = true; endRunTurn(r); proceed(r); }
      expect(a).toEqual(b);
    }
  });
  it('37,44,45 elite heals to cap, skip never heals, next hand has eight', () => {
    for (const relic of ['same', 'heart'] as const) {
      const r = fixture('clock', [], relic); expect([r.hearts, r.maxHearts]).toEqual(relic === 'heart' ? [4, 4] : [3, 3]);
      r.hearts = 2; r.monster.hp = 0; r.monster.broken = true; endRunTurn(r); proceed(r); expect(r.hearts).toBe(2);
      r.monster.hp = 0; r.monster.broken = true; endRunTurn(r); proceed(r); expect(r.fight).toBe(3);
      r.hearts = 1; r.monster.hp = 0; r.monster.broken = true; endRunTurn(r); expect(r.hearts).toBe(r.maxHearts);
      proceed(r); expect([r.fight, r.game.hand.length, r.handLimit]).toEqual([4, 8, 8]);
    }
  });
  it('46 soldier has fixed starting countdown and wind', () => {
    const r = Array.from({ length: 100 }, (_, seed) => createRun(seed)).find(r => r.monster.key === 'soldier')!;
    expect([r.monster.countdown, r.monster.maxCountdown, r.monster.wind, r.monster.maxWind]).toEqual([2, 2, 4, 4]);
  });
  it('47 older envelopes request deletion and outdated notice', () => {
    for (const version of [0, 1, 2]) expect(decodeRunSave(JSON.stringify({ version, state: createRun(1) }))).toEqual({ state: null, clear: true, reason: 'outdated' });
  });
  it('48 save/reload before each of twenty actions matches uninterrupted state, including undo/draw/RNG', () => {
    for (const key of ['soldier', 'dragon', 'chest'] as const) {
      const a = fixture(key, [4, 6, 'bag', 'mirror', 1, 3, 2], 'once');
      debugGiveRelic(a, 'rainbow'); if (key === 'dragon') a.monster.hp = 1_000_100;
      let b = reload(a);
      for (let i = 0; i < 20; i++) {
        b = reload(b);
        const action = (r: RunState) => {
          if (i % 5 === 2) undoRun(r);
          else if (i % 5 === 4) { endRunTurn(r); }
          else play(r);
        };
        action(a); action(b); expect(b).toEqual(a);
      }
    }
  });
  it('48 saves preserve exhausted wind and crossed layers with paired undo snapshots', () => {
    const wind = fixture('soldier', [4, 6, 7, 5], 'same'); damages(wind, 4);
    let restored = reload(wind); expect(restored.monster.woundDown).toBe(true);
    undoRun(wind); undoRun(restored); expect(restored).toEqual(wind); expect(restored.monster.wind).toBe(1);
    const dragon = fixture('dragon', [2], 'same'); dragon.monster.hp = 1_000_100; dragon.game.m = 6001;
    play(dragon); restored = reload(dragon); expect(restored.monster.layer).toBe(3);
    undoRun(dragon); undoRun(restored); expect(restored).toEqual(dragon); expect(restored.monster.layer).toBe(1);
  });
  it('51–54 attack warning distinguishes newly caused attacks and killing blows', () => {
    for (const [countdown, hp, attack] of [[2, 1500000, true], [3, 1500000, false], [1, 1500000, false], [2, 100, false]] as const) {
      const r = fixture('chest', [2]); r.monster.countdown = countdown; r.monster.hp = hp;
      const before = JSON.stringify(r); expect(cardWarnings(r, r.game.hand[0]!).attack).toBe(attack); expect(JSON.stringify(r)).toBe(before);
    }
  });
  it('55 unwind warning uses current resolved blue and ignores wound-down turns', () => {
    const r = fixture('soldier', [1, 'mirror']); expect(cardWarnings(r, r.game.hand[0]!).unwind).toBe(false);
    play(r); expect(cardWarnings(r, r.game.hand[0]!).unwind).toBe(true);
    r.monster.wind = 0; r.monster.woundDown = true; expect(cardWarnings(r, r.game.hand[0]!).unwind).toBe(false);
  });
  it('56,57 ready colors and lit order exclude white and mirror', () => {
    const r = fixture('clock', [1, 3, 2, 6, 4, 5, 7]);
    expect(rainbowStatus(r)).toEqual({ need: 6, lit: [], ready: true, readyIds: r.game.hand.slice(0, 6).map(c => c.id) });
    damages(r, 3); expect(rainbowStatus(r).lit).toEqual([1, 3, 2]); expect(rainbowStatus(r).ready).toBe(true);
    const mirror = fixture('clock', [1, 3, 2, 6, 4, 'mirror']); expect(rainbowStatus(mirror).ready).toBe(false);
  });
  it('58,59 five-color readiness and no second rainbow', () => {
    const r = fixture('clock', [3, 2, 6, 4, 5], 'rainbow'); expect(rainbowStatus(r).need).toBe(5); expect(rainbowStatus(r).ready).toBe(true);
    damages(r, 5); expect(rainbowStatus(r).ready).toBe(false);
  });
  it('60,61 hints skip ordinary cards and prioritize white over shun', () => {
    const r = fixture('clock', [1, 4, 2]); expect(bestHintCard(r)).toBe(undefined); play(r); expect(bestHintCard(r)).toBe(undefined);
    const next = fixture('clock', [1, 6, 3]); play(next); expect(bestHintCard(next)).toBe(next.game.hand[0]!.id);
    expect(bestHintCard(createGame(1))).toBe(undefined);
  });
  it('62 corrected: exclude dangerous cyan and recommend safe magenta', () => {
    const r = fixture('chest', [1, 6, 5]); play(r); r.monster.countdown = 2;
    expect(r.game.hand.map(c => cardWarnings(r, c).attack)).toEqual([true, false]);
    expect(bestHintCard(r)).toBe(r.game.hand[1]!.id);
  });
  it('63 corrected: all reacting cards attack, ordinary alternatives are not hints', () => {
    const r = fixture('chest', [1, 6, 3, 4]); play(r); r.monster.countdown = 2;
    expect(r.game.hand.map(c => cardWarnings(r, c).attack)).toEqual([true, true, false]);
    expect(bestHintCard(r)).toBe(undefined);
  });
});

function proceed(run: RunState): void {
  if (run.phase === 'loot') skipLoot(run);
  else if (run.phase === 'shop') shopSkip(run);
  else if (run.phase === 'relic') chooseRelic(run, Math.max(0, run.relicOptions.findIndex(id => id !== 'first2')));
  if (run.phase === 'doors') chooseDoor(run, Math.max(0, run.doors.findIndex(door => door.reward === 'card')));
}
