/** DOM simulation only. No browser rendering, animation fidelity, FPS or real device claims. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const {Window}=await import(process.env.GEMCARD_DOM_MODULE || pathToFileURL(path.resolve(ROOT,'../qa-tools/node_modules/happy-dom/lib/index.js')).href);
const output=path.join(ROOT,'verification/full');
const bundled=await build({stdin:{contents:"export { GameUI } from './src/ui/game';export { loadArtAssets } from './src/art/store';export {formatFormula} from './src/rules';",resolveDir:ROOT,loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,loader:{'.css':'empty'}});
const file=path.join(output,'.dom-game-bundle.mjs');await fs.writeFile(file,bundled.outputFiles[0].text);
const nativeSetTimeout=globalThis.setTimeout,nativeClearTimeout=globalThis.clearTimeout;
const wait=(ms=45)=>new Promise(r=>nativeSetTimeout(r,ms));
let timerId=0;const timers=new Map();
function accelerated(fn,ms,...args){const id=++timerId;const timer=nativeSetTimeout(()=>{timers.delete(id);fn(...args);},Math.min(5,Math.max(0,Number(ms)/500)));timers.set(id,timer);return id;}
function cancel(id){nativeClearTimeout(timers.get(id));timers.delete(id);}
let current;
const capturedErrors=[];
process.on('uncaughtException',e=>capturedErrors.push(String(e.stack||e)));
process.on('unhandledRejection',e=>capturedErrors.push(String(e?.stack||e)));
async function mount({debug=true,saved={},reload=false,width=390,height=844}={}){
 if(current){current.store.dispose();for(const id of timers.keys())cancel(id);await current.window.happyDOM.abort();}
 const window=new Window({url:'http://localhost/'+(debug?'?debug=1&seed=741':''),width,height});
 for(const name of ['window','document','DOMParser','HTMLElement','Element','SVGElement','SVGSVGElement','HTMLButtonElement','HTMLInputElement','KeyboardEvent','PointerEvent','Event','localStorage'])globalThis[name]=name==='window'?window:window[name];
 globalThis.location=window.location;
 window.setTimeout=globalThis.setTimeout=accelerated;window.clearTimeout=globalThis.clearTimeout=cancel;
 globalThis.requestAnimationFrame=window.requestAnimationFrame=fn=>accelerated(()=>fn(performance.now()+1000),1);
 globalThis.cancelAnimationFrame=window.cancelAnimationFrame=cancel;
 Object.defineProperty(window.performance,'getEntriesByType',{configurable:true,value:t=>t==='navigation'?[{type:reload?'reload':'navigate'}]:[]});
 globalThis.performance=window.performance;
 window.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:t=>({width:t.length*14})});
 window.Element.prototype.animate=function(){let finish;const animation={onfinish:null,oncancel:null,finished:new Promise(r=>finish=r),cancel(){this.oncancel?.();finish();}};accelerated(()=>{animation.onfinish?.();finish();},1);return animation;};
 const captured=new Set();window.Element.prototype.setPointerCapture=id=>captured.add(id);window.Element.prototype.hasPointerCapture=id=>captured.has(id);window.Element.prototype.releasePointerCapture=id=>captured.delete(id);
 window.HTMLElement.prototype.getBoundingClientRect=function(){const viewport=this.classList.contains('game-viewport');const x=parseFloat(this.style.left)||0,y=parseFloat(this.style.top)||0,w=viewport?window.innerWidth:parseFloat(this.style.width)||0,h=viewport?window.innerHeight:parseFloat(this.style.height)||0;return{x,y,left:x,top:y,right:x+w,bottom:y+h,width:w,height:h,toJSON(){return this;}};};
 for(const [key,value]of Object.entries(saved))window.localStorage.setItem(key,value);
 const module=await import(pathToFileURL(file).href);
 const store=await module.loadArtAssets({baseUrl:'http://localhost/',fetcher:async url=>{try{return new Response(await fs.readFile(path.join(ROOT,'public',new URL(String(url),'http://localhost/').pathname)),{status:200});}catch{return new Response('',{status:404});}}});
 const root=window.document.createElement('div');window.document.body.append(root);new module.GameUI(root,store);
 current={window,store,root,api:window.__gemcard,initialText:root.textContent,module};await wait();return current;
}
function saved(){return Object.fromEntries(['gemcard.run','gemcard.records','gemcard.settings'].filter(k=>localStorage.getItem(k)!==null).map(k=>[k,localStorage.getItem(k)]));}
const results=[];
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS',name);}catch(e){results.push({name,status:'FAIL',error:String(e.stack||e)});console.log('FAIL',name,String(e.message||e));}}
await test('Normal page has no debug API or testing controls',async()=>{const c=await mount({debug:false});assert.equal(c.window.__gemcard,undefined);assert.equal(c.root.querySelectorAll('[data-debug-case]').length,0);assert(c.root.textContent.includes('开始冒险'));});
await test('Home starts adventure with seven cards, three hearts and persistent run',async()=>{const{api,root}=await mount();api.startAdventure();await wait();assert.equal(api.runSnapshot().phase,'battle');assert.equal(api.runSnapshot().hearts,3);assert.equal(api.snapshot().hand.length,7);assert(localStorage.getItem('gemcard.run'));assert.equal(root.querySelectorAll('.progress-node').length,6);});
await test('Play and undo round-trip both adventure and RNG state',async()=>{const{api}=current;api.dealCards([1,'mirror',1]);const before=api.runSnapshot();api.play(0);api.play(0);api.undo();api.undo();assert.deepEqual(api.runSnapshot(),before);});
await test('Refresh reload automatically resumes exact battle state',async()=>{current.api.dealCards([1,'lens']);current.api.play(0);const before=current.api.runSnapshot();const values=saved();const{api}=await mount({saved:values,reload:true});assert.equal(api.screen(),'adventure');assert.deepEqual(api.runSnapshot(),before);});
await test('Fresh open with a save shows home and Continue preserves exact state',async()=>{const before=current.api.runSnapshot();const{api,root}=await mount({saved:saved()});assert.equal(api.screen(),'home');assert(root.textContent.includes('继续这局'));api.resume();assert.deepEqual(api.runSnapshot(),before);});
await test('All fourteen authored scenarios render expected damage and multiplier',async()=>{const {api,root}=await mount();api.practice();const data=[[2,300,6],[2,1200,8],[3,3400,8],[7,443600,128],[6,337000,128],[2,2100,4],[2,3000,4],[1,0,2],[2,300,4],[3,4100,8],[2,600,4],[2,1200,3],[2,300,3],[6,40100,64]];for(let n=1;n<=14;n++){api.scenario(n);const[count,total,m]=data[n-1];for(let i=0;i<count;i++){api.play(0);assert.equal(root.querySelector('.formula').textContent,current.module.formatFormula(api.snapshot().row.at(-1)));}await wait();assert.equal(api.snapshot().turnDmg,total,'case '+n);assert.equal(api.snapshot().m,m,'case '+n);assert.equal(Number(root.querySelector('.turn-damage').dataset.value),total,'render '+n);assert.equal(root.querySelectorAll('.row-card').length,count,'row '+n);}});
await test('Practice settings switch 6/7/8 hands, growth and five extra cards',async()=>{const{api,root}=await mount();api.practice();root.querySelector('[data-action="settings"]').click();const select=(label,value)=>{const row=[...root.querySelectorAll('.setting-row')].find(n=>n.querySelector('span')?.textContent===label);assert(row,label);const button=[...row.querySelectorAll('button')].find(n=>n.textContent===value);assert(button,value);button.click();};for(const n of[6,7,8]){select('手牌',String(n));assert.equal(api.snapshot().opts.hand,n);assert.equal(api.snapshot().hand.length,n);}select('额外牌','每种 1 张');assert.equal(api.snapshot().opts.tools,true);const state=api.snapshot();assert.equal([...state.deck,...state.hand,...state.row,...state.discard].filter(c=>c.type).length,5);select('成长','关');assert.equal(api.snapshot().opts.grow,false);select('成长','开');assert.equal(api.snapshot().opts.grow,true);});
await test('Rapid eight plays stay accepted and overkill continues after breaking',async()=>{const{api,root}=await mount();api.startAdventure();api.dealCards([1,3,2,6,4,5,'hammer','lens']);api.setMonsterHp(1);api.play(0);const first=api.runSnapshot().monster.overkill;for(let i=1;i<8;i++)api.play(0);assert.equal(api.snapshot().row.length,8);assert(api.runSnapshot().monster.overkill>first);assert.equal(root.querySelector('[data-action="end-turn"]').textContent,'拿战利品');await wait();});
await test('All six battles, elite hand upgrade, loot, boss and record settlement',async()=>{const{api,root}=await mount();api.startAdventure();for(let fight=1;fight<=6;fight++){assert.equal(api.runSnapshot().fight,fight);api.dealCards([1]);api.setMonsterHp(1);api.play(0);assert(api.runSnapshot().monster.broken);api.end();await wait(90);if(fight<6){assert.equal(api.runSnapshot().phase,'loot');assert.equal(root.querySelectorAll('.loot-card').length,4);if(fight===3)assert.equal(api.runSnapshot().handLimit,8);api.selectLoot(0);assert.equal(api.runSnapshot().phase,'loot');api.selectLoot(0);await wait();}else assert.equal(api.runSnapshot().phase,'victory');}assert(root.textContent.includes('胜利'));assert.equal(api.records().wins,1);assert.equal(api.records().played,1);assert.equal(localStorage.getItem('gemcard.run'),null);api.goHome();assert(root.textContent.includes('通关 1 次'));});
await test('Loot persists on refresh and number/Enter keyboard takes one card',async()=>{let{api}=await mount();api.startAdventure();api.dealCards([1]);api.setMonsterHp(1);api.play(0);api.end();await wait(90);const before=api.runSnapshot();({api}=await mount({saved:saved(),reload:true}));assert.equal(api.runSnapshot().phase,'loot');assert.deepEqual(api.runSnapshot(),before);window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'1',bubbles:true}));assert.equal(api.runSnapshot().phase,'loot');window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await wait();assert.equal(api.runSnapshot().fight,2);assert.equal(api.runSnapshot().cards.length,before.cards.length+1);});
await test('Countdown attacks, last-heart failure and persistent defeat records',async()=>{const{api,root}=await mount();api.startAdventure();api.setHearts(1);for(let i=0;i<3;i++){api.end();await wait(70);}assert.equal(api.runSnapshot().phase,'defeat');assert(root.textContent.includes('失败'));assert.equal(api.records().played,1);assert.equal(api.records().wins,0);assert.equal(localStorage.getItem('gemcard.run'),null);});
await test('Corrupt run is cleared with the specified notice',async()=>{const{api,root,initialText}=await mount({saved:{'gemcard.run':'{broken json'}});assert.equal(api.screen(),'home');assert.equal(localStorage.getItem('gemcard.run'),null);assert(initialText.includes('上次的进度读不出来，已经清掉了'));assert(root.textContent.includes('开始冒险'));});
await test('Clock writes the countdown slot and does not render its external badge',async()=>{const{api,root}=await mount();api.debugJumpFight(3);await wait();assert.equal(api.runSnapshot().monster.key,'clock');assert.equal(root.querySelectorAll('[data-art-slot-value="countdown_slot"]').length,1);assert.equal(root.querySelectorAll('.countdown').length,0);});
await test('Seven specified viewports keep a live scene and unchanged state on resize',async()=>{const{api,root}=await mount();api.startAdventure();api.play(0);const before=api.runSnapshot();for(const[w,h]of[[390,844],[360,800],[430,932],[405,810],[1280,720],[1920,1080],[844,390]]){window.happyDOM.setWindowSize({width:w,height:h});window.dispatchEvent(new window.Event('resize'));assert.deepEqual(api.runSnapshot(),before);assert.equal(root.querySelector('#stage').dataset.layout,w>h?'landscape':'portrait');}});
await wait();
results.push({name:'No uncaught DOM simulation errors',status:capturedErrors.length?'FAIL':'PASS',errors:capturedErrors});
const report={scope:'Happy DOM only; accelerated timers and mocked geometry/WAAPI. Not a real browser, screenshot, animation timing or performance test.',results,passed:results.every(r=>r.status==='PASS')};
await fs.writeFile(path.join(output,'dom-game-results.json'),JSON.stringify(report,null,2)+'\n');
current?.store.dispose();for(const id of timers.keys())cancel(id);await current?.window.happyDOM.abort();await fs.unlink(file).catch(()=>{});
console.log(JSON.stringify({passed:report.passed,checks:results.length,errors:capturedErrors}));process.exit(report.passed?0:1);
