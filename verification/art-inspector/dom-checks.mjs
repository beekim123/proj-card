/** DOM-only checks, not a real-browser/visual/performance acceptance.
 * npm install --prefix ../qa-tools happy-dom
 * node verification/art-inspector/dom-checks.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = process.cwd();
const output = path.join(root,'verification/art-inspector');
const libraryPath = process.env.HAPPY_DOM_PATH ?? path.resolve(root,'../qa-tools/node_modules/happy-dom/lib/index.js');
const { Window } = await import(pathToFileURL(libraryPath).href);
const window = new Window({ url:'http://localhost/?page=art', settings:{ disableCSSFileLoading:true, disableJavaScriptFileLoading:true, disableComputedStyleRendering:false } });
for (const key of ['document','DOMParser','HTMLElement','HTMLImageElement','SVGElement','SVGSVGElement','Event','MouseEvent']) globalThis[key] = window[key];
globalThis.window = window;
// Text sizing is a browser rendering concern. Exercise the conservative fallback here.
window.HTMLCanvasElement.prototype.getContext = () => null;
await fs.mkdir(output,{recursive:true});
await build({ stdin:{ contents:`export {createCard,playCardArt,setCardPaused} from './src/ui/card'; export {renderArtGallery} from './src/art/inspector'; export {ArtStore} from './src/art/store'; export {generatePlaceholder} from './src/art/placeholders'; export {TOOLS,TOOL_TYPES} from './src/rules/config';`, resolveDir:root,loader:'ts'}, bundle:true,platform:'node',format:'esm',loader:{'.css':'empty'},outfile:path.join(output,'dom-runtime.mjs') });
const {createCard,playCardArt,setCardPaused,renderArtGallery,ArtStore,generatePlaceholder,TOOLS,TOOL_TYPES}=await import(pathToFileURL(path.join(output,'dom-runtime.mjs')).href+'?t='+Date.now());
const manifest=JSON.parse(await fs.readFile(path.join(root,'public/art-manifest.json'),'utf8'));
const assets=manifest.assets.map(definition=>({definition,source:'placeholder',svg:generatePlaceholder(definition,manifest),url:`blob:${definition.id}`,staticUrl:definition.idle?`blob:${definition.id}-static`:undefined}));
const store=new ArtStore(manifest,assets);const results=[];
const check=async(name,run)=>{try{await run();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.stack});}};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const text=(node,key)=>node.querySelector(`[data-card-text="${key}"]`).textContent;
const css=document.createElement('style');css.textContent=await fs.readFile(path.join(root,'src/ui/card.css'),'utf8');document.head.append(css);

await check('Numeric mask API retains base gem/text layers, growth and static URLs',()=>{
  for(const mask of [0,1,2,3,4,5,6,7]) {
    const card=createCard(store,mask,[15,0,45],true,{static:true});document.body.append(card);
    assert.equal(card.dataset.mask,String(mask));assert(!card.querySelector('.card-tool-art'));
    const expected=(mask&1?150:0)+(mask&2?100:0)+(mask&4?200:0);assert.equal(text(card,'value'),String(expected));
    assert(card.querySelector('[data-art-id="card_frame"]'));
    for(const image of card.querySelectorAll('img[data-art-id^="gem_"]')) if(image.dataset.artId.endsWith('rough')||image.dataset.artId.endsWith('cut')||image.dataset.artId.endsWith('shine')) assert(image.src.endsWith('-static'));
    setCardPaused(card,false);assert.equal(card.dataset.static,'false');
    for(const image of card.querySelectorAll('img')) assert(!image.src.endsWith('-static'));
    card.remove();
  }
  const noGrowth=createCard(store,7,[45,45,45],false);assert.equal(text(noGrowth,'value'),'300');
});
await check('Five tools use tool art/frame, effect text and correct unknown mirror values',()=>{
  TOOL_TYPES.forEach((type,index)=>{
    const card=createCard(store,{id:31+index,v:TOOLS[type].v,type});
    assert.equal(text(card,'name'),TOOLS[type].name);assert.equal(text(card,'line'),TOOLS[type].text);
    assert.equal(text(card,'value'),type==='mirror'?'?':type==='stone'?'0':'100');
    assert(card.querySelector('[data-art-id="card_frame_tool"]'));assert(card.querySelector('[data-art-id="card_art_bg_tool"]'));
    assert(card.querySelector(`[data-art-id="card_art_${type}"]`));
  });
});
await check('Resolved mirror supports every mask, mixed-growth base and color',()=>{
  for(let mask=0;mask<8;mask++) {
    const card=createCard(store,{id:35,v:mask,type:'mirror'},[15,0,45],true,{static:true,resolved:true});
    assert.equal(text(card,'value'),String((mask&1?150:0)+(mask&2?100:0)+(mask&4?200:0)));
    assert.equal(card.querySelector('.card-tool-art').style.color,manifest.palette.mix[mask]??manifest.palette.textDim);
  }
  const hand=createCard(store,{id:35,v:0,type:'mirror'});
  assert.equal(hand.querySelector('.card-tool-art').style.color,manifest.palette.text);
});
await check('Paused tools retain actual play animation; overlapping plays restart correctly',async()=>{
  const cards=TOOL_TYPES.map((type,index)=>createCard(store,{id:index,v:TOOLS[type].v,type},[0,0,0],true,{static:true,resolved:true}));
  for(const card of cards) {
    document.body.append(card);const art=card.querySelector('.card-tool-art');
    assert.equal(art.dataset.artStatic,undefined,'inline tool must not contain permanent animation:none override');
    assert.equal(window.getComputedStyle(art).animationPlayState,'paused');
    assert.equal(playCardArt(card),600);assert.equal(art.dataset.anim,'play');
    assert.equal(window.getComputedStyle(art).animationPlayState,'running');
  }
  await delay(300);playCardArt(cards[0]);await delay(350);
  assert(cards[0].classList.contains('card-playing'));
  for(const card of cards.slice(1)) {assert(!card.classList.contains('card-playing'));assert.equal(window.getComputedStyle(card.querySelector('.card-tool-art')).animationPlayState,'paused');}
  await delay(300);assert(!cards[0].classList.contains('card-playing'));
  cards.forEach(card=>card.remove());
});
const rootNode=document.createElement('main');document.body.append(rootNode);
await check('Art inspector mounts 63 assets, statuses, idle pairs, 24 base and 10 tool cards',()=>{
  renderArtGallery(rootNode,store);
  assert.equal(rootNode.querySelectorAll('[data-asset-id]').length,63);
  assert.equal(rootNode.querySelectorAll('.art-composed-cards .gem-card').length,24);
  assert.equal(rootNode.querySelectorAll('.art-tool-cards .gem-card').length,10);
  for(const definition of manifest.assets) {
    const item=rootNode.querySelector(`[data-asset-id="${definition.id}"]`);assert.equal(item.dataset.status,definition.status);
    if(definition.idle) {const imgs=item.querySelectorAll('img');assert.equal(imgs.length,2);assert.notEqual(imgs[0].src,imgs[1].src);}
  }
  const filter=rootNode.querySelector('[data-action="filter-changed"]');filter.click();
  for(const item of rootNode.querySelectorAll('[data-asset-id]')) assert.equal(item.hidden,item.dataset.status==='已有');
  filter.click();for(const item of rootNode.querySelectorAll('[data-asset-id]')) assert(!item.hidden);
});
await check('Stay toggle restores daze after hit and explicitly clears to idle',async()=>{
  const item=rootNode.querySelector('[data-asset-id="mon_chest"]');const svgs=item.querySelectorAll('svg[data-art-id="mon_chest"]');assert.equal(svgs.length,5);
  item.querySelector('[data-event="daze"]').click();for(const svg of svgs)assert.equal(svg.dataset.anim,'daze');
  item.querySelector('[data-event="hit"]').click();for(const svg of svgs)assert.equal(svg.dataset.anim,'hit');
  await delay(450);for(const svg of svgs)assert.equal(svg.dataset.anim,'daze');
  item.querySelector('[data-event="daze"]').click();for(const svg of svgs)assert.equal(svg.dataset.anim,undefined);
});
await check('Monster anchors, hit points and namespaced clock countdown slots are complete',()=>{
  for(const item of rootNode.querySelectorAll('[data-asset-id^="mon_"]')) {assert.equal(item.querySelectorAll('.art-cross-anchor').length,5);assert.equal(item.querySelectorAll('.art-cross-hitPoint').length,5);}
  const clock=rootNode.querySelector('[data-asset-id="mon_clock"]');
  for(const value of [1,2,3]) {
    clock.querySelector(`[aria-label="倒计时 ${value}"]`).click();
    const slots=[...clock.querySelectorAll('[id$="-countdown_slot"] text')];assert.equal(slots.length,5);slots.forEach(text=>assert.equal(text.textContent,String(value)));
  }
});
await check('Mirror selector updates resolved card only; composed widgets have correct values',()=>{
  const select=rootNode.querySelector('[aria-label="桌面镜子的宝石"]');
  for(const value of [0,1,3,7]) {
    select.value=String(value);select.dispatchEvent(new Event('change'));
    const cards=rootNode.querySelectorAll('.art-tool-pair[data-tool="mirror"] .gem-card');
    assert.equal(text(cards[0],'value'),'?');assert.equal(cards[1].dataset.mask,String(value));
  }
  assert.deepEqual([...rootNode.querySelectorAll('.art-hp-fill')].map(node=>node.style.width),['100%','37%','0%']);
  assert.equal(rootNode.querySelectorAll('.art-hearts [data-art-id="ui_heart"]').length,2);
  assert.equal(rootNode.querySelectorAll('.art-hearts [data-art-id="ui_heart_empty"]').length,1);
  assert.equal(rootNode.querySelector('.art-banner span').textContent,'战利品');
});
await check('Inline asset IDs stay globally unique after re-renders',()=>{
  const ids=[...document.querySelectorAll('svg [id]')].map(node=>node.id);assert.equal(ids.length,new Set(ids).size);
});
store.dispose();window.happyDOM.abort();await fs.unlink(path.join(output,'dom-runtime.mjs'));
await fs.writeFile(path.join(output,'dom-results.json'),JSON.stringify({environment:'Happy DOM; not real-browser rendering',checks:results},null,2));
console.log(JSON.stringify(results,null,2));
if(results.some(result=>result.status==='FAIL'))process.exitCode=1;
