import { EFFECTS, activeMonsterRule, applyLifecycle, monsterLayer, rainbowNeed } from './effects';
import {
  cloneGame, copyCard, createDeck, createGame, createToolCard, endTurn,
  drawCards, formatNumber, gemForm, playCard, previewCard, randomFromState, refillHand, shuffle, undo,
} from './index';
import { CONFIG, TOOL_TYPES } from './config';
import type { Card, GameState } from './types';
import { MONSTERS, RELIC_IDS, RUN } from './run-config';
import type { RowEntry } from './types';
import type {
  AdventureHandLimit, MonsterKey, MonsterState, NormalMonster, RunRecords,
  RunResult, RunState, RunStats, RelicId, RuleId, DoorOption,
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
    monsters: [...run.monsters], doors: run.doors.map(door => ({ ...door })),
    relicOptions: [...run.relicOptions], relics: [...run.relics],
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

function makeMonster(key: MonsterKey, fight: number, hpScale = RUN.hpScale): MonsterState {
  const config = RUN.fights[fight - 1]!;
  return {
    key, hp: config.hp * hpScale, maxHp: config.hp * hpScale,
    countdown: config.countdown, maxCountdown: config.countdown,
    broken: false, turnStartHp: config.hp * hpScale, overkill: 0,
    rule: MONSTERS[key].rule, layer: 1, wind: 0, maxWind: 0, woundDown: false,
  };
}

/** New adventure. No time/global randomness is read; the caller provides its seed. */
export function createRun(seed: number): RunState {
  const game = createGame(seed, { hand: RUN.handStart as AdventureHandLimit, grow: true, tools: false });
  const rng = randomFromState(game);
  const monsters: MonsterKey[] = RUN.acts.flatMap(act => act.rooms.map(config => config.monster ?? act.normalMonsters[Math.floor(rng() * act.normalMonsters.length)]!));
  const run: RunState = {
    act: 1, room: 1, doors: [], pendingReward: 'card', previousNormal: monsters[0] as NormalMonster,
    hpScale: RUN.hpScale, shopsVisited: 0, nextCardId: createDeck().length + 1,
    cards: createDeck(), hearts: RUN.hearts, maxHearts: RUN.hearts, handLimit: RUN.handStart as AdventureHandLimit,
    relicOptions: shuffle([...RELIC_IDS], rng).slice(0, RUN.relicOptions), relic: null, relics: [],
    fight: 1, monsters, monster: makeMonster(monsters[0]!, 1), game,
    phase: 'relic', loot: [], hist: [], result: null,
    stats: { turns: 0, bestTurn: 0, bestFight: 1, maxOverkill: 0, totalDamage: 0, fights: [] },
  };
  applyLifecycle(run, 'fightStart');
  return run;
}

export function chooseRelic(run: RunState, optionIndex: number): RunState {
  if (run.phase !== 'relic') throw new Error('当前不在选宝物阶段');
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= run.relicOptions.length) throw new RangeError('宝物索引超出范围');
  const initial = run.relics.length === 0;
  const selected = run.relicOptions[optionIndex]!;
  acquireRelic(run, selected);
  run.relicOptions = [];
  if (initial) { run.phase = 'battle'; applyLifecycle(run, 'fightStart'); applyLifecycle(run, 'turnStart'); }
  else nextFight(run);
  clearUndo(run);
  return run;
}
function acquireRelic(run: RunState, relic: RelicId): void {
  if (run.relics.includes(relic)) return;
  run.relics.push(relic); run.relic ??= relic;
  run.game.relic = run.relic; run.game.relics = [...run.relics];
  EFFECTS[relic]?.lifecycle?.runStart?.(run);
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
  const entry = playCard(run.game, handIndex, run.monster);
  run.hist.push(before);
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
    applyLifecycle(run, 'fightWon');
    const config = RUN.fights[run.fight - 1]!;
    run.handLimit = Math.min(RUN.handMax, run.handLimit + (config.handUp ?? 0)) as AdventureHandLimit;
    const count = run.monster.overkill >= RUN.lootBonusOverkill ? RUN.lootBonusCount : RUN.lootCount;
    if (config.relic) {
      run.relicOptions = shuffle(RELIC_IDS.filter(id => !run.relics.includes(id)), randomFromState(run.game)).slice(0, RUN.relicOptions);
      run.phase = 'relic';
    } else if (run.pendingReward === 'shop') { run.phase = 'shop'; run.shopsVisited += 1; }
    else if (run.pendingReward === 'heal') { run.hearts = Math.min(run.maxHearts, run.hearts + RUN.healDoor); nextFight(run); }
    else {
      run.loot = shuffle(TOOL_TYPES.filter(type => toolCount(run, type) < RUN.toolCap), randomFromState(run.game)).slice(0, count);
      run.phase = 'loot';
    }
    return run;
  }

  applyLifecycle(run, 'turnEnd');
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
  run.monster.sealed = false;
  const previousTurn = run.game.turn;
  endTurn(run.game);
  // Practice skips empty turns; adventure time always advances.
  run.game.turn = previousTurn + 1;
  run.monster.turnStartHp = run.monster.hp;
  applyLifecycle(run, 'turnStart');
  return run;
}

/** Start the next fight from canonical cards, never from the resolved mirror row. */
function resetBattleCards(run: RunState): void {
  const previous = run.game;
  run.game = {
    deck: run.cards.map(copyCard), hand: [], row: [], discard: [],
    m: CONFIG.multiplierStart, turnDmg: 0, total: previous.total,
    turn: 1, best: previous.best, last: 0,
    chain: [], chainIdx: [], rainbow: false, xp: [...previous.xp],
    opts: { ...previous.opts, grow: true, hand: run.handLimit, tools: false },
    rngState: previous.rngState, hist: [], onceUsed: false,
    ...(run.relic ? { relic: run.relic } : {}), relics: [...run.relics],
  };
  shuffle(run.game.deck, randomFromState(run.game)); refillHand(run.game);
  clearUndo(run);
}
function startBattle(run: RunState, monster: MonsterKey): void {
  run.monsters[run.fight - 1] = monster;
  run.monster = makeMonster(monster, run.fight, run.hpScale);
  if (roomConfig(run).type === 'normal' || roomConfig(run).type === 'doors') run.previousNormal = monster as NormalMonster;
  applyLifecycle(run, 'fightStart'); applyLifecycle(run, 'turnStart');
  run.phase = 'battle'; run.doors = []; run.loot = []; clearUndo(run);
}
export function roomConfig(run: RunState) { return RUN.acts[run.act - 1]!.rooms[run.room - 1]!; }
function nextFight(run: RunState): void {
  run.fight += 1; run.room += 1;
  if (run.room > RUN.acts[run.act - 1]!.rooms.length) { run.act += 1; run.room = 1; run.previousNormal = null; }
  resetBattleCards(run); run.loot = [];
  const act = RUN.acts[run.act - 1]!; const config = roomConfig(run);
  if (config.type === 'doors') {
    const rng = randomFromState(run.game);
    const monsters = shuffle(act.normalMonsters.filter(key => key !== run.previousNormal), rng).slice(0, 2);
    const rewards = shuffle(RUN.doorRewards.filter(reward => reward !== 'heal' || run.hearts < run.maxHearts), rng);
    run.doors = monsters.map((monster, index) => ({ monster, rule: MONSTERS[monster].rule, reward: rewards[index]! }));
    run.phase = 'doors';
  } else {
    run.pendingReward = 'card';
    startBattle(run, config.monster ?? act.normalMonsters[Math.floor(randomFromState(run.game)() * act.normalMonsters.length)]!);
  }
}
export function doorOptions(run: RunState): DoorOption[] { return run.doors.map(door => ({ ...door })); }
export function chooseDoor(run: RunState, index: number): RunState {
  if (run.phase !== 'doors') throw new Error('当前不在挑门阶段');
  if (!Number.isInteger(index) || !run.doors[index]) throw new RangeError('门索引超出范围');
  const door = run.doors[index]!; run.pendingReward = door.reward;
  startBattle(run, door.monster); return run;
}
export function canDoubleTool(run: RunState, card: Card): boolean {
  return Boolean(card.type && run.relics.includes('twice') && !run.game.row.some(entry => entry.type)
    && EFFECTS[card.type]?.repeatable);
}
export function toolCount(run: RunState, type: import('./types').ToolType): number { return run.cards.filter(card => card.type === type).length; }
export function canCopyCard(run: RunState, cardId: number): boolean {
  const card = run.cards.find(card => card.id === cardId);
  return Boolean(card && (!card.type || toolCount(run, card.type) < RUN.toolCap));
}
export function shopState(run: RunState) {
  const maxDrop = Math.max(0, Math.min(RUN.shop.dropMax, run.cards.length - RUN.shop.minDeck));
  return { canDrop: maxDrop > 0, maxDrop, canCopy: run.cards.some(card => canCopyCard(run, card.id)), minDeck: RUN.shop.minDeck };
}
function requireShop(run: RunState) { if (run.phase !== 'shop') throw new Error('当前不在工坊'); }
export function shopDrop(run: RunState, cardIds: number[]): RunState {
  requireShop(run);
  if (!cardIds.length || cardIds.length > shopState(run).maxDrop || new Set(cardIds).size !== cardIds.length || cardIds.some(id => !run.cards.some(card => card.id === id))) throw new RangeError('扔牌数量或牌不合法');
  run.cards = run.cards.filter(card => !cardIds.includes(card.id)); nextFight(run); return run;
}
export function shopCopy(run: RunState, cardId: number): RunState {
  requireShop(run); if (!canCopyCard(run, cardId)) throw new RangeError('这种牌已经带满 2 张，不能再抄');
  const card = run.cards.find(card => card.id === cardId)!;
  run.cards.push({ ...copyCard(card), id: nextIdentity(run) }); nextFight(run); return run;
}
export function shopSkip(run: RunState): RunState { requireShop(run); nextFight(run); return run; }
function nextIdentity(run: RunState): number { const id = Math.max(run.nextCardId, ...run.cards.map(card => card.id + 1)); run.nextCardId = id + 1; return id; }

/** Zero-based option index; acquired cards receive max existing identity + 1. */
export function chooseLoot(run: RunState, optionIndex: number): RunState {
  requireLoot(run);
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= run.loot.length) {
    throw new RangeError('战利品索引超出范围');
  }
  const id = nextIdentity(run);
  run.cards.push(createToolCard(run.loot[optionIndex]!, id));
  nextFight(run);
  return run;
}

export function skipLoot(run: RunState): RunState {
  requireLoot(run);
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

/** Exact result of playing this hand card now (adventure rules, including all effect hooks), without changing the run. */
export function previewRunCard(run: RunState, card: Card): RowEntry | null {
  if (run.phase !== 'battle') return null;
  const index = run.game.hand.findIndex((item) => item.id === card.id);
  if (index < 0) return null;
  const copy = cloneRun(run);
  return playRunCard(copy, index);
}

/** Active rule only; a broken monster has no rule. */
export function displayedRule(run: RunState): RuleId { return EFFECTS[run.monster.rule]?.ruleFor?.(run.monster) ?? run.monster.rule as RuleId; }
export function ruleSealed(run: RunState): boolean { return Boolean(run.monster.sealed); }
export function currentRule(run: RunState): RuleId | undefined { return activeMonsterRule(run.monster); }

export function cardWarnings(run: RunState, card: Card): { attack: boolean; unwind: boolean } {
  if (run.phase !== 'battle' || run.monster.broken) return { attack: false, unwind: false };
  const index = run.game.hand.findIndex(c => c.id === card.id);
  if (index < 0) return { attack: false, unwind: false };
  const copy = cloneRun(run);
  const entry = playRunCard(copy, index);
  return {
    attack: !copy.monster.broken && run.monster.countdown - 1 > 0 && copy.monster.countdown - 1 <= 0,
    unwind: currentRule(run) === 'wind' && run.monster.maxWind > 0 && run.monster.wind > 0 && !run.monster.woundDown && (entry.v & 4) !== 0,
  };
}
export function previewCountdown(run: RunState, card: Card): number {
  if (run.phase !== 'battle') return run.monster.countdown;
  const index = run.game.hand.findIndex(c => c.id === card.id);
  if (index < 0) return run.monster.countdown;
  const copy = cloneRun(run); playRunCard(copy, index); return copy.monster.countdown;
}

export function bestHintCard(source: RunState | GameState): number | undefined {
  const run = 'game' in source ? source : undefined;
  const game = run ? run.game : source as GameState;
  const rank = { plain: 0, same: 1, shun: 2, white: 3 };
  let best: RowEntry | undefined;
  for (const card of game.hand) {
    if (run && cardWarnings(run, card).attack) continue;
    const entry = run ? previewRunCard(run, card) : previewCard(game, card);
    if (!entry || !rank[entry.k]) continue;
    if (!best || rank[entry.k] > rank[best.k] || (rank[entry.k] === rank[best.k] && (entry.m2 > best.m2 || (entry.m2 === best.m2 && entry.damage > best.damage)))) best = entry;
  }
  return best?.id;
}

export function rainbowStatus(source: RunState | GameState): { need: 5 | 6; lit: number[]; ready: boolean; readyIds: number[] } {
  const game = 'game' in source ? source.game : source;
  const need = rainbowNeed(game);
  const lit = CONFIG.rainbowColors.filter(v => game.rainbow || game.chain.includes(v));
  const chromatic = game.hand.filter(c => c.type !== 'mirror' && c.type !== 'shadow' && CONFIG.rainbowColors.includes(c.v));
  const available = new Set([...game.chain, ...chromatic.map(c => c.v)]);
  const ready = !game.rainbow && CONFIG.rainbowColors.filter(v => available.has(v)).length >= need;
  const readyIds = ready ? chromatic.filter(c => !game.chain.includes(c.v)).map(c => c.id) : [];
  return { need, lit, ready, readyIds };
}

/** Debug commands keep related rule fields in sync and clear paired undo stacks. */
export function debugGiveRelic(run: RunState, relic: RelicId): void {
  if (!RELIC_IDS.includes(relic)) throw new RangeError('未知的宝物');
  if (run.phase === 'relic') { run.relicOptions[0] = relic; chooseRelic(run, 0); return; }
  acquireRelic(run, relic);
  clearUndo(run);
}
export function debugEnterShop(run: RunState): void { run.phase = 'shop'; run.loot = []; run.doors = []; run.relicOptions = []; run.shopsVisited += 1; clearUndo(run); }
export function debugSetSealed(run: RunState, sealed: boolean): void { run.monster.sealed = sealed; clearUndo(run); }
export function debugJumpRoom(run: RunState, room: number): void {
  if (!Number.isInteger(room) || room < 1 || room > RUN.fights.length) throw new RangeError('房间超出范围');
  let act = 1; let local = room;
  while (local > RUN.acts[act - 1]!.rooms.length) { local -= RUN.acts[act - 1]!.rooms.length; act += 1; }
  run.act = act; run.room = local - 1; run.fight = room - 1; run.relicOptions = [];
  nextFight(run);
}
export function debugSetDoors(run: RunState, doors: DoorOption[]): void {
  if (doors.length !== 2 || doors.some(door => !RUN.acts[run.act - 1]!.normalMonsters.includes(door.monster) || !RUN.doorRewards.includes(door.reward))) throw new RangeError('门不合法');
  run.doors = doors.map(door => ({ ...door, rule: MONSTERS[door.monster].rule })); run.phase = 'doors'; run.loot = []; clearUndo(run);
}
export function debugGiveTool(run: RunState, type: import('./types').ToolType, ignoreCap = false): void {
  if (!TOOL_TYPES.includes(type) || (!ignoreCap && toolCount(run, type) >= RUN.toolCap)) throw new RangeError('这种牌已经带满 2 张');
  const card = createToolCard(type, nextIdentity(run)); run.cards.push(card); run.game.deck.push(copyCard(card)); clearUndo(run);
}
export function debugFillHand(run: RunState, count: number): void {
  if (!Number.isInteger(count) || count < 0 || count > RUN.handHardMax) throw new RangeError('手牌最多 12 张');
  while (run.game.hand.length > count) run.game.deck.push(run.game.hand.pop()!);
  drawCards(run.game, count - run.game.hand.length); clearUndo(run);
}

export function debugSetMonsterHp(run: RunState, hp: number): void {
  if (!Number.isFinite(hp) || hp < 0 || hp > run.monster.maxHp) throw new RangeError('怪物血量超出范围');
  run.monster.hp = hp; if (hp > 0) run.monster.turnStartHp = hp; run.monster.broken = hp === 0;
  if (MONSTERS[run.monster.key].rule === 'layers') run.monster.layer = monsterLayer(run.monster);
  clearUndo(run);
}
export function debugSetCountdown(run: RunState, countdown: number): void {
  if (!Number.isInteger(countdown) || countdown < 0 || !Number.isFinite(countdown)) throw new RangeError('倒计时必须在0与满值之间');
  run.monster.countdown = countdown; clearUndo(run);
}
export function debugSetWind(run: RunState, wind: number): void {
  if (!Number.isInteger(wind) || wind < 0 || wind > run.monster.maxWind) throw new RangeError('发条超出范围');
  run.monster.wind = wind; run.monster.woundDown = wind === 0 && run.monster.maxWind > 0; clearUndo(run);
}
export function debugRelicSelection(run: RunState): void {
  Object.assign(run, createRun(run.game.rngState));
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
