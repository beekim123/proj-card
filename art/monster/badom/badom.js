// 巴多姆 (badom) p5.js 动作模块（第 2 次返修：全部渐变严格按 SVG objectBoundingBox 外框拉伸）
// 严格遵循 动作接口-本包.md：仅使用 p5 实例与 drawingContext，不写死色值，不依赖 DOM/全局函数

const SVG_TO_CM = 240 / 817; // 身高 240cm 对应底稿 817 单位（脚底 y=896 到颅顶 y=79）
const ORIGIN_X = 300;
const ORIGIN_Y = 896;

const RIG = {
  pelvisBaseX: 300,
  pelvisBaseY: 495,
  hipOffsetX: 20,
  hipOffsetY: 4,
  thighLen: 202,
  shinLen: 190,
  ankleL: { x: 274, y: 868 },
  ankleR: { x: 327, y: 871 },
  fingerBaseL: [
    { x: 9, y: 20 },
    { x: 7, y: 38 },
    { x: 1, y: 41 },
    { x: -5, y: 39 },
    { x: -10, y: 34 },
  ],
  fingerBaseR: [
    { x: -9, y: 20 },
    { x: -7, y: 38 },
    { x: -1, y: 41 },
    { x: 5, y: 39 },
    { x: 10, y: 34 },
  ],
};

// 与 第一部分/巴多姆.html 每一条渐变路径精确对应的 SVG objectBoundingBox: [x, y, w, h]
const BBOX = {
  thighL: [-19.13, -4, 36.49, 207.75],
  thighLSpec: [-14.64, 15.1, 7.64, 166.9],
  thighR: [-17.36, -4, 36.49, 207.75],
  thighRSpec: [-10.97, 22, 6.22, 162],
  shinL: [-12.55, -1.75, 24.81, 196.75],
  shinLSpec: [-7.69, 14, 6.69, 168],
  shinR: [-12.26, -1.75, 24.81, 196.75],
  shinRSpec: [-6, 16, 6, 166],
  footL: [-37.43, -4, 47.07, 31],
  footLSpec: [-31, 4, 30, 18],
  footR: [-9.64, -4, 47.07, 31],
  footRSpec: [1, 5, 30, 17],
  pelvis: [-20.53, -25, 41.06, 53],
  pelvisSpec: [-14.38, -14, 6.38, 32],
  torso: [-54.2, -240, 108.41, 246.5],
  torsoSpec: [-42, -206, 30.6, 206],
  torsoCenterSpec: [-4.09, -190, 4.36, 124],
  neck: [-14, -74, 28, 80.5],
  neckSpec: [-9, -68, 4.6, 66],
  head: [-27, -86, 54, 92],
  headSpec: [-20.47, -79.58, 27.47, 55.58],
  frontCollar: [-30, -239, 60, 16],
  shoulderCapL: [-22.04, -18.94, 39.04, 25.09],
  shoulderCapR: [-17, -18.94, 39.04, 25.09],
  uArmL: [-14.74, -0.63, 26.12, 193.63],
  uArmLSpec: [-11.77, 14, 6.92, 166],
  uArmR: [-11.38, -0.63, 26.12, 193.63],
  uArmRSpec: [-8.04, 16, 4.29, 162],
  fArmL: [-10.25, -0.75, 19.64, 209.75],
  fArmLSpec: [-6.78, 28, 5.94, 172],
  fArmR: [-9.39, -0.75, 19.64, 209.75],
  fArmRSpec: [-6, 24, 5.15, 176],
  handL: [-12.16, -0.25, 24.16, 45.25],
  handR: [-12, -0.25, 24.16, 45.25],
  fingerL: [
    [-4, -2, 15.2, 52.18],
    [-2.56, -2, 4.99, 79.57],
    [-2.76, -2, 5.39, 93.21],
    [-3, -2, 5.2, 83.48],
    [-5.02, -2, 6.82, 66.52],
  ],
  fingerR: [
    [-11.2, -2, 15.2, 52.18],
    [-2.44, -2, 4.99, 79.57],
    [-2.64, -2, 5.39, 93.21],
    [-2.2, -2, 5.2, 83.48],
    [-1.8, -2, 6.82, 66.52],
  ],
};

const NEUTRAL = {
  pelvisX: 0,
  pelvisY: 0,
  pelvisRot: 0,
  torsoRot: 0.4,
  neckRot: -0.6,
  headRot: 2.2,
  headShiftX: 0,
  headShiftY: 0,
  shLX: 0,
  shLY: 0,
  shLRot: 0,
  uArmL: 16.5,
  fArmL: -9.5,
  handL: -4.0,
  shRX: 0,
  shRY: -1.2,
  shRRot: 0,
  uArmR: -16.2,
  fArmR: 9.8,
  handR: 3.5,
  fL: [4, -2, 1, 4, 9],
  fR: [-4, 2, -1, -5, -10],
};

// 确定性伪随机数（避免调用 p.randomSeed / p.noiseSeed）
function makeRng(seed) {
  let a = (seed >>> 0) || 1337;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

function hexToRgba(hex, alpha) {
  if (!hex || hex[0] !== '#') return `rgba(0,0,0,${alpha})`;
  let h = hex.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function createSpring(initial, stiffness, damping) {
  return { val: initial, vel: 0, target: initial, k: stiffness, d: damping };
}

function stepSpring(s, dt) {
  const force = (s.target - s.val) * s.k;
  const damp = -s.vel * s.d;
  s.vel += (force + damp) * dt;
  s.val += s.vel * dt;
}

function snapJoint(s, target, impulse = 0) {
  const delta = target - s.val;
  s.target = target;
  s.vel += delta * 6.5 + impulse;
}

function solveLegIK(hx, hy, ax, ay, L1, L2, bendDir) {
  const dx = ax - hx;
  const dy = ay - hy;
  const rawDist = Math.hypot(dx, dy);
  const minD = Math.abs(L1 - L2) + 2;
  const maxD = L1 + L2 - 0.6;
  const d = clamp(rawDist, minD, maxD);
  const baseAngle = Math.atan2(dy, dx);
  const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const angleA = Math.acos(cosA);
  const theta1 = baseAngle + bendDir * angleA;
  const kx = hx + Math.cos(theta1) * L1;
  const ky = hy + Math.sin(theta1) * L1;
  const theta2 = Math.atan2(ay - ky, ax - kx);
  return {
    thighRad: theta1 - Math.PI * 0.5,
    shinRad: theta2 - Math.PI * 0.5,
    kx,
    ky,
  };
}

function createJoints() {
  return {
    pelvisX: createSpring(0, 260, 12.5),
    pelvisY: createSpring(0, 280, 13.0),
    pelvisRot: createSpring(0, 240, 11.8),
    torsoRot: createSpring(NEUTRAL.torsoRot, 290, 12.2),
    neckRot: createSpring(NEUTRAL.neckRot, 360, 13.2),
    headRot: createSpring(NEUTRAL.headRot, 420, 12.8),
    headShiftX: createSpring(0, 380, 13.5),
    headShiftY: createSpring(0, 400, 13.8),
    shLX: createSpring(0, 340, 13.0),
    shLY: createSpring(0, 410, 12.8),
    shLRot: createSpring(0, 340, 12.5),
    uArmL: createSpring(NEUTRAL.uArmL, 290, 11.4),
    fArmL: createSpring(NEUTRAL.fArmL, 250, 9.8),
    handL: createSpring(NEUTRAL.handL, 270, 9.2),
    shRX: createSpring(0, 340, 13.0),
    shRY: createSpring(NEUTRAL.shRY, 410, 12.8),
    shRRot: createSpring(0, 340, 12.5),
    uArmR: createSpring(NEUTRAL.uArmR, 290, 11.4),
    fArmR: createSpring(NEUTRAL.fArmR, 250, 9.8),
    handR: createSpring(NEUTRAL.handR, 270, 9.2),
    fL: NEUTRAL.fL.map((v, i) => createSpring(v, 520 + (i === 2 ? 40 : 15), 13.4)),
    fR: NEUTRAL.fR.map((v, i) => createSpring(v, 520 + (i === 2 ? 40 : 15), 13.4)),
  };
}

function setNeutralTargets(S, snap = false) {
  const apply = (sp, v, imp = 0) => (snap ? snapJoint(sp, v, imp) : (sp.target = v));
  apply(S.pelvisX, NEUTRAL.pelvisX);
  apply(S.pelvisY, NEUTRAL.pelvisY, snap ? 30 : 0);
  apply(S.pelvisRot, NEUTRAL.pelvisRot);
  apply(S.torsoRot, NEUTRAL.torsoRot);
  apply(S.neckRot, NEUTRAL.neckRot);
  apply(S.headRot, NEUTRAL.headRot, snap ? -Math.sign(S.headRot.val) * 80 : 0);
  apply(S.headShiftX, 0);
  apply(S.headShiftY, 0);
  apply(S.shLX, NEUTRAL.shLX);
  apply(S.shLY, NEUTRAL.shLY, snap ? 40 : 0);
  apply(S.shLRot, NEUTRAL.shLRot);
  apply(S.uArmL, NEUTRAL.uArmL);
  apply(S.fArmL, NEUTRAL.fArmL);
  apply(S.handL, NEUTRAL.handL);
  apply(S.shRX, NEUTRAL.shRX);
  apply(S.shRY, NEUTRAL.shRY, snap ? 40 : 0);
  apply(S.shRRot, NEUTRAL.shRRot);
  apply(S.uArmR, NEUTRAL.uArmR);
  apply(S.fArmR, NEUTRAL.fArmR);
  apply(S.handR, NEUTRAL.handR);
  for (let i = 0; i < 5; i++) {
    apply(S.fL[i], NEUTRAL.fL[i]);
    apply(S.fR[i], NEUTRAL.fR[i]);
  }
}

function setReadyTargets(S, snap = false) {
  const apply = (sp, v, imp = 0) => (snap ? snapJoint(sp, v, imp) : (sp.target = v));
  apply(S.pelvisX, 0);
  apply(S.pelvisY, 10, snap ? 40 : 0);
  apply(S.pelvisRot, 0);
  apply(S.torsoRot, 0);
  apply(S.neckRot, 0);
  apply(S.headRot, 0, snap ? -S.headRot.val * 4 : 0);
  apply(S.headShiftX, 0);
  apply(S.headShiftY, 16, snap ? 90 : 0);
  apply(S.shLX, -4);
  apply(S.shLY, -10, snap ? -60 : 0);
  apply(S.shLRot, 6);
  apply(S.uArmL, 26, snap ? 80 : 0);
  apply(S.fArmL, -16, snap ? -60 : 0);
  apply(S.handL, -12);
  apply(S.shRX, 4);
  apply(S.shRY, -10, snap ? -60 : 0);
  apply(S.shRRot, -6);
  apply(S.uArmR, -26, snap ? -80 : 0);
  apply(S.fArmR, 16, snap ? 60 : 0);
  apply(S.handR, 12);
  const splayL = [26, 13, 0, -14, -26];
  const splayR = [-26, -13, 0, 14, 26];
  for (let i = 0; i < 5; i++) {
    apply(S.fL[i], splayL[i], snap ? splayL[i] * 5 : 0);
    apply(S.fR[i], splayR[i], snap ? splayR[i] * 5 : 0);
  }
}

// ==================== 待机抽动编排 ====================
function triggerIdleTwitch(state) {
  const { S, rng } = state;
  const isOffset =
    Math.abs(S.headRot.target) > 12 ||
    S.shLY.target < -8 ||
    S.shRY.target < -8 ||
    Math.abs(S.torsoRot.target) > 2.2;
  const pool = ['head', 'head', 'shoulder', 'shoulder', 'fingers', 'fingers', 'jolt'];
  if (isOffset) pool.push('neutral', 'neutral');
  let chosen = pool[Math.floor(rng() * pool.length)];
  if (chosen === state.lastTwitch) chosen = pool[(pool.indexOf(chosen) + 2) % pool.length];
  state.lastTwitch = chosen;
  state.seamFlash = 1.0;

  if (chosen === 'head') {
    const tilted = Math.abs(S.headRot.target) > 10;
    let targetAngle;
    if (tilted && rng() < 0.45) {
      targetAngle = randRange(rng, -2.5, 2.5);
    } else {
      state.headSign = rng() < 0.72 ? -state.headSign : state.headSign;
      targetAngle = state.headSign * randRange(rng, 21, 29);
    }
    const dir = Math.sign(targetAngle - S.headRot.val) || 1;
    snapJoint(S.headRot, targetAngle, dir * 135);
    snapJoint(S.neckRot, targetAngle * 0.22, dir * 32);
    snapJoint(S.headShiftX, dir * 2.4, dir * 14);
    snapJoint(S.headShiftY, -2.5, -24);
    S.torsoRot.vel += dir * 14;
    if (dir > 0) {
      S.shRY.vel -= 28;
      S.handR.vel += 26;
    } else {
      S.shLY.vel -= 28;
      S.handL.vel -= 26;
    }
  } else if (chosen === 'shoulder') {
    state.shoulderSide = rng() < 0.68 ? -state.shoulderSide : state.shoulderSide;
    const isL = state.shoulderSide > 0;
    const sgn = isL ? 1 : -1;
    const shY = isL ? S.shLY : S.shRY;
    const shX = isL ? S.shLX : S.shRX;
    const shR = isL ? S.shLRot : S.shRRot;
    const uArm = isL ? S.uArmL : S.uArmR;
    const fArm = isL ? S.fArmL : S.fArmR;
    const hand = isL ? S.handL : S.handR;
    const fingers = isL ? S.fL : S.fR;
    if (shY.target < -9) {
      snapJoint(shY, NEUTRAL[isL ? 'shLY' : 'shRY'], 95);
      snapJoint(shX, 0, -sgn * 18);
      snapJoint(shR, 0, -sgn * 20);
      snapJoint(uArm, NEUTRAL[isL ? 'uArmL' : 'uArmR'], -sgn * 46);
      snapJoint(fArm, NEUTRAL[isL ? 'fArmL' : 'fArmR'], sgn * 65);
      snapJoint(hand, NEUTRAL[isL ? 'handL' : 'handR'], -sgn * 75);
    } else {
      snapJoint(shY, -randRange(rng, 15, 22), -125);
      snapJoint(shX, sgn * 4.5, sgn * 24);
      snapJoint(shR, sgn * 7.5, sgn * 45);
      snapJoint(uArm, sgn * randRange(rng, 21, 27), sgn * 72);
      snapJoint(fArm, -sgn * randRange(rng, 16, 23), -sgn * 98);
      snapJoint(hand, sgn * randRange(rng, 8, 16), sgn * 115);
      for (let i = 0; i < 5; i++) fingers[i].vel += sgn * (i - 2) * 55;
      S.headRot.vel -= sgn * 36;
      S.torsoRot.vel -= sgn * 16;
    }
  } else if (chosen === 'fingers') {
    const mode = rng();
    const doHand = (isL) => {
      const fingers = isL ? S.fL : S.fR;
      const hand = isL ? S.handL : S.handR;
      const fArm = isL ? S.fArmL : S.fArmR;
      const sgn = isL ? 1 : -1;
      hand.vel += sgn * randRange(rng, 70, 115);
      fArm.vel -= sgn * randRange(rng, 22, 38);
      if (rng() < 0.58) {
        const tgts = [sgn * 24, sgn * 11, sgn * 1, -sgn * 14, -sgn * 27];
        for (let i = 0; i < 5; i++) snapJoint(fingers[i], tgts[i], (tgts[i] - fingers[i].val) * 7);
      } else {
        const base = isL ? NEUTRAL.fL : NEUTRAL.fR;
        for (let i = 0; i < 5; i++) {
          fingers[i].vel += sgn * (i - 1.5) * 160;
          fingers[i].target = base[i] + randRange(rng, -4, 4);
        }
      }
    };
    if (mode < 0.44 || mode > 0.82) doHand(true);
    if (mode >= 0.44) doHand(false);
  } else if (chosen === 'jolt') {
    const dir = rng() < 0.5 ? 1 : -1;
    snapJoint(S.pelvisY, -randRange(rng, 7, 11.5), -95);
    snapJoint(S.pelvisX, dir * randRange(rng, 4.5, 8.5), dir * 48);
    snapJoint(S.pelvisRot, dir * randRange(rng, 1.5, 3.0), dir * 20);
    snapJoint(S.torsoRot, -dir * randRange(rng, 3.2, 5.2), -dir * 42);
    snapJoint(S.neckRot, dir * randRange(rng, 4, 7), dir * 45);
    snapJoint(S.headRot, dir * randRange(rng, 18, 26), dir * 150);
    state.headSign = dir;
    if (dir > 0) {
      snapJoint(S.shLY, -17, -110);
      snapJoint(S.uArmL, 24, 76);
      snapJoint(S.fArmL, -19, -105);
      snapJoint(S.handL, 12, 115);
      snapJoint(S.shRY, 2.5, 45);
      snapJoint(S.uArmR, -16.5, 55);
      snapJoint(S.fArmR, 15, 85);
      snapJoint(S.handR, -11, -95);
    } else {
      snapJoint(S.shRY, -17, -110);
      snapJoint(S.uArmR, -24, -76);
      snapJoint(S.fArmR, 19, 105);
      snapJoint(S.handR, -12, -115);
      snapJoint(S.shLY, 2.5, 45);
      snapJoint(S.uArmL, 16.5, -55);
      snapJoint(S.fArmL, -15, -85);
      snapJoint(S.handL, 11, 95);
    }
    for (let i = 0; i < 5; i++) {
      snapJoint(S.fL[i], (i - 2) * -8, (i - 2) * -75);
      snapJoint(S.fR[i], (i - 2) * 8, (i - 2) * 75);
    }
    state.pending.push({
      t: 0.36,
      fn: () => {
        S.pelvisY.target = -2.2;
      },
    });
  } else {
    setNeutralTargets(S, true);
  }
}

// ==================== 粒子生成（厚皮火星 & 死亡碎屑） ====================
function spawnShellSparks(state) {
  const { rng, sparks } = state;
  const side = rng() < 0.5 ? -1 : 1;
  state.shellSide = side;
  state.shellFlash = 1.0;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + randRange(rng, -0.15, 0.15);
    const alongY = Math.sin(a);
    const outX = Math.cos(a) * side;
    sparks.push({
      x: side * randRange(rng, 20, 36),
      y: -150 + randRange(rng, -45, 35),
      vx: outX * randRange(rng, 35, 110) + side * randRange(rng, 25, 70),
      vy: alongY * randRange(rng, 120, 260) - 20,
      size: randRange(rng, 2.2, 5.2),
      life: 0,
      maxLife: randRange(rng, 0.35, 0.72),
      bright: i % 3 === 0 ? 3 : 2,
    });
  }
}

function spawnDeathDebris(state) {
  const { rng, debris } = state;
  for (let i = 0; i < 58; i++) {
    debris.push({
      x: ORIGIN_X + randRange(rng, -85, 85),
      y: ORIGIN_Y - randRange(rng, 8, 95),
      vx: randRange(rng, -18, 18),
      vy: -randRange(rng, 55, 190),
      w: randRange(rng, 4, 14),
      h: randRange(rng, 2.5, 8),
      rot: randRange(rng, 0, Math.PI * 2),
      vrot: randRange(rng, -4, 4),
      delay: randRange(rng, 0, 0.45),
      life: 0,
      maxLife: randRange(rng, 0.55, 1.15),
      tone: i % 5 === 0 ? 'fx' : 'body',
      idx: i % 3,
    });
  }
}

function generateCracks(rng) {
  const cracks = [];
  const anchors = [0.22, 0.46, 0.68, 0.84];
  for (let i = 0; i < anchors.length; i++) {
    let x = anchors[i] + randRange(rng, -0.05, 0.05);
    let y = 0;
    const segs = [];
    const steps = 6 + Math.floor(rng() * 4);
    for (let s = 0; s < steps; s++) {
      const nx = x + randRange(rng, -0.045, 0.045);
      const ny = y + randRange(rng, 0.055, 0.115);
      segs.push({ x1: x, y1: y, x2: nx, y2: ny, w: (1 - s / steps) * 3.4 + 0.9 });
      if (rng() < 0.48 && s > 0 && s < steps - 1) {
        const bx = nx + randRange(rng, -0.06, 0.06);
        const by = ny + randRange(rng, 0.03, 0.08);
        segs.push({ x1: nx, y1: ny, x2: bx, y2: by, w: 1.2 });
      }
      x = nx;
      y = ny;
    }
    cracks.push(segs);
  }
  return cracks;
}

// ==================== SVG objectBoundingBox 等价渐变填充 ====================
function buildUnitGrad(ctx, kind, pal) {
  let g;
  if (kind === 'head') {
    g = ctx.createLinearGradient(0.12, 0.06, 0.92, 0.88);
    g.addColorStop(0, pal.body[3]);
    g.addColorStop(0.22, pal.body[2]);
    g.addColorStop(0.56, pal.body[1]);
    g.addColorStop(0.84, pal.body[2]);
    g.addColorStop(1, pal.sheen[0]);
  } else if (kind === 'torso') {
    g = ctx.createLinearGradient(0.08, 0.1, 0.96, 0.45);
    g.addColorStop(0, pal.sheen[0]);
    g.addColorStop(0.16, pal.body[2]);
    g.addColorStop(0.52, pal.body[1]);
    g.addColorStop(0.84, pal.body[2]);
    g.addColorStop(1, pal.sheen[0]);
  } else if (kind === 'mantle') {
    g = ctx.createLinearGradient(0.15, 0, 0.88, 1);
    g.addColorStop(0, pal.body[3]);
    g.addColorStop(0.3, pal.body[2]);
    g.addColorStop(0.72, pal.body[1]);
    g.addColorStop(1, pal.body[3]);
  } else if (kind === 'limbL') {
    g = ctx.createLinearGradient(0, 0.2, 1, 0.32);
    g.addColorStop(0, pal.sheen[1]);
    g.addColorStop(0.18, pal.body[2]);
    g.addColorStop(0.55, pal.body[1]);
    g.addColorStop(0.88, pal.body[2]);
    g.addColorStop(1, pal.sheen[0]);
  } else if (kind === 'limbR') {
    g = ctx.createLinearGradient(0, 0.22, 1, 0.3);
    g.addColorStop(0, pal.sheen[0]);
    g.addColorStop(0.22, pal.body[2]);
    g.addColorStop(0.58, pal.body[1]);
    g.addColorStop(0.86, pal.body[2]);
    g.addColorStop(1, pal.sheen[1]);
  } else if (kind === 'finger') {
    g = ctx.createLinearGradient(0, 0, 1, 0.65);
    g.addColorStop(0, pal.sheen[1]);
    g.addColorStop(0.28, pal.body[2]);
    g.addColorStop(0.7, pal.body[1]);
    g.addColorStop(1, pal.body[3]);
  } else if (kind === 'specSharp') {
    g = ctx.createLinearGradient(0, 0, 0, 1);
    g.addColorStop(0, hexToRgba(pal.sheen[3], 0.92));
    g.addColorStop(0.35, hexToRgba(pal.sheen[2], 0.72));
    g.addColorStop(0.75, hexToRgba(pal.sheen[1], 0.28));
    g.addColorStop(1, hexToRgba(pal.sheen[1], 0));
  } else if (kind === 'specCool') {
    g = ctx.createLinearGradient(0, 0, 1, 1);
    g.addColorStop(0, hexToRgba(pal.sheen[3], 0.82));
    g.addColorStop(0.55, hexToRgba(pal.sheen[1], 0.34));
    g.addColorStop(1, hexToRgba(pal.sheen[1], 0));
  } else if (kind === 'pelvis') {
    g = ctx.createLinearGradient(0.12, 0, 0.88, 1);
    g.addColorStop(0, pal.body[3]);
    g.addColorStop(0.25, pal.body[2]);
    g.addColorStop(0.65, pal.body[1]);
    g.addColorStop(1, pal.sheen[0]);
  } else {
    g = ctx.createRadialGradient(0.5, 0.5, 0, 0.5, 0.5, 0.55);
    g.addColorStop(0, pal.body[0]);
    g.addColorStop(0.7, pal.body[1]);
    g.addColorStop(1, hexToRgba(pal.body[2], 0));
  }
  return g;
}

// 在路径建好后调用：平移缩放到形状自身外框，以 0~1 单位渐变填充，效果与 SVG objectBoundingBox 一致
function fillBBoxGrad(ctx, box, kind, pal, alpha = 1) {
  ctx.save();
  if (alpha < 1) ctx.globalAlpha *= alpha;
  ctx.translate(box[0], box[1]);
  ctx.scale(box[2], box[3]);
  ctx.fillStyle = buildUnitGrad(ctx, kind, pal);
  ctx.fill();
  ctx.restore();
}

function drawSeamArc(ctx, x0, y0, cx1, cy1, cx2, cy2, x1, y1, pal, intensity, coreW, glowW) {
  if (intensity <= 0.01) return;
  const aGlow = clamp(intensity * 0.5, 0, 0.92);
  const aCore = clamp(intensity * 0.96, 0, 1);

  ctx.lineCap = 'round';
  ctx.strokeStyle = hexToRgba(pal.seam[1], aGlow);
  ctx.lineWidth = glowW;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.bezierCurveTo(cx1, cy1, cx2, cy2, x1, y1);
  ctx.stroke();

  ctx.strokeStyle = hexToRgba(pal.seam[3], aCore);
  ctx.lineWidth = coreW;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.bezierCurveTo(cx1, cy1, cx2, cy2, x1, y1);
  ctx.stroke();
}

function drawDarkSlot(ctx, x0, y0, cx1, cy1, cx2, cy2, x1, y1, pal, w) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = pal.body[0];
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.bezierCurveTo(cx1, cy1, cx2, cy2, x1, y1);
  ctx.stroke();
}

// 绘制单根手指（逐根按自身精确外框拉伸 grad-finger）
function drawFinger(ctx, isLeft, idx, pal) {
  const box = isLeft ? BBOX.fingerL[idx] : BBOX.fingerR[idx];
  ctx.beginPath();
  if (idx === 0) {
    if (isLeft) {
      ctx.moveTo(-2, -2);
      ctx.bezierCurveTo(3, 12, 8, 28, 11, 46);
      ctx.bezierCurveTo(12, 50, 9, 52, 7, 48);
      ctx.bezierCurveTo(2, 34, -2, 18, -4, 2);
    } else {
      ctx.moveTo(2, -2);
      ctx.bezierCurveTo(-3, 12, -8, 28, -11, 46);
      ctx.bezierCurveTo(-12, 50, -9, 52, -7, 48);
      ctx.bezierCurveTo(-2, 34, 2, 18, 4, 2);
    }
    ctx.closePath();
    fillBBoxGrad(ctx, box, 'finger', pal);
    ctx.strokeStyle = hexToRgba(pal.sheen[2], isLeft ? 0.65 : 0.62);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    if (isLeft) {
      ctx.moveTo(1, 4);
      ctx.bezierCurveTo(5, 18, 8, 32, 9, 44);
    } else {
      ctx.moveTo(-1, 4);
      ctx.bezierCurveTo(-5, 18, -8, 32, -9, 44);
    }
    ctx.stroke();
    return;
  }

  if (idx === 1) {
    if (isLeft) {
      ctx.moveTo(-2.4, -2);
      ctx.bezierCurveTo(-2.8, 20, -2.4, 44, -1.6, 68);
      ctx.bezierCurveTo(-1.2, 76, -0.2, 80, 0.8, 76);
      ctx.bezierCurveTo(2.0, 56, 2.6, 28, 2.4, -2);
    } else {
      ctx.moveTo(-2.4, -2);
      ctx.bezierCurveTo(-2.6, 28, -2.0, 56, -0.8, 76);
      ctx.bezierCurveTo(0.2, 80, 1.2, 76, 1.6, 68);
      ctx.bezierCurveTo(2.4, 44, 2.8, 20, 2.4, -2);
    }
  } else if (idx === 2) {
    if (isLeft) {
      ctx.moveTo(-2.6, -2);
      ctx.bezierCurveTo(-3.0, 24, -2.6, 54, -1.8, 82);
      ctx.bezierCurveTo(-1.2, 90, 0.0, 94, 1.0, 89);
      ctx.bezierCurveTo(2.2, 64, 2.8, 32, 2.6, -2);
    } else {
      ctx.moveTo(-2.6, -2);
      ctx.bezierCurveTo(-2.8, 32, -2.2, 64, -1.0, 89);
      ctx.bezierCurveTo(0.0, 94, 1.2, 90, 1.8, 82);
      ctx.bezierCurveTo(2.6, 54, 3.0, 24, 2.6, -2);
    }
  } else if (idx === 3) {
    if (isLeft) {
      ctx.moveTo(-2.3, -2);
      ctx.bezierCurveTo(-3.0, 22, -3.2, 48, -2.8, 74);
      ctx.bezierCurveTo(-2.4, 81, -1.2, 84, -0.3, 79);
      ctx.bezierCurveTo(1.2, 56, 2.0, 28, 2.2, -2);
    } else {
      ctx.moveTo(-2.2, -2);
      ctx.bezierCurveTo(-2.0, 28, -1.2, 56, 0.3, 79);
      ctx.bezierCurveTo(1.2, 84, 2.4, 81, 2.8, 74);
      ctx.bezierCurveTo(3.2, 48, 3.0, 22, 2.3, -2);
    }
  } else {
    if (isLeft) {
      ctx.moveTo(-2.0, -2);
      ctx.bezierCurveTo(-3.4, 18, -4.4, 38, -5.0, 58);
      ctx.bezierCurveTo(-5.2, 64, -4.0, 67, -3.0, 62);
      ctx.bezierCurveTo(-1.2, 44, 0.4, 24, 1.8, -2);
    } else {
      ctx.moveTo(-1.8, -2);
      ctx.bezierCurveTo(-0.4, 24, 1.2, 44, 3.0, 62);
      ctx.bezierCurveTo(4.0, 67, 5.2, 64, 5.0, 58);
      ctx.bezierCurveTo(4.4, 38, 3.4, 18, 2.0, -2);
    }
  }
  ctx.closePath();
  fillBBoxGrad(ctx, box, 'finger', pal);

  // 手指脊线高光
  ctx.strokeStyle = hexToRgba(idx === 2 ? pal.sheen[3] : pal.sheen[2], idx === 2 ? (isLeft ? 0.8 : 0.76) : (isLeft ? 0.72 : 0.68));
  ctx.lineWidth = idx === 2 ? 1.0 : idx === 1 ? 0.95 : idx === 3 ? 0.9 : 0.85;
  ctx.beginPath();
  if (idx === 1) {
    const s = isLeft ? 1 : -1;
    ctx.moveTo(-1.4 * s, 4);
    ctx.bezierCurveTo(-1.6 * s, 28, -1.2 * s, 52, -0.5 * s, 72);
  } else if (idx === 2) {
    const s = isLeft ? 1 : -1;
    ctx.moveTo(-1.6 * s, 5);
    ctx.bezierCurveTo(-1.8 * s, 34, -1.4 * s, 62, -0.6 * s, 86);
  } else if (idx === 3) {
    const s = isLeft ? 1 : -1;
    ctx.moveTo(-1.7 * s, 5);
    ctx.bezierCurveTo(-2.2 * s, 30, -2.2 * s, 56, -1.5 * s, 76);
  } else {
    const s = isLeft ? 1 : -1;
    ctx.moveTo(-1.6 * s, 4);
    ctx.bezierCurveTo(-2.8 * s, 24, -3.6 * s, 42, -4.0 * s, 58);
  }
  ctx.stroke();
}

// 绘制整条手臂（含肩壳、上臂、前臂、手掌、五指与3处关节缝，全部按自身外框拉伸渐变）
function drawArm(ctx, isLeft, pose, pal, seamLevels) {
  const s = isLeft ? 1 : -1;
  const limbGrad = isLeft ? 'limbL' : 'limbR';

  ctx.save();
  ctx.translate(pose.shX, pose.shY);
  ctx.rotate(pose.shRot);

  // 瘦削斜切硬壳肩甲节
  ctx.beginPath();
  ctx.moveTo(16 * s, -14);
  ctx.bezierCurveTo(4 * s, -22, -11 * s, -20, -20 * s, -10);
  ctx.bezierCurveTo(-24 * s, -4, -22 * s, 3, -15 * s, 6);
  ctx.bezierCurveTo(-5 * s, 7, 8 * s, 3, 17 * s, -3);
  ctx.closePath();
  fillBBoxGrad(ctx, isLeft ? BBOX.shoulderCapL : BBOX.shoulderCapR, 'mantle', pal);

  // 肩壳弹光
  ctx.fillStyle = hexToRgba(isLeft ? pal.sheen[3] : pal.sheen[2], isLeft ? 0.82 : 0.76);
  ctx.beginPath();
  if (isLeft) {
    ctx.moveTo(-17, -9);
    ctx.bezierCurveTo(-9, -17, 3, -18, 12, -13);
    ctx.bezierCurveTo(2, -14, -8, -11, -14, -3);
  } else {
    ctx.moveTo(-12, -13);
    ctx.bezierCurveTo(-3, -18, 9, -17, 17, -9);
    ctx.bezierCurveTo(8, -11, -2, -14, -10, -10);
  }
  ctx.closePath();
  ctx.fill();

  if (!isLeft) {
    ctx.strokeStyle = hexToRgba(pal.sheen[1], 0.64);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(19, -8);
    ctx.bezierCurveTo(22, -3, 20, 2, 14, 5);
    ctx.stroke();
  }

  // 肩关节暗槽与透光缝
  drawDarkSlot(ctx, -16 * s, 7, -7 * s, 10, 5 * s, 8, 14 * s, 2, pal, 5.2);
  drawSeamArc(ctx, -13.5 * s, 7.2, -5.5 * s, 9.4, 3.8 * s, 7.6, 11 * s, 3.2, pal, seamLevels.shoulder, 1.9, 4.2);

  // 上臂（重击脱臼时有额外下垂偏移）
  ctx.translate(0, 6 + (pose.dislocateY || 0));
  ctx.rotate(pose.uArm);

  ctx.beginPath();
  if (isLeft) {
    ctx.moveTo(-13, 4);
    ctx.bezierCurveTo(-16, 38, -15, 88, -11, 138);
    ctx.bezierCurveTo(-9, 166, -8, 182, -6, 190);
    ctx.bezierCurveTo(-2, 194, 4, 194, 7, 190);
    ctx.bezierCurveTo(9, 174, 10, 144, 11, 106);
    ctx.bezierCurveTo(12, 58, 11, 22, 8, 3);
    ctx.bezierCurveTo(2, -2, -7, -2, -13, 4);
  } else {
    ctx.moveTo(-8, 3);
    ctx.bezierCurveTo(-11, 22, -12, 58, -11, 106);
    ctx.bezierCurveTo(-10, 144, -9, 174, -7, 190);
    ctx.bezierCurveTo(-4, 194, 2, 194, 6, 190);
    ctx.bezierCurveTo(8, 182, 9, 166, 11, 138);
    ctx.bezierCurveTo(15, 88, 16, 38, 13, 4);
    ctx.bezierCurveTo(7, -2, -2, -2, -8, 3);
  }
  ctx.closePath();
  fillBBoxGrad(ctx, isLeft ? BBOX.uArmL : BBOX.uArmR, limbGrad, pal);

  // 上臂硬皮亮线 + 边缘反光
  ctx.beginPath();
  if (isLeft) {
    ctx.moveTo(-11, 14);
    ctx.bezierCurveTo(-13, 60, -11, 116, -6, 180);
    ctx.bezierCurveTo(-4, 132, -5, 74, -6, 20);
  } else {
    ctx.moveTo(-7, 16);
    ctx.bezierCurveTo(-9, 66, -8, 122, -5, 178);
    ctx.bezierCurveTo(-3, 132, -4, 76, -4, 20);
  }
  ctx.closePath();
  fillBBoxGrad(ctx, isLeft ? BBOX.uArmLSpec : BBOX.uArmRSpec, 'specSharp', pal, isLeft ? 0.8 : 0.54);

  ctx.strokeStyle = hexToRgba(pal.sheen[1], isLeft ? 0.44 : 0.62);
  ctx.lineWidth = isLeft ? 1.1 : 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (isLeft) {
    ctx.moveTo(8, 16);
    ctx.bezierCurveTo(9, 68, 7, 128, 5, 178);
  } else {
    ctx.moveTo(11, 14);
    ctx.bezierCurveTo(13, 64, 11, 126, 6, 182);
  }
  ctx.stroke();

  // 前臂
  ctx.translate(0, 190);
  ctx.rotate(pose.fArm);

  // 肘关节暗槽与透光缝
  drawDarkSlot(ctx, isLeft ? -8 : -7, -1, -3, 2, 3, 2, isLeft ? 7 : 8, -1, pal, 4.4);
  drawSeamArc(ctx, isLeft ? -6.5 : -5.8, -1, -2.4, 1.4, 2.4, 1.4, isLeft ? 5.8 : 6.5, -1, pal, seamLevels.elbow, 1.7, 3.6);

  ctx.beginPath();
  if (isLeft) {
    ctx.moveTo(-8, 3);
    ctx.bezierCurveTo(-11, 30, -11, 70, -8, 118);
    ctx.bezierCurveTo(-6, 158, -5, 188, -4, 206);
    ctx.bezierCurveTo(-1, 210, 3, 210, 5, 206);
    ctx.bezierCurveTo(7, 184, 8, 148, 9, 108);
    ctx.bezierCurveTo(10, 62, 9, 24, 7, 3);
    ctx.bezierCurveTo(3, -2, -4, -2, -8, 3);
  } else {
    ctx.moveTo(-7, 3);
    ctx.bezierCurveTo(-9, 24, -10, 62, -9, 108);
    ctx.bezierCurveTo(-8, 148, -7, 184, -5, 206);
    ctx.bezierCurveTo(-3, 210, 1, 210, 4, 206);
    ctx.bezierCurveTo(5, 188, 6, 158, 8, 118);
    ctx.bezierCurveTo(11, 70, 11, 30, 8, 3);
    ctx.bezierCurveTo(4, -2, -3, -2, -7, 3);
  }
  ctx.closePath();
  fillBBoxGrad(ctx, isLeft ? BBOX.fArmL : BBOX.fArmR, limbGrad, pal);

  if (isLeft) {
    ctx.fillStyle = hexToRgba(pal.sheen[3], 0.74);
    ctx.beginPath();
    ctx.moveTo(-7, 4);
    ctx.bezierCurveTo(-9, 12, -8, 20, -5, 28);
    ctx.bezierCurveTo(-4, 18, -4, 10, -5, 4);
    ctx.closePath();
    ctx.fill();
  }

  ctx.beginPath();
  if (isLeft) {
    ctx.moveTo(-6, 28);
    ctx.bezierCurveTo(-8, 82, -6, 144, -2, 200);
    ctx.bezierCurveTo(0, 148, -1, 86, -2, 32);
  } else {
    ctx.moveTo(-5, 24);
    ctx.bezierCurveTo(-7, 80, -6, 140, -2, 200);
    ctx.bezierCurveTo(0, 148, -1, 84, -2, 28);
  }
  ctx.closePath();
  fillBBoxGrad(ctx, isLeft ? BBOX.fArmLSpec : BBOX.fArmRSpec, 'specSharp', pal, isLeft ? 0.82 : 0.56);

  if (!isLeft) {
    ctx.strokeStyle = hexToRgba(pal.sheen[1], 0.62);
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(7, 10);
    ctx.bezierCurveTo(9, 68, 7, 138, 3, 202);
    ctx.stroke();
  }

  // 手掌与五指
  ctx.translate(0, 208);
  ctx.rotate(pose.hand);

  // 腕关节暗槽与透光缝
  drawDarkSlot(ctx, -6, -1, -2, 1.5, 2, 1.5, 6, -1, pal, 4.0);
  drawSeamArc(ctx, -4.8, -1, -1.6, 1.1, 1.6, 1.1, 4.8, -1, pal, seamLevels.wrist, 1.55, 3.3);

  ctx.beginPath();
  if (isLeft) {
    ctx.moveTo(-5, 2);
    ctx.bezierCurveTo(-9, 11, -13, 22, -12, 35);
    ctx.bezierCurveTo(-11, 42, -5, 45, 1, 45);
    ctx.bezierCurveTo(7, 44, 12, 39, 12, 32);
    ctx.bezierCurveTo(12, 20, 9, 11, 5, 2);
    ctx.bezierCurveTo(2, -1, -2, -1, -5, 2);
  } else {
    ctx.moveTo(-5, 2);
    ctx.bezierCurveTo(-9, 11, -12, 20, -12, 32);
    ctx.bezierCurveTo(-12, 39, -7, 44, -1, 45);
    ctx.bezierCurveTo(5, 45, 11, 42, 12, 35);
    ctx.bezierCurveTo(13, 22, 9, 11, 5, 2);
    ctx.bezierCurveTo(2, -1, -2, -1, -5, 2);
  }
  ctx.closePath();
  fillBBoxGrad(ctx, isLeft ? BBOX.handL : BBOX.handR, limbGrad, pal);

  ctx.fillStyle = hexToRgba(pal.sheen[2], isLeft ? 0.72 : 0.66);
  ctx.beginPath();
  if (isLeft) {
    ctx.moveTo(-7, 8);
    ctx.bezierCurveTo(-9, 20, -8, 31, -5, 39);
    ctx.bezierCurveTo(-4, 30, -4, 19, -4, 9);
  } else {
    ctx.moveTo(7, 9);
    ctx.bezierCurveTo(9, 20, 8, 31, 5, 39);
    ctx.bezierCurveTo(4, 30, 4, 19, 4, 10);
  }
  ctx.closePath();
  ctx.fill();

  const bases = isLeft ? RIG.fingerBaseL : RIG.fingerBaseR;
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.translate(bases[i].x, bases[i].y);
    ctx.rotate(pose.fingers[i]);
    drawFinger(ctx, isLeft, i, pal);
    ctx.restore();
  }

  ctx.restore();
}

// 绘制单条腿（大腿 + 膝缝 + 小腿 + 脚，全部按各自精确外框拉伸渐变）
function drawLeg(ctx, isLeft, hx, hy, ik, ax, ay, pal, kneeSeam) {
  const limbGrad = isLeft ? 'limbL' : 'limbR';

  // 大腿
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(ik.thighRad);
  ctx.beginPath();
  if (isLeft) {
    ctx.moveTo(-15, 2);
    ctx.bezierCurveTo(-21, 34, -20, 90, -15, 148);
    ctx.bezierCurveTo(-12, 175, -10, 190, -8, 200);
    ctx.bezierCurveTo(-3, 205, 5, 205, 10, 200);
    ctx.bezierCurveTo(13, 184, 15, 150, 17, 108);
    ctx.bezierCurveTo(18, 60, 17, 22, 13, 2);
    ctx.bezierCurveTo(7, -6, -9, -6, -15, 2);
  } else {
    ctx.moveTo(-13, 2);
    ctx.bezierCurveTo(-17, 22, -18, 60, -17, 108);
    ctx.bezierCurveTo(-15, 150, -13, 184, -10, 200);
    ctx.bezierCurveTo(-5, 205, 3, 205, 8, 200);
    ctx.bezierCurveTo(10, 190, 12, 175, 15, 148);
    ctx.bezierCurveTo(20, 90, 21, 34, 15, 2);
    ctx.bezierCurveTo(9, -6, -7, -6, -13, 2);
  }
  ctx.closePath();
  fillBBoxGrad(ctx, isLeft ? BBOX.thighL : BBOX.thighR, limbGrad, pal);

  // 大腿硬皮锐利弹光
  ctx.beginPath();
  if (isLeft) {
    ctx.moveTo(-13, 16);
    ctx.bezierCurveTo(-16, 66, -15, 124, -9, 182);
    ctx.bezierCurveTo(-7, 156, -8, 98, -7, 34);
    ctx.bezierCurveTo(-7, 22, -10, 12, -13, 16);
  } else {
    ctx.moveTo(-10, 22);
    ctx.bezierCurveTo(-12, 76, -11, 134, -6, 184);
    ctx.bezierCurveTo(-4, 148, -5, 92, -5, 36);
  }
  ctx.closePath();
  fillBBoxGrad(ctx, isLeft ? BBOX.thighLSpec : BBOX.thighRSpec, 'specSharp', pal, isLeft ? 0.78 : 0.56);

  // 大腿边缘反光
  ctx.strokeStyle = hexToRgba(pal.sheen[1], isLeft ? 0.45 : 0.58);
  ctx.lineWidth = isLeft ? 1.3 : 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (isLeft) {
    ctx.moveTo(12, 18);
    ctx.bezierCurveTo(14, 74, 12, 134, 8, 184);
  } else {
    ctx.moveTo(13, 16);
    ctx.bezierCurveTo(16, 68, 14, 132, 8, 185);
  }
  ctx.stroke();

  // 膝盖上方微隆与高光
  ctx.fillStyle = pal.body[2];
  ctx.beginPath();
  if (isLeft) {
    ctx.moveTo(-10, 188);
    ctx.bezierCurveTo(-4, 181, 5, 182, 9, 189);
    ctx.bezierCurveTo(6, 199, -6, 199, -10, 188);
  } else {
    ctx.moveTo(-9, 189);
    ctx.bezierCurveTo(-5, 182, 4, 181, 10, 188);
    ctx.bezierCurveTo(6, 199, -6, 199, -9, 189);
  }
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = hexToRgba(pal.sheen[2], isLeft ? 0.72 : 0.65);
  ctx.beginPath();
  if (isLeft) {
    ctx.moveTo(-6, 187);
    ctx.bezierCurveTo(-2, 184, 3, 185, 5, 189);
    ctx.bezierCurveTo(2, 191, -3, 191, -6, 187);
  } else {
    ctx.moveTo(-5, 188);
    ctx.bezierCurveTo(-1, 184, 4, 185, 6, 188);
    ctx.bezierCurveTo(3, 191, -2, 191, -5, 188);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 小腿 + 膝关节缝
  ctx.save();
  ctx.translate(ik.kx, ik.ky);
  ctx.rotate(ik.shinRad);

  drawDarkSlot(ctx, isLeft ? -9 : -8, -2, -4, 2, 4, 2, isLeft ? 8 : 9, -2, pal, 4.6);
  drawSeamArc(ctx, isLeft ? -7 : -6.2, -2, -2.8, 1.2, 2.8, 1.2, isLeft ? 6.2 : 7, -2, pal, kneeSeam, 1.7, 3.7);

  ctx.beginPath();
  if (isLeft) {
    ctx.moveTo(-9, 2);
    ctx.bezierCurveTo(-13, 26, -14, 58, -10, 94);
    ctx.bezierCurveTo(-7, 130, -6, 164, -5, 192);
    ctx.bezierCurveTo(-2, 196, 3, 196, 5, 192);
    ctx.bezierCurveTo(7, 162, 10, 124, 12, 84);
    ctx.bezierCurveTo(13, 48, 11, 20, 8, 2);
    ctx.bezierCurveTo(4, -3, -5, -3, -9, 2);
  } else {
    ctx.moveTo(-8, 2);
    ctx.bezierCurveTo(-11, 20, -13, 48, -12, 84);
    ctx.bezierCurveTo(-10, 124, -7, 162, -5, 192);
    ctx.bezierCurveTo(-3, 196, 2, 196, 5, 192);
    ctx.bezierCurveTo(6, 164, 7, 130, 10, 94);
    ctx.bezierCurveTo(14, 58, 13, 26, 9, 2);
    ctx.bezierCurveTo(5, -3, -4, -3, -8, 2);
  }
  ctx.closePath();
  fillBBoxGrad(ctx, isLeft ? BBOX.shinL : BBOX.shinR, limbGrad, pal);

  // 小腿前脊锐利反光带
  ctx.beginPath();
  if (isLeft) {
    ctx.moveTo(-6, 14);
    ctx.bezierCurveTo(-9, 56, -8, 112, -3, 182);
    ctx.bezierCurveTo(-1, 132, -2, 64, -1, 18);
  } else {
    ctx.moveTo(-5, 16);
    ctx.bezierCurveTo(-7, 62, -6, 120, -2, 182);
    ctx.bezierCurveTo(0, 132, -1, 68, 0, 20);
  }
  ctx.closePath();
  fillBBoxGrad(ctx, isLeft ? BBOX.shinLSpec : BBOX.shinRSpec, 'specSharp', pal, isLeft ? 0.82 : 0.58);

  ctx.strokeStyle = hexToRgba(pal.sheen[1], isLeft ? 0.42 : 0.55);
  ctx.lineWidth = isLeft ? 1.2 : 1.5;
  ctx.beginPath();
  if (isLeft) {
    ctx.moveTo(8, 18);
    ctx.bezierCurveTo(10, 64, 7, 122, 3, 180);
  } else {
    ctx.moveTo(8, 14);
    ctx.bezierCurveTo(10, 60, 8, 118, 3, 182);
  }
  ctx.stroke();
  ctx.restore();

  // 脚
  ctx.save();
  ctx.translate(ax, ay);
  ctx.beginPath();
  if (isLeft) {
    ctx.moveTo(-5, -4);
    ctx.bezierCurveTo(-8, 6, -17, 15, -34, 21);
    ctx.bezierCurveTo(-40, 23, -38, 27, -29, 27);
    ctx.lineTo(4, 26);
    ctx.bezierCurveTo(10, 25, 11, 18, 8, 8);
    ctx.bezierCurveTo(6, 2, 5, -3, 5, -4);
  } else {
    ctx.moveTo(-5, -4);
    ctx.bezierCurveTo(-5, -3, -6, 2, -8, 8);
    ctx.bezierCurveTo(-11, 18, -10, 25, -4, 26);
    ctx.lineTo(29, 27);
    ctx.bezierCurveTo(38, 27, 40, 23, 34, 21);
    ctx.bezierCurveTo(17, 15, 8, 6, 5, -4);
  }
  ctx.closePath();
  fillBBoxGrad(ctx, isLeft ? BBOX.footL : BBOX.footR, limbGrad, pal);

  ctx.beginPath();
  if (isLeft) {
    ctx.moveTo(-4, 4);
    ctx.bezierCurveTo(-10, 12, -20, 18, -31, 22);
    ctx.bezierCurveTo(-20, 21, -9, 16, -1, 9);
  } else {
    ctx.moveTo(4, 5);
    ctx.bezierCurveTo(11, 13, 20, 18, 31, 22);
    ctx.bezierCurveTo(20, 21, 9, 15, 1, 9);
  }
  ctx.closePath();
  fillBBoxGrad(ctx, isLeft ? BBOX.footLSpec : BBOX.footRSpec, 'specCool', pal, isLeft ? 0.82 : 0.72);
  ctx.restore();
}

// 绘制眼窝深影（径向渐变按椭圆外框拉伸）
function drawEyeSocket(ctx, cx, cy, rx, ry, rotDeg, pal) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotDeg * Math.PI) / 180);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  fillBBoxGrad(ctx, [-rx, -ry, rx * 2, ry * 2], 'eyeSocket', pal);
  ctx.restore();
}

// 绘制头部（光滑无角弧顶 + 原版眉眼笑脸 + objectBoundingBox 渐变）
function drawHead(ctx, headDeg, eyeLevel, pal) {
  // 头颅主体
  ctx.beginPath();
  ctx.moveTo(0, -86);
  ctx.bezierCurveTo(17, -86, 27, -72, 27, -52);
  ctx.bezierCurveTo(27, -38, 25, -26, 20, -15);
  ctx.bezierCurveTo(15, -4, 8, 4, 0, 6);
  ctx.bezierCurveTo(-8, 4, -15, -4, -20, -15);
  ctx.bezierCurveTo(-25, -26, -27, -38, -27, -52);
  ctx.bezierCurveTo(-27, -72, -17, -86, 0, -86);
  ctx.closePath();
  fillBBoxGrad(ctx, BBOX.head, 'head', pal);

  // 额头大月牙反光
  ctx.beginPath();
  ctx.moveTo(-18, -68);
  ctx.bezierCurveTo(-12, -78, -2, -81, 7, -79);
  ctx.bezierCurveTo(-2, -76, -10, -70, -14, -58);
  ctx.bezierCurveTo(-18, -48, -18, -36, -16, -24);
  ctx.bezierCurveTo(-21, -36, -22, -54, -18, -68);
  ctx.closePath();
  fillBBoxGrad(ctx, BBOX.headSpec, 'specSharp', pal, 0.88);

  // 额中反光斑
  ctx.fillStyle = hexToRgba(pal.sheen[3], 0.85);
  ctx.beginPath();
  ctx.moveTo(-9, -73);
  ctx.bezierCurveTo(-4, -76, 2, -76, 6, -74);
  ctx.bezierCurveTo(1, -72, -4, -71, -9, -73);
  ctx.closePath();
  ctx.fill();

  // 颧骨反光与右脸轮廓冷光
  ctx.fillStyle = hexToRgba(pal.sheen[2], 0.68);
  ctx.beginPath();
  ctx.moveTo(-21, -32);
  ctx.bezierCurveTo(-17, -25, -12, -22, -8, -22);
  ctx.bezierCurveTo(-13, -20, -18, -22, -22, -28);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = hexToRgba(pal.sheen[1], 0.66);
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(23, -56);
  ctx.bezierCurveTo(25, -42, 23, -26, 17, -14);
  ctx.bezierCurveTo(12, -4, 6, 2, 1, 4);
  ctx.stroke();

  // 鼻脊
  ctx.fillStyle = hexToRgba(pal.sheen[2], 0.58);
  ctx.beginPath();
  ctx.moveTo(-1, -47);
  ctx.bezierCurveTo(-2, -38, -2, -30, -1, -24);
  ctx.bezierCurveTo(1, -29, 1, -38, 0, -47);
  ctx.closePath();
  ctx.fill();

  // 不对称戏谑眉脊
  ctx.lineCap = 'round';
  ctx.strokeStyle = pal.body[0];
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.moveTo(-21, -52);
  ctx.bezierCurveTo(-15, -56, -8, -55, -4, -49);
  ctx.moveTo(4, -50);
  ctx.bezierCurveTo(9, -58, 16, -59, 22, -53);
  ctx.stroke();

  ctx.strokeStyle = hexToRgba(pal.sheen[2], 0.72);
  ctx.lineWidth = 1.05;
  ctx.beginPath();
  ctx.moveTo(-20, -53);
  ctx.bezierCurveTo(-14, -57, -8, -56, -4, -51);
  ctx.stroke();

  ctx.strokeStyle = hexToRgba(pal.sheen[2], 0.64);
  ctx.beginPath();
  ctx.moveTo(5, -51);
  ctx.bezierCurveTo(10, -59, 16, -60, 21, -55);
  ctx.stroke();

  // 眼窝深影（径向渐变）
  drawEyeSocket(ctx, -12, -44, 9, 5.5, 8, pal);
  drawEyeSocket(ctx, 12, -45, 9, 5.5, -11, pal);

  // 眼眶暗眸
  ctx.fillStyle = pal.body[0];
  ctx.beginPath();
  ctx.moveTo(-20, -47);
  ctx.bezierCurveTo(-15, -49, -8, -46, -5, -43);
  ctx.bezierCurveTo(-9, -41, -15, -42, -20, -47);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(5, -44);
  ctx.bezierCurveTo(9, -48, 16, -50, 20, -47);
  ctx.bezierCurveTo(16, -43, 10, -41, 5, -44);
  ctx.closePath();
  ctx.fill();

  // 眼部反光点
  if (eyeLevel > 0.01) {
    const gx = clamp(-headDeg * 0.032, -1.2, 1.2);
    const gy = clamp(Math.abs(headDeg) * 0.015, -0.8, 0.8);
    ctx.fillStyle = hexToRgba(pal.eye[3], 0.95 * eyeLevel);
    ctx.beginPath();
    ctx.arc(-13.2 + gx, -45.2 + gy, 1.35, 0, Math.PI * 2);
    ctx.arc(12.6 + gx, -46.0 + gy, 1.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = hexToRgba(pal.eye[1], 0.72 * eyeLevel);
    ctx.beginPath();
    ctx.arc(-10.2 + gx * 0.8, -44.1 + gy * 0.8, 0.65, 0, Math.PI * 2);
    ctx.arc(15.4 + gx * 0.8, -45.2 + gy * 0.8, 0.65, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = hexToRgba(pal.eye[0], 0.58 * eyeLevel);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-18, -44);
    ctx.bezierCurveTo(-14, -41, -9, -41, -6, -42);
    ctx.moveTo(6, -42.5);
    ctx.bezierCurveTo(10, -41, 15, -42, 19, -45);
    ctx.stroke();
  }

  // 戏谑微笑
  ctx.strokeStyle = pal.body[0];
  ctx.lineWidth = 2.15;
  ctx.beginPath();
  ctx.moveTo(-18, -23);
  ctx.bezierCurveTo(-13, -13, -5, -10, 0, -10.5);
  ctx.bezierCurveTo(6, -11, 14, -14, 19, -24);
  ctx.stroke();

  ctx.lineWidth = 1.35;
  ctx.beginPath();
  ctx.moveTo(-19, -25);
  ctx.bezierCurveTo(-17, -22, -16, -20, -18, -18);
  ctx.moveTo(20, -26);
  ctx.bezierCurveTo(18, -23, 17, -21, 19, -19);
  ctx.stroke();

  ctx.strokeStyle = hexToRgba(pal.smile[2], 0.78);
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(-14, -17.5);
  ctx.bezierCurveTo(-8, -10.5, -2, -8.8, 4, -9.5);
  ctx.bezierCurveTo(9, -10.2, 13, -13.5, 16, -18.5);
  ctx.stroke();

  ctx.fillStyle = hexToRgba(pal.smile[3], 0.75);
  ctx.beginPath();
  ctx.moveTo(-5, 1);
  ctx.bezierCurveTo(-1, 3.5, 3, 3, 6, 0.5);
  ctx.bezierCurveTo(2, 1.8, -2, 1.8, -5, 1);
  ctx.closePath();
  ctx.fill();
}

// ==================== 导出模块 ====================
const BadomModule = {
  id: 'badom',
  height: 240,
  anchor: 'foot',
  bounds: { left: -46, right: 46, top: -242, bottom: 4, originHeight: 0 },
  events: ['appear', 'idle', 'ready', 'attack', 'hit', 'heavyHit', 'shell', 'die'],
  params: {
    swayAmp: 1.0,
    twitchInterval: 3.4,
    seamGlow: 1.0,
    appearDur: 1.5,
    attackDur: 1.85,
    hitDur: 0.65,
    heavyHitDur: 1.55,
    shellDur: 0.95,
    dieDur: 2.3,
  },

  create(p, opt = {}) {
    const rng = makeRng(opt.seed != null ? opt.seed : 20261120);
    return {
      palette: opt.palette,
      seed: opt.seed != null ? opt.seed : 20261120,
      rng,
      time: 0,
      action: 'idle',
      actionTime: 0,
      inReady: false,
      S: createJoints(),
      pending: [],
      nextTwitch: 1.6,
      lastTwitch: '',
      headSign: 1,
      shoulderSide: 1,
      seamFlash: 0,
      attackPullStage: 0,
      attackHitAt: 1.04,
      attackJumpActive: false,
      screenOverlay: 0,
      cracks: generateCracks(rng),
      dislocateSide: 1,
      dislocateAmt: 0,
      dislocateSnapDone: false,
      hitSnapDone: false,
      shellFlash: 0,
      shellSide: -1,
      sparks: [],
      debris: [],
      debrisSpawned: false,
      dieDone: false,
    };
  },

  trigger(state, name, data) {
    if (!this.events.includes(name)) return;
    if (state.action === 'die' && name !== 'die') return;

    const { S, rng } = state;
    state.pending.length = 0;

    if (name === 'appear') {
      state.action = 'appear';
      state.actionTime = 0;
      state.inReady = false;
      state.attackJumpActive = false;
      state.dislocateAmt = 0;
      setNeutralTargets(S, false);
      return;
    }

    if (name === 'idle') {
      state.action = 'idle';
      state.actionTime = 0;
      state.inReady = false;
      state.attackJumpActive = false;
      state.dislocateAmt = 0;
      setNeutralTargets(S, true);
      state.nextTwitch = randRange(rng, 1.4, this.params.twitchInterval);
      return;
    }

    if (name === 'ready') {
      state.action = 'ready';
      state.actionTime = 0;
      state.inReady = true;
      state.attackJumpActive = false;
      state.dislocateAmt = 0;
      state.seamFlash = 0.85;
      setReadyTargets(S, true);
      return;
    }

    if (name === 'attack') {
      const dur = Math.max(0.8, this.params.attackDur);
      const hitAt = Number((dur * 0.56).toFixed(3));
      state.action = 'attack';
      state.actionTime = 0;
      state.inReady = false;
      state.attackPullStage = 0;
      state.attackHitAt = hitAt;
      state.attackJumpActive = false;
      state.dislocateAmt = 0;
      state.cracks = generateCracks(rng);
      state.seamFlash = 0.9;
      return { hitAt };
    }

    if (name === 'hit') {
      state.action = 'hit';
      state.actionTime = 0;
      state.hitSnapDone = false;
      state.attackJumpActive = false;
      state.seamFlash = 0.7;
      snapJoint(S.pelvisY, 34, 180);
      snapJoint(S.pelvisX, randRange(rng, -5, 5), 0);
      snapJoint(S.torsoRot, randRange(rng, -6, 6), 45);
      snapJoint(S.headRot, randRange(rng, -18, 18), 110);
      snapJoint(S.headShiftY, 10, 60);
      snapJoint(S.shLY, 14, 95);
      snapJoint(S.shRY, 14, 95);
      snapJoint(S.uArmL, 8, -90);
      snapJoint(S.fArmL, -16, -120);
      snapJoint(S.handL, 18, 130);
      snapJoint(S.uArmR, -8, 90);
      snapJoint(S.fArmR, 16, 120);
      snapJoint(S.handR, -18, -130);
      return;
    }

    if (name === 'heavyHit') {
      state.action = 'heavyHit';
      state.actionTime = 0;
      state.dislocateSide = rng() < 0.5 ? 1 : -1;
      state.dislocateAmt = 1;
      state.dislocateSnapDone = false;
      state.attackJumpActive = false;
      state.seamFlash = 1.0;
      const isL = state.dislocateSide > 0;
      const sgn = isL ? 1 : -1;
      snapJoint(S.pelvisY, 22, 120);
      snapJoint(S.torsoRot, -sgn * 9, -sgn * 80);
      snapJoint(S.headRot, -sgn * 22, -sgn * 130);
      if (isL) {
        snapJoint(S.shLY, 32, 190);
        snapJoint(S.shLRot, -14, -90);
        snapJoint(S.uArmL, 12, -110);
        snapJoint(S.fArmL, -4, 95);
        snapJoint(S.handL, 16, 120);
      } else {
        snapJoint(S.shRY, 32, 190);
        snapJoint(S.shRRot, 14, 90);
        snapJoint(S.uArmR, -12, 110);
        snapJoint(S.fArmR, 4, -95);
        snapJoint(S.handR, -16, -120);
      }
      return;
    }

    if (name === 'shell') {
      state.action = 'shell';
      state.actionTime = 0;
      state.attackJumpActive = false;
      state.seamFlash = 0.65;
      spawnShellSparks(state);
      S.headRot.target = state.shellSide * -21;
      S.neckRot.target = state.shellSide * -5;
      return;
    }

    if (name === 'die') {
      state.action = 'die';
      state.actionTime = 0;
      state.inReady = false;
      state.attackJumpActive = false;
      state.dislocateAmt = 0;
      state.debrisSpawned = false;
      state.dieDone = false;
      state.seamFlash = 0.8;
    }
  },

  update(state, dt, p) {
    const step = clamp(dt || 0.016, 0.001, 0.05);
    state.time += step;
    state.actionTime += step;
    state.seamFlash = Math.max(0, state.seamFlash - step * 2.8);
    state.shellFlash = Math.max(0, state.shellFlash - step * 2.4);

    for (let i = state.pending.length - 1; i >= 0; i--) {
      state.pending[i].t -= step;
      if (state.pending[i].t <= 0) {
        const fn = state.pending[i].fn;
        state.pending.splice(i, 1);
        fn();
      }
    }

    for (let i = state.sparks.length - 1; i >= 0; i--) {
      const sp = state.sparks[i];
      sp.life += step;
      if (sp.life >= sp.maxLife) {
        state.sparks.splice(i, 1);
        continue;
      }
      sp.x += sp.vx * step;
      sp.y += sp.vy * step;
      sp.vx *= Math.pow(0.28, step);
      sp.vy += 120 * step;
    }

    for (let i = state.debris.length - 1; i >= 0; i--) {
      const d = state.debris[i];
      if (d.delay > 0) {
        d.delay -= step;
        continue;
      }
      d.life += step;
      if (d.life >= d.maxLife) {
        state.debris.splice(i, 1);
        continue;
      }
      d.x += (d.vx + Math.sin(state.time * 4 + i) * 14) * step;
      d.y += d.vy * step;
      d.vy -= 45 * step;
      d.rot += d.vrot * step;
    }

    const { S } = state;
    const act = state.action;
    const t = state.actionTime;

    let targetOverlay = 0;

    if (act === 'appear') {
      const dur = Math.max(0.5, this.params.appearDur);
      if (t >= dur * 0.85 && state.seamFlash < 0.05 && t < dur * 0.92) {
        snapJoint(S.headRot, NEUTRAL.headRot + 6, 65);
        state.seamFlash = 0.55;
      }
      if (t >= dur) {
        state.action = 'idle';
        state.actionTime = 0;
        setNeutralTargets(S, false);
      }
    } else if (act === 'idle') {
      state.nextTwitch -= step;
      if (state.nextTwitch <= 0) {
        triggerIdleTwitch(state);
        const avg = Math.max(1.2, this.params.twitchInterval);
        state.nextTwitch = randRange(state.rng, avg * 0.72, avg * 1.35);
      }
    } else if (act === 'ready') {
      setReadyTargets(S, false);
    } else if (act === 'attack') {
      const dur = Math.max(0.8, this.params.attackDur);
      const hitAt = state.attackHitAt;
      const jumpEnd = Math.min(dur * 0.73, hitAt + 0.28);

      if (state.attackPullStage === 0 && t >= 0.02) {
        state.attackPullStage = 1;
        state.seamFlash = 0.75;
        snapJoint(S.shLY, -12, -90);
        snapJoint(S.shRY, -12, -90);
        snapJoint(S.uArmL, 72, 260);
        snapJoint(S.uArmR, -72, -260);
        snapJoint(S.fArmL, -25, -140);
        snapJoint(S.fArmR, 25, 140);
        snapJoint(S.headRot, -10, -80);
      } else if (state.attackPullStage === 1 && t >= hitAt * 0.34) {
        state.attackPullStage = 2;
        state.seamFlash = 0.85;
        snapJoint(S.shLY, -20, -110);
        snapJoint(S.shRY, -20, -110);
        snapJoint(S.uArmL, 128, 320);
        snapJoint(S.uArmR, -128, -320);
        snapJoint(S.fArmL, -18, -120);
        snapJoint(S.fArmR, 18, 120);
        snapJoint(S.headRot, 12, 95);
      } else if (state.attackPullStage === 2 && t >= hitAt * 0.68) {
        state.attackPullStage = 3;
        state.seamFlash = 1.0;
        snapJoint(S.pelvisY, -14, -100);
        snapJoint(S.shLY, -26, -125);
        snapJoint(S.shRY, -26, -125);
        snapJoint(S.uArmL, 166, 360);
        snapJoint(S.uArmR, -166, -360);
        snapJoint(S.fArmL, -8, -90);
        snapJoint(S.fArmR, 8, 90);
        snapJoint(S.headRot, 0, -60);
        const spL = [30, 15, 0, -16, -30];
        for (let i = 0; i < 5; i++) {
          snapJoint(S.fL[i], spL[i], spL[i] * 8);
          snapJoint(S.fR[i], -spL[i], -spL[i] * 8);
        }
      }

      if (t >= hitAt && t < jumpEnd) {
        if (!state.attackJumpActive) {
          state.attackJumpActive = true;
          state.seamFlash = 1.0;
          S.uArmL.val = 34; S.uArmL.target = 22; S.uArmL.vel = -260;
          S.uArmR.val = -34; S.uArmR.target = -22; S.uArmR.vel = 260;
          S.fArmL.val = -26; S.fArmL.target = -12; S.fArmL.vel = 140;
          S.fArmR.val = 26; S.fArmR.target = 12; S.fArmR.vel = -140;
          S.headShiftY.val = 12; S.headShiftY.target = 18;
        }
        targetOverlay = 1.0;
      } else if (t >= jumpEnd && state.attackJumpActive) {
        state.attackJumpActive = false;
        S.uArmL.val = 82; S.uArmR.val = -82;
        setNeutralTargets(S, true);
      }

      if (t >= hitAt && t < jumpEnd + 0.25) {
        targetOverlay = t < jumpEnd ? 1.0 : clamp(1 - (t - jumpEnd) / 0.25, 0, 1);
      }

      if (t >= dur) {
        state.action = 'idle';
        state.actionTime = 0;
        setNeutralTargets(S, false);
      }
    } else if (act === 'hit') {
      const dur = Math.max(0.35, this.params.hitDur);
      if (!state.hitSnapDone && t >= dur * 0.44) {
        state.hitSnapDone = true;
        state.seamFlash = 0.85;
        if (state.inReady) setReadyTargets(S, true);
        else setNeutralTargets(S, true);
      }
      if (t >= dur) {
        state.action = state.inReady ? 'ready' : 'idle';
        state.actionTime = 0;
      }
    } else if (act === 'heavyHit') {
      const dur = Math.max(0.8, this.params.heavyHitDur);
      const isL = state.dislocateSide > 0;
      if (t < dur * 0.76) {
        const swing = Math.sin(t * 7.2) * Math.exp(-t * 0.9);
        if (isL) {
          S.uArmL.target = 10 + swing * 18;
          S.fArmL.target = -6 + Math.sin(t * 7.2 - 0.9) * Math.exp(-t * 0.85) * 24;
          S.handL.target = 10 + Math.sin(t * 7.2 - 1.6) * Math.exp(-t * 0.8) * 28;
        } else {
          S.uArmR.target = -10 - swing * 18;
          S.fArmR.target = 6 - Math.sin(t * 7.2 - 0.9) * Math.exp(-t * 0.85) * 24;
          S.handR.target = -10 - Math.sin(t * 7.2 - 1.6) * Math.exp(-t * 0.8) * 28;
        }
      } else if (!state.dislocateSnapDone) {
        state.dislocateSnapDone = true;
        state.dislocateAmt = 0;
        state.seamFlash = 1.0;
        if (state.inReady) setReadyTargets(S, true);
        else setNeutralTargets(S, true);
      }
      if (t >= dur) {
        state.dislocateAmt = 0;
        state.action = state.inReady ? 'ready' : 'idle';
        state.actionTime = 0;
      }
    } else if (act === 'shell') {
      const dur = Math.max(0.5, this.params.shellDur);
      const tiltPhase = t < dur * 0.65 ? smoothstep(0.08, dur * 0.45, t) : 1 - smoothstep(dur * 0.65, dur, t);
      S.headRot.target = NEUTRAL.headRot + state.shellSide * -22 * tiltPhase;
      S.neckRot.target = NEUTRAL.neckRot + state.shellSide * -5 * tiltPhase;
      if (t >= dur) {
        state.action = state.inReady ? 'ready' : 'idle';
        state.actionTime = 0;
        if (state.inReady) setReadyTargets(S, false);
        else setNeutralTargets(S, false);
      }
    } else if (act === 'die') {
      const dur = Math.max(1.2, this.params.dieDur);
      if (!state.debrisSpawned && t >= dur * 0.68) {
        state.debrisSpawned = true;
        spawnDeathDebris(state);
      }
      if (t >= dur) {
        state.dieDone = true;
      }
    }

    state.screenOverlay = lerp(state.screenOverlay, targetOverlay, clamp(step * 18, 0, 1));

    if (act !== 'die') {
      const subDt = step * 0.5;
      for (let k = 0; k < 2; k++) {
        stepSpring(S.pelvisX, subDt);
        stepSpring(S.pelvisY, subDt);
        stepSpring(S.pelvisRot, subDt);
        stepSpring(S.torsoRot, subDt);
        stepSpring(S.neckRot, subDt);
        stepSpring(S.headRot, subDt);
        stepSpring(S.headShiftX, subDt);
        stepSpring(S.headShiftY, subDt);
        stepSpring(S.shLX, subDt);
        stepSpring(S.shLY, subDt);
        stepSpring(S.shLRot, subDt);
        stepSpring(S.uArmL, subDt);
        stepSpring(S.fArmL, subDt);
        stepSpring(S.handL, subDt);
        stepSpring(S.shRX, subDt);
        stepSpring(S.shRY, subDt);
        stepSpring(S.shRRot, subDt);
        stepSpring(S.uArmR, subDt);
        stepSpring(S.fArmR, subDt);
        stepSpring(S.handR, subDt);
        for (let i = 0; i < 5; i++) {
          stepSpring(S.fL[i], subDt);
          stepSpring(S.fR[i], subDt);
        }
      }
    }
  },

  draw(p, state) {
    const pal = state.palette;
    if (!pal) return;
    const ctx = p.drawingContext;
    const { S } = state;
    const act = state.action;
    const t = state.actionTime;
    const amp = this.params.swayAmp;
    const glowScale = this.params.seamGlow;

    const pulse = 0.68 + 0.22 * Math.sin(state.time * 1.15);
    const readyBoost = act === 'ready' ? 0.35 + 0.1 * Math.sin(state.time * 6.5) : 0;
    const baseSeam = clamp((pulse + readyBoost + state.seamFlash * 0.55) * glowScale, 0, 1.4);
    const seamLevels = {
      knee: baseSeam,
      hip: baseSeam,
      wrist: baseSeam,
      elbow: baseSeam,
      shoulder: baseSeam,
      neck: baseSeam,
    };
    let eyeLevel = 1.0;
    let bodyAlpha = 1.0;

    if (act === 'appear') {
      const dur = Math.max(0.5, this.params.appearDur);
      const u = clamp(t / dur, 0, 1);
      bodyAlpha = 0.28 + 0.72 * smoothstep(0.05, 0.92, u);
      seamLevels.knee *= smoothstep(0.06, 0.24, u);
      seamLevels.hip *= smoothstep(0.2, 0.38, u);
      seamLevels.wrist *= smoothstep(0.32, 0.52, u);
      seamLevels.elbow *= smoothstep(0.4, 0.58, u);
      seamLevels.shoulder *= smoothstep(0.54, 0.72, u);
      seamLevels.neck *= smoothstep(0.68, 0.84, u);
      eyeLevel = smoothstep(0.8, 0.98, u);
    } else if (act === 'die') {
      const dur = Math.max(1.2, this.params.dieDur);
      const u = clamp(t / dur, 0, 1);
      seamLevels.knee *= 1 - smoothstep(0.42, 0.52, u);
      seamLevels.hip *= 1 - smoothstep(0.48, 0.58, u);
      seamLevels.wrist *= 1 - smoothstep(0.52, 0.62, u);
      seamLevels.elbow *= 1 - smoothstep(0.56, 0.66, u);
      seamLevels.shoulder *= 1 - smoothstep(0.6, 0.7, u);
      seamLevels.neck *= 1 - smoothstep(0.64, 0.74, u);
      eyeLevel = 1 - smoothstep(0.7, 0.82, u);
      bodyAlpha = 1 - smoothstep(0.72, 0.96, u);
    }

    p.push();
    ctx.save();

    if (state.attackJumpActive) {
      const jumpScale = 2.28;
      p.translate(0, 155);
      p.scale(jumpScale);
    }

    p.scale(SVG_TO_CM);
    p.translate(-ORIGIN_X, -ORIGIN_Y);

    const swaySlow =
      act === 'shell' || act === 'die'
        ? 0
        : (Math.sin(state.time * 0.62) * 0.65 + Math.sin(state.time * 1.07 + 1.3) * 0.35) * amp;
    const swayVert =
      act === 'shell' || act === 'die'
        ? 0
        : (Math.sin(state.time * 0.85 + 0.5) * 0.75 + Math.cos(state.time * 0.43) * 0.35) * amp;
    const swayArm = act === 'shell' || act === 'die' ? 0 : Math.sin(state.time * 0.62 - 0.85) * amp;
    const swayHand = act === 'shell' || act === 'die' ? 0 : Math.sin(state.time * 0.62 - 1.55) * amp;

    let dieKnees = 0;
    let dieTorso = 0;
    let dieHead = 0;
    if (act === 'die') {
      const dur = Math.max(1.2, this.params.dieDur);
      const u = clamp(t / dur, 0, 1);
      dieKnees = smoothstep(0.0, 0.26, u);
      dieTorso = smoothstep(0.18, 0.48, u);
      dieHead = smoothstep(0.38, 0.62, u);
    }

    const px = RIG.pelvisBaseX + S.pelvisX.val + swaySlow * 1.5 + dieTorso * 12;
    const py = RIG.pelvisBaseY + S.pelvisY.val + swayVert * 1.05 + dieKnees * 335;
    const pRotDeg = S.pelvisRot.val + swaySlow * 0.35 + dieTorso * 28;
    const pRot = (pRotDeg * Math.PI) / 180;

    if (bodyAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = bodyAlpha;

      // 1. 脚底投影
      const shCx = 300 + (px - RIG.pelvisBaseX) * 0.25;
      const shRx = 78 + dieKnees * 48;
      const shRy = 14 + dieKnees * 8;
      ctx.save();
      ctx.translate(shCx, 893);
      ctx.scale(1, shRy / shRx);
      const gSh = ctx.createRadialGradient(0, 0, 4, 0, 0, shRx);
      gSh.addColorStop(0, hexToRgba(pal.shadow[2], 0.32));
      gSh.addColorStop(0.65, hexToRgba(pal.shadow[1], 0.14));
      gSh.addColorStop(1, hexToRgba(pal.shadow[0], 0));
      ctx.fillStyle = gSh;
      ctx.beginPath();
      ctx.arc(0, 0, shRx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 2. 下肢 2-Bone IK
      const cosP = Math.cos(pRot);
      const sinP = Math.sin(pRot);
      const lHipX = px + (-RIG.hipOffsetX * cosP - RIG.hipOffsetY * sinP);
      const lHipY = py + (-RIG.hipOffsetX * sinP + RIG.hipOffsetY * cosP);
      const rHipX = px + (RIG.hipOffsetX * cosP - RIG.hipOffsetY * sinP);
      const rHipY = py + (RIG.hipOffsetX * sinP + RIG.hipOffsetY * cosP);

      const ikL = solveLegIK(lHipX, lHipY, RIG.ankleL.x, RIG.ankleL.y, RIG.thighLen, RIG.shinLen, 1);
      const ikR = solveLegIK(rHipX, rHipY, RIG.ankleR.x, RIG.ankleR.y, RIG.thighLen, RIG.shinLen, -1);

      drawLeg(ctx, true, lHipX, lHipY, ikL, RIG.ankleL.x, RIG.ankleL.y, pal, seamLevels.knee);
      drawLeg(ctx, false, rHipX, rHipY, ikR, RIG.ankleR.x, RIG.ankleR.y, pal, seamLevels.knee);

      // 3. 骨盆木偶关节节点
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(pRot);

      ctx.fillStyle = pal.body[0];
      ctx.beginPath();
      ctx.moveTo(-28, -8);
      ctx.bezierCurveTo(-31, 4, -28, 16, -18, 22);
      ctx.lineTo(18, 22);
      ctx.bezierCurveTo(28, 16, 31, 4, 28, -8);
      ctx.closePath();
      ctx.fill();

      drawSeamArc(ctx, -24.5, -5, -26.5, 4, -23.5, 13, -16.5, 19, pal, seamLevels.hip, 1.9, 4.3);
      drawSeamArc(ctx, 24.5, -5, 26.5, 4, 23.5, 13, 16.5, 19, pal, seamLevels.hip, 1.9, 4.3);

      // 中轴窄削骨盆硬壳节（objectBoundingBox 渐变）
      ctx.beginPath();
      ctx.moveTo(-17, -22);
      ctx.bezierCurveTo(-22, -11, -22, 2, -15, 15);
      ctx.bezierCurveTo(-10, 24, -4, 28, 0, 28);
      ctx.bezierCurveTo(4, 28, 10, 24, 15, 15);
      ctx.bezierCurveTo(22, 2, 22, -11, 17, -22);
      ctx.bezierCurveTo(9, -26, -9, -26, -17, -22);
      ctx.closePath();
      fillBBoxGrad(ctx, BBOX.pelvis, 'pelvis', pal);

      ctx.beginPath();
      ctx.moveTo(-13, -14);
      ctx.bezierCurveTo(-16, -3, -14, 8, -8, 18);
      ctx.bezierCurveTo(-9, 7, -9, -4, -9, -13);
      ctx.closePath();
      fillBBoxGrad(ctx, BBOX.pelvisSpec, 'specSharp', pal, 0.62);

      ctx.strokeStyle = hexToRgba(pal.sheen[1], 0.48);
      ctx.lineWidth = 1.3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(14, -13);
      ctx.bezierCurveTo(16, -2, 14, 9, 8, 18);
      ctx.stroke();

      drawDarkSlot(ctx, -18, -23, -8, -19, 8, -19, 18, -23, pal, 3.6);

      // 4. 躯干
      const torsoRotDeg = S.torsoRot.val + swaySlow * 0.58 + dieTorso * 68;
      ctx.translate(0, -24 + dieTorso * 16);
      ctx.rotate((torsoRotDeg * Math.PI) / 180);

      // 后侧领脊与冷光边
      ctx.fillStyle = pal.body[0];
      ctx.beginPath();
      ctx.moveTo(-50, -228);
      ctx.bezierCurveTo(-56, -244, -48, -256, -32, -254);
      ctx.bezierCurveTo(-18, -252, -8, -242, 0, -242);
      ctx.bezierCurveTo(8, -242, 18, -252, 32, -254);
      ctx.bezierCurveTo(48, -256, 56, -244, 50, -228);
      ctx.lineTo(34, -196);
      ctx.lineTo(-34, -196);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = hexToRgba(pal.sheen[1], 0.58);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-48, -245);
      ctx.bezierCurveTo(-38, -253, -24, -252, -12, -245);
      ctx.stroke();
      ctx.strokeStyle = hexToRgba(pal.sheen[1], 0.66);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(48, -245);
      ctx.bezierCurveTo(38, -253, 24, -252, 12, -245);
      ctx.stroke();

      // 主躯干（objectBoundingBox 渐变）
      ctx.beginPath();
      ctx.moveTo(-18, 2);
      ctx.bezierCurveTo(-19, -28, -17, -58, -21, -92);
      ctx.bezierCurveTo(-26, -132, -42, -172, -53, -206);
      ctx.bezierCurveTo(-58, -222, -47, -236, -28, -240);
      ctx.lineTo(28, -240);
      ctx.bezierCurveTo(47, -236, 58, -222, 53, -206);
      ctx.bezierCurveTo(42, -172, 26, -132, 21, -92);
      ctx.bezierCurveTo(17, -58, 19, -28, 18, 2);
      ctx.bezierCurveTo(10, 8, -10, 8, -18, 2);
      ctx.closePath();
      fillBBoxGrad(ctx, BBOX.torso, 'torso', pal);

      // 胸骨肌脊
      ctx.fillStyle = hexToRgba(pal.body[2], 0.88);
      ctx.beginPath();
      ctx.moveTo(-38, -218);
      ctx.bezierCurveTo(-22, -206, -8, -200, 0, -198);
      ctx.bezierCurveTo(8, -200, 22, -206, 38, -218);
      ctx.bezierCurveTo(26, -196, 14, -184, 0, -178);
      ctx.bezierCurveTo(-14, -184, -26, -196, -38, -218);
      ctx.closePath();
      ctx.fill();

      // 胸部反光脊线（objectBoundingBox 渐变）
      ctx.beginPath();
      ctx.moveTo(-42, -206);
      ctx.bezierCurveTo(-33, -168, -22, -130, -16, -88);
      ctx.bezierCurveTo(-14, -56, -15, -22, -14, 0);
      ctx.bezierCurveTo(-11, -30, -11, -66, -12, -96);
      ctx.bezierCurveTo(-15, -138, -25, -174, -33, -204);
      ctx.closePath();
      fillBBoxGrad(ctx, BBOX.torsoSpec, 'specSharp', pal, 0.72);

      // 胸中轴微凸光泽（objectBoundingBox 渐变）
      ctx.beginPath();
      ctx.moveTo(-3, -190);
      ctx.bezierCurveTo(-5, -152, -4, -110, -2, -66);
      ctx.bezierCurveTo(-1, -108, 1, -152, 0, -190);
      ctx.closePath();
      fillBBoxGrad(ctx, BBOX.torsoCenterSpec, 'specCool', pal, 0.58);

      // 锁骨锐利弹光
      ctx.fillStyle = hexToRgba(pal.sheen[3], 0.82);
      ctx.beginPath();
      ctx.moveTo(-43, -224);
      ctx.bezierCurveTo(-29, -214, -14, -210, -4, -211);
      ctx.bezierCurveTo(-15, -215, -28, -220, -40, -228);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = hexToRgba(pal.sheen[2], 0.55);
      ctx.beginPath();
      ctx.moveTo(41, -225);
      ctx.bezierCurveTo(28, -216, 15, -211, 5, -211);
      ctx.bezierCurveTo(16, -215, 29, -220, 39, -228);
      ctx.closePath();
      ctx.fill();

      // 躯干右侧轮廓反光 + 腹侧折纹
      ctx.strokeStyle = hexToRgba(pal.sheen[1], 0.62);
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(48, -204);
      ctx.bezierCurveTo(38, -168, 23, -130, 18, -88);
      ctx.bezierCurveTo(15, -56, 17, -24, 16, 0);
      ctx.stroke();

      ctx.strokeStyle = hexToRgba(pal.body[0], 0.68);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-24, -154);
      ctx.bezierCurveTo(-14, -146, -4, -144, 0, -144);
      ctx.bezierCurveTo(4, -144, 14, -146, 24, -154);
      ctx.stroke();

      ctx.strokeStyle = hexToRgba(pal.sheen[1], 0.45);
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(-22, -152);
      ctx.bezierCurveTo(-12, -145, -4, -143, 0, -143);
      ctx.stroke();

      ctx.strokeStyle = hexToRgba(pal.body[0], 0.6);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-18, -118);
      ctx.bezierCurveTo(-10, -112, -3, -110, 0, -110);
      ctx.bezierCurveTo(3, -110, 10, -112, 18, -118);
      ctx.stroke();

      // 厚皮挡住：躯干边上极亮漆面高光闪过
      if (state.shellFlash > 0.02) {
        const sSide = state.shellSide;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = hexToRgba(pal.fx[3], clamp(state.shellFlash * 1.1, 0, 1));
        ctx.lineWidth = 5.5 * state.shellFlash + 1.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sSide * 44, -210);
        ctx.bezierCurveTo(sSide * 34, -168, sSide * 22, -126, sSide * 18, -76);
        ctx.stroke();
        ctx.strokeStyle = hexToRgba(pal.fx[2], state.shellFlash * 0.65);
        ctx.lineWidth = 11 * state.shellFlash;
        ctx.stroke();
        ctx.restore();
      }

      // 厚皮挡住的火星粒子
      if (state.sparks.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < state.sparks.length; i++) {
          const sp = state.sparks[i];
          const a = clamp(1 - sp.life / sp.maxLife, 0, 1);
          ctx.fillStyle = hexToRgba(pal.fx[sp.bright], a);
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.size * (0.4 + 0.6 * a), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // 5. 颈部与头部（按颈部自身窄外框拉伸 grad-torso，并绘制颈部反光筋脊）
      const neckRotDeg = S.neckRot.val - swaySlow * 0.35 + dieHead * 35;
      const headRotDeg = S.headRot.val + Math.sin(state.time * 0.51 + 0.8) * 0.65 * amp + dieHead * 42;
      ctx.save();
      ctx.translate(0, -238);
      ctx.rotate((neckRotDeg * Math.PI) / 180);

      ctx.beginPath();
      ctx.moveTo(-14, 2);
      ctx.bezierCurveTo(-13, -20, -11, -46, -11, -74);
      ctx.lineTo(11, -74);
      ctx.bezierCurveTo(11, -46, 13, -20, 14, 2);
      ctx.bezierCurveTo(6, 8, -6, 8, -14, 2);
      ctx.closePath();
      fillBBoxGrad(ctx, BBOX.neck, 'torso', pal);

      // 颈部硬质筋脊反光 + 右缘冷光
      ctx.beginPath();
      ctx.moveTo(-9, -4);
      ctx.bezierCurveTo(-8, -28, -8, -50, -7, -68);
      ctx.bezierCurveTo(-4, -46, -4, -24, -5, -2);
      ctx.closePath();
      fillBBoxGrad(ctx, BBOX.neckSpec, 'specSharp', pal, 0.72);

      ctx.strokeStyle = hexToRgba(pal.sheen[1], 0.54);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(10, -6);
      ctx.bezierCurveTo(9, -28, 9, -50, 9, -68);
      ctx.stroke();

      // 头部
      const readyHeadScale = act === 'ready' ? 1.07 : 1.0;
      ctx.translate(S.headShiftX.val + dieHead * 14, -68 + S.headShiftY.val + dieHead * 24);
      ctx.rotate((headRotDeg * Math.PI) / 180);
      ctx.scale(readyHeadScale, readyHeadScale);
      drawHead(ctx, headRotDeg, eyeLevel, pal);
      ctx.restore();

      // 颈根关节缝与前领脊
      drawDarkSlot(ctx, -19, -235, -9, -228, 9, -228, 19, -235, pal, 5.2);
      drawSeamArc(ctx, -16, -234.2, -7.8, -228.4, 7.8, -228.4, 16, -234.2, pal, seamLevels.neck, 1.9, 4.2);

      ctx.beginPath();
      ctx.moveTo(-30, -239);
      ctx.bezierCurveTo(-18, -228, -7, -223, 0, -223);
      ctx.bezierCurveTo(7, -223, 18, -228, 30, -239);
      ctx.bezierCurveTo(20, -234, 9, -231, 0, -231);
      ctx.bezierCurveTo(-9, -231, -20, -234, -30, -239);
      ctx.closePath();
      fillBBoxGrad(ctx, BBOX.frontCollar, 'mantle', pal);

      // 6. 左臂与右臂
      const deg = Math.PI / 180;
      const disL = state.dislocateAmt > 0 && state.dislocateSide > 0 ? 18 * state.dislocateAmt : 0;
      const disR = state.dislocateAmt > 0 && state.dislocateSide < 0 ? 18 * state.dislocateAmt : 0;

      const poseL = {
        shX: -54 + S.shLX.val,
        shY: -218 + S.shLY.val + swayVert * 0.45 + dieTorso * 12,
        shRot: S.shLRot.val * deg,
        uArm: (S.uArmL.val + swayArm * 0.95 - dieTorso * 58) * deg,
        fArm: (S.fArmL.val + swayHand * 1.35 + dieTorso * 86) * deg,
        hand: (S.handL.val + swayHand * 1.55 - dieTorso * 35) * deg,
        dislocateY: disL,
        fingers: S.fL.map((f, i) => (f.val + Math.sin(state.time * 0.72 + i * 0.55) * 0.85 * amp) * deg),
      };
      const poseR = {
        shX: 54 + S.shRX.val,
        shY: -218 + S.shRY.val + swayVert * 0.45 + dieTorso * 14,
        shRot: S.shRRot.val * deg,
        uArm: (S.uArmR.val + swayArm * 0.9 + dieTorso * 44) * deg,
        fArm: (S.fArmR.val + swayHand * 1.3 - dieTorso * 94) * deg,
        hand: (S.handR.val + swayHand * 1.5 + dieTorso * 40) * deg,
        dislocateY: disR,
        fingers: S.fR.map((f, i) => (f.val + Math.sin(state.time * 0.74 + i * 0.6 + 1.2) * 0.85 * amp) * deg),
      };

      drawArm(ctx, true, poseL, pal, seamLevels);
      drawArm(ctx, false, poseR, pal, seamLevels);

      ctx.restore(); // pelvis
      ctx.restore(); // bodyAlpha
    }

    // 7. 死亡化成的暗色碎屑
    if (state.debris.length > 0) {
      for (let i = 0; i < state.debris.length; i++) {
        const d = state.debris[i];
        if (d.delay > 0) continue;
        const a = clamp(1 - d.life / d.maxLife, 0, 1);
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rot);
        ctx.fillStyle = hexToRgba(d.tone === 'fx' ? pal.fx[1] : pal.body[d.idx], a * 0.92);
        ctx.beginPath();
        ctx.moveTo(-d.w * 0.5, -d.h * 0.4);
        ctx.lineTo(d.w * 0.5, -d.h * 0.2);
        ctx.lineTo(d.w * 0.35, d.h * 0.5);
        ctx.lineTo(-d.w * 0.45, d.h * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.restore();
    p.pop();
  },

  drawScreen(p, state, w, h) {
    const ov = state.screenOverlay;
    if (ov <= 0.01 || !state.palette) return;
    const pal = state.palette;
    const ctx = p.drawingContext;

    p.push();
    ctx.save();

    const gDark = ctx.createLinearGradient(0, 0, 0, h);
    gDark.addColorStop(0, hexToRgba(pal.body[0], ov * 0.82));
    gDark.addColorStop(0.55, hexToRgba(pal.body[1], ov * 0.45));
    gDark.addColorStop(1, hexToRgba(pal.body[0], ov * 0.12));
    ctx.fillStyle = gDark;
    ctx.fillRect(0, 0, w, h);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < state.cracks.length; i++) {
      const segs = state.cracks[i];
      for (let j = 0; j < segs.length; j++) {
        const s = segs[j];
        ctx.strokeStyle = hexToRgba(pal.body[0], ov * 0.92);
        ctx.lineWidth = s.w * 2.2;
        ctx.beginPath();
        ctx.moveTo(s.x1 * w, s.y1 * h);
        ctx.lineTo(s.x2 * w, s.y2 * h);
        ctx.stroke();
        ctx.strokeStyle = hexToRgba(pal.fx[3], ov * 0.86);
        ctx.lineWidth = s.w * 0.85;
        ctx.beginPath();
        ctx.moveTo(s.x1 * w, s.y1 * h);
        ctx.lineTo(s.x2 * w, s.y2 * h);
        ctx.stroke();
      }
    }

    ctx.restore();
    p.pop();
  },

  done(state) {
    return state.action === 'die' && state.dieDone;
  },
};

export default BadomModule;
