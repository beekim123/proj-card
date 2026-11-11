// Reproduce archived acceptance policies without modifying the frozen H5.
// Original parallel simulator is deliberately run serially (one computing worker).
import {install} from './register.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
install();
const reference=process.env.GEMCARD_REFERENCE_SIM??'/Users/key_/Desktop/CURRGO/game/design/存档/新卡牌旧包-2026-11-10/本体第1批/代码包/参考/模拟';
const root=process.cwd();
fs.mkdirSync('tests/historical',{recursive:true});fs.mkdirSync('artifacts/historical',{recursive:true});
const real=await import('../../h5/src/rules/index.ts');
const mutating=new Set(['chooseRelic','chooseLoot','skipLoot','chooseDoor','shopDrop','shopCopy','shopSkip','playRunCard','endRunTurn']);
const traces=[];let current=null;
function flush(){if(!current)return;const file=`historical-${String(traces.length).padStart(3,'0')}.json`;fs.writeFileSync('tests/historical/'+file,JSON.stringify({seed:current.seed,actions:current.actions,state:current.run}));traces.push(file);current=null;}
const core=Object.fromEntries(Object.entries(real).map(([name,value])=>[name,typeof value==='function'?(...args)=>{
 const result=value(...args);
 if(name==='createRun'){flush();current={seed:args[0],run:result,actions:[]};}
 else if(current&&name==='nextRandom')current.actions.push({name:'next_random',args:[]});
 else if(current&&mutating.has(name))current.actions.push({name:name.replace(/[A-Z]/g,c=>'_'+c.toLowerCase()),args:args.slice(1)});
 return result;
}:value]));
globalThis.__gemcardHistoricalCore=core;
let source=fs.readFileSync('h5/verification/run-batch-one-bots.mjs','utf8');
source=source.replace("const core=await import('../src/rules/index.ts');",'const core=globalThis.__gemcardHistoricalCore;');
for(const file of ['内容表.mjs','本体.mjs'])source=source.replaceAll('../../../参考/模拟/'+file,pathToFileURL(path.join(reference,file)).href);
source=source.replaceAll('./batch-one-bot-results.json',pathToFileURL(path.join(root,'artifacts/historical/production-results.json')).href);
await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));flush();
fs.writeFileSync('tests/historical-index.json',JSON.stringify({traces},null,2));
const oldProduction=JSON.parse(fs.readFileSync('h5/verification/batch-one-bot-results.json','utf8'));
const production=JSON.parse(fs.readFileSync('artifacts/historical/production-results.json','utf8'));
const simulator=await import(pathToFileURL(path.join(reference,'本体.mjs')));
const {BATCH1,PICK_RANDOM,PICK_SMART}=await import(pathToFileURL(path.join(reference,'内容表.mjs')));
const oldReference=JSON.parse(fs.readFileSync('h5/verification/batch-one-reference-results.json','utf8'));
// The archived runPar used four interleaved seed partitions and flattened its
// results by partition. Preserve that summation order without spawning workers:
// two original means sit exactly at a decimal rounding midpoint.
const referencePartitions=4;
const result={reference_directory:reference,computing_workers:1,reference_aggregation_partitions:referencePartitions,modes:{},failures:[]};
function withoutTime(value){if(Array.isArray(value))return value.map(withoutTime);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>k!=='elapsedMs').map(([k,v])=>[k,withoutTime(v)]));return value;}
for(const [label,bot,policy,n]of [['hintRandom','hint',PICK_RANDOM,300],['planSmart','plan',PICK_SMART,100]]){
 const seeds=[];
 for(let partition=0;partition<referencePartitions;partition++)for(let index=partition;index<n;index+=referencePartitions)seeds.push(1+index*7919);
 const actual=simulator.summarize(simulator.runSeeds({...BATCH1,bot,policy},seeds),{...BATCH1,bot,policy});
 const productionExact=JSON.stringify(withoutTime(production[label]))===JSON.stringify(withoutTime(oldProduction[label]));
 let referenceExact=true;try{assert.deepEqual(withoutTime(actual),withoutTime(oldReference[label]));}catch{referenceExact=false;}
 const difference=production[label].win-actual.win;
 result.modes[label]={n,production_win:production[label].win,reference_win:actual.win,difference_percentage_points:difference,within_original_10_point_limit:Math.abs(difference)<=10,production_fixed_seed_rows_exact:productionExact,reference_statistics_exact:referenceExact,reference:actual};
 if(!productionExact||!referenceExact||Math.abs(difference)>10)result.failures.push(label);
 console.log('HISTORICAL',label,JSON.stringify(result.modes[label]));
}
fs.writeFileSync('artifacts/historical/report.json',JSON.stringify(result,null,2));
if(result.failures.length)process.exitCode=1;
