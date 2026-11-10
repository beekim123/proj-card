import assert from 'node:assert/strict';
import * as old from './baseline/index.ts';
import * as next from './rules/index.ts';
const strip=x=>JSON.parse(JSON.stringify(x,(k,v)=>k==='effects'?undefined:v));
let actions=0;
for(let seed=0;seed<250;seed++) {
 const a=old.createGame(seed,{tools:true,hand:7}),b=next.createGame(seed,{tools:true,hand:7});
 for(let turn=0;turn<80;turn++){
   for(let i=0;i<10&&a.hand.length;i++) {
    const index=(seed+turn+i)%a.hand.length;
    assert.deepEqual(strip(next.previewCard(b,b.hand[index])),old.previewCard(a,a.hand[index]));
    assert.deepEqual(strip(next.playCard(b,index)),old.playCard(a,index));
    assert.deepEqual(strip(b),a);
    if(i===3) {old.undo(a);next.undo(b);assert.deepEqual(strip(b),a);}
    actions++;
   }
   old.endTurn(a);next.endTurn(b);assert.deepEqual(strip(b),a);
 }
}
console.log(`Migration differential: ${actions} plays across 250 seeds, preview/play/undo/full-state identical to supplied baseline (new effects excluded).`);
