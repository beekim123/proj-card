// Standalone sim mirroring src/rules (base + run) with monster-rule hooks.
// Usage: import { runMany } and pass a variant config.
const DECK = [[1,5],[2,5],[4,5],[3,4],[6,4],[5,4],[7,2],[0,1]];
const TOOLS = { bag:{v:2}, lens:{v:4}, hammer:{v:1}, mirror:{v:0}, stone:{v:0} };
const TOOL_TYPES = ['bag','lens','hammer','mirror','stone'];
const CHROMA = [1,3,2,6,4,5];
const pc = x => (x&1)+((x>>1)&1)+((x>>2)&1);
function rng(seed){ let s=seed>>>0; return ()=>{ s=(s+0x6d2b79f5)>>>0; let t=s; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; }
function shuffle(a,r){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(r()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function reaction(p,c){ if(p===null) return 'plain'; const d=pc(p^c); return d===0?'same':d===1?'shun':d===3?'white':'plain'; }
const CM={plain:1,same:2,shun:2,white:5};
let GROW=[15,45]; function gv(xp,i){ return xp[i]>=GROW[1]?200:xp[i]>=GROW[0]?150:100; }

// Turn-local state used both by real play and by the planner's search.
// T = { m, turnDmg, prev, chain:[], rainbow, guardDown, tough, cd, hp, broken, xp:[3], mods }
function playOne(T, card, mon, V){
  const v = card.type==='mirror' ? (T.prev===null?0:7-T.prev) : card.v;
  let k = reaction(T.prev, v);
  const RL = V.relicSet || {};
  if (RL.firstPlainShun && k==='plain' && T.prev!==null && !T.usedPlain) { k='shun'; T.usedPlain=true; }
  let b=0; for(let i=0;i<3;i++) if(v&(1<<i)){ let g=gv(T.xp,i); if(mon.zero!=null && mon.zero===i) g=0; b+=g; }
  const cmv = (RL.white10 && k==='white') ? 10 : (RL.white8 && k==='white') ? 8 : CM[k];
  const dmg=b*T.m*cmv;
  let m2 = (k==='shun'||k==='white'||(RL.sameDouble&&k==='same')) ? T.m*2 : T.m+1;
  if (V.whiteOnlyDouble && k==='shun') m2 = T.m+1;
  const chromatic = CHROMA.includes(v);
  const chain = k==='shun' ? T.chain.slice() : [];
  if (chromatic && !chain.includes(v)) chain.push(v);
  let rb=0; if(!T.rainbow && chain.length===(RL.rainbow5?5:6)) { rb=(T.turnDmg+dmg)*9; T.rainbow=true; T.rbCount=(T.rbCount||0)+1; }
  let ham = card.type==='hammer' ? (T.turnDmg+dmg+rb) : 0;
  if (card.type==='lens') m2*=2;
  let damage=dmg+rb+ham;
  if (T.guardDown && damage>0 && V.guardDamage>1) damage=Math.round(damage*V.guardDamage);
  if (RL.overkill2 && T.broken) damage*=2;
  T.m=m2; T.turnDmg+=damage; T.chain=chain; T.prev=v;
  T.hp=Math.max(0,T.hp-damage); if(T.hp===0) T.broken=true;
  // toughness
  if (mon.weak!=null && !T.broken && !T.guardDown && (v&(1<<mon.weak))) {
    T.tough--; if (T.tough===0){ T.guardDown=true; T.breaks=(T.breaks||0)+1; if (mon.breakCancels) { T.cd=mon.maxCd; T.cancelled=true; } else T.cd+=V.guardDelay||0; }
  }
  // monster rules that move the countdown
  if (!T.broken) {
    if (mon.bite!=null && (v&(1<<mon.bite))) T.cd=Math.max(0,T.cd-1);
    if (mon.bell && k==='white') T.cd=Math.max(0,T.cd-1);
  }
  const add=[0,0,0]; for(let i=0;i<3;i++){ add[i]=(v&(1<<i)?1:0)+(card.type==='stone'?5:0); T.xp[i]+=add[i]; }
  return { k, v, damage };
}
function cloneT(T){ return { ...T, chain:T.chain.slice(), xp:T.xp.slice() }; }

// Monster rule set for the current HP layer.
function monRules(key, M, V){
  const r = { key, weak:null, zero:null, bite:null, bell:false, breakCancels:false, maxCd:M.maxCd };
  const set = V.rules||{};
  let rule = set[key];
  if (typeof rule === 'function') rule = rule(M);
  if (!rule) return r;
  for (const part of [].concat(rule)) {
    if (part==='hug') r.zero=0;          // 抱红：红宝石算 0
    if (part==='bite') r.bite=1;         // 咬手：带绿的牌倒计时 −1
    if (part==='bell') r.bell=true;      // 敲钟：凑白倒计时 −1
    if (part==='wind') { r.weak=2; r.breakCancels=true; } // 发条：蓝削韧，削空出手作废
    if (part==='tough') { r.weak=M.weak; }  // 旧韧性
  }
  return r;
}

// ---------- bots ----------
const PRI={white:3,shun:2,same:1,plain:0};
const cmpK=(a,b)=>{ for(let i=0;i<a.length;i++){ if(a[i]!==b[i]) return a[i]-b[i]; } return 0; };
function hintPick(T, hand, mon, V){
  let best=-1,key=null;
  hand.forEach((c,i)=>{ const t=cloneT(T); const e=playOne(t,c,mon,V);
    if (V.aware && !T.broken && !t.broken && T.cd-1>0 && t.cd-1<=0) return;
    if (V.limit && T.played>=V.limit[mon.key]) return;
    const kk=[PRI[e.k], (V.rbAware && e.k==='shun' && t.chain.length>T.chain.length)?1:0, t.m, e.damage];
    if(!key||cmpK(kk,key)>0){key=kk;best=i;} });
  return best;
}
function look2Pick(T, hand, mon, V){
  let best=-1, bs=null;
  const sc=(t)=>[t.broken?1:0, (t.broken||t.cd-1>0)?1:0, t.turnDmg*1 + t.m*1e-9];
  for(let i=0;i<hand.length;i++){
    const t1=cloneT(T); playOne(t1,hand[i],mon,V);
    if (V.aware && !T.broken && !t1.broken && T.cd-1>0 && t1.cd-1<=0) continue;
    let s1=sc(t1); s1=[s1[0],s1[1],t1.turnDmg+t1.m*50];
    for(let j=0;j<hand.length;j++){ if(j===i) continue; const t2=cloneT(t1); playOne(t2,hand[j],mon,V);
      if (V.aware && !t1.broken && !t2.broken && t1.cd-1>0 && t2.cd-1<=0) continue;
      const s2=[t2.broken?1:0,1,t2.turnDmg+t2.m*50]; if(cmpK(s2,s1)>0) s1=s2; }
    if(!bs||cmpK(s1,bs)>0){bs=s1;best=i;}
  }
  return best;
}
// Planner: search orders (dedupe identical cards) and allowed stopping points.
// Score: kill > no heart lost this turn (cd>0 at end, or cancelled) > damage.
function plan(T, hand, mon, V, M){
  let best=null;
  const endScore = (t)=>{
    const kill = t.broken?1:0;
    const cdAfter = t.cd-1; const safe = (t.broken || cdAfter>0) ? 1 : 0;
    return [kill, safe, t.turnDmg];
  };
  const better=(a,b)=>!b||a[0]>b[0]||(a[0]===b[0]&&(a[1]>b[1]||(a[1]===b[1]&&a[2]>b[2])));
  let nodes=0;
  function dfs(t, rem, seq){
    if (++nodes>V.planNodes) return;
    const s=endScore(t); if(better(s,best?.s)) best={s,seq:seq.slice()};
    if (V.limit && V.limit[mon.key]!=null && seq.length+(T.played||0)>=V.limit[mon.key]) return;
    const seen=new Set();
    for(let i=0;i<rem.length;i++){
      const c=rem[i]; const sig=(c.type||'')+c.v; if(seen.has(sig)) continue; seen.add(sig);
      if(c.type==='bag'){ /* treat bag as gems only during search */ }
      const t2=cloneT(t); playOne(t2,c,mon,V);
      const r2=rem.slice(0,i).concat(rem.slice(i+1)); seq.push(c.id); dfs(t2,r2,seq); seq.pop();
    }
  }
  dfs(cloneT(T), hand, []);
  return best?.seq ?? [];
}

function runOne(seed, V){
  const r = rng(seed);
  let id=0; const cards=[]; for(const [v,n] of DECK) for(let i=0;i<n;i++) cards.push({id:++id,v});
  const fights = V.fights;
  let prevN=null;
  const keys = fights.map(f=>{ if(f.type!=='normal') return f.monster; const ch=V.normals.filter(k=>k!==prevN); const s=ch[Math.floor(r()*ch.length)]; prevN=s; return s; });
  const relics = new Set(V.relics||[]);
  const applyRelics=()=>{ V.relicSet=Object.fromEntries([...relics].map(x=>[x,true])); GROW = relics.has('fastGrow')?[8,24]:[15,45]; };
  if (V.openRelic) { const opts=shuffle(V.relicPool.slice(),r).slice(0,3); const pick=V.relicPick?V.relicPick(opts):opts[0]; relics.add(pick); }
  applyRelics();
  const maxHearts = V.hearts + (relics.has('heart1')?1:0);
  let hearts=maxHearts, hand=V.handStart+(relics.has('hand1')?1:0), xp=[0,0,0];
  const st={ beh:{}, turns:0, hits:0, best:0, rainbows:0, breaks:0, cancels:0, fightTurns:[], lost:null, picks:[] };
  for (let f=0; f<fights.length; f++){
    const F=fights[f], key=keys[f];
    const hp0=Math.round(F.hp*(V.hpScale?.[f]??1)); const cd0=V.cdOverride?.[key]??F.countdown; const M={ key, hp:hp0, maxHp:hp0, cd:cd0, maxCd:cd0, weak:V.weak?.[key] };
    let deck=shuffle(cards.map(c=>({...c})), r), disc=[], H=[];
    const draw=n=>{ for(let i=0;i<n;i++){ if(!deck.length){ if(!disc.length) break; deck=shuffle(disc,r); disc=[]; } H.push(deck.pop()); } };
    draw(hand);
    let tough=V.toughOverride?.[key]??F.toughness??6, turn=0, overkill=0;
    while(true){
      turn++; st.turns++;
      const turnStartHp=M.hp;
      const layer = M.hp > M.maxHp*2/3 ? 0 : M.hp > M.maxHp/3 ? 1 : 2;
      let mon = monRules(key, {...M, layer}, V);
      const T={ m:(V.relicSet.startM2?2:1), usedPlain:false, turnDmg:0, prev:null, chain:[], rainbow:false, guardDown:false, tough: mon.weak!=null?tough:0, cd:M.cd, hp:M.hp, broken:false, xp, rbCount:0, breaks:0, cancelled:false };
      const row=[];
      if (V.bot==='hint'||V.bot==='random'||V.bot==='look2') {
        if (V.rbPath && !T.rainbow) { const cyc=[1,3,2,6,4,5]; const has=cyc.every(m=>H.some(c=>!c.type&&c.v===m));
          if (has) { let bestSeq=null,bd=-1; for(let st0=0;st0<6;st0++) for(const dir of [1,-1]){ const seq=[]; for(let q=0;q<6;q++) seq.push(cyc[(st0+dir*q+12)%6]);
              const t=cloneT(T); const used=new Set(); for(const m of seq){ const c=H.find(c=>!c.type&&c.v===m&&!used.has(c.id)); used.add(c.id); playOne(t,c,mon,V); }
              if(t.turnDmg>bd){bd=t.turnDmg;bestSeq=seq;} }
            for(const m of bestSeq){ const i=H.findIndex(c=>!c.type&&c.v===m); const c=H.splice(i,1)[0]; playOne(T,c,mon,V); row.push(c); T.played=(T.played||0)+1; } } }
        while(H.length){ const i = V.bot==='random'?Math.floor(r()*H.length):V.bot==='look2'?look2Pick(T,H,mon,V):hintPick(T,H,mon,V); if(i<0) break; const c=H.splice(i,1)[0]; playOne(T,c,mon,V); T.played=(T.played||0)+1; row.push(c); if(c.type==='bag') draw(2);
          const L = T.hp > M.maxHp*2/3 ? 0 : T.hp > M.maxHp/3 ? 1 : 2; if (key==='dragon' && L!==layer) { /* layer change mid-turn */ mon = monRules(key,{...M,hp:T.hp,layer:L},V); } }
      } else {
        let guard=0;
        while(H.length && guard++<20){
          const seq=plan(T,H,mon,V,M); if(!seq.length) break;
          let replan=false;
          for(const cid of seq){ const i=H.findIndex(c=>c.id===cid); const c=H.splice(i,1)[0]; playOne(T,c,mon,V); row.push(c); T.played=(T.played||0)+1;
            if(key==='dragon'){ const L = T.hp > M.maxHp*2/3 ? 0 : T.hp > M.maxHp/3 ? 1 : 2; const m2=monRules(key,{...M,hp:T.hp,layer:L},V); if(JSON.stringify(m2)!==JSON.stringify(mon)){ mon=m2; replan=true; } }
            if(c.type==='bag'){ draw(2); replan=true; }
            if(replan) break; }
          if(!replan) break;
        }
      }
      { const B=(st.beh[key] ||= {turns:0, held:0, redPos:0, redN:0, white:0}); B.turns++; B.held+=H.length;
        row.forEach((c,ix)=>{ if((c.v&1) && row.length>1){ B.redPos+=ix/(row.length-1); B.redN++; } });
        let pv=null; row.forEach(c=>{ const vv=c.type==='mirror'?(pv===null?0:7-pv):c.v; if(pv!==null && pc(pv^vv)===3) B.white++; pv=vv; }); }
      xp=T.xp; M.hp=T.hp; M.cd=T.cd; tough = T.guardDown ? (V.toughOverride?.[key]??F.toughness??6) : (mon.weak!=null?T.tough:tough); st.rainbows+=T.rbCount; st.breaks+=T.breaks; if(T.cancelled) st.cancels++;
      st.best=Math.max(st.best,T.turnDmg);
      disc.push(...row.map(c=>({...c})));
      if (T.broken){ overkill=T.turnDmg/turnStartHp; break; }
      M.cd-=1;
      if (M.cd<=0){ hearts--; st.hits++; M.cd=M.maxCd; }
      if (hearts<=0){ st.lost=f+1; break; }
      draw(hand-H.length);
      if (turn>60) { st.lost=f+1; break; }
    }
    st.fightTurns.push(turn);
    if (st.lost) break;
    if (f===fights.length-1) break;
    if (F.handUp) hand=Math.min(9,hand+F.handUp);
    if (F.type==='elite' && V.eliteHealFull) hearts=maxHearts;
    if (F.type==='elite' && V.eliteRelic) { const pool=V.relicPool.filter(x=>!relics.has(x)); const opts=shuffle(pool.slice(),r).slice(0,3); const pick = V.relicPick? V.relicPick(opts): opts[0]; relics.add(pick); applyRelics(); if(pick==='hand1') hand=Math.min(9,hand+1); }
    // loot
    const n = overkill>=10?4:3;
    const opts=shuffle(TOOL_TYPES.slice(),r).slice(0,n);
    const L=V.loot;
    const heal = ()=>{ hearts=Math.min(maxHearts,hearts+V.heal); };
    if (V.healAlways) heal();
    if (L==='skip') heal();
    else if (L==='smart' && hearts<maxHearts && !V.healAlways) heal();
    else if (L==='none') {}
    else { const pri=V.lootPri; let pick=opts[0]; if(L==='random') pick=opts[Math.floor(r()*opts.length)]; else { let b=99; for(const t of opts){ const p=pri.indexOf(t); if(p<b){b=p;pick=t;} } }
      cards.push({id:++id, v:TOOLS[pick].v, type:pick}); st.picks.push(pick); }
  }
  return { win: !st.lost, ...st };
}

export function runMany(V, N, seed0=1){
  const rs=[]; for(let s=0;s<N;s++) rs.push(runOne(seed0+s*7919, V));
  const med=a=>{ const b=a.slice().sort((x,y)=>x-y); return b[b.length>>1]; };
  const win=rs.filter(x=>x.win).length/N;
  const lostAt={}; rs.forEach(x=>{ if(x.lost) lostAt[x.lost]=(lostAt[x.lost]||0)+1; });
  return { win:+(win*100).toFixed(0), turns:med(rs.map(x=>x.turns)), hits:+(rs.reduce((a,x)=>a+x.hits,0)/N).toFixed(2),
    best:med(rs.map(x=>x.best)), rbRuns:+(rs.filter(x=>x.rainbows>0).length/N*100).toFixed(0),
    beh: (()=>{ const o={}; rs.forEach(x=>{ for(const [k,b] of Object.entries(x.beh)){ const t=(o[k] ||= {turns:0,held:0,redPos:0,redN:0,white:0}); for(const f in b) t[f]+=b[f]; } });
      const out={}; for(const [k,t] of Object.entries(o)) out[k]={ held:+(t.held/t.turns).toFixed(2), redPos:+(t.redPos/Math.max(1,t.redN)).toFixed(2), white:+(t.white/t.turns).toFixed(2) }; return out; })(),
    breaks:+(rs.reduce((a,x)=>a+x.breaks,0)/N).toFixed(1), cancels:+(rs.reduce((a,x)=>a+x.cancels,0)/N).toFixed(1), lostAt };
}

export const BASE = {
  fights: [
    { type:'normal', hp:20000, countdown:3, toughness:6 },
    { type:'normal', hp:40000, countdown:3, toughness:6 },
    { type:'elite', monster:'clock', hp:100000, countdown:3, toughness:8, handUp:1 },
    { type:'normal', hp:300000, countdown:3, toughness:6 },
    { type:'normal', hp:600000, countdown:3, toughness:6 },
    { type:'boss', monster:'dragon', hp:1500000, countdown:4, toughness:10 },
  ],
  normals:['chest','soldier','bear'], hearts:3, heal:1, handStart:7,
  weak:{ chest:1, soldier:2, bear:0, clock:2, dragon:0 },
  rules:{ chest:'tough', soldier:'tough', bear:'tough', clock:'tough', dragon:'tough' },
  guardDamage:1.5, guardDelay:0, bot:'hint', loot:'take', lootPri:['hammer','lens','bag','mirror','stone'], planNodes:60000,
};
