/** Execute the existing dist bundle in Happy DOM, swap only a deployed SVG, and restore it.
 * No rebuild. No real-browser refresh, screenshots or performance claim.
 * npm install --prefix ../qa-tools happy-dom
 * node verification/art-inspector/replacement-dom-check.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const root=process.cwd(),dist=path.join(root,'dist'),output=path.join(root,'verification/art-inspector');
const {Window}=await import(pathToFileURL(process.env.HAPPY_DOM_PATH??path.resolve(root,'../qa-tools/node_modules/happy-dom/lib/index.js')).href);
const hash=value=>createHash('sha256').update(value).digest('hex');
const artPath=path.join(dist,'art/mon_chest.svg');
const original=await fs.readFile(artPath);
const sourceOriginal=await fs.readFile(path.join(root,'public/art/mon_chest.svg'));
const index=await fs.readFile(path.join(dist,'index.html'),'utf8');
const bundleRelative=index.match(/<script[^>]+src="\.\/([^\"]+)"/)[1];
const bundlePath=path.join(dist,bundleRelative),bundle=await fs.readFile(bundlePath,'utf8');
const bundleHash=hash(bundle),indexHash=hash(index);
const marker='#13F17D';
assert(!original.toString().includes(marker));
const replacement=original.toString().replaceAll('fill="#6E542B"',`fill="${marker}"`);
assert(replacement.includes(marker),'Expected original artwork body color is present');
const results={environment:'Happy DOM using the unchanged dist JavaScript bundle',realBrowser:false,rebuild:false,testColor:marker,bundle:bundleRelative,originalArtSha256:hash(original),bundleSha256:bundleHash,checks:[],restored:false};
const windows=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function launch(search) {
  const window=new Window({url:`http://localhost/${search}`,settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});windows.push(window);
  const errors=[];const requests=[];
  window.console.error=(...args)=>errors.push(args.map(String).join(' '));
  window.Blob=Blob;
  window.URL.createObjectURL=URL.createObjectURL.bind(URL);window.URL.revokeObjectURL=URL.revokeObjectURL.bind(URL);
  window.HTMLCanvasElement.prototype.getContext=()=>null;
  const bounding=window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect=function(){
    if(this.classList.contains('game-viewport')) return {x:0,y:0,left:0,top:0,width:390,height:844,right:390,bottom:844,toJSON(){return this;}};
    return bounding.call(this);
  };
  window.fetch=async(input,options={})=>{
    const url=new URL(String(input),'http://localhost/');requests.push({path:url.pathname,cache:options.cache});
    const requested=path.resolve(dist,'.'+url.pathname);
    assert(requested.startsWith(dist+path.sep));
    try {return new Response(await fs.readFile(requested),{status:200,headers:{'content-type':url.pathname.endsWith('.json')?'application/json':'image/svg+xml'}});}
    catch(error) {if(error.code==='ENOENT')return new Response('',{status:404});throw error;}
  };
  window.document.body.innerHTML='<div id="app"></div>';
  window.eval(bundle);
  for(let n=0;n<500;n++) {
    if(window.__gemcard||window.document.querySelector('.art-tool-cards'))break;
    if(errors.length)throw Error(errors.join('\n'));
    await delay(10);
  }
  assert.equal(errors.length,0);
  assert(requests.some(request=>request.path==='/art/mon_chest.svg'&&request.cache==='no-store'));
  return {window,errors,requests};
}
try {
  await fs.writeFile(artPath,replacement);
  assert.equal(hash(await fs.readFile(bundlePath)),bundleHash);
  const game=await launch('?debug=1&seed=1');
  assert(game.window.__gemcard,'Built game exposes its debug API');
  for(let seed=1;seed<=30;seed++) {
    game.window.history.replaceState(null,'',`/?debug=1&seed=${seed}`);
    game.window.__gemcard.startAdventure();
    if(game.window.__gemcard.runSnapshot().monster.key==='chest')break;
  }
  assert.equal(game.window.__gemcard.runSnapshot().monster.key,'chest');
  const monster=game.window.document.querySelector('.scene svg[data-art-id="mon_chest"]');
  assert(monster,'GameUI contains the chest monster');assert.equal(monster.dataset.artSource,'art');
  const changedGame=monster.querySelectorAll(`[fill="${marker}"]`).length;assert(changedGame>0);
  results.checks.push({name:'GameUI loaded changed deployed chest artwork',status:'PASS',matchingColorElements:changedGame});
  const gallery=await launch('?page=art');
  const previews=gallery.window.document.querySelectorAll('[data-asset-id="mon_chest"] svg[data-art-id="mon_chest"]');
  assert.equal(previews.length,5);
  for(const svg of previews){assert.equal(svg.dataset.artSource,'art');assert(svg.querySelector(`[fill="${marker}"]`));}
  results.checks.push({name:'Inspector loaded changed deployed artwork in every scale preview',status:'PASS',matchingPreviews:previews.length});
  results.checks.push({name:'Deployed assets reread with cache:no-store',status:'PASS',gameFetchCount:game.requests.length,inspectorFetchCount:gallery.requests.length});
  assert.equal(hash(await fs.readFile(bundlePath)),bundleHash);assert.equal(hash(await fs.readFile(path.join(dist,'index.html'))),indexHash);
  assert.equal(hash(await fs.readFile(path.join(root,'public/art/mon_chest.svg'))),hash(sourceOriginal));
  results.checks.push({name:'No rebuild or public/source artwork changes',status:'PASS'});
} catch(error){results.checks.push({name:'Replacement verification',status:'FAIL',error:error.stack});process.exitCode=1;}
finally {
  await fs.writeFile(artPath,original);results.restoredArtSha256=hash(await fs.readFile(artPath));results.restored=results.restoredArtSha256===results.originalArtSha256;
  windows.forEach(window=>window.happyDOM.abort());
  if(!results.restored)process.exitCode=1;
  await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'replacement-dom-results.json'),JSON.stringify(results,null,2));
}
console.log(JSON.stringify(results,null,2));
