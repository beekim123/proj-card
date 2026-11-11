// Paired screenshots, one renderer at a time. H5 is never edited.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const root=process.cwd(),output=path.join(root,'artifacts/screens');fs.mkdirSync(output,{recursive:true});
const chrome=process.env.CHROME??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const baseURL='http://127.0.0.1:'+Number(process.env.GEMCARD_H5_PORT??18780);
const modes=[['landscape',1280,720],['portrait',720,1280]];
const runId=Date.now().toString();
const scenes=['home','relic','arrange','strike','broken','loot','elite-relic','doors','shop','victory','defeat','practice'];
const arts=['mon_dragon','mon_clock','ui_rainbow_slot','ui_rule_sign'];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let server,browser;const profile=fs.mkdtempSync(path.join(os.tmpdir(),'gemcard-screens-'));
const previous=fs.existsSync(path.join(output,'report.json'))?JSON.parse(fs.readFileSync(path.join(output,'report.json'),'utf8')):{};
const report={h5:process.argv.includes('--godot-only')?(previous.h5??[]):[],godot:process.argv.includes('--h5-only')?(previous.godot??[]):[],failures:[]};
function retire(file){if(fs.existsSync(file)){const directory=path.join(output,'prior',String(Date.now()));fs.mkdirSync(directory,{recursive:true});fs.renameSync(file,path.join(directory,path.basename(file)));}}
async function waitFor(fn,limit=20000){const start=Date.now();while(Date.now()-start<limit){try{const value=await fn();if(value)return value;}catch{}await sleep(50);}throw Error('timed out');}
async function stop(child){if(!child||child.exitCode!==null||child.signalCode!==null)return;const exited=once(child,'exit');child.kill('SIGTERM');await Promise.race([exited,sleep(5000)]);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exited;}}
async function cdp(url){
 const ws=new WebSocket(url);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 let id=0;const pending=new Map();ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}});
 return {send(method,params={}){return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});},close(){ws.close();}};
}
async function evaluate(client,expression){const result=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result?.value;}
async function h5Shots(){
 server=spawn(process.execPath,['--single-threaded','tools/h5-server.mjs'],{cwd:root,stdio:['ignore','pipe','pipe'],env:{...process.env,GEMCARD_H5_PORT:String(new URL(baseURL).port),OMP_NUM_THREADS:'1',GOMAXPROCS:'1'}});
 let ownReady=false;server.stdout.on('data',data=>{if(String(data).includes('H5_REFERENCE_READY'))ownReady=true;});server.stderr.on('data',data=>process.stderr.write(data));
 await waitFor(()=>{if(server.exitCode!==null)throw Error('Owned H5 server exited');return ownReady;});
 browser=spawn('/usr/bin/nice',['-n','10',chrome,'--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--renderer-process-limit=1','--num-raster-threads=1','--force-device-scale-factor=1','--hide-scrollbars','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
 const active=path.join(profile,'DevToolsActivePort');await waitFor(()=>fs.existsSync(active));
 const [port,browserPath]=fs.readFileSync(active,'utf8').trim().split('\n');const control=await cdp(`ws://127.0.0.1:${port}${browserPath}`);
 const target=await control.send('Target.createTarget',{url:'about:blank'});const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
 const client=await cdp(targets.find(t=>t.id===target.targetId).webSocketDebuggerUrl);await client.send('Page.enable');
 await client.send('Page.addScriptToEvaluateOnNewDocument',{source:'try{localStorage.clear()}catch{}'});
 for(const [layout,width,height] of modes){
  await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  for(const scene of scenes){
   const marker=layout+'-'+scene;
   await client.send('Page.navigate',{url:`${baseURL}/?seed=1979&layout=${layout}&debug=1&capture=${marker}`});
   await waitFor(()=>evaluate(client,`location.search.includes(${JSON.stringify('capture='+marker)}) && !!window.__gemcard`));
   const setup=`(async()=>{const a=window.__gemcard;const scene=${JSON.stringify(scene)};
    if(scene==='home')return;if(scene==='practice'){a.practice();return;}a.startAdventure();if(scene==='relic')return;a.chooseRelic(0);await new Promise(r=>setTimeout(r,550));
    if(scene==='shop'){a.enterShop();return;}if(scene==='doors'){a.debugJumpFight(2);return;}
    if(scene==='elite-relic'){a.debugJumpFight(3);a.setMonsterHp(0);a.endTurn();return;}
    if(scene==='victory'){a.debugJumpFight(6);a.setMonsterHp(0);a.endTurn();return;}
    if(scene==='defeat'){a.setHearts(1);a.setCountdown(0);a.endTurn();return;}
    if(scene==='loot'){a.setMonsterHp(0);a.endTurn();return;}
    a.dealCards([1,3,2,6,4,5,'hammer']);if(scene==='broken')a.setMonsterHp(1);a.play(0);a.play(0);if(scene==='strike')a.endTurn();})()`;
   await evaluate(client,setup);
   if(scene==='strike')await sleep(120);
   else{
    const expected={'home':'home','practice':'practice','relic':'relic','loot':'loot','elite-relic':'relic','doors':'doors','shop':'shop','victory':'victory','defeat':'defeat'}[scene]??'battle';
    try{await waitFor(()=>evaluate(client,`document.querySelector('.game-stage')?.dataset.screen===${JSON.stringify(expected)}`));}
    catch(error){const state=await evaluate(client,`({screen:document.querySelector('.game-stage')?.dataset.screen,run:window.__gemcard?.runSnapshot(),text:document.body.innerText})`);fs.writeFileSync(path.join(output,`${layout}-${scene}-h5-failure.json`),JSON.stringify(state,null,2));throw error;}
    await waitFor(()=>evaluate(client,`!document.querySelector('.game-stage').getAnimations({subtree:true}).some(a=>a.playState==='running' && a.effect.getTiming().iterations!==Infinity) && [...document.querySelectorAll('.loot-card > .gem-card')].every(n=>getComputedStyle(n).visibility!=='hidden')`));
    await sleep(100);
   }
   const shot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
   const file=`${layout}-${scene}-h5.png`;retire(path.join(output,file));fs.writeFileSync(path.join(output,file),Buffer.from(shot.data,'base64'));report.h5.push(file);console.log('H5_SCREEN',file);
   const snapshot=await evaluate(client,'({screen:window.__gemcard.screen(),run:window.__gemcard.runSnapshot(),game:window.__gemcard.snapshot()})');fs.writeFileSync(path.join(output,file.replace(/\.png$/,'.json')),JSON.stringify(snapshot));
  }
  await client.send('Page.navigate',{url:`${baseURL}/?page=art&layout=${layout}`});await waitFor(()=>evaluate(client,'!!document.querySelector("[data-asset-id=mon_dragon]")'));
  for(const id of arts){
   await evaluate(client,`(()=>{for(const item of document.querySelectorAll('[data-asset-id]'))item.style.display=item.dataset.assetId===${JSON.stringify(id)}?'block':'none';for(const group of document.querySelectorAll('.art-composed-cards,.art-tool-cards,.art-composed-ui'))group.style.display='none';document.querySelector('[data-asset-id=${id}]').scrollIntoView({block:'start'});})()`);await sleep(300);
   const shot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});const file=`${layout}-art-${id}-h5.png`;retire(path.join(output,file));fs.writeFileSync(path.join(output,file),Buffer.from(shot.data,'base64'));report.h5.push(file);console.log('H5_SCREEN',file);
   fs.writeFileSync(path.join(output,file.replace(/\.png$/,'.json')),JSON.stringify({art:id}));
  }
 }
 client.close();control.close();await stop(browser);browser=null;await stop(server);server=null;
}
async function godotShots(){
 for(const [layout,width,height] of modes){
  for(const scenario of [...scenes,...arts.map(id=>'art-'+id)]){
   const file=`${layout}-${scenario}-godot.png`,log=path.join(root,`artifacts/logs/screen-${layout}-${scenario}.log`);
   retire(path.join(output,file));
   const args=[`--layout=${layout}`,'--seed=1979',`--capture=${path.join(output,file)}`,`--scenario=${scenario}`];
   if(scenario.startsWith('art-'))args.push('--art',`--inspect-id=${scenario.slice(4)}`);
   const handle=fs.openSync(log,'w');
   const child=spawn('tools/run.sh',args,{cwd:root,env:{...process.env,GEMCARD_RESOLUTION:`${width}x${height}`,GEMCARD_LOG_FILE:log+'.engine',GEMCARD_DISPLAY_JSON:log+'.display.json',GEMCARD_SAVE_DIR:path.join(root,'artifacts/screens/saves',runId,layout+'-'+scenario)},stdio:['ignore',handle,handle]});fs.closeSync(handle);
   const timer=setTimeout(()=>child.kill('SIGTERM'),60000);const [code]=await once(child,'exit');clearTimeout(timer);
   const messages=fs.readFileSync(log,'utf8');
   if(code!==0||!fs.existsSync(path.join(output,file))||/SCRIPT ERROR|^ERROR:/m.test(messages)||!messages.includes('GEMCARD_SCREENSHOT '+path.join(output,file)))throw Error('Godot screenshot failed '+file+'; see '+log);
   report.godot.push(file);console.log('GODOT_SCREEN',file);
  }
 }
}
try{if(!process.argv.includes('--godot-only'))await h5Shots();if(!process.argv.includes('--h5-only'))await godotShots();}
catch(error){report.failures.push(error.stack);console.error(error);process.exitCode=1;}
finally{await stop(browser);await stop(server);fs.rmSync(profile,{recursive:true,force:true});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));}
