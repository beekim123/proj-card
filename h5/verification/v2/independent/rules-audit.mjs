import '../typescript-loader.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const r=await import('../../../src/rules/index.ts');
let random=314159;const roll=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/2**32;};
const counts={runs:0,plays:0,previews:0,undo:0,end:0,saveRoundTrips:0,loot:0,hints:0,victory:0,defeat:0};
const seen={relic:new Set(),rule:new Set(),effect:new Set()};
const clone=x=>JSON.parse(JSON.stringify(x));
for(let seed=1;seed<=240;seed++) {
 let a=r.createRun(seed),b=r.decodeRunSave(r.encodeRunSave(a)).state;assert.deepEqual(b,a);counts.saveRoundTrips++;
 const index=seed%3;r.chooseRelic(a,index);r.chooseRelic(b,index);seen.relic.add(a.relic);counts.runs++;
 for(let step=0;step<180 && ['battle','loot'].includes(a.phase);step++) {
  assert.deepEqual(a,b);
  const raw=r.encodeRunSave(b);const loaded=r.decodeRunSave(raw);assert.equal(loaded.reason,'ok',`seed ${seed}, step ${step}`);assert.deepEqual(loaded.state,b);b=loaded.state;counts.saveRoundTrips++;
  if(a.phase==='loot') {if(roll()<.2){r.skipLoot(a);r.skipLoot(b)}else {const i=Math.floor(roll()*a.loot.length);r.chooseLoot(a,i);r.chooseLoot(b,i)}counts.loot++;continue;}
  const rule=r.currentRule(a);if(rule)seen.rule.add(rule);
  const before=clone(a),beforeJson=JSON.stringify(a);
  const previews=a.game.hand.map(card=>{counts.previews++;return r.previewRunCard(a,card)});
  const warnings=a.game.hand.map(card=>r.cardWarnings(a,card));
  const hint=r.bestHintCard(a);counts.hints++;r.rainbowStatus(a);assert.equal(JSON.stringify(a),beforeJson,'pure query changed run');
  if(hint!==undefined){const hi=a.game.hand.findIndex(c=>c.id===hint);assert(hi>=0);assert(!warnings[hi].attack);assert.notEqual(previews[hi].k,'plain');}
  const choice=roll();
  if(choice<.10 && a.hist.length) {r.undoRun(a);r.undoRun(b);counts.undo++;}
  else if(choice<.20||a.game.hand.length===0||a.monster.broken) {const hearts=a.hearts;const wasBroken=a.monster.broken;r.endRunTurn(a);r.endRunTurn(b);counts.end++;if(!wasBroken)assert(hearts-a.hearts<=1,'multiple heart loss in one end turn');}
  else {const i=choice<.60&&hint!==undefined?a.game.hand.findIndex(c=>c.id===hint):Math.floor(roll()*a.game.hand.length);const pa=r.playRunCard(a,i),pb=r.playRunCard(b,i);counts.plays++;assert.deepEqual(pa,previews[i]);assert.deepEqual(pa,pb);assert.equal(a.hearts,before.hearts,'mid-turn changed hearts');assert(a.monster.countdown>=0);assert.equal(a.game.turnDmg,a.game.row.reduce((sum,e)=>sum+e.damage,0));for(const e of pa.effects)seen.effect.add(e.id);
   const after=clone(a);assert(r.undoRun(a));assert.deepEqual(a,before,'undo did not restore exact previous state');r.playRunCard(a,i);assert.deepEqual(a,after,'replay after undo diverged');counts.undo++;
  }
 }
 assert.deepEqual(a,b);if(a.phase==='victory')counts.victory++;if(a.phase==='defeat')counts.defeat++;
}
const output={passed:true,scope:'Independent deterministic property audit using Node TypeScript transform. Not Vitest/typecheck/build, and not a balance benchmark.',counts,coverage:Object.fromEntries(Object.entries(seen).map(([k,v])=>[k,[...v].sort()]))};
fs.writeFileSync(new URL('./rules-audit-results.json',import.meta.url),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
