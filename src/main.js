import {GAME as C} from './config.js';
import {createGame,act,look,step,worldView,clamp} from './game.js';
import {loadEnvironment, beginEnvSample, endEnvSample, envProfile} from './draw/environment.js';
import {paintWorld} from './world.js';
import {renderHUD} from './battle/hud.js';
import {beginDrag,moveDrag,releaseDrag} from './battle/combat-drag.js';
import {autoInput,screenshotFor,distribution} from './dev/auto.js';
import {createMonsterRuntime} from './battle/monsters.js';
import {createMonsterView} from './battle/monster-view.js';

import * as audio from './audio/forest.js';
import {changeVolume,collect} from './storage/profile.js';
import {owlDirection,moonIndex} from './explore/night-air.js';
import {albumPointer} from './album/module.js';
import {initSealPortraits,loadSlateUI} from './draw/slate-ui.js';
import {practicePanel,practiceBadge} from './battle/practice.js';
import {waterDistance} from './explore/wetland.js';
import {loadCardArt} from '../art/cards/index.js';
import {createStudy,launchStudy,updateStudy} from './draw/seal-study.js';
const params=new URLSearchParams(location.search);
const monsterId=params.get('monster');
const auto=!monsterId&&params.get('auto')==='1';
const captureMonster=Boolean(monsterId)&&params.get('captureMonster')==='1';
const canvas=document.querySelector('canvas');
const ctx=canvas.getContext('2d',{alpha:false});
let h, zones=[], g, ticks=0, runs=0;
const pointer={x:C.width/2,y:0,down:false};
const held=new Set(),events=[], files=new Map(), pending=[];
const lockLog=[], frameMs=[],jsMs=[],items=[],threeMonsterMs=[];
let actualLock=false, readyForInput=false, startClickPending=false;
let monsters, preview;
let assets, loadMs, clickAt, walkFrameAt, clickToNormalMs, clickToFirstWalkMs;
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
function resize() {
  const d=devicePixelRatio;
  canvas.width=Math.round(innerWidth*d);
  canvas.height=Math.round(innerHeight*d);
  h=C.width*canvas.height/canvas.width;
  ctx.setTransform(canvas.width/C.width,0,0,canvas.height/h,0,0);
}
resize();
pointer.y=h/2;
window.addEventListener('resize',resize);
function requestLock() {
  if (!document.pointerLockElement) canvas.requestPointerLock()?.catch(()=>{});
}
function reset() {
  const seed=params.has('seed')?Number(params.get('seed'))>>>0:auto?C.autoSeed:crypto.getRandomValues(new Uint32Array(1))[0];
  runs++;
  startClickPending=false;
  g=createGame(seed,{
    monsters,collect,study:()=>createStudy(monsters,seed),tryStudy:launchStudy,updateStudy,sound:audio.sound,quit:()=>window.close(),
    volume:(k,d)=>{changeVolume(k,d);audio.volumes();audio.sound('menu')},
    musicSuite:(id)=>{audio.setMusicSuite(id);audio.sound('menu')},
    musicPreview:(sc)=>{audio.setMusicPreview(sc);audio.sound('menu')},
    lock() {
      if (auto) {
        g.locked=true;
        if (navigator.userActivation.isActive) requestLock();
        else window.evidence.gesture();
      }
      else requestLock();
    },
    unlock() {
      if (document.pointerLockElement) document.exitPointerLock();
      pointer.x=C.width/2;pointer.y=h/2;held.clear();
    },
    phase(name) {
      if (auto) events.push({tick:ticks,run:runs,phase:name,hearts:g.hearts,
        fight:g.fight,turn:g.b?.turn??0,walkedM:Number(g.distance.toFixed(3)),
        ...(name==='encounter'?{monsters:g.b.monsters.map(m=>m.kind)}:{})});
    },
    switchGame(next){g=next;zones=[];held.clear();},
    restart:reset
  });
}
document.addEventListener('pointerlockchange',()=>{
  actualLock=document.pointerLockElement===canvas;
  if (auto) lockLog.push({tick:ticks,locked:actualLock});
  else if(g) g.locked=actualLock;
  if (!actualLock) held.clear();
});
window.addEventListener('blur',()=>{
  held.clear();
  if (!auto && document.pointerLockElement) document.exitPointerLock();
});
function point(e) {
  pointer.x=e.clientX/innerWidth*C.width;
  pointer.y=e.clientY/innerHeight*h;
  g.focus={x:clamp(pointer.x/C.width*2-1,-1,1),y:clamp(pointer.y/h*2-1,-1,1)};
}
canvas.addEventListener('mousemove',e=>{
  if (auto || preview || !readyForInput) return;
  if (g.locked) look(g,e.movementX,e.movementY);
  else point(e);
});
// Continue tracking a grabbed card even if the cursor leaves the canvas before release.
window.addEventListener('mousemove',e=>{if(g?.cardDrag && !g.cardDrag.returning){point(e);moveDrag(g,pointer)}});
window.addEventListener('mouseup',e=>{if(e.button===0){pointer.down=false;if(g?.cardDrag){point(e);releaseDrag(g,pointer,C.width,h,act)}}});
window.addEventListener('blur',()=>{pointer.down=false;if(g)g.cardDrag=null});
canvas.addEventListener('mousedown',e=>{
  if (!readyForInput || preview || e.button!==0) return;
  pointer.down=true;
  audio.unlock();
  if (auto) {
    if (g.phase!=='start') {
      if (g.locked && ['walk','loot'].includes(g.phase)) requestLock();
      return;
    }
  }
  if (['walk','loot'].includes(g.phase)) {
    if (!g.locked) {
      point(e);
      const home=zones.find(r=>r.action==='hall'&&pointer.x>=r.x&&pointer.x<=r.x+r.w&&pointer.y>=r.y&&pointer.y<=r.y+r.h);
      act(g,home?'hall':'resume');
    }
    else if (g.phase==='loot') act(g,'pickup');
    return;
  }
  point(e);
  const zone=zones.findLast(r=>r.hit?r.hit(pointer.x,pointer.y):
    pointer.x>=r.x&&pointer.x<=r.x+r.w&&pointer.y>=r.y&&pointer.y<=r.y+r.h);
  if(g.phase==='battle'){
    if(zone?.action==='play'){beginDrag(g,zone,pointer);return;}
    g.cardDrag=null;
  }
  if (zone?.action==='start' && clickAt===undefined) clickAt=e.timeStamp;
  if(zone){if(['album','back','settings','start','continue','exit','choose'].includes(zone.action)&&g.phase!=='album')audio.sound('menu');act(g,zone.action,zone.arg)}
});
window.addEventListener('keydown',e=>{
  if (!readyForInput || auto) return;
  if (preview) {
    if (!captureMonster&&!e.repeat&&/^\d$/.test(e.key)) preview.dispatch(Number(e.key));
    return;
  }
  if(e.code==='KeyH'&&!e.repeat){act(g,'hall');return;}
  if (e.code.startsWith('Arrow')) e.preventDefault();
  held.add(e.code);
  if (e.code==='KeyE'&&!e.repeat) act(g,'pickup');
});
window.addEventListener('keyup',e=>held.delete(e.code));
// Capture page-edge drags before the regular canvas button passes. Mouse-up outside the leaf still settles it.
for(const [event,type] of [['mousedown','down'],['mousemove','move'],['mouseup','up']]) window.addEventListener(event,e=>{
  if(!readyForInput||g?.phase!=='album'||(type!=='move'&&e.button!==0)||(type==='down'&&e.target!==canvas))return;
  point(e);if(albumPointer(g.album,type,pointer.x,pointer.y,C.width,h)){if(type==='down')audio.unlock();e.stopImmediatePropagation();e.preventDefault();}
},true);
window.addEventListener('blur',()=>{if(g?.phase==='album')albumPointer(g.album,'cancel',pointer.x,pointer.y,C.width,h);});
window.addEventListener('keydown',e=>{if(g?.phase!=='album'||e.repeat)return;if(e.key==='Escape')act(g,'escape');else if(e.key==='ArrowLeft')act(g,'step',-1);else if(e.key==='ArrowRight')act(g,'step',1);});
window.addEventListener('wheel',e=>{if(g?.phase==='album'&&Math.abs(e.deltaY)+Math.abs(e.deltaX)>2)act(g,'wheel',Math.sign(e.deltaY||e.deltaX));},{passive:true});
function keyboard() {
  const down=(a,b)=>Number(held.has(a)||held.has(b));
  return {forward:down('KeyW','ArrowUp')-down('KeyS','ArrowDown'),
    side:down('KeyD','ArrowRight')-down('KeyA','ArrowLeft'),run:down('ShiftLeft','ShiftRight')};
}
function autoPointer() {
  if (!['battle','cast','choose','start','result','route'].includes(g.phase)) return;
  const action=({battle:'play',cast:'cast',choose:'choose',start:'start',result:'restart',route:'exit'})[g.phase];
  const r=zones.find(z=>z.action===action) ?? {x:C.width*.54,y:h*.55,w:0,h:0};
  pointer.x=r.x+r.w*.5;pointer.y=r.y+r.h*.4;
  g.focus={x:pointer.x*2/C.width-1,y:pointer.y*2/h-1};
}
function capture(name) {
  files.set(name,ticks);
  pending.push(new Promise((resolve,reject)=>canvas.toBlob(blob=>{
    if (!blob) {reject(Error('截图失败 '+name));return;}
    blob.arrayBuffer().then(data=>window.evidence.capture(name,data)).then(resolve,reject);
  },'image/png')));
}
const cues=[
  ['appear',.90], ['idle',3.25], ['ready',.50], ['attack',.46], ['hit',.17],
  ['heavyhit',.49], ['hide',.65], ['blowopen',.30], ['die',1.10]
];
let cueIndex=0,cueTick=0;
function playCue() {
  if(cueIndex===6){preview.dispatch(0);preview.dispatch(0);}
  if(cueIndex===8) preview.dispatch(0);
  preview.dispatch(cueIndex+1);
  cueTick=ticks;
}
function paint(dt) {
  if(preview) return paintWorld(ctx,preview.world,C.width,h,preview.view(C.width,h));
  if(g.phase!=='settings' && audio.getMusicState().preview) audio.setMusicPreview(null);
  const scene = ['start','settings','album','study','practiceMenu','practiceResult'].includes(g.phase)
    ? 'hall'
    : ['encounter','battle','cast','attack','death','sealing'].includes(g.phase)
      ? (g.b?.elite ? 'elite' : 'battle')
      : 'walk';
  audio.environment(g.elapsed<g.quietUntil,...waterDistance(g.world),owlDirection(g.world,g.elapsed),scene);
  // 卡册是单独一页、自带背景（opaque）：完全展开后就不画后面的世界。
  const drawn=(g.phase==='album'&&g.album.opaque&&g.album.arrival>=1&&!g.album.depart)?{enemies:[],count:0}:paintWorld(ctx,g.world,C.width,h,worldView(g));
  g.screenEnemies=drawn.enemies;
  if(['practiceMenu','practiceResult'].includes(g.phase)) zones=practicePanel(ctx,g,C.width,h,pointer);
  else {zones=renderHUD(ctx,g,C.width,h,pointer,dt);if(g.practice)practiceBadge(ctx,g,C.width,pointer,zones);}
  return drawn;
}
let previous=null, startTime=0, accumulator=0;
function frame(now) {
  const before=performance.now(),first=previous===null;
  const delta=first?0:now-previous;
  if (first) startTime=now;
  previous=now;
  monsters.beginFrame(auto,C.width,h);
  accumulator+=auto?delta/1000:Math.min(delta/1000,.25);
  while (accumulator+1e-9>=C.step && (!auto||ticks<Math.round(C.autoSeconds/C.step))) {
    ticks++;
    if(preview) preview.update(C.step);
    else step(g,auto?autoInput(g,C.step):keyboard(),C.step);
    accumulator-=C.step;
  }
  if (auto) autoPointer();
  const profileFrame=auto && frameMs.length%20===0;
  if (profileFrame) beginEnvSample();
  const drawn=paint(delta/1000);
  if (profileFrame) endEnvSample();
  if(captureMonster&&(ticks-cueTick)*C.step>=cues[cueIndex][1]){
    capture('0'+(cueIndex+1)+'-'+cues[cueIndex][0]+'.png');
    if(++cueIndex===cues.length){
      Promise.all(pending).then(()=>window.evidence.finish()).catch(console.error);
      return;
    }
    playCue();
  }
  if (auto) {
    if (g.phase==='start' && g.phaseTime>=1 && !startClickPending) {
      startClickPending=true;
      window.evidence.gesture();
    }
    if (g.phase==='walk' && clickAt!==undefined && clickToNormalMs===undefined) {
      if (walkFrameAt!==undefined && delta<=C.limitMs) clickToNormalMs=Math.max(0,now-clickAt);
      if (walkFrameAt===undefined) clickToFirstWalkMs=performance.now()-clickAt;
      walkFrameAt=now;
    }
    const name=screenshotFor(g);
    if (name && !files.has(name)) capture(name);
    if (!first) {
      frameMs.push(delta);
      jsMs.push(performance.now()-before);
      items.push(drawn.count);
      if(monsters.drawn===3) threeMonsterMs.push(monsters.frameMs);
    }
    if (ticks>=Math.round(C.autoSeconds/C.step)) {finish(now-startTime);return;}
  }
  requestAnimationFrame(frame);
}
async function finish(elapsedMs) {
  await Promise.all(pending);
  const late=frameMs.filter(t=>t>C.limitMs).length;
  const intervals=distribution(frameMs), latePercent=100*late/frameMs.length;
  const summary={frames:frameMs.length,elapsedMs,intervals,late,latePercent,
    js:distribution(jsMs),worldItems:distribution(items),
    threeMonsters:{frames:threeMonsterMs.length,...distribution(threeMonsterMs)},
    passed:latePercent<=C.latePercent&&intervals.p99<=C.limitMs};
  await window.evidence.finish({
    seed:C.autoSeed,ticks,stepSeconds:C.step,summary,viewport:[innerWidth,innerHeight],
    pixels:[canvas.width,canvas.height],events,pointerLockEvents:lockLog,
    environment:{...assets,profile:envProfile()},startup:{loadMs,clickToFirstWalkMs,clickToNormalMs},
    screenshots:Object.fromEntries(files),frameMs,jsMs,worldItems:items,threeMonsterMs
  });
}
async function ready() {
  if (document.hidden) {
    document.addEventListener('visibilitychange',ready,{once:true});
    return;
  }
  const began=performance.now();
  const loading=document.getElementById('loading');
  try {
    await nextFrame();
    audio.prepare();
    [assets]=await Promise.all([loadEnvironment(ctx),loadCardArt(),loadSlateUI()]);
    monsters=await createMonsterRuntime(canvas,params.has('modules')?params.get('modules').split(',').filter(Boolean):undefined);
    initSealPortraits(monsters).catch(e=>console.warn('封印牌怪像没截到',e));
    if(monsterId) preview=createMonsterView(monsters,monsterId);
    else { reset(); if(params.has('observe')) {const {snapshot}=await import('../scripts/observe.js'); window.captureAudioStream=audio.captureAudioStream; window.nightSnapshot=()=>({...snapshot(g,zones,C.width,h),moon:moonIndex(g.world,g.elapsed),moonOffset:g.world.moonOffset,album:g.phase==='album'?{spread:g.album.spread,view:g.album.view,id:g.album.id,flip:g.album.flip?.u}:null,audio:audio.audioStatus(),quiet:g.elapsed<g.quietUntil}); }}
    if(captureMonster) playCue();
    monsters.beginFrame(false,C.width,h);
    paint(0);
    ctx.getImageData(0,0,1,1);
    await nextFrame();
    await nextFrame();
    loadMs=performance.now()-began;
    loading.remove();
    readyForInput=true;
    requestAnimationFrame(frame);
  } catch (error) {
    loading.textContent='加载失败 · '+error.message;
    console.error(error);
  }
}
ready();
