/** Real pure-function checks. No DOM, browser, screenshot, FPS or typecheck claims. */
import './typescript-loader.mjs';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const { portrait } = await import('../../src/layout/portrait.ts');
const { landscape } = await import('../../src/layout/landscape.ts');
const { fitLayout } = await import('../../src/layout/fit.ts');
const { handPositions } = await import('../../src/ui/geometry.ts');
const { handSize } = await import('../../src/layout/types.ts');
const { scoreAt } = await import('../../src/ui/presentation.ts');
let checks = 0;
for(const [w,h] of [[390,844],[360,800],[430,932],[405,810],[1280,720],[1920,1080],[844,390]]) {
  const base=w>h?landscape:portrait;const extra=base.name==='portrait'?h/w*base.width-base.height:w/h*base.height-base.width;const l=fitLayout(base,extra);
  for(const count of [7,8,9]) {const {w:cw,h:ch}=handSize(l);for(const p of handPositions(count,l)){const a=p.rotation*Math.PI/180;for(const x of [0,cw])for(const y of[0,ch]){const px=p.x+cw/2+(x-cw/2)*Math.cos(a)-(y-ch)*Math.sin(a);assert(px>=-1e-8&&px<=l.width+1e-8,`${w}x${h} count ${count} x ${px}`);checks++;}}}
  assert.deepEqual(l.relicPick.points,l.loot.three);assert.equal('toughBar' in l,false);checks+=2;
  for(const rect of [l.ruleSign,l.rainbowReady]) {assert(rect.x>=0&&rect.y>=0&&rect.x+rect.w<=l.width&&rect.y+rect.h<=l.height);checks++;}
}
assert.equal(scoreAt(0,100,-16),0);assert.equal(scoreAt(4100,100,300),100);checks+=2;
for(let t=-16;t<400;t++){assert(scoreAt(0,100,t)>=0);assert(scoreAt(4100,100,t)>=100);checks+=2;}
const result={scope:'Pure geometry and score interpolation only; no browser or rendering.',passed:true,checks};
writeFileSync(new URL('./ui-geometry-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
