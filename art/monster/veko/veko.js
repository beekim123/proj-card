// 独立 p5 ES 模块；单位厘米。几何工具内置，单文件即可交接。
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
function ease(a,b,t){let x=clamp((t-a)/(b-a));return x*x*(3-2*x)}
function colorSet(p,palette){const c=Object.fromEntries(Object.entries(palette).map(([k,v])=>[k,p.color(Array.isArray(v)?v[2]:v)]));for(let [name,key,a] of [['haloLow','eyeGlow',16],['haloMid','eyeGlow',38],['warmLow','rimLow',26],['warmMid','spark',62]]){c[name]=p.color(c[key].toString());c[name].setAlpha(a)}return c}
function path(p,fill,stroke,w,start,...segments){if(fill)p.fill(fill);else p.noFill();if(stroke){p.stroke(stroke);p.strokeWeight(w)}else p.noStroke();p.beginShape();p.vertex(...start);for(let s of segments){if(s.length===2)p.vertex(...s);else p.bezierVertex(...s)}p.endShape(fill?p.CLOSE:undefined)}
function dot(p,c,x,y,w,h=w){p.noStroke();p.fill(c);p.ellipse(x,y,w,h)}
function eye(p,c,x,y,r,open=1){if(open<.015)return;dot(p,c.haloLow,x,y,r*5.1,r*4.9*open);dot(p,c.haloLow,x,y,r*4.1,r*3.9*open);dot(p,c.haloMid,x,y,r*3.0,r*2.7*open);dot(p,c.eyeGlow,x,y,r*1.9,r*1.42*open);dot(p,c.eye,x,y,r*1.5,r*1.15*open);dot(p,c.pupil,x,y,r*.36,r*1.15*open)}
function line(p,c,w,x,y,X,Y){p.stroke(c);p.strokeWeight(w);p.line(x,y,X,Y)}
function blade(p,c,x,y,ax,ay,bx,by,X,Y,width,side=1){const n=width*side,al=Math.hypot(bx-x,by-y)||1,bl=Math.hypot(X-ax,Y-ay)||1,an=[(by-y)*n/al,(x-bx)*n/al],bn=[(Y-ay)*n/bl,(ax-X)*n/bl],a=[ax+an[0],ay+an[1]],b=[bx+bn[0]*.56,by+bn[1]*.56],aa=[ax-an[0]*.52,ay-an[1]*.52],bb=[bx-bn[0]*.24,by-bn[1]*.24];path(p,c.body,null,0,[x,y],[...a,...b,X,Y],[...bb,...aa,x,y]);path(p,null,c.rimTop,width*.1,[x,y],[...a,...b,X,Y]);path(p,null,c.rimLow,width*.095,[x,y],[...aa,...bb,X,Y])}
function state(p,opt){return{c:colorSet(p,opt.palette),phase:(Math.abs(opt.seed??13)%4093)/4093*6.283,elite:!!opt.elite,t:0,a:0,act:'idle',ready:false,end:false,shellT:9,chipT:9,origin:{},v:{}}}
function event(s,name,d={},dur){if(s.act==='die'||s.act==='seal')return;if(name==='shell')s.shellT=0;if(name==='hit'||name==='heavyHit')s.chipT=0;if(name==='ready')s.ready=true;if(['idle','attack','appear','die','seal'].includes(name))s.ready=false;s.act=name;s.a=0;s.len=dur;s.hitAt=name==='attack'?clamp(Number.isFinite(d.hitAt)?d.hitAt:s.strike,.075,3):0;if(name==='attack'){s.len=s.hitAt+s.recover;return{hitAt:s.hitAt}}}
function tick(s,dt){s.t+=dt;s.a+=dt;s.chipT+=dt;s.shellT+=dt;if(s.len&&s.a>=s.len){if(s.act==='seal'||s.act==='die')s.end=true;else{s.act=s.ready?'ready':'idle';s.a=0;s.len=0}}}
function follow(s,k,target,dt,speed){let x=s[k]??0,v=s.v[k]??0,h=x-target,j=v+speed*h,e=Math.exp(-speed*dt);s[k]=target+(h+j*dt)*e;s.v[k]=(v-speed*j*dt)*e}
function sparks(p,s,x,y,r,t,kind){if(t<0||t>.55)return;let u=t/.55;for(let i=0;i<12;i++){let a=i*2.4+s.phase,b=r*(.35+u*(1+(i%3)*.18)),dx=Math.cos(a),dy=Math.sin(a);line(p,kind==='shell'?s.c.rimTopHi:i%3?s.c.body:s.c.skin,Math.max(.15,1-u)*r*.035,x+b*dx,y+b*dy-u*u*r*.35,x+(b+r*.15*(1-u))*dx,y+(b+r*.15*(1-u))*dy-u*u*r*.35)}}
function attackCurve(s){if(s.act!=='attack')return 0;let t=s.a,h=s.hitAt;return t<h?-.26*ease(0,h*.76,t)+1.26*ease(h*.76,h,t):1-ease(h,h+s.recover*.81,t)}
function terminal(s){return s.act==='die'||s.act==='seal'?ease(0,s.len,s.a):0}
function canAct(s,events,name){return events.includes(name)&&!s.end&&s.act!=='die'&&s.act!=='seal'}
function fade(p,t){if(t>0)p.drawingContext.globalAlpha*=1-clamp(t)}
// 04 · 五对针足交错落地。龟背与钳分开运动，腹下留一线暖光。
const events=['appear','idle','ready','attack','hit','heavyHit','die','shell'];
const params={hitAt:.46,recover:.47,appear:.65,hit:.42,heavyHit:.78,die:.96,shell:.54,stepHz:.59};
function draw(p,s){if(s.end)return;const c=s.c,t=s.t+s.phase,die=terminal(s),A=attackCurve(s),q=s.q,h=s.recoil;let y=-39+Math.sin(t*3)*.85+q*6+h*7+die*36;let f=s.act==='appear'?1-ease(0,params.appear,s.a):0;
 p.push();fade(p,ease(.62,1,die)+f*.8);p.translate(0,f*14);p.scale(1+.22*A,.99+.12*A);
 for(let d of [-1,1]){p.push();p.scale(d,1);for(let i=4;i>=0;i--){const theta=t*6.28*params.stepHz+i*2.6+d*.7,footX=54+i*19+Math.sin(theta)*1.6-die*28,footY=-Math.max(0,Math.sin(theta))*2*(1-q)-die*2;
 let jx=50+i*9+Math.sin(theta)*2+q*4,jy=y-6-i*5.7+2*Math.cos(theta)+die*8,kx=footX-8+2*Math.sin(theta),ky=footY-12-i*2.4;
 if(i===2||i===4){path(p,c.skinMid,c.rimLow,.48,[35,y-2],[48,y-23,80,y-32,92,y-19],[87,y-7,72,y-11,64,y-7],[75,y-2,51,y+3,35,y-2]);path(p,c.skinDark,null,0,[49,y-10],[60,y-16],[64,y-11],[81,y-16],[67,y-7])}
 blade(p,c,37,y+8,40,y+3,jx-6,jy+2,jx,jy,3.4);blade(p,c,jx,jy,jx+15,jy+5,kx,ky-10,kx,ky,2.8);blade(p,c,kx+.4,ky+1,kx+6,ky+6,footX-2,footY-9,footX,footY,1.9);path(p,c.body,c.rimTop,.48,[jx-3,jy],[jx-1,jy-8-i*.3],[jx+3,jy-2],[jx+2,jy+.5]);}p.pop()}
 p.push();p.translate(0,y);p.scale(1,1-die*.72);path(p,c.body,c.rimLow,1.15,[-51,1],[-50,-13,-29,-30,0,-30],[26,-30,51,-15,52,0],[52,17,27,26,0,26],[-28,26,-53,16,-51,1]);path(p,null,s.shellT<.14?c.rimTopHi:c.rimTop,s.shellT<.14?2.9:1.35,[-51,4],[-51,-12,-29,-30,0,-30],[25,-30,46,-17,51,-4]);
 for(let i=0;i<13;i++){let x=(i-6)*6.3,y=-30+12*(x/40)**2;path(p,c.body,c.rimTop,.42,[x-1.45,y+1],[x+.72,y-3.5-i%2],[x+1.2,y+1])}
 for(let i=0;i<2;i++)path(p,null,c.inner,1.4,[-43+i*3,-9+i*4],[-16,-24+i*4,15,-24+i*4,43-i*3,-9+i*4]);for(let x of [-14,0,14])path(p,c.body,c.rimLow,.6,[x-2.8,-19],[x+.3,-30],[x+3,-20],[x+1,-18]);
 path(p,c.bodyDeep,c.rimTop,.94,[-36,15],[-39,2,-34,-13,0,-13],[34,-13,39,2,36,15],[28,25,-23,25,-36,15]);for(let i=-2;i<=2;i++)eye(p,c,i*10.8,4+Math.abs(i)*3.5,3.2-Math.abs(i)*.4,(1-die)*(.87+.10*Math.sin(t*2+i)+.1*q));
 for(let d of [-1,1]){p.push();p.translate(d*21,20);p.scale(d,1);p.rotate(-.17*q+.52*A-.14*h-die*.22);path(p,c.body,c.rimLow,.85,[-5,0],[8,-4,21,1,21,10],[19,18,3,22,-15,17],[-12,13,-5,10,2,11],[0,7,-7,6,-5,0]);path(p,null,c.rimTop,.95,[-5,0],[8,-4,21,1,21,10]);for(let i=0;i<3;i++)path(p,c.body,c.rimTop,.34,[3+i*4,14-i],[5+i*4,12-i],[2+i*4,12-i]);p.pop()}dot(p,c.spark,0,25,2.8);p.pop();sparks(p,s,0,y,39,s.shellT,'shell');sparks(p,s,0,y,33,s.chipT,'hit');p.pop()}
export default{id:'veko',height:70,anchor:'foot',bounds:{left:-130,right:130,top:-70,bottom:0,originHeight:0},events,params,create(p,opt){return Object.assign(state(p,opt),{q:0,recoil:0,strike:params.hitAt,recover:params.recover})},trigger(s,n,d){if(canAct(s,events,n))return event(s,n,d,params[n]??0)},update(s,dt){tick(s,dt);follow(s,'q',s.act==='ready'?1:0,dt,17);follow(s,'recoil',s.act==='hit'||s.act==='heavyHit'?(s.act==='hit'?.55:1)*(1-ease(.15,s.len,s.a)):0,dt,32)},draw,done:s=>s.end};
