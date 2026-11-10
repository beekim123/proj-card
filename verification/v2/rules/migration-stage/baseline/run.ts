import {
  cloneGame, copyCard, createDeck, createGame, createToolCard, endTurn,
  formatNumber, gemForm, playCard, randomFromState, refillHand, shuffle, undo,
} from './index';
import { CONFIG, TOOL_TYPES } from './config';
import type { Card } from './types';
import { MONSTERS, RUN } from './run-config';
import type { RowEntry } from './types';
import type {
  AdventureHandLimit, MonsterKey, MonsterState, NormalMonster, RunRecords,
  RunResult, RunState, RunStats,
} from './run-types';

export * from './run-config';
export * from './run-types';

function copyStats(stats: RunStats): RunStats {
  return { ...stats, fights: stats.fights.map((fight) => ({ ...fight })) };
}

/** Independent deep copy, including both paired undo stacks and RNG state. */
export function cloneRun(run: RunState): RunState {
  return {
    ...run,
    cards: run.cards.map(copyCard),
    monsters: [...run.monsters],
    monster: { ...run.monster },
    game: cloneGame(run.game),
    loot: [...run.loot],
    stats: copyStats(run.stats),
    hist: run.hist.map((entry) => ({
      monster: { ...entry.monster }, stats: copyStats(entry.stats),
    })),
    result: run.result ? {
      ...run.result, gemForms: [...run.result.gemForms],
      extraCards: run.result.extraCards.map(copyCard),
      newRecords: { ...run.result.newRecords },
    } : null,
  };
}

function makeMonster(key: MonsterKey, fight: number): MonsterState {
  const config = RUN.fights[fight - 1]!;
  return {
    key, hp: config.hp, maxHp: config.hp,
    countdown: config.countdown, maxCountdown: config.countdown,
    broken: false, turnStartHp: config.hp, overkill: 0,
    weak: MONSTERS[key].weak, toughness: config.toughness, maxToughness: config.toughness, guardDown: false,
  };
}

/** New adventure. No time/global randomness is read; the caller provides its seed. */
export function createRun(seed: number): RunState {
  const game = createGame(seed, { hand: RUN.handStart, grow: true, tools: false });
  const rng = randomFromState(game);
  let previousNormal: NormalMonster | undefined;
  const monsters: MonsterKey[] = RUN.fights.map((config) => {
    if (config.type !== 'normal') return config.monster!;
    const choices = RUN.normalMonsters.filter((key) => key !== previousNormal);
    const selected = choices[Math.floor(rng() * choices.length)]!;
    previousNormal = selected;
    return selected;
  });
  return {
    cards: createDeck(), hearts: RUN.hearts, handLimit: RUN.handStart,
    fight: 1, monsters, monster: makeMonster(monsters[0]!, 1), game,
    phase: 'battle', loot: [], hist: [], result: null,
    stats: { turns: 0, bestTurn: 0, bestFight: 1, maxOverkill: 0, totalDamage: 0, fights: [] },
  };
}

function requireBattle(run: RunState): void {
  if (run.phase !== 'battle') throw new Error('当前不在打仗阶段');
}

function requireLoot(run: RunState): void {
  if (run.phase !== 'loot') throw new Error('当前不在战利品阶段');
}

/** Mutable command. Broken monsters still accept plays until endRunTurn. */
export function playRunCard(run: RunState, handIndex: number): RowEntry {
  requireBattle(run);
  const before = { monster: { ...run.monster }, stats: copyStats(run.stats) };
  const guardDown = run.monster.guardDown;
  const entry = playCard(run.game, handIndex);
  run.hist.push(before);
  if (guardDown && entry.damage > 0) {
    const bonus = Math.round(entry.damage * (RUN.guardDamage - 1));
    entry.guard = bonus; entry.damage += bonus;
    run.game.turnDmg += bonus; run.game.total += bonus;
  }
  run.monster.hp = Math.max(0, run.monster.hp - entry.damage);
  if (run.monster.hp === 0) run.monster.broken = true;
  const m = run.monster;
  if (!m.broken && !m.guardDown && m.maxToughness > 0 && (entry.v & (1 << m.weak))) {
    m.toughness -= 1;
    if (m.toughness === 0) { m.guardDown = true; m.countdown += RUN.guardDelay; }
  }
  if (run.monster.broken) {
    run.monster.overkill = run.game.turnDmg / run.monster.turnStartHp;
    run.stats.maxOverkill = Math.max(run.stats.maxOverkill, run.monster.overkill);
  }
  run.stats.totalDamage = run.game.total;
  if (run.game.turnDmg > run.stats.bestTurn) {
    run.stats.bestTurn = run.game.turnDmg;
    run.stats.bestFight = run.fight;
  }
  return entry;
}

/** Undo exactly one play, including draws, recycled piles, RNG and monster death. */
export function undoRun(run: RunState): boolean {
  if (run.phase !== 'battle') return false;
  const previous = run.hist.at(-1);
  if (!previous) return false;
  if (!undo(run.game)) throw new Error('冒险撤回记录与出牌记录不一致');
  run.hist.pop();
  run.monster = { ...previous.monster };
  run.stats = copyStats(previous.stats);
  return true;
}

function clearUndo(run: RunState): void {
  run.hist = [];
  run.game.hist = [];
}

function recordFight(run: RunState, won: boolean): void {
  const earlierDamage = run.stats.fights.reduce((sum, fight) => sum + fight.damage, 0);
  run.stats.fights.push({
    fight: run.fight, monster: run.monster.key, won, turns: run.game.turn,
    damage: run.stats.totalDamage - earlierDamage,
    overkill: run.monster.broken ? run.monster.overkill : 0,
  });
}

function settle(run: RunState, outcome: RunResult['outcome'], reason: RunResult['reason']): void {
  run.phase = outcome;
  run.loot = [];
  clearUndo(run);
  run.result = {
    outcome, reason, fight: run.fight, monster: run.monster.key,
    totalTurns: run.stats.turns,
    bestTurn: run.stats.bestTurn, bestFight: run.stats.bestFight,
    maxOverkill: run.stats.maxOverkill, totalDamage: run.stats.totalDamage,
    gemForms: [gemForm(run.game, 0), gemForm(run.game, 1), gemForm(run.game, 2)],
    extraCards: run.cards.filter((card) => card.type !== undefined).map(copyCard),
    newRecords: { farthest: false, bestTurn: false, maxOverkill: false },
    recordsApplied: false,
  };
}

/**
 * End a battle turn. Every click counts, including an empty turn or a fatal one.
 * Winning freezes the countdown; only an unbroken monster can attack.
 */
export function endRunTurn(run: RunState): RunState {
  requireBattle(run);
  run.stats.turns += 1;
  run.game.last = run.game.turnDmg;
  run.game.best = Math.max(run.game.best, run.game.turnDmg);
  clearUndo(run);
  if (run.monster.broken) {
    recordFight(run, true);
    if (run.fight === RUN.fights.length) {
      settle(run, 'victory', 'boss');
      return run;
    }
    const config = RUN.fights[run.fight - 1]!;
    run.handLimit = Math.min(RUN.handMax, run.handLimit + (config.handUp ?? 0)) as AdventureHandLimit;
    const count = run.monster.overkill >= RUN.lootBonusOverkill ? RUN.lootBonusCount : RUN.lootCount;
    run.loot = shuffle([...TOOL_TYPES], randomFromState(run.game)).slice(0, count);
    run.phase = 'loot';
    return run;
  }

  run.monster.countdown -= 1;
  if (run.monster.countdown === 0) {
    run.hearts = Math.max(0, run.hearts - 1);
    run.monster.countdown = run.monster.maxCountdown;
  }
  if (run.monster.guardDown) { run.monster.guardDown = false; run.monster.toughness = run.monster.maxToughness; }
  if (run.hearts === 0) {
    // The fatal turn ends, but no next turn is started and no cards are drawn.
    recordFight(run, false);
    run.game.discard.push(...run.game.row.map(copyCard));
    run.game.row = [];
    run.game.chain = [];
    run.game.chainIdx = [];
    run.game.rainbow = false;
    settle(run, 'defeat', 'hearts');
    return run;
  }
  const previousTurn = run.game.turn;
  endTurn(run.game);
  // Practice skips empty turns; adventure time always advances.
  run.game.turn = previousTurn + 1;
  run.monster.turnStartHp = run.monster.hp;
  return run;
}

/** Start the next fight from canonical cards, never from the resolved mirror row. */
function nextFight(run: RunState): void {
  const previous = run.game;
  run.fight += 1;
  run.game = {
    deck: run.cards.map(copyCard), hand: [], row: [], discard: [],
    m: CONFIG.multiplierStart, turnDmg: 0, total: previous.total,
    turn: 1, best: previous.best, last: 0,
    chain: [], chainIdx: [], rainbow: false, xp: [...previous.xp],
    opts: { ...previous.opts, grow: true, hand: run.handLimit, tools: false },
    rngState: previous.rngState, hist: [],
  };
  shuffle(run.game.deck, randomFromState(run.game));
  refillHand(run.game);
  run.monster = makeMonster(run.monsters[run.fight - 1]!, run.fight);
  run.phase = 'battle';
  run.loot = [];
  clearUndo(run);
}

/** Zero-based option index; acquired cards receive max existing identity + 1. */
export function chooseLoot(run: RunState, optionIndex: number): RunState {
  requireLoot(run);
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= run.loot.length) {
    throw new RangeError('战利品索引超出范围');
  }
  const id = Math.max(...run.cards.map((card) => card.id)) + 1;
  run.cards.push(createToolCard(run.loot[optionIndex]!, id));
  nextFight(run);
  return run;
}

export function skipLoot(run: RunState): RunState {
  requireLoot(run);
  run.hearts = Math.min(RUN.hearts, run.hearts + RUN.skipHeal);
  nextFight(run);
  return run;
}

/** Explicit abandonment counts the currently open battle turn, per clarification. */
export function abandonRun(run: RunState): RunState {
  if (run.phase === 'victory' || run.phase === 'defeat') return run;
  if (run.phase === 'battle') {
    run.stats.turns += 1;
    recordFight(run, false);
  }
  settle(run, 'defeat', 'abandoned');
  return run;
}

export function createRecords(): RunRecords {
  return { played: 0, wins: 0, farthest: 0, bestTurn: 0, maxOverkill: 0 };
}

/** Mutable, once-only settlement. Storage and removal of the run are UI duties. */
export function updateRecords(records: RunRecords, run: RunState): RunRecords {
  const result = run.result;
  if (!result) throw new Error('尚未结算，不能更新纪录');
  if (result.recordsApplied) return records;
  const reached = result.outcome === 'victory' ? RUN.fights.length + 1 : result.fight;
  result.newRecords = {
    farthest: reached > records.farthest,
    bestTurn: result.bestTurn > records.bestTurn,
    maxOverkill: result.maxOverkill > records.maxOverkill,
  };
  records.played += 1;
  if (result.outcome === 'victory') records.wins += 1;
  records.farthest = Math.max(records.farthest, reached);
  records.bestTurn = Math.max(records.bestTurn, result.bestTurn);
  records.maxOverkill = Math.max(records.maxOverkill, result.maxOverkill);
  result.recordsApplied = true;
  return records;
}

/** Exact result of playing this hand card now (adventure rules, including break bonus), without changing the run. */
export function previewRunCard(run: RunState, card: Card): RowEntry | null {
  if (run.phase !== 'battle') return null;
  const index = run.game.hand.findIndex((item) => item.id === card.id);
  if (index < 0) return null;
  const copy = cloneRun(run);
  return playRunCard(copy, index);
}

/** Would playing this card wear down the monster's toughness? */
export function hitsWeakness(run: RunState, mask: number): boolean {
  const m = run.monster;
  return !m.broken && !m.guardDown && m.maxToughness > 0 && (mask & (1 << m.weak)) !== 0;
}

/** First floor the raw ratio, then use the existing rounded large-number format. */
export function formatOverkill(value: number): string {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('超杀必须是非负有限数字');
  const floored = value < 10 ? Math.floor(value * 10) / 10 : Math.floor(value);
  return `×${floored < 10 ? String(floored) : formatNumber(floored)}`;
}

export function formatMonsterHp(hp: number, maxHp: number): string {
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) {
    throw new RangeError('怪物血量必须是有限数字，满血必须大于 0');
  }
  return `${formatNumber(Math.max(0, hp))} / ${formatNumber(maxHp)}`;
}
