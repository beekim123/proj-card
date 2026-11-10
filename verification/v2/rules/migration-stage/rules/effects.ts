import { TOOLS } from './config';
import type { Card, GameSnapshot, GemValues, RowEntry } from './types';

export type EffectHook = 'mask' | 'reaction' | 'gemValues' | 'reactionMultiplier' | 'multiplier' | 'rainbowNeed' | 'hammer' | 'afterMonster' | 'growthThresholds' | 'afterCard' | 'afterLayer';
export interface EffectContext {
  state: GameSnapshot;
  card: Card;
  entry: RowEntry;
  xp: GemValues;
  thresholds: readonly [number, number, number];
  need: number;
  draw: number;
  onceUsed: boolean;
}
export interface EffectDefinition {
  id: string;
  name: string;
  text: string;
  hooks: Partial<Record<EffectHook, (context: EffectContext) => void>>;
}
export function markEffect(context: EffectContext, id: string, text: string): void {
  if (!context.entry.effects.some(effect => effect.id === id && effect.text === text)) context.entry.effects.push({ id, text });
}
/** Effects declare their hook and tuning together; settlement knows no tool types. */
export const EFFECTS: Record<string, EffectDefinition> = {
  mirror: { id: 'mirror', ...TOOLS.mirror, hooks: { mask(c) { c.entry.v = c.state.row.length ? 7 - c.state.row.at(-1)!.v : TOOLS.mirror.v; } } },
  hammer: { id: 'hammer', ...TOOLS.hammer, hooks: { hammer(c) { c.entry.hammer = (c.state.turnDmg + c.entry.dmg + c.entry.rainbow) * (TOOLS.hammer.turnMultiplier - 1); markEffect(c, 'hammer', TOOLS.hammer.name); } } },
  lens: { id: 'lens', ...TOOLS.lens, hooks: { afterCard(c) { c.entry.m2 *= TOOLS.lens.multiplier; markEffect(c, 'lens', TOOLS.lens.name); } } },
  stone: { id: 'stone', ...TOOLS.stone, hooks: { afterCard(c) { c.xp = c.xp.map(x => x + TOOLS.stone.xp) as GemValues; markEffect(c, 'stone', TOOLS.stone.name); } } },
  bag: { id: 'bag', ...TOOLS.bag, hooks: { afterCard(c) { c.draw += TOOLS.bag.draw; markEffect(c, 'bag', TOOLS.bag.name); } } },
};
export function applyEffects(ids: readonly string[], hook: EffectHook, context: EffectContext): void {
  for (const id of ids) EFFECTS[id]?.hooks[hook]?.(context);
}
