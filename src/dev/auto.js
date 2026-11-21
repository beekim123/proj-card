import { GAME as C, RULES, WORLD } from '../config.js';
import { autoCardIndex } from './auto-line.js';
import { act, look, clamp, angleTo } from '../game.js';

export function autoInput(g,dt) {
  const input={forward:0,side:0,run:false};
  const {phase,phaseTime:t}=g;
  function steer(yaw,pitch) {
    const turn=clamp(angleTo(g.world.yaw,yaw),-dt*2.5,dt*2.5);
    look(g,turn/C.sensitivity,(g.world.pitch-pitch)*Math.min(1,dt*7)/C.sensitivity);
  }
  if (phase==='walk' && g.locked) {
    // Look back along the path, turn through the rest of the circle, then follow the clearing.
    const side=t>1 && t<1.7;
    if (t>1.8 && t<3.8) steer(Math.PI,0);
    else if (t>=3.8 && t<5.6) steer(-.05,0);
    else {
      const z=g.world.z+2;
      const trail=WORLD.trailBend*Math.sin(z/WORLD.trailWave)+WORLD.trailBend*.35*Math.sin(z/5);
      steer(Math.atan2(trail-g.world.x,2),-.016);
    }
    input.side=side?1:0;
    input.forward=(t<1.8||t>5.6)&&!side?1:0;
    input.run=t>5.6;
  }
  if (phase==='battle' && t>.50+.28*g.b.line.length) {
    const n=g.b.turn<4?1:5;
    const idx=autoCardIndex(g.b);
    if (g.b.line.length<n && idx>=0) act(g,'play',idx);
    else if (t>1.0+.28*g.b.line.length) act(g,'cast');
  }
  if (phase==='loot') {
    if (!g.locked && t>.65) act(g,'resume');
    const {x,z}=g.loot;
    const d=Math.hypot(x-g.world.x,z-g.world.z);
    steer(Math.atan2(x-g.world.x,z-g.world.z),clamp(Math.atan2(WORLD.lootHeight-WORLD.eye,d),-C.pitchDown,C.pitchUp));
    if (t>1 && d>1.80) input.forward=1;
    else if (g.canPickup && t>1.6) act(g,'pickup');
  }
  if (phase==='choose' && t>1.3) act(g,'choose',0);
  if (phase==='elite' && t>1.2) act(g,'seal');
  if (phase==='route' && t>1.0) act(g,'exit');
  if (phase==='result' && t>2.5) act(g,'restart');
  return input;
}

export function screenshotFor(g) {
  if (g.phase==='encounter' && g.phaseTime>1.10 && g.b.monsters.some(m=>m.kind==='tiko'))
    return '10-encounter.png';
}

export function distribution(samples) {
  const ordered=[...samples].sort((a,b)=>a-b);
  const at=q=>ordered[Math.max(0,Math.ceil(ordered.length*q)-1)];
  return {p50:at(.5),p95:at(.95),p99:at(.99),max:ordered.at(-1)};
}
