/** Dependency-free contract checks. Node 24 strips TypeScript; this is not tsc or browser QA. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here,'../..');
const temp = await mkdtemp(join(tmpdir(),'gemcard-v2-art-'));
const results = [];
const check = async (name,fn) => { await fn(); results.push({name,status:'passed'}); };
try {
  await writeFile(join(temp,'package.json'),'{"type":"module"}');
  for (const file of ['types','namespace','placeholders','store','filters']) {
    const source = await readFile(join(root,'src/art',`${file}.ts`),'utf8');
    await writeFile(join(temp,`${file}.ts`),source.replace(/from '(\.\/[^']+)'/g,"from '$1.ts'"));
  }
  const { generatePlaceholder } = await import(join(temp,'placeholders.ts'));
  const { ArtStore, loadArtAssets } = await import(join(temp,'store.ts'));
  const { namespaceSvg } = await import(join(temp,'namespace.ts'));
  const { matchesAssetFilter } = await import(join(temp,'filters.ts'));
  const manifest = JSON.parse(await readFile(join(root,'public/art-manifest.json'),'utf8'));
  const assets = manifest.assets.map(definition => ({definition,source:'placeholder',svg:generatePlaceholder(definition,manifest),url:`blob:${definition.id}`}));
  await check('Manifest v3: 75 unique assets; batch 1 = 3; batch 2 = 16',() => {
    assert.equal(manifest.version,3); assert.equal(assets.length,75);
    assert.equal(new Set(assets.map(a=>a.definition.id)).size,75);
    assert.equal(manifest.assets.filter(a=>a.v2==='第1批').length,3);
    assert.equal(manifest.assets.filter(a=>a.v2==='第2批').length,16);
  });
  await check('Every placeholder satisfies dimensions, parts, slots, events, durations and tint',() => {
    for (const {definition:d,svg} of assets) {
      const [,,w,h] = d.viewBox.split(' ').map(Number);
      assert.ok(svg.includes(`viewBox="${d.viewBox}"`),d.id);
      assert.ok(svg.includes(`width="${w}" height="${h}"`),d.id);
      for (const id of d.parts??[]) assert.ok(svg.includes(`id="${id}"`),`${d.id}/${id}`);
      for (const slot of Object.keys(d.slots??{})) assert.ok(svg.includes(`<g id="${slot}">`),`${d.id}/${slot}`);
      for (const [event,duration] of Object.entries(d.events??{})) {
        assert.ok(svg.includes(`[data-anim="${event}"]`),`${d.id}/${event}`);
        assert.ok(svg.includes(`${duration}ms`),`${d.id}/${event}`);
      }
      if(d.tint) assert.ok(svg.includes('currentColor'),d.id);
      const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
      assert.equal(ids.length,new Set(ids).size,`duplicate IDs: ${d.id}`);
      const first = namespaceSvg(svg,'i1'); const second = namespaceSvg(svg,'i2');
      for (const id of ids) { assert.ok(first.includes(`id="i1-${id}"`)); assert.ok(!second.includes(`id="i1-${id}"`)); }
    }
  });
  await check('All generated placeholder SVGs are well-formed XML',async () => {
    await writeFile(join(temp,'placeholders.json'),JSON.stringify(assets.map(a=>({id:a.definition.id,svg:a.svg}))));
    const parsed = spawnSync('python3',['-c',`import json,sys,xml.etree.ElementTree as E\nfor a in json.load(open(sys.argv[1])):\n r=E.fromstring(a['svg']); assert r.tag=='{http://www.w3.org/2000/svg}svg',a['id']`,join(temp,'placeholders.json')],{encoding:'utf8'});
    assert.equal(parsed.status,0,parsed.stderr);
  });
  const chestFixture=assets.find(a=>a.definition.id==='mon_chest').svg.replace('</svg>','<text x="160" y="340" text-anchor="middle" fill="'+manifest.palette.text+'" font-size="18" data-replacement="v2-bite-check">BITE V2 CHECK</text></svg>');
  await writeFile(join(here,'mon_chest.with-bite.svg'),chestFixture);
  await check('Rules use first character and relics first two characters of provided names',() => {
    for (const {definition:d,svg} of assets.filter(a=>/^(rule|relic)_/.test(a.definition.id))) {
      const label=d.desc.split('：')[0].slice(0,d.id.startsWith('rule_')?1:2);
      assert.ok(svg.includes(`>${label}</text>`),d.id);
    }
  });
  await check('Batch filters combine with changed-only without losing untagged assets',() => {
    for (const [changed,batch,expected] of [[false,'all',75],[false,'第1批',3],[false,'第2批',16],[true,'all',19],[true,'第1批',3],[true,'第2批',16]])
      assert.equal(manifest.assets.filter(a=>matchesAssetFilter(a,changed,batch)).length,expected);
  });
  await check('Missing artwork resolves every asset and reports all 75 progress steps',async () => {
    let progress=0; const paths=[];
    const store=await loadArtAssets({fetcher:async (url,options)=>{
      paths.push([url,options]); return String(url).endsWith('art-manifest.json')?new Response(JSON.stringify(manifest)):new Response('',{status:404});
    },onProgress:(loaded,total)=>{progress=loaded;assert.equal(total,75);}});
    assert.equal(store.assets.size,75); assert.equal(paths.length,76); assert.equal(progress,75);
    assert.ok(paths.every(([,o])=>o.cache==='no-store'));
    assert.ok([...store.assets.values()].every(a=>a.source==='placeholder'));
    store.dispose();
  });
  await check('Rule sign icon uses current instance, contract bounds, current loaded URL, and one reusable image',() => {
    const previous=globalThis.document;const attrs=new Map();const image={dataset:{},setAttribute:(k,v)=>attrs.set(k,v)};let inserted=false;let appends=0;
    const slot={id:'i123-icon_slot',localName:'g',querySelector:()=>inserted?image:null,append:()=>{inserted=true;appends++;}};
    const other={id:'i456-icon_slot',localName:'g',querySelector:()=>{throw new Error('wrong instance');},append:()=>{throw new Error('wrong instance');}};
    const sign={dataset:{artId:'ui_rule_sign',artPrefix:'i123'},querySelectorAll:()=>[other,slot]};
    globalThis.document={createElementNS:()=>image};
    const store=new ArtStore(manifest,assets);
    try {
      assert.equal(store.setSlotIcon(sign,'icon_slot','rule_bite'),image);
      for (const [key,value] of Object.entries({x:'20',y:'16',width:'56',height:'56',href:'blob:rule_bite'})) assert.equal(attrs.get(key),value);
      store.setSlotIcon(sign,'icon_slot','rule_bell');assert.equal(appends,1);assert.equal(attrs.get('href'),'blob:rule_bell');
    } finally {globalThis.document=previous;store.dispose();}
  });
  const oldSet = globalThis.setTimeout; const oldClear = globalThis.clearTimeout;
  let now=0; let nextId=0; const timers=new Map();
  const tick = ms => { const target=now+ms; while(true) {const due=[...timers].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0]; if(!due)break; now=due[1].at;timers.delete(due[0]);due[1].fn();}now=target;};
  const fakeSvg = id => {const attrs=new Map();return{dataset:{artId:id},getBoundingClientRect:()=>({}),setAttribute:(k,v)=>attrs.set(k,v),getAttribute:k=>attrs.get(k)??null,removeAttribute:k=>attrs.delete(k)};};
  globalThis.setTimeout=(fn,ms)=>{const id=++nextId;timers.set(id,{fn,at:now+ms});return id;};
  globalThis.clearTimeout=id=>timers.delete(id);
  try {
    await check('Existing chest without bite finishes at precisely 300ms without animationend',async () => {
      const original=await readFile(join(root,'public/art/mon_chest.svg'),'utf8');
      assert.ok(!/data-anim\s*=\s*["']bite["']/.test(original));
      const store=new ArtStore(manifest,assets.map(a=>a.definition.id==='mon_chest'?{...a,svg:original,source:'art'}:a));
      const chest=fakeSvg('mon_chest'); assert.equal(store.play(chest,'bite'),300);
      tick(299);assert.equal(chest.getAttribute('data-anim'),'bite');tick(1);assert.equal(chest.getAttribute('data-anim'),null);
      store.play(chest,'bite');tick(200);store.play(chest,'bite');tick(100);assert.equal(chest.getAttribute('data-anim'),'bite');tick(200);assert.equal(chest.getAttribute('data-anim'),null);
      store.dispose();
    });
    await check('Finite animation tails survive hit-stop; infinite idle is ignored; newer events are protected',async () => {
      const store=new ArtStore(manifest,assets);const chest=fakeSvg('mon_chest');let finish;
      const done=new Promise(resolve=>{finish=resolve;});
      chest.getAnimations=()=>[{playState:'paused',effect:{getComputedTiming:()=>({endTime:400})},finished:done},{playState:'running',effect:{getComputedTiming:()=>({endTime:Infinity})},finished:new Promise(()=>{})}];
      store.play(chest,'hit');tick(400);assert.equal(chest.getAttribute('data-anim'),'hit');
      finish();await new Promise(resolve=>setImmediate(resolve));assert.equal(chest.getAttribute('data-anim'),null);
      let finishAgain;const again=new Promise(resolve=>{finishAgain=resolve;});
      chest.getAnimations=()=>[{playState:'paused',effect:{getComputedTiming:()=>({endTime:400})},finished:again}];
      store.play(chest,'hit');tick(400);store.play(chest,'bite');finishAgain();await new Promise(resolve=>setImmediate(resolve));
      assert.equal(chest.getAttribute('data-anim'),'bite');chest.getAnimations=()=>[];tick(300);assert.equal(chest.getAttribute('data-anim'),null);store.dispose();
    });
    await check('Wound-down persists/restores; clearing light before out leaves rainbow unlit',() => {
      const store=new ArtStore(manifest,assets);const soldier=fakeSvg('mon_soldier');const slot=fakeSvg('ui_rainbow_slot');
      store.setStay(soldier,'wound_down');store.setStay(slot,'light');tick(10000);
      assert.equal(soldier.getAttribute('data-anim'),'wound_down');assert.equal(slot.getAttribute('data-anim'),'light');
      store.play(soldier,'hit');tick(400);assert.equal(soldier.getAttribute('data-anim'),'wound_down');
      store.setStay(soldier,null);assert.equal(soldier.getAttribute('data-anim'),null);
      store.setStay(slot,null);assert.equal(store.play(slot,'out'),300);tick(300);assert.equal(slot.getAttribute('data-anim'),null);
      assert.equal(store.getStay(slot),null);store.dispose();
    });
  } finally {globalThis.setTimeout=oldSet;globalThis.clearTimeout=oldClear;}
  await check('All 63 delivered artwork files retain their baseline SHA-256',async () => {
    const baseline=JSON.parse(await readFile(join(here,'original-art-sha256.json'),'utf8'));
    assert.equal(Object.keys(baseline).length,63);
    for(const [file,expected] of Object.entries(baseline)) assert.equal(createHash('sha256').update(await readFile(join(root,'public/art',file))).digest('hex'),expected,file);
  });
  const report={checkedAt:new Date().toISOString(),method:'Node 24 native TypeScript stripping + assertions + Python XML parser; not typecheck, Vitest, or browser validation',checks:results};
  await mkdir(here,{recursive:true});await writeFile(join(here,'contract-result.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally {await rm(temp,{recursive:true,force:true});}
