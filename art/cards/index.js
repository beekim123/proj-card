import sealTiko from './seal_tiko.js';
import {sealPalette,cardPalette} from './palettes.js';
export {sealTiko,sealPalette};
const root=new URL('./',import.meta.url);
const images=new Map();let loading,ready=false;
const order=['r','rg','g','gb','b','br','rgb'];
const names=['red','green','blue'];
const artIds=[...order.map(x=>'gem_'+x),'lens','rain','light','mirror','ice','shield','seal_badom'];
export const assetKeys=['frame_base','frame_seal','frame_hover','frame_select','corner_plate',...names.map(n=>'pip_'+n),'pip_none','pip_shift',...names.flatMap(n=>['gem_'+n,'gem_'+n+'_glow']),...artIds.map(x=>'art_'+x),'back','pile',...['spell','summon','equip','discover','heal','grow','treasure','seal'].map(n=>'badge_'+n)];
function loadImage(key,dir){const im=new Image();im.src=new URL(dir+key+'.png',root).href;return im.decode().then(()=>images.set(key,im));}
export function loadCardArt(){return loading??=(async()=>{
 const font=new FontFace('Yineng Latin',`url("${new URL('16/字体/yineng-latin.woff2',root)}")`);
 await Promise.all([font.load(),...assetKeys.map(k=>loadImage(k,'png/'))]);document.fonts.add(font);ready=true;
 })().catch(e=>{loading=null;throw e});}
export function drawCardAsset(ctx,key,x,y,w,h){const image=images.get(key);if(!image)return false;ctx.drawImage(image,x,y,w,h);return true;}
const ui='"Yineng Latin", "PingFang SC", sans-serif';
function type(ctx,s,x,y,size,color,align='left',maxWidth){if(!s&&s!==0)return;ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='alphabetic';ctx.font=`${size}px ${ui}`;if(maxWidth)ctx.fillText(String(s),x,y,maxWidth);else ctx.fillText(String(s),x,y)}
export function createSealState(p,seed=0,palette=sealPalette){return sealTiko.create(p,{palette,seed})}
export function drawCardFace(ctx,card,rect,o={}){
 if(!ready)return false;
 const {x,y,w,h}=rect,{id,col,vals=[0,0,0]}=card,seal=id==='seal'||id==='seal_badom'||id==='seal_tiko';
 const gem=id==='gem',code=order[col],art=gem?'gem_'+code:(id==='seal'?'seal_badom':id);
 const letters=gem?(code||'').split(''):vals.map((v,i)=>v?'rgb'[i]:'').filter(Boolean);
 const X=letters.length===1?[88]:letters.length===2?[54,122]:[36,88,140],size=[0,64,56,44][letters.length];
 const layer=(k,a,b,c,d)=>drawCardAsset(ctx,k,a,b,c,d);
 ctx.save();ctx.translate(x,y);ctx.scale(w/200,h/280);
 ctx.save();ctx.beginPath();ctx.roundRect(12,12,176,150,4);ctx.clip();
 if(id==='seal_tiko'){if(o.p&&o.sealState){ctx.translate(12,12);sealTiko.draw(o.p,o.sealState)}else{ctx.fillStyle=cardPalette.cavity[0];ctx.fillRect(12,12,176,150)}}
 else layer('art_'+art,12,12,176,150);ctx.restore();
 if(gem)letters.forEach((v,i)=>{const ix='rgb'.indexOf(v),cx=12+X[i];if(o.resolving)layer('gem_'+names[ix]+'_glow',cx-size*.64,76-size*.64,size*1.28,size*1.28);type(ctx,vals[ix],cx,138,26,cardPalette.thread[3],'center')});
 layer(seal?'frame_seal':'frame_base',0,0,200,280);
 const width=gem?Math.max(31,letters.length*16+10):48;layer('corner_plate',5,5,width,25);
 if(col===8){layer('pip_none',7,11,12,12);type(ctx,'无色',20,22,11,cardPalette.panel[3])}
 else if(col===7){layer('pip_shift',8,8,17,17);type(ctx,'变色',25,22,11,cardPalette.panel[3])}
 else letters.forEach((v,j)=>{const ix='rgb'.indexOf(v);layer('pip_'+names[ix],7+j*16,8,18,18);if(!gem)type(ctx,vals[ix],36,23,16,cardPalette.thread[3],'center')});
 if(!gem)layer('badge_'+(card.badge||(seal?'seal':'spell')),165,6,27,27);
 type(ctx,card.name,14,189,18,cardPalette.cardFrame[3],'left',170);
 const desc=String(card.text??'');let row='',line=0;ctx.font=`14px ${ui}`;
 for(const c of desc){if(row&&ctx.measureText(row+c).width>170&&line===0){type(ctx,row,14,214,14,cardPalette.panel[3]);row='';line++}row+=c}type(ctx,row,14,214+line*18,14,cardPalette.panel[3],'left',170);
 if(o.hint){ctx.fillStyle=cardPalette.cavity[0];ctx.fillRect(10,248,180,24);type(ctx,o.hint,100,265,14,cardPalette.thread[3],'center',172)}
 if(o.selected)layer('frame_select',0,0,200,280);if(o.hover)layer('frame_hover',0,0,200,280);
 if(o.disabled){ctx.fillStyle=cardPalette.cavity[0];ctx.globalAlpha*=.55;ctx.beginPath();ctx.roundRect(2,2,196,276,8);ctx.fill()}
 ctx.restore();return true;
}
