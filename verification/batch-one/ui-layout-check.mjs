/** Offline geometry only: not a browser or a touch-device test. */
import '../v2/typescript-loader.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { portrait } = await import('../../src/layout/portrait.ts');
const { landscape } = await import('../../src/layout/landscape.ts');
const { fitLayout } = await import('../../src/layout/fit.ts');
const { handPositions, handScale } = await import('../../src/ui/geometry.ts');
const { MOTION } = await import('../../src/layout/types.ts');
let assertions=0;
for(const [w,h] of [[390,844],[360,800],[430,932],[1280,720],[1920,1080]]) {
 const base=w>h?landscape:portrait, unit=Math.min(w/base.width,h/base.height);
 const layout=fitLayout(base,base.name==='portrait'?h/unit-base.height:w/unit-base.width);
 for(const count of [9,10,12]) {
  const positions=handPositions(count,layout),scale=handScale(count,layout),cardW=MOTION.cardW*scale;
  assert.equal(positions.length,count);assertions++;
  for(const [i,p] of positions.entries()){
   assert(p.x>=0&&p.x+cardW<=layout.width+1e-8);assertions++;
   if(i){assert(p.x-positions[i-1].x>=layout.handMinStep*(scale/layout.hand.scale)-1e-8);assertions++;}
  }
 }
 for(const rect of [layout.doors.detail,layout.doors.hint,layout.shop.grid,layout.shop.back,layout.shop.confirm,...layout.shop.ops]){
  assert(rect.x>=0&&rect.y>=0&&rect.x+rect.w<=layout.width&&rect.y+rect.h<=layout.height);assertions++;
 }
}
const result={passed:true,assertions,scope:'Pure layout geometry at five required viewport sizes; no browser, rendering or touch validation.'};
fs.writeFileSync('verification/batch-one/ui-layout-result.json',JSON.stringify(result,null,2)+'\n');console.log(result);
