// All clocks below run on scene time, not the system calendar or battle random stream.
const TAU=Math.PI*2,clamp=x=>Math.min(1,Math.max(0,x));
export function moonIndex(world,t){return ((world.seed%3)+(world.moonOffset||0)+Math.floor(t/10))%3;}
export function drawMoon(c,w,horizon,yaw,f,sky,t){
  const a=sky.bearing-yaw;if(Math.cos(a)<.2)return;
  const x=w/2+f*Math.tan(a),y=horizon-f*(.235+.013*Math.sin(t*.042))/Math.cos(a),r=f*.029;
  if(x<-4*r||x>w+4*r)return;
  const index=moonIndex(sky,t),lit=[.135,.5,.994],blend=clamp((t%10)*1.7),light=t<.6?lit[index]:lit[(index+2)%3]*(1-blend)+lit[index]*blend;
  const halo=c.createRadialGradient(x,y,0,x,y,r*3.7);halo.addColorStop(0,'rgba(203,219,200,.22)');halo.addColorStop(.4,'rgba(190,216,202,.10)');halo.addColorStop(1,'rgba(135,174,168,0)');c.fillStyle=halo;c.fillRect(x-r*3.7,y-r*3.7,r*7.4,r*7.4);
  c.save();c.translate(x,y);c.rotate(-.23);c.beginPath();c.arc(0,0,r,0,TAU);c.fillStyle='rgba(82,104,106,.31)';c.fill();
  c.beginPath();c.arc(0,0,r,-Math.PI/2,Math.PI/2);for(let i=0;i<=28;i++){const a=Math.PI/2-i*Math.PI/28;c.lineTo(r*Math.cos(a)*(1-2*light),r*Math.sin(a));}c.closePath();c.fillStyle='#d2d9bf';c.fill();c.clip();c.fillStyle='rgba(122,149,139,.22)';for(const [dx,dy,k] of [[.43,-.32,.22],[.29,-.14,.13],[-.33,.38,.19],[-.44,.15,.09],[.55,.41,.08]]){c.beginPath();c.ellipse(dx*r,dy*r,k*r,k*r*.72,-.32,0,TAU);c.fill();}c.restore();
}
let mist,glow;
function sprite(w,h,paint){const image=new OffscreenCanvas(w,h),c=image.getContext('2d');paint(c);return image;}
function mistSprite(){return mist??=sprite(384,88,c=>{
  for(let i=0;i<19;i++){const x=40+305*i/18,y=34+12*Math.sin(i*.61)+7*Math.sin(i*2.2),rx=26+14*(1+Math.sin(i*1.3)),ry=11+7*(1+Math.cos(i*1.36));c.save();c.translate(x,y);c.scale(rx,ry);const g=c.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,'rgba(166,193,185,.16)');g.addColorStop(1,'rgba(145,180,176,0)');c.fillStyle=g;c.fillRect(-1,-1,2,2);c.restore();}
});}
// A seamless low-resolution density field, baked once. Overscan keeps all four edges covered
// while the layers drift. The mid layer is depth sorted; the front layer is behind all HUD text.
let volume;
export function fieldFog(c,cam,w,h,t,near){
 if(!volume)volume=sprite(384,200,g=>{const im=g.createImageData(384,200);for(let j=0;j<200;j++)for(let i=0;i<384;i++){
   const x=i/384*TAU,y=j/200*TAU,n=.51+.18*Math.sin(x*2+y+1.6*Math.sin(y))+.14*Math.cos(y*2-x+1.3*Math.sin(x*2))+.10*Math.sin(x*4+y*2+.8*Math.cos(x+y))+.06*Math.sin(5*y-x);
   const k=(j*384+i)*4;im.data[k]=123+18*n;im.data[k+1]=149+18*n;im.data[k+2]=153+15*n;im.data[k+3]=75+150*clamp(n);
 }g.putImageData(im,0,0);});
 const s=near?1.58:1.39,dx=(s-1)*w,dy=(s-1)*h;
 const ox=-dx*(.5+.24*Math.sin(cam.yaw+(near?t*.042:-t*.025)+cam.x*.023)),oy=-dy*(.5+.22*Math.sin(t*(near?.039:.021)+cam.z*.027)+(near?.09:-.09)*clamp((cam.horizon-h*.5)/h));
 c.globalAlpha=near?.275:.58;c.drawImage(volume,ox,oy,s*w,s*h);c.globalAlpha=1;
}
function spark(){return glow??=sprite(24,24,c=>{const g=c.createRadialGradient(12,12,0,12,12,12);g.addColorStop(0,'#ffedaf');g.addColorStop(.13,'#e7efad');g.addColorStop(.32,'rgba(191,207,118,.56)');g.addColorStop(1,'rgba(153,190,108,0)');c.fillStyle=g;c.fillRect(0,0,24,24);});}
function owl(c,x,y,s,t){
 c.save();c.translate(x,y);c.scale(s,s);c.fillStyle='#19272c';c.strokeStyle='#35494a';c.lineWidth=.8;
 c.beginPath();c.moveTo(-13,17);c.quadraticCurveTo(-23,12,-33,14);c.lineTo(-30,17);c.quadraticCurveTo(-14,15,11,24);c.lineTo(24,23);c.closePath();c.fill();
 c.beginPath();c.moveTo(-6,19);c.quadraticCurveTo(-13,8,-10,1);c.lineTo(-12,-12);c.lineTo(-5,-8);c.quadraticCurveTo(1,-10,7,-8);c.lineTo(12,-13);c.lineTo(10,-1);c.quadraticCurveTo(15,11,6,20);c.lineTo(3,24);c.closePath();c.fill();c.stroke();
 c.fillStyle='#455756';c.beginPath();c.moveTo(-8,-4);c.quadraticCurveTo(-3,-7,0,-1);c.quadraticCurveTo(6,-7,9,-4);c.quadraticCurveTo(7,3,0,6);c.quadraticCurveTo(-5,4,-8,-4);c.fill();
 if(t%6>.2){c.fillStyle='#b6af7f';for(const dx of [-4,5]){c.beginPath();c.ellipse(dx+Math.sin(t*.5),-1,1.35,1,0,0,TAU);c.fill();}}
 c.restore();
}
export function owlDirection(w,t){
 if(w.owlCheck===undefined||Math.abs(t-w.owlCheck)>.3){let best=24,pan=null;for(const ch of w.chunks.values()){if(!ch.perch)continue;const dx=ch.perch.x-w.x,dz=ch.perch.z-w.z,d=Math.hypot(dx,dz);if(d<best){best=d;pan=(dx*Math.cos(w.yaw)-dz*Math.sin(w.yaw))/Math.max(1,d);}}w.owlPan=pan;w.owlCheck=t;}return w.owlPan;
}
function bat(c,x,y,s,t){c.save();c.translate(x,y);c.scale(s,s);const b=Math.sin(t*19)*8;c.fillStyle='#213037';c.beginPath();c.moveTo(0,4);for(const k of [-1,1]){c.quadraticCurveTo(k*5,-3,k*18,b-4);c.quadraticCurveTo(k*14,b+3,k*12,b+4);c.quadraticCurveTo(k*8,b,k*6,5);c.quadraticCurveTo(k*3,3,0,7);}c.fill();c.restore();}
export function queueAir(c,cam,w,h,ch,world,t,q,quiet){
 const sx=ch.cx*20+10,sz=ch.cz*20+10,n=ch.airHash,ph=(n%127)/13;
 const add=(x,y,z,reach,r,fn)=>{const p=cam.project(x,y,z);if(p.d<1.2||p.d>reach||p.x< -r||p.x>w+r||p.y< -r||p.y>h+r)return;q.push({d:p.d,paint(){c.globalAlpha=1;fn(p,cam.f/p.d);}});};
 add(sx+Math.sin(t*.13+ph)*1.6,1.75,sz,37,650,(p,s)=>{if(p.d<6)return;c.globalAlpha=.55*clamp((p.d-6)/8);c.drawImage(mistSprite(),p.x-9*s,p.y-1.5*s,18*s,3.2*s);});
 if(quiet)return;
 const a=ch.perch;if(a)add(a.x+.35,3.85,a.z,31,45,(p,s)=>owl(c,p.x,p.y,.012*s,t+ph));
 if(ch.pool||n%3===0){const x=ch.pool?.x??sx,z=ch.pool?.z??sz;for(let i=0;i<5;i++){const p=ph+i*2.39;add(x+2.55*Math.sin(p+t*.18),.6+.45*Math.sin(p+t*.44),z+2.1*Math.cos(p+t*.15),21,20,(v,s)=>{const d=Math.max(4,Math.min(18,s*.1));c.globalAlpha=.84*clamp((Math.sin(p+t*1.8)+.6)*.9);c.drawImage(spark(),v.x-d/2,v.y-d/2,d,d);});}}
 const flight=(t+ph)%17;if(flight<4.8&&n%2===0){for(let i=0;i<2;i++)add(sx-7+flight*3.8-i*.9,4.3+.6*Math.sin(flight*1.7+i),sz+Math.sin(flight+i),32,55,(p,s)=>bat(c,p.x,p.y,.012*s,t+i));}
}
