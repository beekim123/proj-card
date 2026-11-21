import {WORLD} from '../config.js';
import {createWorld,monsterAnchorHeight} from '../world.js';

const seed=73131;
const reference={width:1120,height:640,centerY:205,floorY:604};
const defaults={hit:{damage:1,crit:false},heavyHit:{damage:2,crit:true}};

export function createMonsterView(runtime,id) {
  const module=runtime.module(id);
  if(!module) throw new RangeError('没有找到怪物模块 '+id);
  const world=createWorld(seed), enemy={x:0,z:0,kind:id,hp:1};
  const scene={eye:WORLD.eye,time:0,enemies:[enemy]};
  const bounds=module.bounds;
  const anchor=bounds?.originHeight??monsterAnchorHeight(module.anchor);
  const hides=module.events.includes('hide');
  let amount=0;
  function reset() {
    enemy.animation=runtime.create(id,{seed,elite:false});
    enemy.animation.trigger('idle');
    if(hides) enemy.animation.trigger('hide',{amount});
  }
  reset();
  return {
    world,
    view(w,h) {
      // Match the artist's framing by moving the forest camera to the same apparent scale.
      const scale=Math.min(w/reference.width,h/reference.height);
      const f=w*WORLD.focalRatio;
      const cm=bounds?Math.min(w*.74/(bounds.right-bounds.left),h*.70/(bounds.bottom-bounds.top)):0;
      const depth=bounds?f/(100*cm):f/(scale*(reference.floorY-reference.centerY)/monsterAnchorHeight('center'));
      const vertical=bounds?(bounds.top+bounds.bottom)*cm/(2*f):(reference.height/2-(anchor?reference.centerY:reference.floorY))*scale/f;
      world.pitch=Math.asin((anchor-scene.eye)/(depth*Math.hypot(1,vertical)))-Math.atan(vertical);
      enemy.z=depth*(Math.cos(world.pitch)-vertical*Math.sin(world.pitch));
      return scene;
    },
    update(dt) {
      scene.time+=dt;
      enemy.animation.update(dt);
    },
    dispatch(digit) {
      if(digit===0&&hides){
        amount=amount===1?0:amount+.5;
        enemy.animation.trigger('hide',{amount});
        return {name:'hide',amount};
      }
      const name=module.events[(digit===0?10:digit)-1];
      if(!name) return;
      reset();
      if(amount>0&&name!=='appear'){
        const seconds=Math.max(.7,9/(module.params?.hideResponse??9));
        const steps=Math.ceil(seconds*120);
        for(let i=0;i<steps;i++) enemy.animation.update(seconds/steps);
      }
      enemy.animation.trigger(name,name==='hide'?{amount}:defaults[name]);
      return {name,amount};
    }
  };
}
