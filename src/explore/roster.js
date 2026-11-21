// Variant bodies inherit an existing encounter slot, its HP share and countdown.
// No draw from the battle RNG; routing through the forest cannot reroll rewards.
export const variants = {
  veko: { name: '维柯', model: 'badom' },
  reya: { name: '芮娅', model: 'tiko' },
  oru: { name: '奥鲁', model: 'badom' },
};
export function inhabit(kind, seed, fight, index) {
  if (kind === 'elite' || fight % 4 === 0) return kind;
  const band = ((seed >>> 0) + fight - 1 + index * 4) % 8;
  if (kind === 'tiko') return band === 3 || band === 7 ? 'reya' : kind;
  return band === 1 || band === 5 ? 'veko' : band === 2 || band === 6 ? 'oru' : kind;
}
export const traitOf = (kind) => variants[kind]?.model ?? kind;
