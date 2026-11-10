import { describe,it,expect } from 'vitest';
import { SAVE_KEYS, loadRun, loadRecords, type SaveStorage } from '../save';
import { createRun, chooseRelic, chooseDoor, doorOptions, chooseLoot, skipLoot, shopCopy, encodeRunSave, decodeRunSave, endRunTurn, undoRun, type RunState } from './index';
import { start, play, deal, win } from './batch-one-fixtures';
function reload(r:RunState) {const raw=encodeRunSave(r)!;const result=decodeRunSave(raw);expect(result.reason).toBe('ok');expect(result.state).toEqual(r);return result.state!;}

describe('第一批 §11 save and continuation',()=>{
  it('211 old version three is discarded without changing old records',()=>{const records={played:10,wins:3,farthest:7,bestTurn:12345,maxOverkill:10};const data=new Map<string,string>([[SAVE_KEYS.run,JSON.stringify({version:3,state:createRun(1)})],[SAVE_KEYS.records,JSON.stringify(records)]]);const storage:SaveStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);},removeItem:k=>{data.delete(k);}};const result=loadRun(storage);expect([result.state,result.reason,result.clear]).toEqual([null,'outdated',true]);expect(storage.getItem(SAVE_KEYS.run)).toBe(null);expect(loadRecords(storage)).toEqual(records);});
  it('212 each saved checkpoint continues identically for thirty commands through doors/shop/elite/seal/hourglass/twice',()=>{
    const initial=start(49,'twice');deal(initial,['seal','hourglass','bag']);
    const checkpoints:RunState[]=[reload(initial)]; const seen=new Set<string>();
    // Pure deterministic command driver. Fixture dealing only selects real canonical cards;
    // each actual play still compares the production preview with the command result.
    function command(r:RunState,step:number){
      seen.add(r.phase);
      if(r.phase==='relic'){chooseRelic(r,0);return;}
      if(r.phase==='doors'){const shop=doorOptions(r).findIndex(d=>d.reward==='shop');chooseDoor(r,shop<0?0:shop);return;}
      if(r.phase==='shop'){shopCopy(r,r.cards.find(c=>!c.type)!.id);return;}
      if(r.phase==='loot'){if(r.loot.length)chooseLoot(r,0);else skipLoot(r);return;}
      if(r.phase==='victory'||r.phase==='defeat')throw new Error('Fixture ended early');
      if(r.game.row.length===0){deal(r,['seal','hourglass','bag']);play(r);return;}
      if(r.game.row.length===1){play(r);return;}
      if(r.game.row.length===2){play(r);return;}
      // Stay in room six to permit 30 more genuine commands from every checkpoint.
      if(r.room===6){if(step%2===0)undoRun(r);else{endRunTurn(r);r.hearts=r.maxHearts;}return;}
      win(r);
    }
    const uninterrupted=reload(initial);
    for(let step=0;step<24;step++){command(uninterrupted,step);checkpoints.push(reload(uninterrupted));}
    expect([...seen]).toContain('doors');expect([...seen]).toContain('shop');expect([...seen]).toContain('relic');
    for(const checkpoint of checkpoints){const a=reload(checkpoint),b=reload(checkpoint);for(let step=0;step<30;step++){command(a,step);command(b,step);expect(b).toEqual(a);const restored=reload(b);Object.assign(b,restored);}}
  });
  it('regression initial relic options and extended countdown save verbatim',()=>{reload(createRun(873));const r=start(1,'twice');deal(r,['hourglass']);play(r);expect(r.monster.countdown>r.monster.maxCountdown).toBe(true);const loaded=reload(r);expect(undoRun(loaded)).toBe(true);});
});
