import { applyEffects, effectIds, growthThresholds, type EffectContext } from './effects';
import type { MonsterState } from './run-types';
export { EFFECTS, growthThresholds } from './effects';
import { RUN } from './run-config';
import { CARD_NAMES, CONFIG, GEMS, REACTION_NAMES, TOOLS, TOOL_TYPES } from './config';
import type {
  Card, GameOptions, GameSnapshot, GameState, GemForm,
  RandomSource, RandomState, StatefulRandomSource, Reaction, RowEntry, ToolType, HandLimit,
} from './types';

export * from './config';
export * from './types';

function assertMask(v: number): void {
  if (!Number.isInteger(v) || v < 0 || v > 7) {
    throw new RangeError('宝石位必须是 0–7 的整数');
  }
}

function assertOptions(opts: GameOptions): void {
  if (!(CONFIG.handLimits as readonly number[]).includes(opts.hand)) {
    throw new RangeError('手牌上限必须是 6、7 或 8');
  }
  if (typeof opts.hint !== 'boolean' || typeof opts.grow !== 'boolean'
    || (opts.tools !== undefined && typeof opts.tools !== 'boolean')) {
    throw new TypeError('提示、成长与额外牌设置必须是布尔值');
  }
}

/** Advance the same Mulberry32 stream as the original seededRng implementation. */
export function nextRandom(state: RandomState): number {
  state.rngState = (state.rngState + 0x6d2b79f5) >>> 0;
  const value = state.rngState;
  let mixed = Math.imul(value ^ (value >>> 15), value | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x100000000;
}

/** Stateful adapter. Only the caller's ordinary integer field is mutated. */
export function randomFromState(state: RandomState): StatefulRandomSource {
  const rng = (() => nextRandom(state)) as StatefulRandomSource;
  rng.getState = () => state.rngState;
  rng.setState = (value: number) => { state.rngState = value >>> 0; };
  return rng;
}

/** Original callable API, now also exposing its serializable integer state. */
export function seededRng(seed: number): StatefulRandomSource {
  return randomFromState({ rngState: seed >>> 0 });
}

function initialRandomState(source: number | RandomSource): number {
  if (typeof source === 'number') {
    if (!Number.isFinite(source)) throw new RangeError('随机种子必须是有限数字');
    return source >>> 0;
  }
  const stateful = source as Partial<StatefulRandomSource>;
  if (typeof stateful.getState === 'function') return stateful.getState() >>> 0;
  // Legacy sources seed the local stream once. All later randomness is saved.
  const value = source();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError('随机函数必须返回 [0, 1) 范围内的数');
  }
  return Math.floor(value * 0x100000000) >>> 0;
}

/** Fisher–Yates, operating only on the supplied array and random source. */
export function shuffle<T>(items: T[], rng: RandomSource): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const random = rng();
    if (!Number.isFinite(random) || random < 0 || random >= 1) {
      throw new RangeError('随机函数必须返回 [0, 1) 范围内的数');
    }
    const j = Math.floor(random * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

export function createDeck(tools = false): Card[] {
  const cards: Card[] = [];
  for (const { v, count } of CONFIG.deck) {
    for (let i = 0; i < count; i += 1) cards.push({ id: cards.length + 1, v });
  }
  if (tools) {
    for (const type of TOOL_TYPES) cards.push(createToolCard(type, cards.length + 1));
  }
  return cards;
}

export function createToolCard(type: ToolType, id: number): Card {
  if (!TOOL_TYPES.includes(type)) throw new RangeError('未知的额外牌类型');
  return { id, v: TOOLS[type].v, type };
}

/** Return a pile card; a resolved row mirror always goes back to its blank face. */
export function copyCard(card: Card): Card {
  return card.type ? createToolCard(card.type, card.id) : { id: card.id, v: card.v };
}

function copyRow(entry: RowEntry): RowEntry {
  return { ...entry, gemValues: [...entry.gemValues], grown: [...entry.grown], effects: entry.effects.map(effect => ({ ...effect })) };
}

/** Clone every gameplay field, including settings, without recursive undo stacks. */
export function snapshot(state: GameSnapshot): GameSnapshot {
  return {
    deck: state.deck.map(copyCard), discard: state.discard.map(copyCard),
    hand: state.hand.map(copyCard), row: state.row.map(copyRow),
    m: state.m, turnDmg: state.turnDmg, total: state.total, turn: state.turn,
    best: state.best, last: state.last,
    chain: [...state.chain], chainIdx: [...state.chainIdx],
    rainbow: state.rainbow, xp: [...state.xp], opts: { ...state.opts },
    rngState: state.rngState, onceUsed: state.onceUsed,
    ...(state.relic ? { relic: state.relic } : {}),
    ...(state.relics ? { relics: [...state.relics] } : {}),
  };
}

export function cloneGame(state: GameState): GameState {
  return { ...snapshot(state), hist: state.hist.map(snapshot) };
}

/** Draw from the array end, recycling only the real discard pile. */
export function drawCards(state: GameState, count: number): Card[] {
  if (!Number.isInteger(count) || count < 0) throw new RangeError('摸牌数必须是非负整数');
  const drawn: Card[] = [];
  for (let i = 0; i < count && state.hand.length < RUN.handHardMax; i += 1) {
    if (state.deck.length === 0) {
      if (state.discard.length === 0) break;
      state.deck = shuffle(state.discard.map(copyCard), randomFromState(state));
      state.discard = [];
    }
    const card = state.deck.pop()!;
    state.hand.push(card);
    drawn.push(card);
  }
  return drawn;
}

/** Search from the top (array end), without recycling the discard. */
export function drawToolCards(state: GameState, count: number): Card[] {
  const drawn: Card[] = [];
  for (let n = 0; n < count && state.hand.length < RUN.handHardMax; n += 1) {
    let index = state.deck.length - 1;
    while (index >= 0 && !state.deck[index]!.type) index -= 1;
    if (index < 0) break;
    const card = state.deck.splice(index, 1)[0]!;
    state.hand.push(card); drawn.push(card);
  }
  return drawn;
}

export function refillHand(state: GameState): void {
  drawCards(state, Math.max(0, state.opts.hand - state.hand.length));
}

/** A seed or the original RNG argument is accepted; state owns all later draws. */
export function createGame(rng: number | RandomSource, options: Partial<GameOptions> = {}): GameState {
  const opts: GameOptions = { hint: true, hand: CONFIG.defaultHandLimit, grow: true, ...options };
  assertOptions(opts);
  const state: GameState = {
    deck: createDeck(Boolean(opts.tools)), discard: [], hand: [], row: [],
    m: CONFIG.multiplierStart, turnDmg: 0, total: 0, turn: 1, best: 0, last: 0,
    chain: [], chainIdx: [], rainbow: false, xp: [0, 0, 0], opts, hist: [],
    rngState: initialRandomState(rng), onceUsed: false,
  };
  shuffle(state.deck, randomFromState(state));
  refillHand(state);
  return state;
}

export function gemForm(state: Pick<GameSnapshot, 'xp' | 'opts'> & Partial<Pick<GameSnapshot, 'relic' | 'relics'>>, index: number): GemForm {
  if (!Number.isInteger(index) || index < 0 || index >= GEMS.length) {
    throw new RangeError('宝石索引必须是 0、1 或 2');
  }
  if (!state.opts.grow) return 0;
  const count = state.xp[index]!;
  const thresholds = growthThresholds(state);
  return count >= thresholds[2] ? 2 : count >= thresholds[1] ? 1 : 0;
}

export function gemValue(state: Pick<GameSnapshot, 'xp' | 'opts'> & Partial<Pick<GameSnapshot, 'relic' | 'relics'>>, index: number): number {
  return CONFIG.gemValue[gemForm(state, index)];
}

export function baseValue(state: Pick<GameSnapshot, 'xp' | 'opts'> & Partial<Pick<GameSnapshot, 'relic' | 'relics'>>, v: number): number {
  assertMask(v);
  return GEMS.reduce((sum, gem, index) => sum + ((v & gem.bit) ? gemValue(state, index) : 0), 0);
}

export function reaction(previous: number | null, current: number): Reaction {
  assertMask(current);
  if (previous === null) return 'plain';
  assertMask(previous);
  const xor = previous ^ current;
  const different = (xor & 1) + ((xor >>> 1) & 1) + ((xor >>> 2) & 1);
  return different === 0 ? 'same' : different === 1 ? 'shun' : different === 3 ? 'white' : 'plain';
}

function nextChain(state: GameSnapshot, v: number, k: Reaction): { colors: number[]; indices: number[] } {
  const chromatic = CONFIG.rainbowColors.includes(v);
  const colors = k === 'shun' ? [...state.chain] : [];
  if (chromatic && !colors.includes(v)) colors.push(v);
  const indices = k === 'shun' ? [...state.chainIdx, state.row.length] : [state.row.length];
  return { colors, indices };
}

/** Resolve effective gems using the same hook as play and preview. */
export function resolvedMask(state: Pick<GameSnapshot, 'row'>, card: Card): number {
  assertMask(card.v);
  if (card.type && !TOOL_TYPES.includes(card.type)) throw new RangeError('未知的额外牌类型');
  const context = { state, card, entry: { ...card, effects: [] } } as unknown as EffectContext;
  applyEffects(card.type ? [card.type] : [], 'mask', context);
  return context.entry.v;
}

function evaluateCard(state: GameSnapshot, original: Card, monster?: MonsterState): EffectContext {
  const entry: RowEntry = {
    ...original, v: original.v, k: 'plain', cm: 1, b: 0,
    m: state.m, m2: state.m, dmg: 0, rainbow: 0, hammer: 0, damage: 0,
    gemValues: [gemValue(state, 0), gemValue(state, 1), gemValue(state, 2)],
    grown: [], rb: false, effects: [],
  };
  const context: EffectContext = { state, card: original, entry, xp: [...state.xp], thresholds: CONFIG.formAt, need: CONFIG.rainbowColors.length, draw: 0, drawTool: 0, times: 1, onceUsed: state.onceUsed, monster: monster ? { ...monster } : undefined, monsterWasBroken: monster?.broken };
  const ids = effectIds(state, original, monster);
  assertMask(original.v);
  if (original.type && !TOOL_TYPES.includes(original.type)) throw new RangeError('未知的额外牌类型');
  applyEffects(ids, 'prepare', context);
  applyEffects(ids, 'mask', context);
  entry.k = reaction(state.row.at(-1)?.v ?? null, entry.v);
  applyEffects(ids, 'reaction', context);
  applyEffects(ids, 'gemValues', context);
  entry.b = GEMS.reduce((sum, gem, index) => sum + ((entry.v & gem.bit) ? entry.gemValues[index]! : 0), 0);
  entry.cm = CONFIG.reactionMultiplier[entry.k];
  applyEffects(ids, 'reactionMultiplier', context);
  entry.dmg = entry.b * state.m * entry.cm;
  entry.m2 = entry.k === 'shun' || entry.k === 'white' ? state.m * CONFIG.multiplierDouble : state.m + CONFIG.multiplierIncrement;
  applyEffects(ids, 'multiplier', context);
  applyEffects(ids, 'rainbowNeed', context);
  const chain = nextChain(state, entry.v, entry.k);
  entry.rb = !state.rainbow && chain.colors.length >= context.need;
  entry.rainbow = entry.rb ? (state.turnDmg + entry.dmg) * (CONFIG.rainbowMultiplier - 1) : 0;
  applyEffects(ids, 'rainbow', context);
  applyEffects(ids, 'hammer', context);
  entry.damage = entry.dmg + entry.rainbow + entry.hammer;
  if (context.monster) {
    context.monster.hp = Math.max(0, context.monster.hp - entry.damage);
    context.monster.broken = context.monster.hp === 0;
  }
  applyEffects(ids, 'afterMonster', context);
  applyEffects(ids, 'growthThresholds', context);
  GEMS.forEach((gem, index) => { context.xp[index] = context.xp[index]! + ((entry.v & gem.bit) ? 1 : 0); });
  applyEffects(ids, 'afterCard', context);
  const free = RUN.handHardMax - Math.max(0, state.hand.length - 1);
  const requested = context.draw + context.drawTool;
  if (requested > free) entry.effects.push({ id: 'handFull', text: '手里拿不下了' });
  else if (context.drawTool > state.deck.filter(card => card.type).length) entry.effects.push({ id: 'whistleEmpty', text: '牌堆里没有额外牌' });
  GEMS.forEach((_gem, index) => {
    const before = gemForm(state, index);
    if (state.opts.grow && before < 2 && context.xp[index]! >= context.thresholds[before + 1]!) entry.grown.push(index);
  });
  applyEffects(ids, 'afterGrowth', context);
  applyEffects(ids, 'afterLayer', context);
  return context;
}

/** Preview shares the complete settlement path and never changes source state. */
export function previewCard(state: GameSnapshot, cardOrMask: Card | number): RowEntry {
  return evaluateCard(state, typeof cardOrMask === 'number' ? { id: -1, v: cardOrMask } : cardOrMask).entry;
}

/** Mutable command: return the row entry inserted into the supplied state. */
export function playCard(state: GameState, handIndex: number, monster?: MonsterState): RowEntry {
  if (!Number.isInteger(handIndex) || handIndex < 0 || handIndex >= state.hand.length) throw new RangeError('手牌索引超出范围');
  const context = evaluateCard(state, state.hand[handIndex]!, monster);
  const entry = context.entry;
  const chain = nextChain(state, entry.v, entry.k);
  state.hist.push(snapshot(state));
  state.hand.splice(handIndex, 1);
  state.row.push(entry);
  state.m = entry.m2;
  state.turnDmg += entry.damage;
  state.total += entry.damage;
  state.chain = chain.colors;
  state.chainIdx = chain.indices;
  if (entry.rb) {
    state.rainbow = true;
    for (const index of state.chainIdx) state.row[index]!.rb = true;
  }
  state.xp = context.xp;
  state.onceUsed = context.onceUsed;
  if (monster && context.monster) Object.assign(monster, context.monster);
  drawCards(state, context.draw);
  drawToolCards(state, context.drawTool);
  return entry;
}

/** Mutable command. Retains unplayed cards; clears all undo history. */
export function endTurn(state: GameState, _rng?: RandomSource): GameState {
  state.last = state.turnDmg;
  state.best = Math.max(state.best, state.turnDmg);
  if (state.row.length > 0) state.turn += 1;
  state.discard.push(...state.row.map(copyCard));
  state.row = [];
  state.m = CONFIG.multiplierStart;
  state.turnDmg = 0;
  state.chain = [];
  state.chainIdx = [];
  state.rainbow = false;
  state.onceUsed = false;
  state.hist = [];
  refillHand(state);
  return state;
}

/** Restore the complete pre-play snapshot, while retaining earlier snapshots. */
export function undo(state: GameState): boolean {
  const previous = state.hist.pop();
  if (!previous) return false;
  Object.assign(state, snapshot(previous));
  return true;
}

export function setHandLimit(state: GameState, limit: HandLimit, _rng?: RandomSource): GameState {
  assertOptions({ ...state.opts, hand: limit });
  const previousLimit = state.opts.hand;
  state.opts.hand = limit;
  if (limit > previousLimit) refillHand(state);
  return state;
}

export function updateSettings(state: GameState, options: Partial<GameOptions>, _rng?: RandomSource): GameState {
  const next = { ...state.opts, ...options };
  assertOptions(next);
  if (Boolean(next.tools) !== Boolean(state.opts.tools)) {
    Object.assign(state, createGame(state.rngState, next));
    return state;
  }
  const previousLimit = state.opts.hand;
  state.opts = next;
  if (next.hand > previousLimit) refillHand(state);
  return state;
}

export function resetGrowth(state: GameState): GameState {
  state.xp = [0, 0, 0];
  return state;
}

/** Debug/test fixture, never a replacement deck: exact identities/counts are kept. */
export function makeDebugGame(
  sequence: readonly (number | ToolType)[], rng: number | RandomSource, options: Partial<GameOptions> = {},
): GameState {
  const state = createGame(rng, { ...options, tools: options.tools ?? sequence.some(v => typeof v === 'string') });
  const pool = [...state.deck, ...state.hand];
  const hand: Card[] = [];
  for (const value of sequence) {
    if (typeof value === 'number') assertMask(value);
    const index = pool.findIndex((card) => typeof value === 'number'
      ? !card.type && card.v === value : card.type === value);
    if (index < 0) throw new RangeError(`发牌序列超出牌组中的${typeof value === 'number' ? CARD_NAMES[value] : TOOLS[value]?.name}数量`);
    hand.push(pool.splice(index, 1)[0]!);
  }
  state.hand = hand;
  state.deck = pool;
  return state;
}

/** Chinese units with four significant digits. Only decimal trailing zeros vanish. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError('只能格式化有限数字');
  const sign = value < 0 ? '-' : '';
  const n = Math.round(Math.abs(value));
  const units = [
    [1e16, '京'], [1e12, '兆'], [1e8, '亿'], [1e4, '万'],
  ] as const;
  for (const [threshold, suffix] of units) {
    if (n < threshold) continue;
    const part = n / threshold;
    const decimals = Math.max(0, 3 - Math.floor(Math.log10(part)));
    // Round the original integer before division into a Chinese unit. Rounding
    // 1.2345 with toFixed(3) alone can produce 1.234 because of its binary
    // representation; 12345 / 10 is an exact half and rounds correctly.
    const roundingStep = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 3);
    const rounded = Math.round(n / roundingStep) * roundingStep;
    const fixed = (rounded / threshold).toFixed(decimals);
    const clean = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
    return sign + clean + suffix;
  }
  return sign + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Full integer with thousands separators (12,345,678); falls back to Chinese units from 1e12. */
export function formatFull(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError('只能格式化有限数字');
  if (Math.abs(value) >= 1e12) return formatNumber(value);
  const n = Math.round(Math.abs(value));
  return (value < 0 && n ? '-' : '') + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Uses the captured, pre-growth values, so old formulae never change afterwards. */
export function formatFormula(entry: RowEntry, preview = false, formatNumber: (value: number) => string = formatChinese): string {
  const pieces = GEMS.flatMap((gem, index) => (entry.v & gem.bit)
    ? [`${gem.shortName} ${formatNumber(entry.gemValues[index]!)}${index === 0 && entry.effects.some(effect => effect.id === 'hug') ? '（抱红）' : ''}`] : []);
  const base = formatNumber(entry.b);
  const composition = pieces.length > 1 ? `${pieces.join(' + ')} = ${base}`
    : (entry.type || entry.effects.some(effect => effect.id === 'hug')) && pieces.length === 1 ? pieces[0]! : base;
  const reactionTerm = entry.k === 'plain' ? '' : ` × ${REACTION_NAMES[entry.k]} ${formatNumber(entry.cm)}${entry.effects.some(effect => effect.id === 'once') ? '（断一次不算）' : ''}`;
  const rainbowTerm = entry.rainbow > 0
    ? `　彩虹！这回合 ×${CONFIG.rainbowMultiplier}　+${formatNumber(entry.rainbow)}` : '';
  const name = entry.type === 'mirror'
    ? (entry.k === 'plain' && entry.v === 0 ? TOOLS.mirror.name : `${TOOLS.mirror.name}（变成${entry.v === 0 ? '没宝石' : CARD_NAMES[entry.v]}）`)
    : entry.type ? TOOLS[entry.type].name : CARD_NAMES[entry.v];
  let effect = '';
  if (entry.type === 'bag') effect = `　摸 ${TOOLS.bag.draw} 张`;
  if (entry.type === 'lens') effect = `　倍率再 ×${TOOLS.lens.multiplier} → ${formatNumber(entry.m2)}`;
  if (entry.type === 'hammer') effect = `　锤子！这回合 ×${TOOLS.hammer.turnMultiplier}　+${formatNumber(entry.hammer)}`;
  if (entry.type === 'stone') effect = `　三颗宝石各 +${TOOLS.stone.xp} 次`;
  return `${preview ? '预计 ' : ''}${name}：${composition} × 倍率 ${formatNumber(entry.m)}${reactionTerm} = ${formatNumber(entry.dmg)}${rainbowTerm}${effect}`;
}

const formatChinese = (value: number) => formatNumber(value);

/** Hint text is shared by practice and adventure; ordinary cards stay compatible. */
export function formatCardHint(entry: RowEntry): string {
  const name = entry.k === 'plain' ? '' : REACTION_NAMES[entry.k];
  const effect = entry.type === 'bag' ? `摸 ${TOOLS.bag.draw}`
    : entry.type === 'lens' ? `倍率 ×${TOOLS.lens.multiplier}`
    : entry.type === 'hammer' ? `这回合 ×${TOOLS.hammer.turnMultiplier}`
    : entry.type === 'stone' ? `宝石 +${TOOLS.stone.xp}` : '';
  return [name, effect].filter(Boolean).join(' · ');
}

export * from './run';
export * from './save-state';
