const assert=require('node:assert/strict'),R=require('./compiled/index.js');
let checks=0;
function same(a,b,label){assert.deepStrictEqual(a,b,label);checks++;}
function oracleStep(s,v){
 const previous=s.sequence.at(-1);const d=previous===undefined?null:[1,2,4].filter(bit=>!!(previous&bit)!==!!(v&bit)).length;
 const k=d===0?'same':d===1?'shun':d===3?'white':'plain';
 const cm={same:2,shun:2,white:5,plain:1}[k];
 const values=s.xp.map(n=>!s.grow?100:n<15?100:n<45?150:200);
 const b=[1,2,4].reduce((sum,bit,i)=>sum+((v&bit)?values[i]:0),0);
 const damage=b*s.multiplier*cm;
 s.multiplier=k==='shun'||k==='white'?s.multiplier*2:s.multiplier+1;
 if(k!=='shun')s.colors=new Set();
 if([1,2,3,4,5,6].includes(v))s.colors.add(v);
 s.damage+=damage;let bonus=0;
 if(!s.rainbow&&s.colors.size===6){bonus=s.damage*9;s.damage+=bonus;s.rainbow=true;}
 for(let i=0;i<3;i++)if(v&(1<<i))s.xp[i]++;
 s.sequence.push(v);return {k,b,damage,bonus};
}
for(let seed=1;seed<=500;seed++){
 const rng=R.seededRng(seed);const seq=R.shuffle(R.createDeck(),rng).map(x=>x.v);
 const g=R.makeDebugGame(seq,rng,{grow:seed%4!==0});
 g.xp=[seed%48,(seed*7)%48,(seed*17)%48];
 const o={sequence:[],xp:[...g.xp],grow:g.opts.grow,multiplier:1,damage:0,rainbow:false,colors:new Set()};
 for(const v of seq){const expected=oracleStep(o,v),actual=R.playCard(g,0);same([actual.k,actual.b,actual.dmg,actual.rainbow],[expected.k,expected.b,expected.damage,expected.bonus],'entry');same([g.m,g.turnDmg,g.xp,g.rainbow],[o.multiplier,o.damage,o.xp,o.rainbow],'state');}
}
for(const count of [0,14,15,44,45])for(const v of [0,1,2,3,4,5,6,7]){
 const g=R.makeDebugGame([v],R.seededRng(1));g.xp=[count,count,count];
 const before=R.previewCard(g,g.hand[0]);const played=R.playCard(g,0);same(before,played,'preview equivalence');
 const affected=[1,2,4].flatMap((bit,i)=>(v&bit)&&(count===14||count===44)?[i]:[]);same(played.grown,affected,'precise growth');
}
console.log(JSON.stringify({status:'PASS',seededFullDeckSequences:500,cardTransitions:15000,growthBoundaryCases:40,assertions:checks,independentOracle:true},null,2));
