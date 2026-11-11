import { writeFileSync } from 'node:fs';
import { runMany, BASE } from './reference/sim.mjs';

function chooserRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rules = { chest: 'bite', soldier: 'wind', bear: 'hug', clock: 'bell', dragon: (monster) => ['hug', 'bite', 'bell'][monster.layer] };
const pool = ['sameDouble', 'firstPlainShun', 'white8', 'rainbow5', 'heart1', 'fastGrow'];
const priority = ['white8', 'firstPlainShun', 'sameDouble', 'fastGrow', 'rainbow5', 'heart1'];
const config = { ...BASE, guardDamage: 1, aware: true, rbAware: true, rules,
  cdOverride: { soldier: 2 }, toughOverride: { soldier: 4 }, loot: 'take', eliteHealFull: true,
  openRelic: true, relicPool: pool };
const random = chooserRandom(0x7632);
const hint = runMany({ ...config, relicPick: (options) => options[Math.floor(random() * options.length)] }, 300);
const plan = runMany({ ...config, bot: 'plan', relicPick: (options) => options.slice().sort((a, b) => priority.indexOf(a) - priority.indexOf(b))[0] }, 60);
const output = { implementation: 'Unmodified supplied sim.mjs with second-version configuration', seedFormula: '1 + i * 7919', hintCount: 300, planCount: 60, hint, plan };
writeFileSync(new URL('reference-paired-results.json', import.meta.url), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output, null, 2));
