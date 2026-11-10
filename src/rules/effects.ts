import { CONFIG, TOOLS } from './config';
import { MONSTERS, RELICS, RULES, RUN } from './run-config';
import type { Card, GameSnapshot, GemValues, RowEntry } from './types';
import type { MonsterState, RelicId, RuleId, RunState } from './run-types';

export type EffectHook = 'mask' | 'reaction' | 'gemValues' | 'reactionMultiplier' | 'multiplier' | 'rainbowNeed' | 'rainbow' | 'hammer' | 'afterMonster' | 'growthThresholds' | 'afterCard' | 'afterGrowth' | 'afterLayer';
export type LifecycleHook = 'runStart' | 'fightStart' | 'turnStart' | 'turnEnd' | 'fightWon';
export interface EffectContext {
  state: GameSnapshot;
  card: Card;
  entry: RowEntry;
  xp: GemValues;
  thresholds: readonly [number, number, number];
  need: number;
  draw: number;
  onceUsed: boolean;
  monster?: MonsterState;
  monsterWasBroken?: boolean;
}
export interface EffectDefinition {
  id: string;
  name: string;
  text: string;
  hooks: Partial<Record<EffectHook, (context: EffectContext) => void>>;
  lifecycle?: Partial<Record<LifecycleHook, (run: RunState) => void>>;
  ruleFor?: (monster: MonsterState) => RuleId;
}
export function markEffect(context: EffectContext, id: string, text: string): void {
  if (!context.entry.effects.some(effect => effect.id === id && effect.text === text)) context.entry.effects.push({ id, text });
}
const liveMonster = (c: EffectContext): MonsterState | undefined => c.monster && !c.monsterWasBroken && !c.monster.broken ? c.monster : undefined;
const carries = (c: EffectContext, index: number): boolean => (c.entry.v & (1 << index)) !== 0;
export function monsterLayer(monster: Pick<MonsterState, 'hp' | 'maxHp'>): 1 | 2 | 3 {
  return monster.hp > monster.maxHp * 2 / 3 ? 1 : monster.hp > monster.maxHp / 3 ? 2 : 3;
}

/** New effects only extend this registry; the settlement pipeline has no named-effect branches. */
export const EFFECTS: Record<string, EffectDefinition> = {
  mirror: { id: 'mirror', ...TOOLS.mirror, hooks: { mask(c) { c.entry.v = c.state.row.length ? 7 - c.state.row.at(-1)!.v : TOOLS.mirror.v; markEffect(c, 'mirror', TOOLS.mirror.name); } } },
  hammer: { id: 'hammer', ...TOOLS.hammer, hooks: { hammer(c) { c.entry.hammer = (c.state.turnDmg + c.entry.dmg + c.entry.rainbow) * (TOOLS.hammer.turnMultiplier - 1); markEffect(c, 'hammer', TOOLS.hammer.name); } } },
  lens: { id: 'lens', ...TOOLS.lens, hooks: { afterCard(c) { c.entry.m2 *= TOOLS.lens.multiplier; markEffect(c, 'lens', TOOLS.lens.name); } } },
  stone: { id: 'stone', ...TOOLS.stone, hooks: { afterCard(c) { c.xp = c.xp.map(x => x + TOOLS.stone.xp) as GemValues; markEffect(c, 'stone', TOOLS.stone.name); } } },
  bag: { id: 'bag', ...TOOLS.bag, hooks: { afterCard(c) { c.draw += TOOLS.bag.draw; markEffect(c, 'bag', TOOLS.bag.name); } } },
  bite: { id: 'bite', ...RULES.bite, hooks: { afterMonster(c) {
    const m = liveMonster(c); if (m && carries(c, RULES.bite.gem)) { m.countdown = Math.max(0, m.countdown + RULES.bite.countdown); markEffect(c, 'bite', RULES.bite.name); }
  } } },
  hug: { id: 'hug', ...RULES.hug, hooks: { gemValues(c) {
    if (liveMonster(c) && carries(c, RULES.hug.gem)) { c.entry.gemValues[RULES.hug.gem] = 0; markEffect(c, 'hug', RULES.hug.name); }
  } } },
  wind: { id: 'wind', ...RULES.wind, hooks: { afterMonster(c) {
    const m = liveMonster(c);
    if (!m || m.woundDown || m.wind <= 0 || !carries(c, RULES.wind.gem)) return;
    m.wind -= 1; markEffect(c, 'wind', '松发条');
    if (m.wind === 0) { m.countdown = m.maxCountdown; m.woundDown = true; markEffect(c, 'wind', '发条松完'); }
  } }, lifecycle: {
    fightStart(run) { const m = run.monster; m.wind = m.maxWind = MONSTERS.soldier.wind; m.countdown = m.maxCountdown = MONSTERS.soldier.countdown; },
    turnStart(run) { const m = run.monster; if (m.woundDown) { m.wind = m.maxWind; m.woundDown = false; } },
  } },
  bell: { id: 'bell', ...RULES.bell, hooks: { afterMonster(c) {
    const m = liveMonster(c); if (m && c.entry.k === 'white') { m.countdown = Math.max(0, m.countdown + RULES.bell.countdown); markEffect(c, 'bell', RULES.bell.name); }
  } } },
  layers: { id: 'layers', ...RULES.layers, ruleFor: m => MONSTERS.dragon.rules[m.layer - 1]!, hooks: { afterLayer(c) {
    if (!c.monster || c.monsterWasBroken) return;
    const layer = monsterLayer(c.monster);
    if (layer !== c.monster.layer) { c.monster.layer = layer; markEffect(c, 'layers', '换规矩'); }
  } }, lifecycle: { fightStart(run) { run.monster.layer = monsterLayer(run.monster); } } },
  same: { id: 'same', ...RELICS.same, hooks: { multiplier(c) {
    if (c.entry.k === 'same') { c.entry.m2 = c.state.m * CONFIG.multiplierDouble; markEffect(c, 'same', RELICS.same.name); }
  } } },
  once: { id: 'once', ...RELICS.once, hooks: { reaction(c) {
    if (c.state.row.length > 0 && c.entry.k === 'plain' && !c.onceUsed) { c.entry.k = 'shun'; c.onceUsed = true; markEffect(c, 'once', RELICS.once.name); }
  } } },
  white: { id: 'white', ...RELICS.white, hooks: { reactionMultiplier(c) {
    if (c.entry.k === 'white') { c.entry.cm = RELICS.white.whiteMultiplier; markEffect(c, 'white', RELICS.white.name); }
  } } },
  rainbow: { id: 'rainbow', ...RELICS.rainbow, hooks: {
    rainbowNeed(c) { c.need = RELICS.rainbow.rainbowColors; },
    rainbow(c) { if (c.entry.rb) markEffect(c, 'rainbow', RELICS.rainbow.name); },
  } },
  heart: { id: 'heart', ...RELICS.heart, hooks: {}, lifecycle: {
    runStart(run) { run.maxHearts += RELICS.heart.hearts; run.hearts = run.maxHearts; },
  } },
  grow: { id: 'grow', ...RELICS.grow, hooks: {
    growthThresholds(c) { c.thresholds = RELICS.grow.formAt; },
    afterGrowth(c) { if (c.entry.grown.length) markEffect(c, 'grow', RELICS.grow.name); },
  } },
  combat: { id: 'combat', name: '一仗', text: '回合结束结算，打赢精英心回满。', hooks: {}, lifecycle: {
    turnEnd(run) { const m = run.monster; m.countdown -= 1; if (m.countdown <= 0) { run.hearts = Math.max(0, run.hearts - 1); m.countdown = m.maxCountdown; } },
    fightWon(run) { if (RUN.fights[run.fight - 1]!.healFull) run.hearts = run.maxHearts; },
  } },
};
export function activeRelics(game: Pick<GameSnapshot, 'relic' | 'relics'>): RelicId[] {
  return game.relics ? [...new Set(game.relics)] : game.relic ? [game.relic] : [];
}
export function activeMonsterRule(monster: MonsterState): RuleId | undefined {
  if (monster.broken) return undefined;
  return EFFECTS[monster.rule]?.ruleFor?.(monster) ?? monster.rule as RuleId;
}
export function effectIds(state: GameSnapshot, card: Card, monster?: MonsterState): string[] {
  const rule = monster ? activeMonsterRule(monster) : undefined;
  return [...new Set([...(card.type ? [card.type] : []), ...activeRelics(state), ...(rule ? [rule] : []), ...(monster && !monster.broken ? [monster.rule] : [])])];
}
export function applyEffects(ids: readonly string[], hook: EffectHook, context: EffectContext): void {
  for (const id of ids) EFFECTS[id]?.hooks[hook]?.(context);
}
export function applyLifecycle(run: RunState, hook: LifecycleHook): void {
  const ids = [...new Set(['combat', ...run.relics, run.monster.rule])];
  for (const id of ids) EFFECTS[id]?.lifecycle?.[hook]?.(run);
}
export function growthThresholds(source: (Pick<GameSnapshot, 'relic' | 'relics'>) | RunState): readonly [number, number, number] {
  const state = 'game' in source ? source.game : source;
  const c = { thresholds: CONFIG.formAt } as EffectContext;
  applyEffects(activeRelics(state), 'growthThresholds', c);
  return c.thresholds;
}
export function rainbowNeed(state: GameSnapshot): 5 | 6 {
  const c = { need: CONFIG.rainbowColors.length } as EffectContext;
  applyEffects(activeRelics(state), 'rainbowNeed', c);
  return c.need as 5 | 6;
}
