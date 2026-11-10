import { CONFIG, TOOLS, TOOL_TYPES } from './config';
import { RUN, MONSTERS } from './run-config';
import type { RunState } from './run-types';
import type { ToolType } from './types';

type ObjectValue = Record<string, unknown>;
export type RunLoadResult = {
  state: RunState | null;
  clear: boolean;
  reason: 'empty' | 'invalid' | 'ok';
};

function object(value: unknown): value is ObjectValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function number(value: unknown, min = 0): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min;
}
function integer(value: unknown, min = 0): value is number {
  return number(value, min) && Number.isSafeInteger(value);
}
function tool(value: unknown): value is ToolType {
  return typeof value === 'string' && (TOOL_TYPES as readonly string[]).includes(value);
}
function numbers(value: unknown, length?: number): value is number[] {
  return Array.isArray(value) && (length === undefined || value.length === length)
    && value.every((item: unknown) => number(item));
}
function card(value: unknown, row = false): value is ObjectValue {
  if (!object(value) || !integer(value.id, 1) || !integer(value.v) || value.v > 7) return false;
  if (value.type === undefined) return true;
  return tool(value.type) && (row && value.type === 'mirror' || value.v === TOOLS[value.type].v);
}
function rowEntry(value: unknown): value is ObjectValue {
  if (!card(value, true)) return false;
  const positive = ['cm', 'm', 'm2'];
  const nonnegative = ['b', 'dmg', 'rainbow', 'hammer', 'damage'];
  return positive.every((key) => number(value[key], 1))
    && nonnegative.every((key) => number(value[key]))
    && ['plain', 'same', 'shun', 'white'].includes(String(value.k))
    && numbers(value.gemValues, 3)
    && Array.isArray(value.grown) && value.grown.every((index: unknown) => integer(index) && index < 3)
    && typeof value.rb === 'boolean';
}

/** Verify both card conservation and identity; resolved mirrors are only allowed on the row. */
function game(value: unknown, cards: ObjectValue[], history: boolean): value is ObjectValue {
  if (!object(value)) return false;
  const piles = ['deck', 'discard', 'hand'];
  for (const key of piles) {
    if (!Array.isArray(value[key]) || !value[key].every((item: unknown) => card(item))) return false;
  }
  if (!Array.isArray(value.row) || !value.row.every(rowEntry)) return false;
  const all = piles.flatMap((key) => value[key] as ObjectValue[]).concat(value.row as ObjectValue[]);
  if (all.length !== cards.length || new Set(all.map((item) => item.id)).size !== cards.length) return false;
  const canonical = new Map(cards.map((item) => [item.id, item]));
  for (const item of all) {
    const original = canonical.get(item.id);
    if (!original || original.type !== item.type || (item.type !== 'mirror' && original.v !== item.v)) return false;
  }
  if (!integer(value.rngState) || value.rngState > 0xffffffff || !number(value.m, 1)
    || !integer(value.turn, 1) || !typeofBoolean(value.rainbow)) return false;
  for (const key of ['turnDmg', 'total', 'best', 'last']) if (!number(value[key])) return false;
  if (!numbers(value.xp, 3) || !value.xp.every((item) => integer(item))) return false;
  if (!Array.isArray(value.chain) || !value.chain.every((item: unknown) => integer(item) && CONFIG.rainbowColors.includes(item))) return false;
  if (!Array.isArray(value.chainIdx) || !value.chainIdx.every((item: unknown) => integer(item) && item < (value.row as unknown[]).length)) return false;
  if (!object(value.opts) || !typeofBoolean(value.opts.hint) || !typeofBoolean(value.opts.grow)
    || !CONFIG.handLimits.includes(value.opts.hand as 6 | 7 | 8)
    || (value.opts.tools !== undefined && !typeofBoolean(value.opts.tools))) return false;
  if (history && (!Array.isArray(value.hist) || !value.hist.every((item: unknown) => game(item, cards, false)))) return false;
  return true;
}
function typeofBoolean(value: unknown): value is boolean { return typeof value === 'boolean'; }

function monster(value: unknown): value is ObjectValue {
  return object(value) && Object.hasOwn(MONSTERS, String(value.key))
    && number(value.hp) && number(value.maxHp, 1) && value.hp <= value.maxHp
    && integer(value.countdown, 1) && integer(value.maxCountdown, 1) && value.countdown <= value.maxCountdown + RUN.guardDelay
    && typeofBoolean(value.broken) && value.broken === (value.hp === 0)
    && number(value.turnStartHp, 1) && number(value.overkill)
    && integer(value.weak) && value.weak <= 2 && integer(value.maxToughness) && integer(value.toughness)
    && value.toughness <= value.maxToughness && typeofBoolean(value.guardDown)
    && (value.guardDown ? value.toughness === 0 : value.toughness > 0 || value.maxToughness === 0);
}
function stats(value: unknown): value is ObjectValue {
  return object(value) && integer(value.turns) && number(value.bestTurn)
    && integer(value.bestFight, 1) && value.bestFight <= RUN.fights.length && number(value.maxOverkill)
    && number(value.totalDamage) && Array.isArray(value.fights)
    && value.fights.every((entry: unknown) => object(entry)
      && integer(entry.fight, 1) && entry.fight <= RUN.fights.length
      && Object.hasOwn(MONSTERS, String(entry.monster)) && typeofBoolean(entry.won)
      && integer(entry.turns, 1) && number(entry.damage) && number(entry.overkill));
}

/** Strict structural validation of active states; no browser, clock, or storage dependency. */
export function isActiveRunState(value: unknown): value is RunState {
  if (!object(value) || (value.phase !== 'battle' && value.phase !== 'loot')
    || !Array.isArray(value.cards) || !value.cards.every((item: unknown) => card(item))) return false;
  const cards = value.cards as ObjectValue[];
  if (cards.length < CONFIG.deck.reduce((sum, entry) => sum + entry.count, 0) || new Set(cards.map((item) => item.id)).size !== cards.length) return false;
  if (!integer(value.hearts, 1) || value.hearts > RUN.hearts || (value.handLimit !== RUN.handStart && value.handLimit !== RUN.handMax)
    || !integer(value.fight, 1) || value.fight > RUN.fights.length || !monster(value.monster)
    || !game(value.game, cards, true) || !stats(value.stats) || value.result !== null) return false;
  if (!Array.isArray(value.monsters) || value.monsters.length !== RUN.fights.length
    || !value.monsters.every((item: unknown) => typeof item === 'string' && Object.hasOwn(MONSTERS, item))) return false;
  if (!Array.isArray(value.loot) || !value.loot.every(tool)
    || new Set(value.loot).size !== value.loot.length) return false;
  if (value.phase === 'loot' && (!value.monster.broken || value.fight === RUN.fights.length || (value.loot.length !== RUN.lootCount && value.loot.length !== RUN.lootBonusCount))) return false;
  if (value.phase === 'battle' && value.loot.length !== 0) return false;
  if (value.monster.key !== value.monsters[value.fight - 1]) return false;
  if (!Array.isArray(value.hist) || !Array.isArray(value.game.hist) || value.hist.length !== value.game.hist.length) return false;
  if (value.phase === 'loot' && value.hist.length !== 0) return false;
  return value.hist.every((entry: unknown) => object(entry) && monster(entry.monster) && stats(entry.stats));
}

/** Saves from before toughness existed: give their monsters full toughness (in place). */
function upgradeMonsters(state: ObjectValue): void {
  const upgrade = (m: unknown) => {
    if (!object(m) || m.weak !== undefined || !Object.hasOwn(MONSTERS, String(m.key))) return;
    const fight = integer(state.fight, 1) ? RUN.fights[(state.fight as number) - 1] : undefined;
    const max = fight?.toughness ?? 0;
    Object.assign(m, { weak: MONSTERS[m.key as keyof typeof MONSTERS].weak, toughness: max, maxToughness: max, guardDown: false });
  };
  upgrade(state.monster);
  if (Array.isArray(state.hist)) state.hist.forEach((entry: unknown) => object(entry) && upgrade(entry.monster));
}

export function encodeRunSave(state: RunState): string | null {
  if (state.phase !== 'battle' && state.phase !== 'loot') return null;
  if (!isActiveRunState(state)) throw new TypeError('不能保存不完整的一局');
  return JSON.stringify({ version: 2, state });
}

/** Invalid saves return a clear instruction; the later UI storage adapter performs deletion. */
export function decodeRunSave(raw: string | null): RunLoadResult {
  if (raw === null) return { state: null, clear: false, reason: 'empty' };
  try {
    const envelope: unknown = JSON.parse(raw);
    if (object(envelope) && object(envelope.state)) upgradeMonsters(envelope.state);
    if (object(envelope) && envelope.version === 2 && isActiveRunState(envelope.state)) {
      return { state: envelope.state, clear: false, reason: 'ok' };
    }
  } catch { /* Broken JSON is a recoverable missing save, never a startup crash. */ }
  return { state: null, clear: true, reason: 'invalid' };
}
