import { preview, segmentDamage } from '../rules.js';

// Score the next card with the same target order, immunities and turn-start lamps.
// Never roll a crit while planning. Uses batches so huge multipliers stay O(cards).
function usefulDamage(b, cards) {
  const hp = b.monsters.map(mon => mon.hp);
  let target = b.target;
  let total = 0;
  for (const batch of preview(b, cards).batches) {
    let remaining = batch.count;
    while (remaining > 0) {
      if (hp[target] <= 0) target = hp.findIndex(value => value > 0);
      if (target < 0) return total;
      const perShot = segmentDamage({ value: batch.raw, white: batch.white, pure: batch.pure }, b.monsters[target].kind, b.lamps);
      if (perShot <= 0) break;
      const shotsNeeded = Math.ceil(hp[target] / perShot);
      const used = Math.min(remaining, shotsNeeded);
      total += Math.min(hp[target], perShot * used);
      hp[target] = Math.max(0, hp[target] - perShot * used);
      remaining -= used;
    }
  }
  return total;
}

export function autoCardIndex(b) {
  let best = -1;
  let bestDamage = -1;
  for (let i = 0; i < b.hand.length; i++) {
    if (b.hand[i].instant) continue;
    const damage = usefulDamage(b, [...b.line, b.hand[i]]);
    if (damage > bestDamage) {
      bestDamage = damage;
      best = i;
    }
  }
  return best;
}
