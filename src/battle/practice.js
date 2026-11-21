// Practice borrows the normal battle engine, never its run, RNG or collection.
import {RULES as R,EXPERIMENT as X} from '../config.js';
import {newRun,startFight} from '../rules.js';
import {traitOf} from '../explore/roster.js';
import {CREATURES} from './creature-catalog.js';
import {drawButton,drawPointer,INK,text,box,glow,diamond,lightLine,shadowText,measure} from '../draw/ui.js';

export function practiceDeal(seed,kinds){
  const run=newRun(seed),b=startFight(run),elite=kinds.includes('elite');
  b.elite=elite;
  b.monsters=kinds.map(kind=>{
    const base=R.monsters[traitOf(kind)], hp=Math.round((X.lowHp?(elite?X.hpElite:X.hpNormal):elite?R.hpElite:R.hpNormal)*(kinds.length===1?1:elite?(kind==='elite'?.8:.25):kinds.length===2?.55:.38));
    return {...base,kind,name:CREATURES[kind].name,maxHp:hp,hp,attacks:0};
  });
  return {run,b};
}
export function practicePanel(c,g,w,h,p){
  const z=[],s=Math.min(w/1250,h/720),ox=(w-1040*s)/2,oy=(h-580*s)/2;
  c.save();c.fillStyle='rgba(3,7,9,.8)';c.fillRect(0,0,w,h);c.translate(ox,oy);c.scale(s,s);
  const btn=(x,y,bw,bh,label,action,arg,primary=false)=>{const r={x:ox+x*s,y:oy+y*s,w:bw*s,h:bh*s,action,arg},hover=p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h;z.push(r);
    if(primary){drawButton(c,{x,y,w:bw,h:bh},label,hover,true);return;}
    // 普通按钮：左对齐的字，悬停变暖、左边一颗小菱形、下面一条暖线
    const size=bh>44?22:18,tw=measure(c,label,size,true);
    if(hover){glow(c,x+tw/2,y+bh/2,tw*.9,'rgba(242,182,96,.6)',.28,.45);diamond(c,x-12,y+bh/2,5,INK.warm);lightLine(c,x-4,x+tw+16,y+bh/2+size*.5+8,INK.warm);}
    shadowText(c,label,x,y+bh/2,size,hover?INK.warmHi:INK.light,'left',true);};
  text(c,'夜林   /   练习',28,30,17,INK.gold);text(c,g.phase==='practiceMenu'?'战斗练习':g.practice.reason,26,91,48,INK.light,'left',true);
  box(c,28,143,982,1,'#5b695f',null,0);
  if(g.phase==='practiceMenu'){
    text(c,'点怪物加入阵容，最多三只，可重复。点下方位置可以移除。',28,182,21,INK.muted);
    Object.entries(CREATURES).forEach(([id,m],i)=>btn(28+(i%3)*334,221+Math.floor(i/3)*61,309,48,m.name,'practiceAdd',id));
    text(c,'出场顺序',28,387,17,INK.gold);g.practice.kinds.forEach((k,i)=>btn(28+i*228,415,208,42,(i+1)+'  '+CREATURES[k].name+'   ×','practiceRemove',i));
    if(g.practice.kinds.length)btn(727,500,277,54,'开始练习','practiceGo',null,true);
  }else{
    text(c,'仅本次练习',28,207,18,INK.gold);text(c,g.practice.kinds.map(k=>CREATURES[k].name).join('  /  '),28,263,33);
    text(c,`第 ${g.b.turn} 回合　·　最高回合伤害 ${g.run.maxTurn}　·　不结算掉落`,28,329,22,INK.muted);
    btn(380,500,288,54,'换组怪物','practiceSetup');btn(704,500,300,54,'原样再来','practiceGo',null,true);
  }
  btn(28,500,198,54,'返回大厅','practiceLeave');c.restore();drawPointer(c,p.x,p.y);return z;
}
export function practiceBadge(c,g,w,p,z){
  const r={x:w/2-93,y:74,w:186,h:28,action:'practiceSetup'};
  const hover=p.x>r.x&&p.x<r.x+r.w&&p.y>r.y&&p.y<r.y+r.h;
  c.save();c.shadowColor='rgba(2,6,8,.85)';c.shadowBlur=8;text(c,'木桩练习　·　换组怪物',w/2,r.y+15,14,hover?INK.warmHi:INK.gold,'center');c.restore();z.push(r);
  if(hover)drawPointer(c,p.x,p.y,true);
}
