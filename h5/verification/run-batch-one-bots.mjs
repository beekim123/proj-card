/** Reproducible simulation against production public commands.
 * Uses unchanged reference DFS for ordering only; actual state always comes from core. */
import { registerHooks } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)){try{return n(s+'.ts',c);}catch{}}return n(s,c);}});
const core=await import('../src/rules/index.ts');
const {BATCH1,PICK_RANDOM,PICK_SMART}=await import('../../../参考/模拟/内容表.mjs');
// Only add exports in memory, leaving supplied simulator unchanged on disk.
const source=readFileSync(new URL('../../../参考/模拟/本体.mjs',import.meta.url),'utf8');
const ref=await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport {plan,hintPick,doWorkshop,pickByPri};').toString('base64'));
const mapRelic=x=>({white:'white8',rainbow:'rainbow5',twice:'twice1'}[x]??x);
function context(r){const g=r.game,m=r.monster;return {
 T:{m:g.m,usedPlain:g.onceUsed,turnDmg:g.turnDmg,prev:g.row.at(-1)?.v??null,chain:[...g.chain],rainbow:g.rainbow,cd:m.countdown,hp:m.hp,broken:m.broken,xp:[...g.xp],rbCount:0,cancels:0,played:g.row.length,toolsPlayed:g.row.filter(c=>c.type).length,prevK:g.row.at(-1)?.k??'plain',wind:m.wind,woundDown:m.woundDown,muted:m.sealed,heal:0,draw:0,drawTool:0},
 mon:{key:m.key,rule:m.rule==='layers'?null:m.rule,layers:m.rule==='layers'?['hug','bite','bell']:null,maxHp:m.maxHp,maxCd:m.maxCountdown},
 RL:Object.fromEntries(r.relics.map(x=>[mapRelic(x),true])),ctx:{hearts:r.hearts,maxHearts:r.maxHearts}
};}
let checkedPlays=0,hintDifferences=0;
function exec(r,index,V){const {T,mon,RL}=context(r);const card=r.game.hand[index];const pred=ref.playOne(T,card,mon,RL,V);const actual=core.playRunCard(r,index);checkedPlays++;
 assert.deepEqual([actual.v,actual.k,actual.damage,r.game.m,r.game.turnDmg,r.monster.hp,r.monster.countdown,r.monster.wind,r.game.xp],[pred.v,pred.k,pred.damage,T.m,T.turnDmg,T.hp,T.cd,T.wind,T.xp]);
 return card.type==='bag'||card.type==='whistle';}
function pick(opts,pri,rng){return ref.pickByPri(opts,pri,rng);}
function workshop(r,V,rng){const cards=r.cards.map(c=>({...c}));const S={id:Math.max(...cards.map(c=>c.id)),shops:[]};ref.doWorkshop(cards,S,V,rng);const op=S.shops[0];if(op==='drop'){const ids=new Set(cards.map(c=>c.id));const removed=r.cards.filter(c=>!ids.has(c.id)).map(c=>c.id);if(removed.length)core.shopDrop(r,removed);else core.shopSkip(r);}else{const added=cards.at(-1);const original=r.cards.find(c=>c.type===added.type&&c.v===added.v&&core.canCopyCard(r,c.id));if(original)core.shopCopy(r,original.id);else core.shopSkip(r);}}
function runOne(seed,V){const r=core.createRun(seed);let turns=0,hits=0;const rng=()=>core.nextRandom(r.game);const P=V.policy;
 for(let guard=0;guard<1000;guard++){
  if(r.phase==='victory'||r.phase==='defeat')return {seed,win:r.phase==='victory',hits,turns,room:r.room,relics:r.relics,deck:r.cards.length};
  if(r.phase==='relic'){const opts=r.relicOptions.map(mapRelic);const chosen=pick(opts,P.relic==='random'?null:P.relicPri,rng);core.chooseRelic(r,opts.indexOf(chosen));continue;}
  if(r.phase==='loot'){if(r.loot.length){const chosen=pick(r.loot,P.loot==='random'?null:P.lootPri,rng);core.chooseLoot(r,r.loot.indexOf(chosen));}else core.skipLoot(r);continue;}
  if(r.phase==='shop'){workshop(r,V,rng);continue;}
  if(r.phase==='doors'){let index;if(P.door==='random')index=Math.floor(rng()*2);else{const n=r.cards.filter(c=>c.type).length;const base=P.shopAfter!=null&&n>=P.shopAfter?['shop',...P.doorPri.filter(x=>x!=='shop')]:P.doorPri;const pri=r.hearts<r.maxHearts&&r.hearts<=(P.healAt??0)?['heal',...base]:base;const score=d=>{const i=pri.indexOf(d.reward);return (i<0?99:i)*10+((P.avoid??[]).includes(d.monster)?1:0);};index=score(r.doors[0])<=score(r.doors[1])?0:1;}core.chooseDoor(r,index);continue;}
  if(V.bot==='plan'){
   for(let tries=0;r.game.hand.length&&tries<30;tries++){const {T,mon,RL,ctx}=context(r);const seq=ref.plan(T,r.game.hand,mon,RL,V,ctx);if(!seq.length)break;let replan=false;for(const id of seq){const i=r.game.hand.findIndex(c=>c.id===id);if(exec(r,i,V)){replan=true;break;}}if(!replan)break;}
  }else{
   for(let plays=0;r.game.hand.length&&plays<60;plays++){const {T,mon,RL,ctx}=context(r);const ri=ref.hintPick(T,r.game.hand,mon,RL,V,ctx);const hinted=core.bestHintCard(r);const hi=hinted===undefined?-1:r.game.hand.findIndex(c=>c.id===hinted);if(hi>=0&&hi!==ri)hintDifferences++;const i=hi>=0?hi:ri;if(i<0)break;exec(r,i,V);}
  }
  const before=r.hearts;const broken=r.monster.broken;core.endRunTurn(r);turns++;if(!broken&&r.hearts<before)hits+=before-r.hearts;
 }
 throw new Error(`Guard exhausted seed ${seed}`);
}
const results={};
for(const [label,bot,policy,n] of [['hintRandom','hint',PICK_RANDOM,300],['planSmart','plan',PICK_SMART,100]]){
 const V={...BATCH1,bot,policy};const t=Date.now();const rows=[];const before=checkedPlays,beforeHints=hintDifferences;
 for(let i=0;i<n;i++){rows.push(runOne(1+i*7919,V));if((i+1)%25===0)console.error(`${label} ${i+1}/${n}`);}
 results[label]={n,win:+(rows.filter(x=>x.win).length/n*100).toFixed(1),hits:+(rows.reduce((s,x)=>s+x.hits,0)/n).toFixed(2),turnsMean:+(rows.reduce((s,x)=>s+x.turns,0)/n).toFixed(2),checkedPlays:checkedPlays-before,hintDifferences:hintDifferences-beforeHints,elapsedMs:Date.now()-t,rows};
 console.log(label,JSON.stringify({...results[label],rows:undefined}));writeFileSync(new URL('./batch-one-bot-results.json',import.meta.url),JSON.stringify(results,null,2));
}
