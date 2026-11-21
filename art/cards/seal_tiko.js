// A state belongs to one physical card. No timers, DOM or game-rule callbacks.
const clip=x=>Math.max(0,Math.min(1,x)), mix=(a,b,k)=>a+(b-a)*k, smooth=t=>{t=clip(t);return t*t*(3-2*t)};
const params={breath:3.25,peek:4.6,flutter:16,release:.24,flight:.42,interval:.17,fade:.48};
function create(p,{palette,seed=0}){
 const colors={};for(const [key,v] of Object.entries(palette))if(Array.isArray(v)||typeof v==='string'&&v[0]==='#')colors[key]=p.color(Array.isArray(v)?v[2]:v);
 const fade=(key,a)=>{const c=p.color(colors[key].toString());c.setAlpha(a);return c};
 colors.mist=Array.from({length:12},(_,i)=>p.lerpColor(colors.bodyDeep,colors.fog,(i+1)/15));
 colors.halo=fade('spark',20);colors.halo2=fade('spark',54);colors.thread=fade('rimTopBack',130);colors.wisp=fade('fogHi',35);
 return {colors,clock:0,phase:(Math.imul(seed>>>0,2654435761)>>>0)/4294967296*6.28,mode:'idle',alert:0,time:0,params:{...params}};
}
function trigger(s,event,data){
 if(event==='play'){
  if(!data?.from||!data?.target)throw new TypeError('play requires from and target');
  s.mode='play';s.time=0;s.from={...data.from};s.target={...data.target};s.release=s.params.release;s.first=s.release+s.params.flight;
  s.hitTimes=Array.from({length:4},(_,i)=>s.first+i*s.params.interval);s.end=s.hitTimes[3]+s.params.fade;return {hitTimes:[...s.hitTimes]};
 }
 if(event==='idle'){s.mode='idle';s.time=0;s.alert=0}
 else if(s.mode!=='play'&&(event==='hover'||event==='unhover'))s.mode=event==='hover'?'hover':'idle';
}
function update(s,dt){if(!Number.isFinite(dt)||dt<0)return;s.clock+=dt;s.time+=dt;s.alert=mix(s.alert,s.mode==='hover'?1:0,1-Math.exp(-dt*(s.mode==='hover'?12:5)))}
function silhouette(p,color,start,curves){p.fill(color);p.noStroke();p.beginShape();p.vertex(...start);for(const q of curves){if(q.length===2)p.vertex(...q);else p.bezierVertex(...q)}p.endShape(p.CLOSE)}
function lines(p,c,w,seq){p.noFill();p.stroke(c);p.strokeWeight(w);p.beginShape();p.vertex(...seq[0]);for(let i=1;i<seq.length;i++){if(seq[i].length===2)p.vertex(...seq[i]);else p.bezierVertex(...seq[i])}p.endShape()}
// Two overlapping membranes on either side: the leading edge grows out of the shoulder;
// every control point travels continuously from the closed hood to the flight contour.
const closed=[[[0,-25],[20,-35,35,-4,23,27],[21,23],[19,32],[17,29],[13,38],[12,35],[1,43],[-2,17,1,-1,0,-25]],[[2,-23],[22,-29,29,0,15,22],[15,18],[10,33],[9,29],[2,38],[1,32],[-5,10,11,-7,2,-23]]];
const open=[[[3,-1],[20,-23,53,-37,76,-31],[67,-24],[64,-27],[56,-18],[53,-21],[40,-12],[37,-15],[26,-5,12,-5,3,-1]],[[3,2],[32,-2,57,9,66,25],[55,19],[57,24],[43,17],[39,19],[28,11],[15,8,8,5,3,2]]];
function wing(p,c,side,layer,k,wave){
 p.push();p.scale(side,1);p.rotate(wave);const pts=closed[layer].map((pt,j)=>pt.map((v,n)=>mix(v,open[layer][j][n],k)));
 silhouette(p,layer?c.skinMid:c.skinDark,pts[0],pts.slice(1));lines(p,layer?c.skinEdge:c.rimTopBack,layer?.52:.8,pts.slice(0,2));
 const tip=pts[1],a=pts[0];lines(p,layer?c.skinDark:c.skinMid,.95,[a,[mix(17,20,k),mix(-10,-10,k),mix(19,33,k),mix(9,layer?9:-19,k),tip[4]-3,tip[5]]]);
 if(!layer)lines(p,c.skinMid,1.7,[[mix(10,22,k),mix(-13,-12,k)],[mix(22,42,k),mix(1,-22,k)],[mix(19,53,k),mix(18,-24,k)]]);p.pop();
}
function bug(p,s,x,y,scale,k,roll=0){
 const c=s.colors,t=s.clock+s.phase,b=.5+.5*Math.sin(t*2*Math.PI/s.params.breath),q=s.alert,a=s.phase;const wave=Math.sin(t*s.params.flutter)*(q*.021+k*.08)+Math.pow(Math.max(0,Math.sin(t*2.23)),30)*.022;
 p.push();p.translate(x,y);p.rotate(roll);p.scale(scale);const flick=Math.sin(t*2.4+a)*1.5;
 // Abdomen, recurved sickles and sensitive antennae are exposed only as it opens.
 if(k>.02){for(const side of [-1,1]){p.push();p.scale(side,1);lines(p,c.rimTopBack,.9,[[4,-18],[6,-25,13,-29,11,-34+flick]]);silhouette(p,c.body,[5,1],[[17,-1,19,18,6,23],[15,13,12,7,5,6]]);p.pop()}}
 silhouette(p,c.bodyDeep,[0,-26],[[12,-26,14,-12,7,-5],[12,2,6,17,0,28],[-4,19,-10,5,-7,-4],[-14,-13,-12,-26,0,-26]]);
 const ly=mix(49,42,k)+Math.sin(t*2.1)*1.2,lx=flick*1.8;lines(p,c.body,1.8,[[0,18],[-3,28,5,33,lx,ly]]);
 for(const side of [-1,1]){wing(p,c,side,0,k,wave);wing(p,c,side,1,k,wave*(side===1?.85:1))}
 // Eye slit set into the hood, not painted over the leading edge.
 const once=(t%s.params.peek)/s.params.peek,peek=Math.exp(-((once-.42)**2)/.0015);
 for(const side of [-1,1]){p.push();p.scale(side,1);const h=.5+2.9*Math.max(q,k,side===-1?peek:0);silhouette(p,c.eye,[1.3,-15.2],[[3,-15.1-h,6,-16.3-h,9,-17],[7,-14+h,4,-14+h,1.3,-15.2]]);if(h>1.1){p.fill(c.pupil);p.ellipse(5.4,-15.2,1.25,h*1.55)}p.pop()}
 const glow=2.3+1.5*b+1.3*q;p.noStroke();p.fill(c.halo);p.circle(lx,ly,glow*4.6);p.fill(c.halo2);p.circle(lx,ly,glow*2.45);p.fill(c.spark);p.ellipse(lx,ly,glow*1.25,glow*1.65);p.fill(c.sparkCore);p.ellipse(lx,ly,glow*.6,glow*.88);p.pop();
}
function draw(p,s){const c=s.colors,t=s.clock+s.phase;p.push();p.noStroke();p.fill(c.bodyDeep);p.rect(0,0,176,150);for(let i=0;i<c.mist.length;i++){p.fill(c.mist[i]);p.ellipse(91+i*.82,69-i*1.24,209-i*11,177-i*8)}
 for(let i=0;i<4;i++){p.push();p.translate(i&1?176:0,i&2?150:0);p.scale(i&1?-1:1,i&2?-1:1);const l=s.mode==='play'&&s.time>s.release?18:34;lines(p,c.thread,.7,[[0,43],[7,36,19,17,l,0]]);lines(p,c.thread,.65,[[0,24],[7,23,13,6,l-9,0]]);p.pop()}
 if(s.mode!=='play'||s.time<s.release){const k=s.mode==='play'?smooth(s.time/s.release):s.alert*.045;bug(p,s,88+Math.sin(t*1.3)*1.45,60+Math.sin(t*1.8)*1.5,1.03,k)}p.pop();}
function drawScreen(p,s){if(s.mode!=='play'||s.time<s.release||s.time>=s.end)return;
 const t=s.time,c=s.colors,f=s.from,g=s.target,dx=g.x-(f.x+f.w/2),dy=g.y-(f.y+f.h*.4),size=Math.max(15,g.size||60);
 p.push();const approach=smooth((t-s.release)/(s.first-s.release)),last=s.hitTimes[3];if(t<last+.035){let x=f.x+f.w/2+dx*approach,y=f.y+f.h*.4+dy*approach-Math.sin(approach*Math.PI)*Math.min(130,Math.hypot(dx,dy)*.24);let swing=t<s.first?0:Math.sin((t-s.first)*Math.PI/s.params.interval);x+=size*.28*swing;y-=Math.abs(swing)*size*.13;bug(p,s,x,y,mix(f.w/176,Math.min(2,size/100),approach),1,mix(0,.34*Math.sin(approach*Math.PI)+.3*swing,approach))}
 for(let j=0;j<4;j++){const age=t-s.hitTimes[j];if(age<0||age>.17)continue;const u=clip(age/.17),d=size*(.42+.13*Math.sin(j)),side=j%2?1:-1;p.push();p.translate(g.x,g.y+size*(j-1.5)*.05);p.scale(side,1);silhouette(p,c.skinEdge,[-d,-d*.64],[[d*.18,-d*.1,d*.42,d*.21,d*.91,d*.72],[d*.34,d*.32,-d*.12,d*(.10-u*.16),-d,-d*.64]]);p.pop()}
 if(t>=last){const u=clip((t-last)/(s.end-last));for(let j=0;j<10;j++){const angle=j*2.4+s.phase,d=size*(.12+.55*u)*(1+(j%3)*.12),x=g.x+Math.cos(angle)*d,y=g.y+Math.sin(angle)*d+u*u*size*.3;p.push();p.translate(x,y);p.rotate(angle+u*3);const r=(1-u)*(j%3+2);silhouette(p,j%3?c.skinMid:c.skinEdge,[0,-r],[[r*1.8,r],[0,r*.4]]);p.pop()}p.noStroke();p.fill(c.spark);p.circle(g.x,g.y+size*(u*u*.6),size*.06*(1-u))}p.pop();}
export default {id:'seal_tiko',kind:'cardArt',width:176,height:150,events:['idle','hover','unhover','play'],params,create,update,trigger,draw,drawScreen,done:s=>s.mode==='play'&&s.time>=s.end};
