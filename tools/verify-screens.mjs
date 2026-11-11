import fs from 'node:fs';
import path from 'node:path';
const directory=path.resolve('artifacts/screens');
const scenes=['home','relic','arrange','strike','broken','loot','elite-relic','doors','shop','victory','defeat','practice',...['mon_dragon','mon_clock','ui_rainbow_slot','ui_rule_sign'].map(id=>'art-'+id)];
function difference(a,b,p='$'){
 if(typeof a!==typeof b||a===null||b===null)return a===b?'':`${p}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`;
 if(Array.isArray(a)&&Array.isArray(b)){if(a.length!==b.length)return p+'.length';for(let i=0;i<a.length;i++){const d=difference(a[i],b[i],p+'['+i+']');if(d)return d;}return '';}
 if(typeof a==='object'){for(const key of new Set([...Object.keys(a),...Object.keys(b)])){if(!(key in a)||!(key in b))return p+'.'+key+' missing';const d=difference(a[key],b[key],p+'.'+key);if(d)return d;}return '';}
 return Object.is(a,b)?'':`${p}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`;
}
const report={pairs:[],failures:[]};let html='<!doctype html><meta charset="utf-8"><title>新卡牌 · H5 / Godot 对照</title><style>body{background:#0d111c;color:#e6dec8;font:16px sans-serif;margin:24px}a{color:#c2a670}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:36px}img{width:100%;object-fit:contain;border:1px solid #6e542b}h2{margin-top:40px}figure{margin:0}figcaption{padding:10px}pre{white-space:pre-wrap}</style><h1>新卡牌 · H5 / Godot 配对截图</h1><p>同种子1979、同方向与同场景。截图旁JSON保存实际业务状态；状态比较与规则黄金重放另有报告。</p>';
for(const [layout,w,h]of [['landscape',1280,720],['portrait',720,1280]])for(const scene of scenes){
 const label=layout+'-'+scene;const files=['h5','godot'].map(engine=>`${label}-${engine}.png`);
 try{
  for(const file of files){const bytes=fs.readFileSync(path.join(directory,file));if(bytes.toString('hex',0,8)!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==w||bytes.readUInt32BE(20)!==h)throw Error('Invalid dimensions '+file);}
  const states=files.map(file=>JSON.parse(fs.readFileSync(path.join(directory,file.replace(/\.png$/,'.json')),'utf8')));
  const diff=difference(states[0],states[1]);if(diff)throw Error(diff);
  report.pairs.push({scene:label,state_equal:true,dimensions_equal:true,h5:files[0],godot:files[1]});
 }catch(error){report.failures.push({scene:label,error:error.message});}
 html+=`<h2>${label}</h2><div class="pair">`+files.map((file,i)=>`<figure><figcaption>${i?'Godot':'H5'} · <a href="${file.replace(/\.png$/,'.json')}">状态JSON</a></figcaption><a href="${file}"><img loading="lazy" src="${file}"></a></figure>`).join('')+'</div>';
}
html+='<h2>验证结果</h2><pre>'+JSON.stringify({pairs:report.pairs.length,failures:report.failures},null,2).replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</pre>';
fs.writeFileSync(path.join(directory,'index.html'),html);fs.writeFileSync(path.join(directory,'comparison.json'),JSON.stringify(report,null,2));
console.log('SCREEN_STATE_PAIRS',report.pairs.length,'passed;',report.failures.length,'failed; visual review is separate');for(const failure of report.failures)console.error(failure.scene,failure.error);if(report.failures.length)process.exitCode=1;
