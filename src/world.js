import {WORLD as E} from './config.js';
import {queueAir,fieldFog} from './explore/night-air.js';
import * as land from './draw/world.js';
import {isPostGLAvailable,beginDataPass,stampPuddleData,applyPostGL,captureSceneGL} from './draw/post-gl.js';
import * as actors from './draw/actors.js';
import {poolFor,paintPool,wetTile} from './explore/wetland.js';
const TAU=2*Math.PI;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>t*t*(3-2*t);

function hash(seed,x,z) {
  let n=seed^Math.imul(x,0x9e3779b1)^Math.imul(z,0x85ebca77);
  n=Math.imul(n^(n>>>16),0x21f0aaad);
  n=Math.imul(n^(n>>>15),0x735a2d97);
  return (n^(n>>>15))>>>0;
}
function noise(seed,x,z){
  const a=Math.floor(x), b=Math.floor(z), fx=smooth(x-a), fz=smooth(z-b);
  return mix(mix(hash(seed,a,b),hash(seed,a+1,b),fx),
    mix(hash(seed,a,b+1),hash(seed,a+1,b+1),fx),fz)/4294967296;
}
// The crossing trail at the entrance winds back into the same noise field.
function trail(x,z) {
  const lane=E.trailBend*Math.sin(z/E.trailWave)+E.trailBend*.35*Math.sin(z/5);
  return Math.abs(x-lane)<E.trailWidth;
}
function growChunk(seed,cx,cz){
  const items=[], trees=[];
  let state=hash(seed,cx,cz);
  const random=()=>{ state=(Math.imul(state,1664525)+1013904223)>>>0; return state/4294967296; };
  const range=(a,b)=>mix(a,b,random());
  const pick = list => Math.floor(random()*list.length);
  function plant(type,x,z,scale=1,y=0,variant=pick(E.sizes[type])+1) {
    const [w,h]=E.sizes[type][variant-1];
    const obj={type,x,z,y,variant,w:w*scale,h:h*scale,phase:random()*TAU,face:1};
    items.push(obj);
    return obj;
  }
  const treeOK=(x,z)=>!trail(x,z)&&Math.hypot(x,z)>E.startClear&&noise(seed,x/E.noiseScale,z/E.noiseScale)>E.clearing;
  const darkTrees=[];
  const cells=E.chunk/E.cell;
  for(let iz=0;iz<cells;iz++) for(let ix=0;ix<cells;ix++){
    const x=cx*E.chunk+(ix+.5+(random()-.5)*E.jitter)*E.cell;
    const z=cz*E.chunk+(iz+.5+(random()-.5)*E.jitter)*E.cell;
    const den=noise(seed,x/E.noiseScale,z/E.noiseScale);
    if(treeOK(x,z)&&random()<mix(...E.groupChance,den)){
      const n=1+Number(random()<E.extraTrees[0])+Number(random()<E.extraTrees[1]);
      for(let k=0;k<n;k++){
        const a=random()*TAU, r=k?range(...E.groupRadius):0;
        const tx=x+Math.cos(a)*r,tz=z+Math.sin(a)*r;
        if(!treeOK(tx,tz)) continue;
        const scale=k?range(...E.sapling):1;
        const tr=plant('tree',tx,tz,scale), index=tr.variant-1;
        tr.face=tr.phase>Math.PI?-1:1;
        tr.diameter=E.trunks[index]*scale;
        trees.push(tr);
        if(den>=E.ambience.eyesDensity) darkTrees.push(tr);
        if(random()<E.vineChance) {
          const hook=E.hooks[index][pick(E.hooks[index])];
          const variant=pick(E.sizes.vine)+1;
          const [vw,vh]=E.sizes.vine[variant-1];
          tr.vine={variant,face:1,phase:random()*TAU,w:vw*scale,h:vh*scale,
            right:hook[0]*scale,up:hook[1]*scale};
        }
        if(random()<E.shrubChance) plant('shrub',tx+range(-.9,.9),tz+range(-.9,.9));
        if(random()<E.grassChance) plant('grass',tx+range(-1.1,1.1),tz+range(-1.1,1.1));
      }
    } else if(random()<E.rockChance) plant('rock',x,z);
    else if(!trail(x,z)&&random()<E.logChance) plant('log',x,z);
    if(random()<E.moteChance) plant('mote',x,z,1,range(.4,3.8));
    if(random()<E.ambience.fallChance) plant('fall',x,z,1,range(.1,.7));
  }
  for(let i=0;i<E.ambience.fogChance.length;i++) {
    if(random()<E.ambience.fogChance[i]) {
      plant('low_fog',(cx+random())*E.chunk,(cz+random())*E.chunk,1,0,i+1);
    }
  }
  if(darkTrees.length && random()<E.ambience.eyesChance) {
    const tr=darkTrees[pick(darkTrees)];
    plant('eyes',tr.x+tr.diameter,tr.z,1,range(.75,1.65));
  }
  const airHash=hash(seed^0x83f1,cx,cz);
  return {cx,cz,items,trees,airHash,perch:airHash%4===0&&trees.length?trees[airHash%trees.length]:null,pool:poolFor(cx,cz,seed)};
}
function stream(world) {
  const cx=Math.floor(world.x/E.chunk),cz=Math.floor(world.z/E.chunk);
  if(cx===world.cx&&cz===world.cz) return;
  world.cx=cx; world.cz=cz;
  const radius=Math.ceil((E.fogEnd+E.groupRadius[1])/E.chunk);
  for(const [key,c] of world.chunks)
    if(Math.abs(c.cx-cx)>radius||Math.abs(c.cz-cz)>radius) world.chunks.delete(key);
  for(let j=-radius;j<=radius;j++) for(let i=-radius;i<=radius;i++){
    const key=(cx+i)+','+(cz+j);
    if(!world.chunks.has(key)) world.chunks.set(key,growChunk(world.seed,cx+i,cz+j));
  }
  world.wetCells=new Map();const s=E.tileSize;
  for(const {pool:p} of world.chunks.values())if(p)for(let i=Math.floor((p.x-p.rx*1.06)/s);i<=Math.floor((p.x+p.rx*1.06)/s);i++)for(let j=Math.floor((p.z-p.rz*1.06)/s);j<=Math.floor((p.z+p.rz*1.06)/s);j++)world.wetCells.set(i+','+j,p);
}
export function createWorld(seed) {
  // Seeded trailheads stay inside the carved lane and keep deterministic input replays possible.
  const k=(seed>>>2)%4,z=[0,-17,25,-31][k],lane=v=>E.trailBend*Math.sin(v/E.trailWave)+E.trailBend*.35*Math.sin(v/5),x=lane(z),yaw=k?Math.atan2(lane(z+5)-x,5):0;
  const w={seed,x,z,yaw,pitch:0,walkPhase:0,bearing:yaw+.23,moonOffset:0,chunks:new Map()};
  stream(w);
  let perch=null,score=Infinity;for(const ch of w.chunks.values())for(const tr of ch.trees){const dx=tr.x-x,dz=tr.z-z,f=dx*Math.sin(yaw)+dz*Math.cos(yaw),side=dx*Math.cos(yaw)-dz*Math.sin(yaw);if(f<7||f>18||Math.abs(side)>.61*f)continue;const v=Math.abs(side/f-.31)*8+Math.abs(f-13)*.09;if(v<score){score=v;perch={ch,tr};}}
  if(perch)perch.ch.perch=perch.tr;
  return w;
}
export function worldAhead(world,forwardMeters,rightMeters=0) {
  const s=Math.sin(world.yaw),c=Math.cos(world.yaw);
  return {x:world.x+s*forwardMeters+c*rightMeters,z:world.z+c*forwardMeters-s*rightMeters};
}
function nearbyTrees(world,r) {
  const out=[];
  for(const c of world.chunks.values()){
    if(world.x+r<(c.cx*E.chunk-E.groupRadius[1])||world.x-r>((c.cx+1)*E.chunk+E.groupRadius[1])||
       world.z+r<(c.cz*E.chunk-E.groupRadius[1])||world.z-r>((c.cz+1)*E.chunk+E.groupRadius[1])) continue;
    for(const tree of c.trees)
      if(Math.abs(tree.x-world.x)<r&&Math.abs(tree.z-world.z)<r) out.push(tree);
  }
  return out;
}
export function moveWorld(world,forwardMeters,rightMeters) {
  const length=Math.hypot(forwardMeters,rightMeters);
  if(!length) return 0;
  const startX=world.x,startZ=world.z;
  const dest=worldAhead(world,forwardMeters,rightMeters);
  const steps=Math.ceil(length/E.radius), dx=(dest.x-startX)/steps, dz=(dest.z-startZ)/steps;
  for(let i=0;i<steps;i++){
    let x=world.x+dx,z=world.z+dz;
    const trees=nearbyTrees(world,2);
    for(let pass=0;pass<3;pass++){
      let overlap=false;
      for(const tree of trees){
        const tx=x-tree.x,tz=z-tree.z,d=Math.hypot(tx,tz),rr=tree.diameter*.5+E.radius;
        if(d>=rr) continue;
        overlap=true;
        if(d===0){ x=world.x; z=world.z; continue; }
        x=tree.x+tx*rr/d; z=tree.z+tz*rr/d;
      }
      if(!overlap) break;
    }
    world.x=x; world.z=z; stream(world);
  }
  const actual=Math.hypot(world.x-startX,world.z-startZ);
  world.walkPhase+=actual*Math.PI/E.stepLength;
  return actual;
}
function clearance(world,trees,p,margin) {
  const dx=p.x-world.x,dz=p.z-world.z,dd=dx*dx+dz*dz;
  let cost=0;
  for(const tr of trees){
    const k=clamp(((tr.x-world.x)*dx+(tr.z-world.z)*dz)/dd,0,1);
    const d=Math.hypot(tr.x-world.x-dx*k,tr.z-world.z-dz*k);
    cost+=Math.max(0,tr.diameter*.5+margin-d);
  }
  return cost;
}
export function placeEncounter(world,count,kinds=[]) {
  const trees=nearbyTrees(world,E.encounterDistance+4);
  let best=[], bestCost=Infinity;
  for(const angle of [0,-.16,.16,-.34,.34,-.51,.51,-.72,.72,-.95,.95]){
    const facing={x:world.x,z:world.z,yaw:world.yaw+angle};
    const points=Array.from({length:count},(_,i)=>{const d=E.encounterDepth[kinds[i]]??E.encounterDistance;return worldAhead(facing,d,Math.tan((i-(count-1)/2)*E.encounterSpread)*d);});
    const cost=points.reduce((n,p)=>n+clearance(world,trees,p,.62),Math.abs(angle)*.025);
    if(cost<bestCost){bestCost=cost;best=points;}
    if(cost===0) break;
  }
  // Low runners enter along an existing bank; choose an unobstructed near-camera shore.
  const low=kinds.indexOf('veko');if(low>=0){let score=Infinity,bank=null;for(const {pool:p} of world.chunks.values()){if(!p)continue;const q={x:p.x,z:p.z-.42*p.rz},dx=q.x-world.x,dz=q.z-world.z,d=Math.hypot(dx,dz);if(d<5||d>12)continue;const dir=Math.abs(Math.atan2(Math.sin(Math.atan2(dx,dz)-world.yaw),Math.cos(Math.atan2(dx,dz)-world.yaw)));if(dir>.65||clearance(world,trees,q,.38)>.05)continue;const cost=dir*4+Math.abs(d-8);if(cost<score){score=cost;bank=q}}if(bank)best[low]=bank}
  return best;
}
export function placeLoot(world,defeated) {
  const trees=nearbyTrees(world,E.encounterDistance+4);
  if(defeated&&clearance(world,trees,defeated,E.radius+.12)===0) return {x:defeated.x,z:defeated.z};
  let best=null,bestCost=Infinity;
  for(const dist of [E.lootDistance,3,2.4]) for(const r of [0,-.75,.75,-1.5,1.5]){
    const p=worldAhead(world,dist,r), cost=clearance(world,trees,p,E.radius+.12);
    if(cost<bestCost){bestCost=cost;best=p;}
    if(cost===0) return p;
  }
  return best;
}

function camera(world,w,h,view){
  const t=view.time||0;
  const yaw=world.yaw+(view.yawOffset||0);
  const pitch=world.pitch+(view.pitchOffset||0);
  const sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
  const sway=E.sway*Math.sin(world.walkPhase),back=view.back||0;
  const x=world.x+cy*sway-sy*back,z=world.z-sy*sway-cy*back;
  const eye=view.eye??(E.eye+E.bob*(Math.abs(Math.sin(world.walkPhase))-.5)+.013*Math.sin(t*1.36));
  const f=w*E.focalRatio;
  const mx=w/2+(view.shake||0)*Math.sin(t*79),my=h/2+(view.shake||0)*.72*Math.cos(t*93);
  function space(wx,wy,wz){
    const dx=wx-x,dz=wz-z,dy=wy-eye;
    const forward=dx*sy+dz*cy;
    return [dx*cy-dz*sy,dy*cp-forward*sp,dy*sp+forward*cp];
  }
  const screen=p=>({x:mx+f*p[0]/p[2],y:my-f*p[1]/p[2],d:p[2]});
  return {x,z,yaw,sy,cy,eye,f,mx,my,horizon:my+Math.min(h*4,f*Math.tan(Math.min(Math.PI/2-.001,pitch))),space,screen,project:(x,y,z)=>screen(space(x,y,z))};
}

// A plane clips linearly in camera space. Interpolate UV before perspective division.
function cutPolygon(poly,inside) {
  const result=[];
  for(let i=0;i<poly.length;i++) {
    const a=poly[i], b=poly[(i+1)%poly.length], da=inside(a), db=inside(b);
    if(da>=0) result.push(a);
    if((da>=0)!==(db>=0)) {
      const t=da/(da-db);
      result.push(a.map((value,k)=>mix(value,b[k],t)));
    }
  }
  return result;
}
function floorQuad(cam,x,z,s,bottom) {
  let corners=[[0,0],[1,0],[1,1],[0,1]].map(([u,v])=>[
    ...cam.space(x+u*s,0,z+v*s),u,v
  ]);
  if(corners.some(p=>p[2]<E.near)) corners=cutPolygon(corners,p=>p[2]-E.near);
  const bottomPlane=p=>(bottom-cam.my)*p[2]+cam.f*p[1];
  if(corners.some(p=>bottomPlane(p)<0)) corners=cutPolygon(corners,bottomPlane);
  return corners.map(p=>({...cam.screen(p),u:p[3],v:p[4]}));
}
function visibility(d) { return 1-smooth(clamp((d-E.fogStart)/(E.fogEnd-E.fogStart),0,1)); }
function paintFloor(c,cam,w,h,world) {
  const {seed}=world;
  const s=E.tileSize, n=Math.ceil(E.fogEnd/s),ox=Math.floor(cam.x/s),oz=Math.floor(cam.z/s);
  let count=0;
  for(let iz=oz-n;iz<=oz+n;iz++) for(let ix=ox-n;ix<=ox+n;ix++){
    const x=(ix+.5)*s,z=(iz+.5)*s,dx=x-cam.x,dz=z-cam.z;
    const forward=dx*cam.sy+dz*cam.cy, side=dx*cam.cy-dz*cam.sy, dist=Math.hypot(dx,dz);
    if(forward< -s||dist>=E.fogEnd||Math.abs(side)>(forward+s)*.80+s) continue;
    const points=floorQuad(cam,x-s/2,z-s/2,s,h);
    if(points.length<3 || points.every(p=>p.x<0) || points.every(p=>p.x>w)) continue;
    const variant=trail(x,z)?3:1+(hash(seed,ix,iz)&1);
    const cell=world.wetCells.get(ix+','+iz);const tile=cell&&wetTile(c,cell,x-s/2,z-s/2,s,variant,land.groundImage(variant));
    land.drawGroundTile(c,points,variant,visibility(dist),tile); count++;
  }
  c.globalAlpha=1;
  return count;
}
// The floor has no animation: retain the native-density lower half at stationary viewpoints.
// Small breathing motions are reprojected about the horizon; geometry, waves, fog and actors stay live.
const floors=new WeakMap();
function floorLayer(c,cam,w,h,world,moving){
  if(cam.horizon>h+24)return 0; // The whole ground plane is below the viewport.
  if(moving)return paintFloor(c,cam,w,h,world);
  const scale=c.getTransform().a,margin=24;let f=floors.get(world);
  if(!f||f.width!==w||f.height!==h||f.scale!==scale||Math.abs(f.yaw-cam.yaw)>.0035||Math.abs(f.pitch-cam.horizon)>3.5||Math.hypot(f.x-cam.x,f.z-cam.z)>.025){
    const top=Math.max(0,Math.floor(cam.horizon)-margin),pw=Math.ceil((w+2*margin)*scale),ph=Math.max(1,Math.ceil((h-top+margin)*scale));
    const image=f?.image??new OffscreenCanvas(pw,ph);if(image.width!==pw||image.height!==ph){image.width=pw;image.height=ph}
    const g=image.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,pw,ph);g.setTransform(scale,0,0,scale,margin*scale,-top*scale);
    const count=paintFloor(g,cam,w,h+margin,world);f={image,x:cam.x,z:cam.z,yaw:cam.yaw,pitch:cam.horizon,eye:cam.eye,top,scale,width:w,height:h,count};floors.set(world,f);
  }
  const sy=cam.eye/f.eye,dy=cam.horizon+(f.top-f.pitch)*sy,dx=-margin-cam.f*Math.tan(cam.yaw-f.yaw);c.drawImage(f.image,dx,dy,f.image.width/scale,f.image.height/scale*sy);return f.count;
}
const scenery={
  tree:land.drawTree,shrub:land.drawShrub,rock:land.drawRock,log:land.drawLog,
  grass:land.drawGrass,mote:land.drawMote,low_fog:land.drawLowFog,fall:land.drawFall,eyes:land.drawEyes
};

export const monsterAnchorHeight=anchor=>anchor==='center'?1.2:0;
function actorBox(cam,o,index,v){
  const sx=o.shakeX||0;
  if(o.animation){
    const {anchor,height,bounds}=o.animation.module;
    if(bounds){const origin=cam.project(o.x,bounds.originHeight??monsterAnchorHeight(anchor),o.z),cm=cam.f/Math.max(.15,origin.d)/100;
      const w=(bounds.right-bounds.left)*cm,top=origin.y+bounds.top*cm,h=(bounds.bottom-bounds.top)*cm;
      return {...origin,originX:origin.x+sx,originY:origin.y,x:origin.x+sx+(bounds.left+bounds.right)*cm*.5,top,w,h,index,cm,y:top+h,labelY:top-18-Math.min(105,w*.55)*.27};}
    const center=anchor==='center';
    const origin=cam.project(o.x,monsterAnchorHeight(anchor),o.z);
    const cm=cam.f/Math.max(.15,origin.d)/100;
    const size=height*cm, w=size*(center?4:1), h=size*(center?2.35:1);
    const top=origin.y-(center?size:h);
    return {...origin,x:origin.x+sx,originX:origin.x+sx,top,w,h,index,cm,y:top+h,originY:origin.y,labelY:top-10-w*.27};
  }
  const elite=o.kind==='elite';
  const leap=index===v.lunger?clamp(v.lunge||0,0,1):0;
  const x=mix(o.x,cam.x,leap*.85),z=mix(o.z,cam.z,leap*.85);
  const height=elite?2.77:2.36, width=elite?1.49:1.06;
  const y=mix(0,cam.eye-height*.52,leap);
  const feet=cam.project(x,y,z),head=cam.project(x,y+height,z),d=(feet.d+head.d)/2;
  const w=cam.f*width/Math.max(.15,d),h=feet.y-head.y;
  return {x:feet.x+sx,y:feet.y,top:head.y,d,w,h,index,labelY:head.y-10-w*.27};
}
export function paintWorld(ctx,world,width,height,view={}) {
  const c=ctx, w=width,h=height,t=view.time||0,cam=camera(world,w,h,view);
  const result={count:0,enemies:[],loot:null};
  const enemies=view.enemies||[];
  let nearPool=false;
  if(!view.skipPost){
    for(const ch of world.chunks.values()){
      const p=ch.pool;
      if(p&&Math.hypot(p.x-cam.x,p.z-cam.z)<18){nearPool=true;break;}
    }
  }
  const usePost=nearPool&&Boolean(c.canvas)&&isPostGLAvailable();
  const dp=usePost?beginDataPass(w,h,cam,t,world.seed):null;
  let hasPuddle=false;
  const pBox=[Infinity,Infinity,-Infinity,-Infinity];
  const poolData=dp?{w,h,ripples:[],puddle:(poly,x0,y0,x1,y1)=>{
      hasPuddle=true;
      if(x0<pBox[0])pBox[0]=x0; if(y0<pBox[1])pBox[1]=y0;
      if(x1>pBox[2])pBox[2]=x1; if(y1>pBox[3])pBox[3]=y1;
      if(dp.ctx)stampPuddleData(dp.ctx,poly);
    }}:null;
  c.save();
  land.drawHorizon(c,w,h,cam,t,world);
  result.count=2+floorLayer(c,cam,w,h,world,view.travel||view.shake>0);
  const queue=[];
  for(const chunk of world.chunks.values()){
    if(chunk.pool)paintPool(c,cam,chunk.pool,t,world,queue,view.quiet,poolData);
  }
  const postParams=dp?{
    w,h,time:t,seed:world.seed,horizonUv:cam.horizon/h,yaw:cam.yaw,camX:cam.x,camZ:cam.z,
    hasPuddle,puddleBox:pBox,hasActors:enemies.length>0,ripples:poolData.ripples
  }:null;
  let posted=!view.skipPost&&!nearPool&&isPostGLAvailable();
  if(dp) posted=applyPostGL(c,c.canvas,dp.canvas,postParams);
  for(const chunk of world.chunks.values()){
    queueAir(c,cam,w,h,chunk,world,t,queue,view.quiet);
    for(const o of chunk.items){
      let x=o.x,y=o.y,z=o.z,alpha=1,eyeProgress=1;
      const A=E.ambience;
      const dx=x-cam.x,dz=z-cam.z;
      const depth=dx*cam.sy+dz*cam.cy,side=dx*cam.cy-dz*cam.sy;
      if(depth<E.near||Math.abs(side)>depth*.83+o.w+.8) continue;
      const d=Math.hypot(dx,dz);
      if(d>=E.fogEnd) continue;
      if(o.type==='fall') {
        const age=(t+o.phase/TAU*A.fallPeriod)%A.fallPeriod;
        if(age>A.fallDuration) continue;
        const u=age/A.fallDuration;
        y+=A.fallDrop*(1-u);
        x+=A.fallDrift*(u+.4*Math.sin(o.phase+u*TAU));
        alpha=Math.min(1,8*u,8*(1-u));
      } else if(o.type==='eyes') {
        const [near,far]=A.eyesRange;
        if(d<=near || d>=far) continue;
        const age=(t+o.phase/TAU*A.eyesPeriod)%A.eyesPeriod;
        if(age>=A.eyesDuration) continue;
        const u=age/A.eyesDuration;
        eyeProgress=u;
        alpha=smooth(clamp(Math.min(d-near,far-d)/A.eyesBandFade,0,1))*Math.min(1,6*u,6*(1-u));
      } else if(o.type==='mote') {
        if(o.phase>1.75||d<1.6)continue;alpha=clamp((d-1.6)/4,0,1)*.62;
        const wave=t*A.moteRate+o.phase;
        x+=A.moteDrift*Math.cos(wave*.73);
        y+=A.moteDrift*Math.sin(wave);
      } else if(o.type==='low_fog') {
        const [near,full]=A.fogNear;
        alpha=smooth(clamp((d-near)/(full-near),0,1))*A.fogOpacity[o.variant-1];
        if(!alpha) continue;
      }
      const p=cam.project(x,y,z);
      if(p.d<=E.near) continue;
      const scale=cam.f/p.d,sw=o.w*scale,sh=o.h*scale;
      const centered=o.type==='mote'||o.type==='eyes'||o.type==='fall';
      const bottom=centered?p.y+sh*.5:p.y;
      if(bottom-sh>h||bottom<0||p.x+sw*.6<0||p.x-sw*.6>w) continue;
      queue.push({d:p.d,paint(){
        c.globalAlpha=visibility(d)*alpha;
        if(o.type==='mote'){c.fillStyle='#cbdfdf';c.beginPath();c.arc(p.x,p.y,Math.min(2.4,sw*.23),0,TAU);c.fill()}else scenery[o.type](c,p.x,p.y,sw,sh,o,t,d,eyeProgress);
        if(o.vine){
          const v=o.vine;
          v.face=o.face;
          const vx=p.x+v.right*o.face*scale,vy=p.y-v.up*scale,vw=v.w*scale,vh=v.h*scale;
          land.drawVine(c,vx,vy,vw,vh,v,t,d);
          result.count++;
        }
      }});
    }
  }
  for(const [i,o] of enemies.entries()){
    const index=o.index??i,die=o.death||0,animation=o.animation;
    if(animation ? animation.done() : (o.hp<=0&&!die)||die>=1) continue;
    const p=actorBox(cam,o,index,view);
    if(p.d<=E.near) continue;
    const foot=cam.project(o.x,0,o.z);
    result.enemies.push(p);
    queue.push({d:p.d,paint(){
      if(animation){
        c.globalAlpha=1;
        actors.groundLight(c,foot,p,animation.module.anchor==='center',o.alpha??1,(o.death||0));
        animation.draw(p.originX??p.x,p.originY,p.cm);
        c.globalAlpha=o.alpha??1;
      } else {throw Error('缺少实战怪物模块：'+o.kind)}
      if((view.circle||0)>0&&index===view.target&&o.hp>0){
        const radius=Math.min(105,p.w*.66);
        actors.drawMagicCircle(c,p.x,p.top-12-radius*.12,radius,t,view.lit,view.circle); result.count++;
      }
      if(o.hit>0)actors.castFlash(c,p,view.numbers?.filter(n=>n.x===o.x&&n.z===o.z).at(-1),(1-o.hit)*.28);
    }});
  }
  if(view.loot){
    const {x,z}=view.loot,p=cam.project(x,E.lootHeight+E.ambience.lootBob*Math.sin(t*E.ambience.lootRate),z);
    if(p.d>E.near){
      result.loot={x:p.x,y:p.y};
      const lw=cam.f*.30/p.d,lh=cam.f*.48/p.d;
      queue.push({d:p.d,paint(){
        c.globalAlpha=1;
        actors.drawLoot(c,p.x,p.y,lw,lh,t);
      }});
    }
  }
  queue.push({d:10,paint:()=>fieldFog(c,cam,w,h,t,false)});
  queue.sort((a,b)=>b.d-a.d);
  for(const item of queue) {item.paint(); result.count++;}
  if(dp&&posted) captureSceneGL(c.canvas,postParams);
  if(!posted) fieldFog(c,cam,w,h,t,true);
  c.globalAlpha=1;
  for(const [i,n] of (view.numbers||[]).entries()){
    const p=cam.project(n.x,n.y??1.38,n.z);
    if(p.d>E.near){
      actors.paintNumber(c,n,p.x+(n.offsetX??((i%2?-1:1)*57)),p.y+(n.offsetY??((i%3)*22)));
      result.count++;
    }
  }
  const vignette=c.createRadialGradient(w/2,h*.47,w*.23,w/2,h*.47,w*.71);
  vignette.addColorStop(0,'rgba(8,14,16,0)'); vignette.addColorStop(1,'rgba(8,14,16,.48)');
  c.fillStyle=vignette; c.fillRect(0,0,w,h);
  if(view.red>0){
    const flash=c.createRadialGradient(w/2,h/2,h*.14,w/2,h/2,w*.57);
    flash.addColorStop(0,'rgba(158,43,31,0)'); flash.addColorStop(1,'rgba(181,50,36,'+view.red+')');
    c.fillStyle=flash; c.fillRect(0,0,w,h);
  }
  for(const {animation} of enemies) if(animation&&!animation.done()) animation.drawScreen(w,h);
  c.restore();
  return result;
}
