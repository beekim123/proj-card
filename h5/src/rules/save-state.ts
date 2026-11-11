import { CONFIG, TOOLS, TOOL_TYPES } from './config';
import { RUN, MONSTERS, RELICS } from './run-config';
import type { RunState } from './run-types';
import type { ToolType } from './types';

type ObjectValue = Record<string, unknown>;
export type RunLoadResult = {
  state: RunState | null;
  clear: boolean;
  reason: 'empty' | 'invalid' | 'outdated' | 'ok';
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
function relic(value: unknown): boolean {
  return typeof value === 'string' && Object.hasOwn(RELICS, value);
}
function relicList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(relic) && new Set(value).size === value.length;
}
function numbers(value: unknown, length?: number): value is number[] {
  return Array.isArray(value) && (length === undefined || value.length === length)
    && value.every((item: unknown) => number(item));
}
function card(value: unknown, row = false): value is ObjectValue {
  if (!object(value) || !integer(value.id, 1) || !integer(value.v) || value.v > 7) return false;
  if (value.type === undefined) return true;
  return tool(value.type) && (row && (value.type === 'mirror' || value.type === 'shadow') || value.v === TOOLS[value.type].v);
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
    && typeof value.rb === 'boolean'
    && Array.isArray(value.effects) && value.effects.every((effect: unknown) => object(effect)
      && typeof effect.id === 'string' && typeof effect.text === 'string');
}

/** Verify both card conservation and identity; resolved mirrors and shadows are only allowed on the row. */
function game(value: unknown, cards: ObjectValue[], history: boolean): value is ObjectValue {
  if (!object(value) || !typeofBoolean(value.onceUsed)
    || (value.relic !== undefined && !relic(value.relic))
    || (value.relics !== undefined && !relicList(value.relics))) return false;
  const piles = ['deck', 'discard', 'hand'];
  for (const key of piles) {
    if (!Array.isArray(value[key]) || !value[key].every((item: unknown) => card(item))) return false;
  }
  if ((value.hand as unknown[]).length > RUN.handHardMax) return false;
  if (!Array.isArray(value.row) || !value.row.every(rowEntry)) return false;
  const all = piles.flatMap((key) => value[key] as ObjectValue[]).concat(value.row as ObjectValue[]);
  if (all.length !== cards.length || new Set(all.map((item) => item.id)).size !== cards.length) return false;
  const canonical = new Map(cards.map((item) => [item.id, item]));
  for (const item of all) {
    const original = canonical.get(item.id);
    if (!original || original.type !== item.type || (item.type !== 'mirror' && item.type !== 'shadow' && original.v !== item.v)) return false;
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
  if (!object(value) || !Object.hasOwn(MONSTERS, String(value.key))) return false;
  const definition = MONSTERS[value.key as keyof typeof MONSTERS];
  const expectedRule = value.key === 'dragon' ? 'layers' : 'rule' in definition ? definition.rule : undefined;
  return value.rule === expectedRule
    && number(value.hp) && number(value.maxHp, 1) && value.hp <= value.maxHp
    && integer(value.countdown) && integer(value.maxCountdown, 1)
    && (value.sealed === undefined || typeofBoolean(value.sealed))
    && typeofBoolean(value.broken) && value.broken === (value.hp === 0)
    && number(value.turnStartHp, 1) && number(value.overkill)
    && integer(value.layer, 1) && value.layer <= 3
    && integer(value.wind) && integer(value.maxWind) && value.wind <= value.maxWind
    && typeofBoolean(value.woundDown)
    && (value.rule === 'wind'
      ? value.maxWind === MONSTERS.soldier.wind && (value.maxCountdown === MONSTERS.soldier.countdown || value.maxCountdown === MONSTERS.soldier.countdown + RELICS.slow.countdown)
        && value.woundDown === (value.wind === 0)
      : value.wind === 0 && value.maxWind === 0 && value.woundDown === false);
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
  if (!object(value) || !['relic', 'battle', 'loot', 'doors', 'shop'].includes(String(value.phase))
    || !Array.isArray(value.cards) || !value.cards.every((item: unknown) => card(item))) return false;
  const cards = value.cards as ObjectValue[];
  if (cards.length < RUN.shop.minDeck || new Set(cards.map((item) => item.id)).size !== cards.length) return false;
  if (!integer(value.maxHearts, RUN.hearts) || value.maxHearts > RUN.hearts + RELICS.heart.hearts
    || !integer(value.hearts, 1) || value.hearts > value.maxHearts || (value.handLimit !== RUN.handStart && value.handLimit !== RUN.handMax)
    || !integer(value.fight, 1) || value.fight > RUN.fights.length || !monster(value.monster)
    || !game(value.game, cards, true) || !stats(value.stats) || value.result !== null) return false;
  if (!relicList(value.relics)) return false;
  if (!Array.isArray(value.relicOptions) || !value.relicOptions.every(relic)
    || new Set(value.relicOptions).size !== value.relicOptions.length) return false;
  const owned = value.relics;
  if (value.relicOptions.some(option => owned.includes(String(option)))) return false;
  if (value.maxHearts !== RUN.hearts + (owned.includes('heart') ? RELICS.heart.hearts : 0)) return false;
  if (value.phase === 'relic' && value.relicOptions.length !== Math.min(RUN.relicOptions, Object.keys(RELICS).length - owned.length)) return false;
  if (value.phase !== 'relic' && value.relicOptions.length !== 0) return false;
  if (owned.length === 0) {
    if (value.phase !== 'relic' || value.relic !== null || value.game.relic !== undefined
      || (value.game.relics !== undefined && (value.game.relics as string[]).length !== 0)
      || value.fight !== 1 || value.hearts !== RUN.hearts
      || (value.game.row as unknown[]).length !== 0 || value.game.onceUsed !== false) return false;
  } else if (!relic(value.relic) || value.game.relic !== value.relic
    || !owned.includes(String(value.relic)) || JSON.stringify(value.game.relics) !== JSON.stringify(owned)) return false;
  if (!integer(value.act, 1) || value.act > RUN.acts.length || !integer(value.room, 1)) return false;
  const act = RUN.acts[value.act - 1]!;
  if (value.room > act.rooms.length
    || value.fight !== RUN.acts.slice(0, value.act - 1).reduce((sum, item) => sum + item.rooms.length, 0) + value.room
    || !number(value.hpScale, Number.MIN_VALUE) || !integer(value.shopsVisited) || !integer(value.nextCardId, 1)
    || !RUN.doorRewards.includes(value.pendingReward as 'card' | 'shop' | 'heal')
    || (value.previousNormal !== null && !act.normalMonsters.includes(value.previousNormal as never))) return false;
  if (!Array.isArray(value.doors) || !value.doors.every((door: unknown) => object(door)
    && act.normalMonsters.includes(door.monster as never)
    && door.rule === MONSTERS[door.monster as keyof typeof MONSTERS].rule
    && RUN.doorRewards.includes(door.reward as 'card' | 'shop' | 'heal'))) return false;
  if (value.phase === 'doors') {
    if (act.rooms[value.room - 1]!.type !== 'doors' || value.doors.length !== 2
      || new Set(value.doors.map(door => door.monster)).size !== 2
      || new Set(value.doors.map(door => door.reward)).size !== 2
      || value.doors.some(door => door.monster === value.previousNormal)
      || (value.hearts === value.maxHearts && value.doors.some(door => door.reward === 'heal'))) return false;
  }
  if (!Array.isArray(value.monsters) || value.monsters.length !== RUN.fights.length
    || !value.monsters.every((item: unknown) => typeof item === 'string' && Object.hasOwn(MONSTERS, item))) return false;
  if (!Array.isArray(value.loot) || !value.loot.every(tool)
    || new Set(value.loot).size !== value.loot.length) return false;
  if (value.phase === 'loot' && (!value.monster.broken || value.fight === RUN.fights.length || value.loot.length > RUN.lootBonusCount)) return false;
  if (value.phase !== 'loot' && value.loot.length !== 0) return false;
  if (value.phase !== 'doors' && value.monster.key !== value.monsters[value.fight - 1]) return false;
  if (!Array.isArray(value.hist) || !Array.isArray(value.game.hist) || value.hist.length !== value.game.hist.length) return false;
  if (value.phase !== 'battle' && value.hist.length !== 0) return false;
  const selectedRelic = value.game.relic;
  const selectedRelics = JSON.stringify(value.game.relics);
  if (!(value.game.hist as ObjectValue[]).every((snapshot) => snapshot.relic === selectedRelic && JSON.stringify(snapshot.relics) === selectedRelics)) return false;
  return value.hist.every((entry: unknown) => object(entry) && monster(entry.monster) && stats(entry.stats));
}

export function encodeRunSave(state: RunState): string | null {
  if (!['relic', 'battle', 'loot', 'doors', 'shop'].includes(state.phase)) return null;
  if (!isActiveRunState(state)) throw new TypeError('不能保存不完整的一局');
  return JSON.stringify({ version: 4, state });
}

/** Invalid saves return a clear instruction; the later UI storage adapter performs deletion. */
export function decodeRunSave(raw: string | null): RunLoadResult {
  if (raw === null) return { state: null, clear: false, reason: 'empty' };
  try {
    const envelope: unknown = JSON.parse(raw);
    if (object(envelope) && integer(envelope.version) && envelope.version < 4) {
      return { state: null, clear: true, reason: 'outdated' };
    }
    if (object(envelope) && envelope.version === 4 && isActiveRunState(envelope.state)) {
      return { state: envelope.state, clear: false, reason: 'ok' };
    }
  } catch { /* Broken JSON is a recoverable missing save, never a startup crash. */ }
  return { state: null, clear: true, reason: 'invalid' };
}
