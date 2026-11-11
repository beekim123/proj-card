import { install } from './register.mjs';
import fs from 'node:fs';
install();
const R=await import('../../h5/src/rules/index.ts');
const S=await import('../../h5/src/rules/save-state.ts');
const {landscape}=await import('../../h5/src/layout/landscape.ts');
const {portrait}=await import('../../h5/src/layout/portrait.ts');
fs.mkdirSync('tests/golden',{recursive:true});
fs.writeFileSync('tests/layout-base.json',JSON.stringify({landscape,portrait}));
const rngSamples=[1,1979,4294967295].map(seed=>{const rng=R.seededRng(seed);const values=Array.from({length:1000},()=>rng());return {seed,values,u32:values.map(v=>v*4294967296)};});
fs.writeFileSync('tests/rng.json',JSON.stringify(rngSamples));
const summary={version:1,adventures:0,practice:0,steps:0,victory:0,defeat:0,coverage:{},traces:[]};
function action(name,args=[]){summary.coverage[name]=(summary.coverage[name]??0)+1;return {name,args};}
function floatBits(value,path='$',out={}){if(typeof value==='number'&&(!Number.isInteger(value)||Math.abs(value)>=2**53)){const b=Buffer.allocUnsafe(8);b.writeDoubleLE(value);out[path]=b.toString('hex');}else if(Array.isArray(value))value.forEach((v,i)=>floatBits(v,path+'['+i+']',out));else if(value&&typeof value==='object')for(const [key,v]of Object.entries(value))floatBits(v,path+'.'+key,out);return out;}
for(let i=0;i<300;i++){
  const seed=(1+i*7919)>>>0,policy=R.seededRng(seed^0xa5a5a5a5),run=R.createRun(seed),steps=[];
  const save=(a)=>{steps.push({action:a,state:JSON.parse(JSON.stringify(run)),float64:floatBits(run),save:S.encodeRunSave(run)});summary.steps++;};
  save(action('create_run',[seed]));
  let count=0,plays=0;
  while(!run.result){
    if(++count>2000)throw Error('nonterminal '+seed);
    let name,args=[];
    if(run.phase==='relic'){name='choose_relic';args=[Math.floor(policy()*run.relicOptions.length)];}
    else if(run.phase==='loot'){if(policy()<.22||!run.loot.length)name='skip_loot';else{name='choose_loot';args=[Math.floor(policy()*run.loot.length)];}}
    else if(run.phase==='doors'){name='choose_door';args=[Math.floor(policy()*2)];}
    else if(run.phase==='shop'){
      const mode=policy(),ss=R.shopState(run);
      if(mode<.3&&ss.canDrop){name='shop_drop';args=[[run.cards[Math.floor(policy()*run.cards.length)].id]];}
      else if(mode<.65&&ss.canCopy){name='shop_copy';const choices=run.cards.filter(c=>R.canCopyCard(run,c.id));args=[choices[Math.floor(policy()*choices.length)].id];}
      else name='shop_skip';
    }else if(run.game.hist.length&&policy()<.018){name='undo_run';}
    else if(!run.game.hand.length||plays>=18||(run.game.row.length>0&&policy()<.055)||i%29===0){name='end_run_turn';plays=0;}
    else{
      name='play_run_card';let choices=run.game.hand.map((c,index)=>({index,p:R.previewRunCard(run,c),safe:!R.cardWarnings(run,c).attack}));
      if(policy()<.86){const safe=choices.filter(c=>c.safe);if(safe.length)choices=safe;choices.sort((a,b)=>b.p.m2-a.p.m2||b.p.damage-a.p.damage||a.index-b.index);choices=choices.slice(0,Math.min(2,choices.length));}
      args=[choices[Math.floor(policy()*choices.length)].index];plays++;
    }
    R[name.replace(/_([a-z])/g,(_,c)=>c.toUpperCase())](run,...args);save(action(name,args));
  }
  summary.adventures++;summary[run.phase]++;
  const file=`adventure-${String(i).padStart(3,'0')}.json`;
  fs.writeFileSync('tests/golden/'+file,JSON.stringify({kind:'adventure',seed,steps}));summary.traces.push(file);
  if(i%25===24)console.log('golden',i+1,'adventures',summary.steps,'steps',summary.victory,'wins');
}
for(const hand of [6,7,8])for(const grow of [false,true])for(const tools of [false,true]){
 const seed=1979+hand*10+(grow?2:0)+(tools?1:0),opts={hand,grow,tools},state=R.createGame(seed,opts),policy=R.seededRng(seed),steps=[];
 const save=a=>{steps.push({action:a,state:JSON.parse(JSON.stringify(state)),float64:floatBits(state),save:null});summary.steps++;};
 save(action('create_game',[seed,opts]));
 for(let n=0;n<100;n++){
  let name,args=[];
  if(n%9===4&&state.hist.length)name='undo';
  else if(n%8===7||!state.hand.length)name='end_turn';
  else{name='play_card';args=[Math.floor(policy()*state.hand.length)];}
  R[name.replace(/_([a-z])/g,(_,c)=>c.toUpperCase())](state,...args);save(action(name,args));
 }
 const file=`practice-${hand}-${+grow}-${+tools}.json`;fs.writeFileSync('tests/golden/'+file,JSON.stringify({kind:'practice',seed,steps}));summary.practice++;summary.traces.push(file);
}
fs.writeFileSync('tests/golden-index.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify({...summary,traces:summary.traces.length}));
