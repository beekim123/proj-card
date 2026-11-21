import { GAME as C, WORLD, AUTO_WALK } from './config.js';
import {
  newRun, seededRandom, startFight, playInstant, queueCard, undoLast, undoAll, selectTarget, startCast,
  applyHit, endCast, attack, finishTurn, lootChoices, takeLoot, finishElite, lampCount,
} from './rules.js';
import { createWorld, moveWorld, placeEncounter, placeLoot } from './world.js';
import { openAlbum, albumAction, updateAlbum } from './album/module.js';
import { practiceDeal } from './battle/practice.js';
import { CREATURES } from './battle/creature-catalog.js';
import { underfoot } from './explore/wetland.js';

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const angleTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const scenePhases = new Set(['walk', 'encounter', 'battle', 'cast', 'attack', 'death', 'loot', 'choose', 'elite', 'sealing', 'route', 'result']);
export const isScenePhase = s => scenePhases.has(s);
const travel = phase => phase === 'walk' || phase === 'loot';

export const cardVisuals = new WeakMap();
export function cardVis(card) {
  let v = cardVisuals.get(card);
  if (!v) { v = {}; cardVisuals.set(card, v); }
  return v;
}

export function showMsg(g, text, duration = 1.1) {
  g.centerMsg = { text, born: g.elapsed, duration };
}

export function createGame(seed, hooks = {}) {
  const g = {
    seed, hooks, run: newRun(seed), world: createWorld(seed), pathRng: seededRandom(seed ^ 0x754ca),
    phase: 'start', phaseTime: 0, elapsed: 0, locked: false, b: null, choices: [], shots: [],
    distance: 0, threshold: 0, positions: [], loot: null, damageFlash: 0, rainbowFlash: null, whiteBeam: null,
    shake: 0, stageShake: null, heartLose: null, gemFlash: null, multPop: null, centerMsg: null,
    turnDamage: 0, shownTurnDamage: 0, pileModal: null, confirmFlee: false, levelUpToast: null,
    flyingCards: [], drawCursor: 0, castTime: 0, castSpeed: 1, castSkip: false, settledCastIndex: -1,
    cameraYaw: 0, cameraPitch: 0, encounterFacing: 0, focus: { x: 0, y: 0 }, canPickup: false,
    get fight() { return this.run.fights; }, get hearts() { return this.run.hearts; },
    get seals() { return this.run.seals; }, get bestTurn() { return this.run.maxTurn; },
    get bestHit() { return this.run.maxHit; }, get target() { return this.b?.target; },
  };
  g.footMeters = 0; g.quietUntil = 0; g.album = { tab: 0, id: null, progress: 0 };
  return g;
}

export function pumpDrawEvents(g, baseTime = g.elapsed) {
  const b = g.b;
  if (!b?.drawEvents?.length) return;
  let t = Math.max(baseTime, g.drawCursor || baseTime);
  for (const ev of b.drawEvents.splice(0)) {
    if (ev.type === 'reshuffle') {
      const startAt = t;
      g.pendingCues ??= [];
      g.pendingCues.push({
        at: startAt,
        fn: () => {
          showMsg(g, '洗牌：弃牌堆洗回牌堆', 1.15);
          g.hooks.sound?.('shuffle');
          for (let k = 0; k < 5; k++) {
            g.flyingCards.push({
              card: { id: 'back' },
              fromX: 61, fromY: 745, fromW: 54, fromH: 81,
              toX: 1379, toY: 745, toW: 54, toH: 81,
              born: g.elapsed + k * 0.045,
              duration: 0.35,
            });
          }
        },
      });
      t += 0.45;
    } else if (ev.type === 'draw') {
      const cv = cardVis(ev.card);
      cv.dealAt = t;
      cv.dealSounded = false;
      t += 0.11;
    } else if (ev.type === 'overflow') {
      const startAt = t;
      g.pendingCues ??= [];
      g.pendingCues.push({
        at: startAt,
        fn: () => {
          showMsg(g, '手牌满了，这张进弃牌堆', 1.2);
          g.hooks.sound?.('overflow');
          g.flyingCards.push({
            card: ev.card,
            fromX: 1379, fromY: 745, fromW: 60, fromH: 90,
            midX: 720, midY: 360, midW: 120, midH: 180,
            toX: 61, toY: 745, toW: 60, toH: 90,
            born: g.elapsed,
            duration: 0.72,
            twoStage: true,
          });
        },
      });
      t += 0.55;
    }
  }
  g.drawCursor = t;
}

function phase(g, name) {
  if (name === 'encounter') g.quietUntil = Infinity;
  if (name === 'death') g.quietUntil = g.elapsed + 4;
  if (name !== 'battle') { g.pileModal = null; g.confirmFlee = false; }
  const cue = { loot: 'drop', cast: 'cast', attack: 'warning', result: 'result' }[name];
  if (cue) g.hooks.sound?.(cue);
  g.phase = name;
  g.phaseTime = 0;
  g.hooks.phase?.(name);
}

function ungrab(g) {
  g.locked = false;
  g.hooks.unlock?.();
}

function nextLeg(g) {
  g.b = null; g.positions = []; g.loot = null; g.canPickup = false; g.distance = 0;
  g.threshold = C.encounter[0] + g.pathRng() * (C.encounter[1] - C.encounter[0]);
  phase(g, 'walk');
  g.hooks.lock?.();
}

function meet(g, battle = null) {
  g.b = battle ?? startFight(g.run);
  for (const m of g.b.monsters) { m.visualHp = m.hp; m.shownHp = m.hp; }
  g.turnDamage = 0;
  g.shownTurnDamage = 0;
  g.pileModal = null;
  g.confirmFlee = false;
  g.levelUpToast = null;
  g.flyingCards = [];
  g.pendingCues = [];
  g.drawCursor = g.elapsed + C.arrival * 0.45;
  pumpDrawEvents(g, g.drawCursor);
  g.positions = placeEncounter(g.world, g.b.monsters.length, g.b.monsters.map(m => m.kind)).map((p, i) => {
    const { kind } = g.b.monsters[i];
    const seed = (g.seed ^ Math.imul(g.fight * 4 + i, 0x9e3779b9)) >>> 0;
    const animation = g.hooks.monsters?.create(kind, { seed, elite: kind === 'elite' });
    animation?.trigger('appear');
    return { ...p, lastHit: -Infinity, lastShake: -Infinity, shakeSign: 1, died: -Infinity, animation };
  });
  hideAtTurnStart(g);
  const middle = g.positions.reduce((p, m) => ({ x: p.x + m.x / g.positions.length, z: p.z + m.z / g.positions.length }), { x: 0, z: 0 });
  g.encounterFacing = Math.atan2(middle.x - g.world.x, middle.z - g.world.z);
  g.cameraYaw = g.cameraPitch = 0;
  g.focus = { x: 0, y: 0 };
  ungrab(g);
  phase(g, 'encounter');
}

function result(g, reason) {
  g.reason = reason;
  ungrab(g);
  phase(g, 'result');
}

export function look(g, dx, dy) {
  if (!travel(g.phase) || !g.locked) return;
  g.world.yaw = angleTo(0, g.world.yaw + dx * C.sensitivity);
  g.world.pitch = clamp(g.world.pitch - dy * C.sensitivity * 0.55, -C.pitchDown, C.pitchUp);
}

function pickupRange(g) {
  const d = Math.hypot(g.loot.x - g.world.x, g.loot.z - g.world.z);
  const bearing = Math.atan2(g.loot.x - g.world.x, g.loot.z - g.world.z);
  const aimHeight = WORLD.eye + Math.tan(g.world.pitch) * d;
  const angle = angleTo(g.world.yaw, bearing);
  return d <= C.pickupRange && Math.abs(angle) < Math.PI / 2 && Math.abs(d * Math.sin(angle)) <= C.pickupHalfWidth
    && aimHeight >= C.pickupBase && aimHeight <= WORLD.lootHeight + C.pickupAboveCard;
}

export function act(g, action, arg) {
  const s = g.phase;
  if (action === 'flee' && ['encounter', 'battle', 'cast', 'attack'].includes(s) && g.hearts > 0 && g.b?.monsters.some(m => m.hp > 0)) {
    g.cardDrag = null; g.quietUntil = 0; g.shots = []; g.damageFlash = g.shake = 0; g.cameraPitch = g.cameraYaw = 0; g.focus = { x: 0, y: 0 };
    if (g.practice) act(g, 'practiceSetup'); else nextLeg(g);
    return;
  }
  if (action === 'hall' && isScenePhase(s)) {
    if (g.practice) { act(g, 'practiceLeave'); return; }
    g.cardDrag = null; ungrab(g);
    const menu = createGame(g.seed, g.hooks); menu.world = g.world; menu.elapsed = g.elapsed; menu.pausedRun = g;
    g.hooks.switchGame?.(menu); return;
  }
  if (s === 'start' && action === 'start' && g.pausedRun) {
    const live = g.pausedRun; g.pausedRun = null; g.hooks.switchGame?.(live);
    if (travel(live.phase)) live.hooks.lock?.(); return;
  }
  if (s === 'start' && action === 'practice') {
    g.practice = { homeRun: g.run, homeWorld: g.world, kinds: ['tiko'], seed: (g.seed ^ 0xe411) >>> 0 }; phase(g, 'practiceMenu'); return;
  }
  if (g.practice) {
    const p = g.practice, setup = s === 'practiceMenu', menu = setup || s === 'practiceResult';
    if (setup && action === 'practiceAdd' && Object.hasOwn(CREATURES, arg) && p.kinds.length < 3) p.kinds.push(arg);
    if (setup && action === 'practiceRemove' && Number.isInteger(arg) && arg >= 0 && arg < p.kinds.length) p.kinds.splice(arg, 1);
    if (menu && action === 'practiceGo' && p.kinds.length) { const { run, b } = practiceDeal(p.seed, p.kinds); g.run = run; g.world = createWorld(g.seed); g.shots = []; g.damageFlash = g.shake = 0; meet(g, b); return; }
    if (action === 'practiceSetup' || action === 'practiceLeave') {
      Object.assign(g, { run: p.homeRun, world: p.homeWorld, b: null, positions: [], shots: [], loot: null, damageFlash: 0, shake: 0, quietUntil: 0, cameraYaw: 0, cameraPitch: 0, focus: { x: 0, y: 0 } });
      if (action === 'practiceLeave') g.practice = null; phase(g, g.practice ? 'practiceMenu' : 'start'); return;
    }
    if (menu) return;
  }
  if (s === 'start' && ['album', 'settings'].includes(action)) { if (action === 'album') openAlbum(g.album); phase(g, action); return; }
  if (s === 'album' && albumAction(g.album, action, arg)) return;
  if (s === 'start' && action === 'moon') { g.world.moonOffset = (g.world.moonOffset + 1) % 3; return; }
  if (s === 'start' && action === 'quit') { g.hooks.quit?.(); return; }
  if (s === 'start' && action === 'start') { for (const c of g.run.deck) g.hooks.collect?.('gem' + c.col); }
  if (['settings', 'album'].includes(s) && action === 'back') { phase(g, 'start'); return; }
  if (s === 'settings' && action === 'volume') { g.hooks.volume?.(...arg); return; }
  if (s === 'settings' && action === 'musicSuite') { g.hooks.musicSuite?.(arg); return; }
  if (s === 'settings' && action === 'musicPreview') { g.hooks.musicPreview?.(arg); return; }
  if (s === 'study') { if (action === 'back') { g.study = null; phase(g, 'album'); } else if (action === 'trycard') g.hooks.tryStudy(g.study); return; }
  if (s === 'album' && action === 'study') { g.study = g.hooks.study(); phase(g, 'study'); return; }
  if ((action === 'start' && s === 'start') || (action === 'continue' && s === 'route')) nextLeg(g);
  else if (action === 'resume' && travel(s)) g.hooks.lock?.();
  else if (s === 'cast' && action === 'castClick') {
    if (g.castSpeed === 1) {
      g.castSpeed = 3;
      showMsg(g, '加速', 0.6);
      g.hooks.sound?.('menu');
    } else if (!g.castSkip) {
      g.castSkip = true;
      showMsg(g, '跳过', 0.6);
      g.hooks.sound?.('menu');
    }
  } else if (s === 'battle') {
    if (action === 'openPile' && (arg === 'draw' || arg === 'discard')) { g.pileModal = arg; g.hooks.sound?.('menu'); return; }
    if (action === 'closePile') { g.pileModal = null; g.hooks.sound?.('menu'); return; }
    if (g.pileModal) return;
    if (action === 'play') {
      const card = g.b.hand[arg];
      if (card?.instant) {
        const pose = cardVis(card).pose;
        if (playInstant(g.b, arg)) {
          g.hooks.sound?.('instant');
          if (card.id === 'shield') showMsg(g, '护盾：挡下一次攻击', 1.1);
          if (pose) {
            g.flyingCards.push({
              card,
              fromX: pose.x, fromY: pose.y, fromW: pose.w || 120, fromH: pose.h || 180,
              toX: 61, toY: 745, toW: 56, toH: 84,
              born: g.elapsed, duration: 0.35,
            });
          }
          pumpDrawEvents(g);
        }
      } else if (queueCard(g.b, arg)) {
        g.hooks.sound?.('play');
      }
    }
    if ((action === 'undoLast' || action === 'undo') && undoLast(g.b)) g.hooks.sound?.('undo');
    if (action === 'undoAll' && undoAll(g.b)) g.hooks.sound?.('undo');
    if (action === 'target') selectTarget(g.b, arg);
    if (action === 'cast') {
      for (const m of g.b.monsters) m.visualHp = m.hp;
      g.castPlan = startCast(g.b);
      g.castSchedule = buildCastSchedule(g.castPlan);
      g.castTime = 0;
      g.castSpeed = 1;
      g.castSkip = false;
      g.settledCastIndex = -1;
      g.castRainbowActive = false;
      g.rainbowRetroSum = 0;
      g.rainbowRetroByTarget = g.b.monsters.map(() => 0);
      g.lastCastMult = 1;
      g.turnDamage = 0;
      g.shownTurnDamage = 0;
      g.uiBells = 0; g.castState = null; g.castIndex = -1; g.castCueIndex = -1; g.segment = 0;
      phase(g, 'cast');
    }
  } else if (s === 'loot' && action === 'pickup' && g.locked && pickupRange(g)) {
    g.hooks.sound?.('pickup'); g.choices = lootChoices(g.run);
    g.loot = null; g.canPickup = false;
    ungrab(g);
    phase(g, 'choose');
  } else if (s === 'choose' && action === 'choose' && (arg === -1 || g.choices[arg])) {
    takeLoot(g.run, g.choices[arg]); if (g.choices[arg]) g.hooks.collect?.(g.choices[arg].id);
    phase(g, 'route');
  } else if (s === 'elite' && ['seal', 'release'].includes(action)) {
    finishElite(g.run, action === 'seal'); if (action === 'seal') {
      g.hooks.collect?.('seal'); g.hooks.sound?.('seal');
      const i = g.b.monsters.findIndex(m => m.kind === 'elite'), anim = g.hooks.monsters?.create('elite', { seed: g.seed, elite: true });
      if (anim && anim.module.events?.includes('seal')) { g.positions[i].animation = anim; anim.trigger('seal'); phase(g, 'sealing'); return; }
    }
    phase(g, 'route');
  } else if (s === 'route' && action === 'exit') result(g, '主动撤离');
  else if (s === 'result' && action === 'restart') g.hooks.restart?.();
}

function hideAtTurnStart(g) {
  const amount = lampCount(g.b.lamps) / 6;
  g.positions.forEach(({ animation }, i) => {
    if (g.b.monsters[i].hp > 0) animation?.trigger('hide', { amount });
  });
}

function readyMonster(g, i) {
  if (g.b.monsters[i].countdown === 1) {
    g.positions[i].animation?.trigger('ready');
    g.hooks.sound?.('countdown1');
  }
}

function startAttack(g) {
  g.lunger = g.attacks.shift();
  g.struck = false;
  const animation = g.positions[g.lunger].animation;
  const timing = animation?.trigger('attack');
  const hitAt = typeof timing === 'number' ? timing : timing?.hitAt;
  g.strikeAt = Number.isFinite(hitAt) && hitAt > 0 ? hitAt : C.strike;
  g.attackLength = Math.max(C.attackLength, animation?.module.params?.attackDuration || animation?.module.params?.attackDur || 0, g.strikeAt + C.step);
  phase(g, 'attack');
}

function deathAnimationsDone(g) {
  return g.positions.every(({ animation }) => !animation || animation.done());
}

// 每张牌的发在约 0.45 秒内全部打出去，结束后停 0.16 秒飞入弃牌堆，再间隔 0.12 秒进入下一张牌
function buildCastSchedule(plan) {
  const times = [];
  const visual = [];
  const cardWindows = [];
  let cursorTime = C.castLead;
  let idx = 0;
  for (let cardIdx = 0; cardIdx < plan.states.length; cardIdx++) {
    const start = idx;
    while (idx < plan.segments.length && plan.segments[idx].cardIndex === cardIdx) idx++;
    const n = idx - start;
    const cardStart = cursorTime;
    if (n === 0) {
      const cardEnd = cursorTime + 0.16;
      cardWindows.push({ start: cardStart, end: cardEnd, flyAt: cardEnd + 0.08, rainbowChecked: false, flew: false });
      cursorTime = cardEnd + 0.22;
      continue;
    }
    const burst = 0.45;
    const maxVisual = 72;
    const stride = n > maxVisual ? n / maxVisual : 1;
    let nextShow = 0;
    for (let k = 0; k < n; k++) {
      times.push(cardStart + (n === 1 ? 0 : (k / (n - 1)) * burst));
      const seg = plan.segments[start + k];
      const show = n <= maxVisual || k >= nextShow || seg.crit;
      if (show && n > maxVisual && k >= nextShow) nextShow += stride;
      visual.push(show);
    }
    const cardEnd = cardStart + burst;
    cardWindows.push({ start: cardStart, end: cardEnd, flyAt: cardEnd + 0.16, rainbowChecked: false, flew: false });
    cursorTime = cardEnd + 0.28;
  }
  return { times, visual, cardWindows, endTime: cursorTime + C.castEnd };
}

function finish(g) {
  const outcome = finishTurn(g.run, g.b);
  pumpDrawEvents(g);
  if (g.b.lastLevelUps?.length) {
    g.levelUpToast = { items: g.b.lastLevelUps, born: g.elapsed };
    const names = [...new Set(g.b.lastLevelUps.map(u => ['红', '绿', '蓝'][u.color]))].join('、');
    showMsg(g, '宝石升级：' + names, 1.2);
    g.gemFlash = { colors: new Set(g.b.lastLevelUps.map(u => u.color)), born: g.elapsed, duration: 0.70 };
    g.hooks.sound?.('gemUp');
  }
  if (outcome === 'win') {
    g.loot = g.practice || g.b.elite ? null : placeLoot(g.world, g.positions[g.b.target]);
    phase(g, 'death');
  } else if (outcome === 'next') {
    g.turnDamage = 0;
    g.shownTurnDamage = 0;
    hideAtTurnStart(g);
    phase(g, 'battle');
  } else if (g.practice) {
    g.practice.reason = outcome === 'dead' ? '练习结束 · 心已耗尽' : '练习结束 · 十回合耗尽';
    phase(g, 'practiceResult');
  } else {
    result(g, outcome === 'dead' ? '心已耗尽' : '十回合耗尽');
  }
}

function triggerCardStartCues(g, p, cardIdx) {
  if (cardIdx <= g.castCueIndex) return;
  g.castCueIndex = cardIdx;
  g.castIndex = cardIdx;
  g.castState = p.states[cardIdx];
  if (g.castState.multiplier !== g.lastCastMult) {
    g.lastCastMult = g.castState.multiplier;
    g.multPop = { born: g.elapsed, duration: 0.30 };
    g.hooks.sound?.('mult');
  }
  const before = p.states[cardIdx - 1]?.lamps ?? p.startLamps;
  if (g.castState.relation === '补色') {
    g.uiBells++;
    g.whiteBeam = { born: g.elapsed, duration: 0.42, target: g.b.target };
    g.hooks.sound?.('white');
    g.positions.forEach((q, i) => {
      if (g.b.monsters[i].kind === 'elite' && g.b.monsters[i].hp > 0) {
        q.animation?.trigger('bell');
        g.hooks.sound?.('bell');
      }
    });
  } else if (before & ~g.castState.lamps) {
    g.hooks.sound?.('dark');
  }
  if (g.castState.relation === '补色' && (before & ~g.castState.lamps)) {
    g.positions.forEach(({ animation }, i) => {
      if (g.b.monsters[i].hp > 0) animation?.trigger('blowOpen');
    });
  }
}

function castStep(g, dt) {
  const p = g.castPlan;
  const sched = g.castSchedule || {
    times: p.segments.map((_, i) => C.castLead + C.hitInterval * i),
    visual: p.segments.map(() => true),
    cardWindows: [],
    endTime: C.castLead + C.hitInterval * p.segments.length + C.castEnd,
  };
  g.castTime = g.castSkip ? sched.endTime : (g.castTime || 0) + dt * (g.castSpeed || 1);

  // 检查还没打出任何发的无伤害牌（如点灯）的起始时刻
  for (let cIdx = 0; cIdx < sched.cardWindows.length; cIdx++) {
    const win = sched.cardWindows[cIdx];
    if (g.castTime >= win.start && cIdx > g.castCueIndex) {
      triggerCardStartCues(g, p, cIdx);
    }
  }

  let firedThisTick = 0;
  while (g.segment < p.segments.length && g.castTime >= sched.times[g.segment]) {
    const segIdx = g.segment++;
    const livingTarget = g.b.monsters.some(mon => mon.hp > 0);
    const hit = applyHit(g.run, g.b, p, segIdx);
    const pos = g.positions[hit.target];
    const mon = g.b.monsters[hit.target];
    pos.lastHit = g.elapsed;
    // 同一只怪 0.09 秒内只抖一次，横向抖 6 像素、0.12 秒
    if (g.elapsed - (pos.lastShake ?? -Infinity) >= 0.09 && hit.damage > 0) {
      pos.lastShake = g.elapsed;
      pos.shakeSign = -(pos.shakeSign || 1);
    }
    if (hit.killed) {
      pos.died = g.elapsed;
      g.hooks.sound?.('monsterDie');
    }

    const isCardStart = hit.cardIndex > g.castCueIndex;
    triggerCardStartCues(g, p, hit.cardIndex);

    // 出彩虹之前按未乘 3 的 raw 显示，待彩虹那张打完时一次性弹出“彩虹补 xxx”
    const shownSingle = g.castRainbowActive || !p.rainbow ? hit.damage : hit.rawDamage;
    const shownTotal = g.castRainbowActive || !p.rainbow ? hit.totalDamage : hit.rawTotalDamage;
    const diffTotal = hit.totalDamage - shownTotal;
    if (diffTotal > 0) {
      g.rainbowRetroSum += diffTotal;
      g.rainbowRetroByTarget[hit.target] = (g.rainbowRetroByTarget[hit.target] || 0) + diffTotal;
    }
    g.turnDamage += shownTotal;
    mon.visualHp = Math.max(0, (mon.visualHp ?? mon.maxHp) - shownTotal);

    if (livingTarget && (isCardStart || hit.crit || hit.killed || firedThisTick === 0)) {
      pos.animation?.trigger(!hit.damage ? 'shell' : hit.crit ? 'heavyHit' : 'hit', { damage: shownSingle, crit: hit.crit });
      g.hooks.sound?.(hit.damage === 0 ? 'block' : hit.crit ? 'crit' : 'hit');
    }
    if (hit.killed) pos.animation?.trigger('die');

    const allowVisual = !g.castSkip || (segIdx % 12 === 0);
    if (livingTarget && allowVisual && (sched.visual[segIdx] || hit.killed || !hit.damage) && g.shots.length < 240) {
      // 原型散落范围：横向约 ±150 像素、纵向约 170 像素，0.9 秒上飘淡出
      const h1 = Math.sin((segIdx + 1) * 12.9898 + hit.cardIndex * 78.233) * 43758.5453;
      const h2 = Math.sin((segIdx + 1) * 93.9898 + hit.cardIndex * 67.345) * 24634.6345;
      const h3 = Math.sin((segIdx + 1) * 45.164 + hit.cardIndex * 19.123) * 15731.743;
      const rx = ((h1 - Math.floor(h1)) + (h3 - Math.floor(h3)) - 1); // [-1, 1]
      const ry = (h2 - Math.floor(h2)); // [0, 1]
      g.shots.push({
        x: pos.x, z: pos.z, kind: hit.art, crit: hit.crit,
        rainbow: g.castRainbowActive && p.rainbow,
        blocked: !hit.damage,
        reduced: !hit.pure && ['tiko', 'reya'].includes(mon.kind) && p.startLamps !== 0,
        value: shownSingle,
        offsetX: rx * 150,
        offsetY: (ry - 0.55) * 170,
        born: g.elapsed,
        life: C.floatTime,
      });
    }
    if (hit.crit && hit.damage) g.shake = Math.max(g.shake, 0.7);
    firedThisTick++;
  }

  // 每张牌打完瞬间：检查彩虹触发 & “彩虹补 xxx”，以及结算完飞进弃牌堆
  for (let cIdx = 0; cIdx < sched.cardWindows.length; cIdx++) {
    const win = sched.cardWindows[cIdx];
    const st = p.states[cIdx];
    if (!win.rainbowChecked && g.castTime >= win.end) {
      win.rainbowChecked = true;
      if (st?.rainbow && !g.castRainbowActive) {
        g.castRainbowActive = true;
        g.rainbowFlash = { born: g.elapsed, duration: 0.70 };
        showMsg(g, '彩虹！这次施法每一发 ×3', 1.25);
        g.hooks.sound?.('rainbow');
        if (g.rainbowRetroSum > 0) {
          g.turnDamage += g.rainbowRetroSum;
          g.b.monsters.forEach((m, mi) => {
            m.visualHp = Math.max(0, (m.visualHp ?? m.hp) - (g.rainbowRetroByTarget[mi] || 0));
          });
          const pos = g.positions[p.lastTarget ?? g.b.target] || g.positions[0];
          if (pos) {
            g.shots.push({
              x: pos.x, z: pos.z,
              prefix: '彩虹补 ',
              value: g.rainbowRetroSum,
              kind: 'pure',
              crit: true,
              rainbow: true,
              offsetX: 0,
              offsetY: -32,
              born: g.elapsed,
              life: 1.4,
            });
          }
          g.hooks.sound?.('rainbowSup');
        }
      }
    }
    if (!win.flew && g.castTime >= win.flyAt) {
      win.flew = true;
      g.settledCastIndex = cIdx;
      const card = g.b.line[cIdx];
      const pose = card ? cardVis(card).seqPose : null;
      if (card && pose) {
        g.flyingCards.push({
          card,
          fromX: pose.x, fromY: pose.y, fromW: pose.w || 75, fromH: pose.h || 112,
          toX: 61, toY: 745, toW: 56, toH: 84,
          born: g.elapsed,
          duration: 0.35,
        });
      }
    }
  }

  if (g.castTime >= sched.endTime) {
    for (const m of g.b.monsters) m.visualHp = m.hp;
    g.attacks = endCast(g.run, g.b, p); g.uiBells = 0;
    g.turnDamage = p.damage;
    g.shownTurnDamage = p.damage;
    g.positions.forEach((_, i) => { if (g.b.monsters[i].hp > 0) readyMonster(g, i); });
    if (!g.attacks.length) finish(g);
    else startAttack(g);
  }
}

function attackStep(g) {
  if (!g.struck && g.phaseTime >= g.strikeAt) {
    g.struck = true;
    const mon = g.b.monsters[g.lunger];
    const prevHearts = g.hearts;
    const hit = attack(g.run, g.b, g.lunger);
    if (hit.blocked) {
      showMsg(g, `护盾挡住了${mon.name}的攻击`, 1.15);
      g.hooks.sound?.('shieldBlock');
      g.damageFlash = 0;
    } else {
      const hw = hit.damage === 0.5 ? '半颗心' : `${hit.damage} 颗心`;
      showMsg(g, `${mon.name}攻击：掉${hw}`, 1.15);
      g.hooks.sound?.('hurt');
      g.damageFlash = 0.9;
      g.stageShake = { born: g.elapsed, duration: 0.35 };
      const lostIdx = Math.max(0, Math.min(2, Math.ceil(prevHearts) - 1));
      g.heartLose = { index: lostIdx, born: g.elapsed, duration: 0.60 };
    }
    g.shake = 1;
  }
  if (g.phaseTime >= g.attackLength) {
    if (g.hearts) readyMonster(g, g.lunger);
    if (!g.hearts || !g.attacks.length) finish(g);
    else startAttack(g);
  }
}

export function step(g, input, dt) {
  g.elapsed += dt; g.phaseTime += dt;
  if (g.phase === 'study') g.hooks.updateStudy(g.study, dt, g.hooks.sound);
  if (g.phase === 'album') { updateAlbum(g.album, dt); for (const [name, o] of g.album.sfx.splice(0)) g.hooks.sound?.(name, o); if (g.album.exitReady) phase(g, 'start'); }

  // 触发定时队列事件（洗牌、满手牌进弃牌堆、一张张发牌音效）
  if (g.pendingCues?.length) {
    for (let i = g.pendingCues.length - 1; i >= 0; i--) {
      if (g.elapsed >= g.pendingCues[i].at) {
        const cue = g.pendingCues.splice(i, 1)[0];
        cue.fn();
      }
    }
  }
  if (g.b?.hand) {
    for (const c of g.b.hand) {
      const cv = cardVis(c);
      if (cv.dealAt !== undefined && !cv.dealSounded && g.elapsed >= cv.dealAt) {
        cv.dealSounded = true;
        if (['battle', 'encounter'].includes(g.phase)) g.hooks.sound?.('deal');
      }
    }
  }
  if (g.flyingCards?.length) {
    g.flyingCards = g.flyingCards.filter(f => g.elapsed - f.born < (f.duration || 0.35));
  }

  g.shots = g.shots.filter(s => g.elapsed - s.born < (s.life || C.floatTime));
  g.damageFlash = Math.max(0, g.damageFlash - 1.6 * dt);
  g.shake = Math.max(0, g.shake - 2.4 * dt);
  if (g.levelUpToast && g.elapsed - g.levelUpToast.born > 2.6) g.levelUpToast = null;
  if (g.centerMsg && g.elapsed - g.centerMsg.born > g.centerMsg.duration) g.centerMsg = null;

  // 本回合总伤害：施法中每帧追剩下差值的 18%
  if (g.phase === 'cast') {
    if (g.shownTurnDamage < g.turnDamage) {
      g.shownTurnDamage += Math.max(1, Math.ceil((g.turnDamage - g.shownTurnDamage) * 0.18));
      if (!g._lastRollTick || g.elapsed - g._lastRollTick > 0.055) {
        g._lastRollTick = g.elapsed;
        g.hooks.sound?.('roll');
      }
    }
  } else {
    g.shownTurnDamage = g.turnDamage;
  }

  if (travel(g.phase)) {
    if (!g.locked) return;
    const forward = input.forward || (AUTO_WALK ? 1 : 0), side = input.side;
    const length = Math.max(1, Math.hypot(forward, side));
    const pace = (input.run ? C.run : C.walk) * dt / length;
    const meters = moveWorld(g.world, forward * pace, side * pace);
    g.wet = Boolean(underfoot(g.world)); g.footMeters += meters;
    if (g.footMeters > 0.79) {
      g.footMeters %= 0.79; g.hooks.sound?.(g.wet ? 'wet' : 'dry');
      if (g.wet) {
        g.world.splashes = (g.world.splashes || []).filter(f => g.elapsed - f.time < 1.4);
        g.world.splashes.push({ x: g.world.x + 0.18 * Math.sin(g.world.walkPhase), z: g.world.z, time: g.elapsed });
      }
    }
    if (g.phase === 'loot') g.canPickup = pickupRange(g);
    else {
      g.distance += meters;
      if (g.distance >= g.threshold - 1.9) g.quietUntil = Infinity;
      if (g.distance >= g.threshold) meet(g);
    }
    return;
  }
  const scan = ['encounter', 'battle', 'cast', 'attack'].includes(g.phase);
  if (scan || g.phase === 'death' || g.phase === 'sealing') {
    for (const { animation } of g.positions) {
      if (animation && !animation.done()) animation.update(dt);
    }
  }
  g.cameraYaw += ((scan ? g.focus.x * C.battleYaw : 0) - g.cameraYaw) * dt * C.scanEase;
  const lower = scan && g.b.monsters.some(m => m.hp > 0 && m.kind === 'veko');
  const lobby = g.phase === 'start' || g.phase === 'settings';
  g.cameraPitch += ((scan ? -(lower ? 0.119 : 0.053) - g.focus.y * C.battlePitch : lobby ? 0.075 : 0) - g.cameraPitch) * dt * C.scanEase;
  if (g.phase === 'sealing' && (deathAnimationsDone(g) || !g.positions.some(p => p.animation?.module.events?.includes('seal')))) phase(g, 'route');
  if (g.phase === 'encounter') {
    g.world.yaw += angleTo(g.world.yaw, g.encounterFacing) * dt * C.turnEase;
    g.world.pitch *= 1 - dt * C.turnEase;
    if (g.phaseTime >= C.arrival) phase(g, 'battle');
  } else if (g.phase === 'cast') castStep(g, dt);
  else if (g.phase === 'attack') attackStep(g);
  else if (g.phase === 'death' && g.phaseTime >= C.deathLength && deathAnimationsDone(g)) {
    if (g.practice) { g.practice.reason = '练习结束 · 击破'; phase(g, 'practiceResult'); }
    else phase(g, g.b.elite ? 'elite' : 'loot');
  }
}

export function worldView(g) {
  const t = g.phaseTime, s = g.phase, incoming = s === 'encounter';
  const fighting = ['encounter', 'battle', 'cast', 'attack', 'death', 'sealing'].includes(s);
  const strike = g.strikeAt, length = g.attackLength;
  const peak = s === 'attack' ? clamp(t < strike ? (t / strike) ** 3 : 1 - (t - strike) / (length - strike), 0, 1) : 0;
  const positions = fighting ? g.positions.map((p, i) => {
    const shakeAge = g.elapsed - (p.lastShake ?? -Infinity);
    const shakeX = shakeAge >= 0 && shakeAge < 0.12
      ? Math.sin((shakeAge / 0.12) * Math.PI) * 6 * (p.shakeSign || 1)
      : 0;
    return {
      ...p, ...g.b.monsters[i], index: i,
      alpha: incoming ? clamp(t / C.appear, 0, 1) : 1,
      death: Number.isFinite(p.died) ? clamp((g.elapsed - p.died + 0.001) / C.scatter, 0, 1) : 0,
      hit: Math.max(0, 1 - (g.elapsed - p.lastHit) / C.hitFlash),
      shakeX,
    };
  }) : [];
  const lamps = (s === 'cast' ? g.castState?.lamps : null) ?? g.b?.lamps ?? 0;
  const loot = s === 'loot' || (s === 'death' && t > C.lootDrop && deathAnimationsDone(g)) ? g.loot : null;
  return {
    time: g.elapsed, travel: travel(s), quiet: g.elapsed < g.quietUntil,
    yawOffset: g.cameraYaw, pitchOffset: g.cameraPitch, shake: g.shake ** 2 * 11,
    back: incoming ? C.recoil * Math.sin(Math.PI * clamp(t / C.arrival, 0, 1)) : peak * 0.18,
    circle: s === 'cast' && g.castPlan?.states.length ? 1 : 0,
    enemies: positions, target: g.target, lunge: peak, lunger: g.lunger,
    lit: Array.from({ length: 6 }, (_, i) => Boolean(lamps & (1 << i))),
    red: g.damageFlash, loot,
    skipPost: s === 'album' && g.album?.arrival >= 1,
    numbers: g.shots.map(n => ({ ...n, t: (g.elapsed - n.born) / (n.life || C.floatTime) })),
  };
}
