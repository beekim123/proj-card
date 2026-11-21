import {drawMoon} from '../explore/night-air.js';
import { WORLD } from '../config.js';
import { sprites, blit, sampleStart, sampleEnd } from './environment.js';

const M = WORLD.motion;
const TAU = Math.PI * 2;
const clamp = (x, low, high) => Math.min(high, Math.max(low, x));
const wave = (time, hz, phase = 0) => Math.sin(time * TAU * hz + phase);

export function fogLightX(width, yaw) {
  const angle = M.lightYaw - yaw;
  return width * (.5 + WORLD.focalRatio * Math.sin(angle) / Math.max(.18, Math.cos(angle)));
}

export function drawSkyFog(c, w, h, horizon, yaw, time = 0) {
  const start = sampleStart(), frame = sprites.sky_1;
  const width = Math.max(w, h * frame.width / frame.height), height = width * frame.height / frame.width;
  const lift = (horizon - h * .5) * .65;
  c.save();
  // Opaque base covers the viewport even while looking up beyond the artboard.
  blit(c, frame.layers[0], (w-width)/2, (h-height)/2, width, height);
  const breath = wave(time, M.skyHz), size = 1 + M.skyExpand * breath;
  const light = fogLightX(w, yaw);
  const visibility = clamp(2 * Math.cos(yaw - M.lightYaw), 0, 1);
  if (visibility > 0) {
    c.globalAlpha *= visibility * (1 - M.skyPulse * (.5 - .5*breath));
    const glowW = width*size, glowH = height*size;
    blit(c, frame.layers[1], light - .52*glowW,
      h*.5 + lift - .516*glowH - height*M.skyLift*breath, glowW, glowH);
  }
  c.restore();
  sampleEnd('sky', start, width, height);
}

export function drawDistantForest(c, w, horizon, yaw, focal) {
  c.save();
  for (const variant of [2, 1]) {
    const start = sampleStart();
    const frame = sprites['forest_'+variant];
    const repeats = M.forestTiles[variant-1];
    const tileW = focal * TAU / repeats, tileH = tileW * frame.height / frame.width;
    const offset = w/2 - yaw*focal + tileW*(variant*.19);
    const left = ((offset % tileW) + tileW) % tileW - tileW;
    c.globalAlpha = M.forestAlpha[variant-1];
    for (let x = left; x < w; x += tileW) {
      blit(c, frame.layers[0], x, horizon - tileH*(variant===1 ? .65 : .83), tileW+.4, tileH);
    }
    sampleEnd('forest', start, tileW, tileH);
  }
  c.restore();
}

// Distant fog has no near-field parallax. Reproject the panorama between subpixel light changes;
// close trees, water, every monster, figures and HUD still render at native density each frame.
let horizonLayer;
export function drawHorizon(c,w,h,cam,t,world){
 const m=64,prev=horizonLayer,angle=prev?Math.atan2(Math.sin(cam.yaw-prev.yaw),Math.cos(cam.yaw-prev.yaw)):0;
 const dx=-angle*cam.f,dy=(cam.horizon-(prev?.horizon??cam.horizon))*.73;
 if(!prev||w!==prev.w||h!==prev.h||Math.abs(dx)>42||Math.abs(dy)>35||Math.abs(t-prev.t)>.12){
   const image=prev?.image??new OffscreenCanvas(w+2*m,Math.ceil(h)+2*m);if(image.width!==w+2*m||image.height!==Math.ceil(h)+2*m){image.width=w+2*m;image.height=Math.ceil(h)+2*m}
   const g=image.getContext('2d',{alpha:false});g.save();g.translate(m,m);g.fillStyle='#19282d';g.fillRect(-m,-m,w+2*m,h+2*m);
   // Sky fills the overscan; forest repetitions continue naturally along the horizontal seam.
   g.save();g.translate(-m,-m);drawSkyFog(g,w+2*m,h+2*m,cam.horizon+m,cam.yaw,t);drawMoon(g,w+2*m,cam.horizon+m,cam.yaw,cam.f,world,t);drawDistantForest(g,w+2*m,cam.horizon+m,cam.yaw,cam.f);
    const veil=g.createLinearGradient(0,cam.horizon-h*.46,0,cam.horizon+h*.32);veil.addColorStop(0,'rgba(135,162,160,0)');veil.addColorStop(.56,'rgba(139,166,163,.27)');veil.addColorStop(1,'rgba(98,126,127,.05)');g.fillStyle=veil;g.fillRect(0,0,w+2*m,h+2*m);g.restore();g.restore();
   horizonLayer={image,w,h,t,yaw:cam.yaw,horizon:cam.horizon};c.drawImage(image,-m,-m);return;
 }
 c.drawImage(prev.image,-m+dx,-m+dy);
}

// The clipped vertices retain UVs. Each fan triangle maps the original tile onto the floor.
const groundPatterns = new Map();
export function groundFace(c, a, b, d, texW, texH, pattern) {
  const u1 = (b.u-a.u)*texW, v1 = (b.v-a.v)*texH;
  const u2 = (d.u-a.u)*texW, v2 = (d.v-a.v)*texH;
  const det = u1*v2 - u2*v1;
  if (Math.abs(det) < .0001) return;
  const dx1 = b.x-a.x, dx2 = d.x-a.x, dy1 = b.y-a.y, dy2 = d.y-a.y;
  const xx=(dx1*v2-dx2*v1)/det, xy=(dx2*u1-dx1*u2)/det;
  const yx=(dy1*v2-dy2*v1)/det, yy=(dy2*u1-dy1*u2)/det;
  pattern.setTransform({a:xx,b:yx,c:xy,d:yy,e:a.x-xx*a.u*texW-xy*a.v*texH,f:a.y-yx*a.u*texW-yy*a.v*texH});
  c.fillStyle = pattern;
  c.beginPath();
  c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(d.x, d.y);
  c.closePath(); c.fill();
}

export function groundImage(variant){return sprites['ground_'+variant].layers[0].image}
export function drawGroundTile(c, points, variant, opacity, tile) {
  const start = sampleStart();
  const frame = sprites['ground_'+variant], img = frame.layers[0].image;
  if (!groundPatterns.has(variant)) groundPatterns.set(variant, c.createPattern(img, 'repeat'));
  c.globalAlpha = opacity;
  for (let i=1; i<points.length-1; i++) {
    groundFace(c, points[0], points[i], points[i+1], tile?.w??img.width, tile?.h??img.height, tile?.pattern??groundPatterns.get(variant));
  }
  if (start) {
    const xs=points.map(p=>p.x), ys=points.map(p=>p.y);
    sampleEnd('ground', start, Math.max(...xs)-Math.min(...xs), Math.max(...ys)-Math.min(...ys));
  }
}

// Three connected bands leave the attachment fixed. The lowest pixels can trail
// the upper branch without splitting the artist's joined, multi-strand silhouette.
function vineTip(c, layer, w, h, time, phase, variant) {
  const [rx, ry, rw, rh] = layer.rect, image = layer.image;
  function offset(y) {
    const delay = M.tipLag * y * (variant === 2 ? -.65 : 1);
    return h * M.tipBend * y*y * wave(time - delay, M.windHz, phase);
  }
  for (let i=0; i<3; i++) {
    const py=Math.round(image.height*i/3), end=Math.round(image.height*(i+1)/3);
    const y0=ry+rh*py/image.height, y1=ry+rh*end/image.height;
    const dh=(y1-y0)*h, x0=offset(y0), shear=(offset(y1)-x0)/dh;
    c.save();
    c.transform(1,0,shear,1,x0,y0*h);
    c.drawImage(image,0,py,image.width,end-py,(rx-.5)*w,0,rw*w,dh);
    c.restore();
  }
}

function eyeLayer(c, layer, w, h, progress, variant) {
  const [rx,ry,rw,rh] = layer.rect, img=layer.image, A=WORLD.ambience;
  const cuts=variant===3 ? M.eyeCuts : [0,1];
  for (let i=0; i<cuts.length-1; i++) {
    const u=progress - i*M.eyeLag;
    const blink=clamp(Math.abs(u-A.eyeBlinkAt)/A.eyeBlinkWidth,0,1);
    const open=clamp(Math.min(u,1-u)*5,0,1)*blink;
    const from=Math.max(rx,cuts[i]), to=Math.min(rx+rw,cuts[i+1]);
    if (to<=from || !open) continue;
    c.save();
    c.globalAlpha*=clamp(open*2,0,1);
    if (layer.role==='sway') c.scale(1, Math.max(.025,open));
    c.drawImage(img,(from-rx)/rw*img.width,0,(to-from)/rw*img.width,img.height,
      (from-.5)*w,(ry-.5)*h,(to-from)*w,rh*h);
    c.restore();
  }
}

const NEAR_DARK = {tree: 11, log: 8, rock: 7};
function darkLayer(layer) {
  if (layer.dark) return layer.dark;
  const img = layer.image, canvas = new OffscreenCanvas(img.naturalWidth || img.width, img.naturalHeight || img.height), g = canvas.getContext('2d');
  g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#04070a'; g.fillRect(0, 0, canvas.width, canvas.height);
  return layer.dark = {...layer, image: canvas};
}
function bill(c, type, x, y, w, o, time, distance, open=1) {
  const start = sampleStart();
  const variant = o.variant || 1, frame = sprites[type+'_'+variant];
  const h = w * frame.height / frame.width;
  const phase = o.phase || 0;
  const wind = .72 * wave(time, M.windHz, phase) + .28 * wave(time, M.windHz*1.57, phase+.8);
  let anchorY = 1;
  if (type === 'vine') anchorY = 0;
  if (type === 'mote') anchorY = 34/60;
  if (type === 'fall' || type === 'eyes' || type === 'loot') anchorY = .5;
  c.save();
  c.translate(x,y);
  if (o.face === -1) c.scale(-1,1);
  for (const layer of frame.layers) {
    c.save();
    const moving = layer.role === 'sway';
    if (layer.role === 'warm') c.globalAlpha *= clamp(1-distance/M.warmReach, 0, 1);
    if ((moving || layer.role === 'warm') && M.swayRad[type]) {
      c.rotate(wind * M.swayRad[type] * (1-.075*(variant-1)));
    }
    if (moving && type === 'low_fog') {
      const drift = wave(time, M.fogHz, phase);
      c.translate(w * M.fogSlide * drift * (variant===1 ? 1 : -1),
        variant===2 ? h * M.fogLift * Math.cos(time*TAU*M.fogHz+phase) : 0);
    }
    if (moving && type === 'fall') {
      c.rotate(wave(time,M.fallHz,phase)*M.fallSwing);
      c.scale(M.fallEdge + (1-M.fallEdge)*Math.abs(Math.cos(time*TAU*M.fallHz+phase)),1);
    }
    if (type === 'mote' || (type === 'loot' && moving)) {
      const pulse = type === 'mote' ? M.motePulse : M.lootPulse;
      const hz = type === 'mote' ? M.moteHz : M.lootHz;
      c.globalAlpha *= 1 - pulse * (.5-.5*wave(time,hz,phase));
    }
    if (c.globalAlpha > .001) {
      if (type === 'eyes') eyeLayer(c,layer,w,h,open,variant);
      else if (type === 'vine' && moving) vineTip(c,layer,w,h,time,phase,variant);
      else blit(c, layer, -w/2, -h*anchorY, w, h);
      // 近景适度压暗增强纵深，同时保留精修树皮肌理与层次，不压成死黑一片。
      const near = NEAR_DARK[type] ? clamp((NEAR_DARK[type] - distance) / 8, 0, 1) * .35 : 0;
      if (near > .01 && layer.role !== 'warm') { c.globalAlpha *= near; blit(c, darkLayer(layer), -w/2, -h*anchorY, w, h); }
    }
    c.restore();
  }
  c.restore();
  sampleEnd(type, start, w, h);
}

function paper(type) {
  return (c,x,y,w,h,o,time=0,distance=0,open=1) => bill(c,type,x,y,w,o,time,distance,open);
}
export const drawTree = paper('tree'), drawShrub = paper('shrub'), drawGrass = paper('grass');
export const drawRock = paper('rock'), drawLog = paper('log'), drawVine = paper('vine');
export const drawLowFog = paper('low_fog'), drawMote = paper('mote');
export const drawFall = paper('fall'), drawEyes = paper('eyes');
export function drawLootGlow(c,x,y,w,h,time) {
  // The 30 cm solid card occupies the centre of a 66 cm artboard.
  bill(c, 'loot', x, y, w * .66 / .30, {variant:1}, time, 0);
}
