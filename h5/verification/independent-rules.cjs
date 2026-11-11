const assert = require('node:assert/strict');
const R = require('./compiled/index.js');
const cases = [
 [[1],[100],2,100], [[1,1],[100,400],3,500], [[1,3],[100,800],4,900],
 [[1,6],[100,2000],4,2100], [[1,2],[100,200],3,300], [[0,1],[0,400],4,400],
 [[7,0],[300,0],4,300], [[3,6],[200,400],3,600],
 [[1,3,2,6,4,5],[100,800,800,3200,3200,12800],64,209000],
 [[1,3,2,6,4,5,5,2],[100,800,800,3200,3200,12800,25600,32500],130,267100],
 [[1,3,7,3,2,6,4,5],[100,800,2400,3200,3200,12800,12800,51200],256,865000],
 [[1,3,2,5,4,6],[100,800,800,8000,3200,12800],64,25700],
 [[1,3,2,6,4,5,4,6,2,3,1,5],null,4096,1553000],
];
let checks=0;
function eq(a,b,msg){assert.deepStrictEqual(a,b,msg);checks++;}
function fresh(seq,opts){return R.makeDebugGame(seq,R.seededRng(123),opts);}
for(const [ix,[seq,dam,m,total]] of cases.entries()){
 const g=fresh(seq), damage=[];
 for(const v of seq){const pre=JSON.stringify(g);const preview=R.previewCard(g,g.hand[0]);eq(JSON.stringify(g),pre,`preview pure #${ix+1}`);const e=R.playCard(g,0);eq(e.dmg,preview.dmg);damage.push(e.dmg);}
 if(dam)eq(damage,dam,`case ${ix+1} damages`);
 eq(g.m,m,`case ${ix+1} multiplier`);eq(g.turnDmg,total,`case ${ix+1} total`);
 if(ix===8)eq(g.row[5].rainbow,188100);
 if(ix===10)eq(g.row[7].rainbow,778500);
 if(ix===12)eq(g.row.filter(x=>x.rainbow>0).length,1);
}
{const g=fresh([1]);g.xp=[14,0,0];eq(R.playCard(g,0).dmg,100,'14 pre-growth');eq(g.xp,[15,0,0]);eq(R.gemForm(g,0),1);}
{const g=fresh([3]);g.xp=[15,0,0];eq(R.previewCard(g,3).b,250,'15 mixed growth');}
{const g=fresh([7]);g.xp=[15,45,0];eq(R.previewCard(g,7).b,450,'16 mixed');g.opts.grow=false;eq(R.previewCard(g,7).b,300,'17 growth off');R.playCard(g,0);eq(g.xp,[16,46,1],'growth off still counts');}
{const g=fresh([1,3]);R.playCard(g,0);const before=R.cloneGame(g);R.playCard(g,0);R.undo(g);eq(g,before,'18 exact undo');eq(g.xp,[1,0,0]);}
{const g=R.createGame(R.seededRng(11));eq([g.deck.length,g.hand.length,g.turn],[24,6,1],'19');R.playCard(g,0);R.playCard(g,0);R.playCard(g,0);R.endTurn(g,R.seededRng(11));eq([g.discard.length,g.hand.length,g.deck.length,g.turn],[3,6,21,2],'20');eq(R.undo(g),false,'undo clears');}
{const g=R.createGame(R.seededRng(22));R.endTurn(g,R.seededRng(22));eq([g.turn,g.hand.length,g.deck.length],[1,6,24],'21');}
{const g=fresh(cases[8][0]);while(g.hand.length)R.playCard(g,0);R.endTurn(g,R.seededRng(9));eq([g.last,g.best,g.m,g.rainbow],[209000,209000,1,false],'23');}
const nums=[[0,'0'],[9999,'9,999'],[10000,'1万'],[12000,'1.2万'],[267100,'26.71万'],[1000000,'100万'],[12300000,'1230万'],[99990000,'9999万'],[123456789,'1.235亿'],[1e12,'1兆'],[2.5e16,'2.5京']];
for(const [n,out] of nums)eq(R.formatNumber(n),out,`format ${n}`);
// Independent state/invariant stress: 100 seeds, 100 rounds, shuffled selection, arbitrary undos.
let rounds=0,plays=0;
function invariant(g){const cards=[...g.deck,...g.hand,...g.row,...g.discard];eq(cards.length,30);eq(new Set(cards.map(x=>x.id)).size,30);const histogram=cards.reduce((a,c)=>(a[c.v]=(a[c.v]||0)+1,a),{});eq(histogram,{0:1,1:5,2:5,3:4,4:5,5:4,6:4,7:2});}
for(let seed=0;seed<100;seed++){
 const rng=R.seededRng(seed),g=R.createGame(rng);
 for(let round=0;round<100;round++){
  const limit=round%2?6:8;R.setHandLimit(g,limit,rng);invariant(g);
  if(round%11===0){R.updateSettings(g,{grow:!g.opts.grow},rng);R.resetGrowth(g);}
  while(g.hand.length){const ix=Math.floor(rng()*g.hand.length);const before=R.cloneGame(g);const e=R.playCard(g,ix);plays++;invariant(g);if(rng()<.25){eq(R.undo(g),true);eq(g,before,'full snapshot exact');R.playCard(g,ix);invariant(g);}}
  const total=g.total;R.endTurn(g,rng);eq(g.total,total);invariant(g);rounds++;
 }
}
{const g=R.createGame(R.seededRng(5));R.setHandLimit(g,8,R.seededRng(5));eq(g.hand.length,8);R.setHandLimit(g,6,R.seededRng(5));eq(g.hand.length,8,'shrink retains cards');}
{const g=fresh([1,3]);g.xp=[15,0,0];R.playCard(g,0);const e=R.playCard(g,0);eq(R.formatFormula(e),'黄宝石：红 150 + 绿 100 = 250 × 倍率 2 × 顺色 2 = 1,000');}
console.log(JSON.stringify({status:'PASS',specifiedRuleCases:23,formatCases:11,seededStressGames:100,stressRounds:rounds,stressPlays:plays,assertions:checks,note:'Independent Node-level acceptance; no browser or physical-device coverage.'},null,2));
