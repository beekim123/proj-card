import { runMany, BASE } from './sim.mjs';
const R = { chest:'bite', soldier:'wind', bear:'hug', clock:'bell', dragon:(M)=>['hug','bite','bell'][M.layer] };
const POOL = ['sameDouble','firstPlainShun','white8','rainbow5','heart1','fastGrow'];
const PLANPRI = ['white8','firstPlainShun','sameDouble','fastGrow','rainbow5','heart1'];
const V2 = { ...BASE, guardDamage:1, aware:true, rbAware:true, rules:R, cdOverride:{soldier:2}, toughOverride:{soldier:4},
  loot:'take', eliteHealFull:true, openRelic:true, relicPool:POOL };
const rnd=(o)=>o[Math.floor(Math.random()*o.length)], best=(o)=>o.slice().sort((a,b)=>PLANPRI.indexOf(a)-PLANPRI.indexOf(b))[0];
const out=(name,r)=>console.log(name.padEnd(24), JSON.stringify(r));
const H=(V)=>({...V, relicPick:rnd}), P=(V)=>({...V, bot:'plan', relicPick:best});
console.log('== behaviour: v1 vs v2 planner ==');
out('v1 plan', runMany({...BASE, bot:'plan', loot:'smart'}, 60).beh);
out('v2 plan', runMany(P(V2), 60).beh);
console.log('== v2 full ==');
out('v2 random', runMany({...H(V2), bot:'random'}, 300));
out('v2 hint', runMany(H(V2), 300));
out('v2 plan', runMany(P(V2), 80));
console.log('== v2 minus one piece (hint / plan) ==');
for (const [name, V] of [
  ['no monster rules', {...V2, rules:{}, toughOverride:{}, cdOverride:{}}],
  ['no opening relic', {...V2, openRelic:false}],
  ['loot as v1 (skip=heal)', {...V2, loot:'smart', eliteHealFull:false}],
]) { out(name+' hint', runMany(H(V), 300)); out(name+' plan', runMany(P(V), 50)); }
console.log('== each relic forced (hint / plan) ==');
for (const rel of POOL) { const V={...V2, openRelic:false, relics:[rel]}; const a=runMany(H(V),300), b=runMany(P(V),50);
  console.log(rel.padEnd(16), 'hint', a.win+'%', 'rb', a.rbRuns+'%', '| plan', b.win+'%', 'hits', b.hits, 'best', b.best); }
