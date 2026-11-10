import { expect } from 'vitest';
import { createRun, chooseRelic, createToolCard, previewRunCard, playRunCard, endRunTurn, type RunState, type ToolType, type MonsterKey, type RelicId } from './index';
export function deal(r: RunState, values: (number | ToolType)[]) {
  const pool = [...r.game.hand, ...r.game.deck, ...r.game.discard];
  r.game.hand = values.map(v => {
    let i = pool.findIndex(c => typeof v === 'number' ? !c.type && c.v === v : c.type === v);
    if (i < 0 && typeof v === 'string') { const c = createToolCard(v, Math.max(...r.cards.map(c => c.id)) + 1); r.cards.push(c); r.nextCardId = c.id + 1; pool.push({ ...c }); i = pool.length - 1; }
    if (i < 0) throw new Error(`Missing fixture ${v}`);
    return pool.splice(i, 1)[0]!;
  });
  r.game.deck = pool; r.game.discard = [];
}
export function fixture(values: (number | ToolType)[] = [], key?: MonsterKey, relic?: RelicId) {
  const r = createRun(1979);
  if (relic) { r.relicOptions[0] = relic; chooseRelic(r, 0); }
  else { r.phase = 'battle'; r.relicOptions = []; }
  Object.assign(r.monster, { key: key ?? 'clock', rule: key ? ({ chest: 'bite', bear: 'hug', soldier: 'wind', clock: 'bell', dragon: 'layers' })[key] : undefined,
    hp: 1_000_000, maxHp: 1_000_000, turnStartHp: 1_000_000, broken: false, layer: 1,
    countdown: key === 'soldier' ? 2 : key === 'dragon' ? 4 : 3, maxCountdown: key === 'soldier' ? 2 : key === 'dragon' ? 4 : 3,
    wind: key === 'soldier' ? 4 : 0, maxWind: key === 'soldier' ? 4 : 0, woundDown: false });
  deal(r, values); return r;
}
export function play(r: RunState, index = 0) {
  const before = JSON.stringify(r), preview = previewRunCard(r, r.game.hand[index]!);
  expect(JSON.stringify(r)).toBe(before);
  const result = playRunCard(r, index); expect(result).toEqual(preview); return result;
}
export const damage = (r: RunState, n: number) => Array.from({ length: n }, () => play(r).dmg);
export const effects = (e: ReturnType<typeof play>) => e.effects.map(e => e.text);
export function start(seed = 1979, relic: RelicId = 'white') { const r = createRun(seed); r.relicOptions[0] = relic; chooseRelic(r, 0); return r; }
export function win(r: RunState) { r.monster.hp = 1; r.monster.turnStartHp = 1; const i = r.game.hand.findIndex(c => c.v && (r.monster.rule !== 'hug' && !(r.monster.rule === 'layers' && r.monster.layer === 1) || (c.v & 6))); if (i < 0) throw new Error('No damaging fixture card'); play(r, i); expect(r.monster.broken).toBe(true); endRunTurn(r); }
