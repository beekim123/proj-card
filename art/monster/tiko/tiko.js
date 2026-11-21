/**
 * 提可（Tiko）p5.js 怪物动作模块
 * 遵循《动作接口-本包.md》：实例模式、1 单位 = 1 厘米、原点在身子中心、
 * 时间仅由 dt 累加、颜色全从 opt.palette 取、每帧现画无位图缓存。
 */

// 1 厘米对应第一部分 SVG 坐标的缩放比例（总翼展 1024 * 0.088 ≈ 90.1 厘米）
const SVG_TO_CM = 0.088;
const DEG = Math.PI / 180;

// ================= 颜色解析与混合工具（绝不写死色值） =================
function parseHex(hex) {
  const h = (hex || '').replace('#', '');
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0
  ];
}

function mixRgb(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

function rgbStr(rgb, alpha = 1) {
  const r = Math.max(0, Math.min(255, Math.round(rgb[0])));
  const g = Math.max(0, Math.min(255, Math.round(rgb[1])));
  const b = Math.max(0, Math.min(255, Math.round(rgb[2])));
  const a = Math.max(0, Math.min(1, alpha));
  return a >= 0.999 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

function buildColorCache(palette) {
  const parsed = {};
  const keys = ['wing', 'body', 'mark', 'orb', 'eye', 'claw', 'fx'];
  const fallback = [[0, 0, 0], [32, 32, 32], [96, 96, 96], [192, 192, 192]];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const arr = palette && palette[k] ? palette[k] : (palette && palette.wing ? palette.wing : null);
    parsed[k] = arr
      ? [parseHex(arr[0]), parseHex(arr[1]), parseHex(arr[2]), parseHex(arr[3])]
      : fallback;
  }
  return parsed;
}

function sampleRgb(palRgb, key, level) {
  const arr = palRgb[key] || palRgb.wing;
  const c = Math.max(0, Math.min(3, level));
  const i0 = Math.floor(c);
  const i1 = Math.min(3, i0 + 1);
  const frac = c - i0;
  return frac === 0 ? arr[i0] : mixRgb(arr[i0], arr[i1], frac);
}

function col(palRgb, key, level, alpha = 1) {
  return rgbStr(sampleRgb(palRgb, key, level), alpha);
}

function mixCol(palRgb, k1, l1, k2, l2, t, alpha = 1) {
  return rgbStr(mixRgb(sampleRgb(palRgb, k1, l1), sampleRgb(palRgb, k2, l2), t), alpha);
}

// ================= 确定性伪随机（仅用 opt.seed，不污染全局随机种子） =================
function makeRng(seed) {
  let s = (typeof seed === 'number' ? seed : 1337) >>> 0;
  if (s === 0) s = 0x9e3779b9;
  return function next() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ================= 缓动与插值函数 =================
function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(t) {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

function easeOutCubic(t) {
  const c = 1 - clamp(t, 0, 1);
  return 1 - c * c * c;
}

function easeInCubic(t) {
  const c = clamp(t, 0, 1);
  return c * c * c;
}

function easeOutBack(t, s = 1.70158) {
  const c = clamp(t, 0, 1) - 1;
  return 1 + (s + 1) * c * c * c + s * c * c;
}

// ================= 粒子生成辅助 =================
function spawnDebris(state, count, spreadX, spreadY, speedScale, isWingTear = false) {
  const rng = state.rng;
  for (let i = 0; i < count; i++) {
    const ang = rng() * Math.PI * 2;
    const spd = (14 + rng() * 34) * speedScale;
    state.particles.push({
      x: (rng() - 0.5) * spreadX,
      y: (rng() - 0.5) * spreadY,
      vx: Math.cos(ang) * spd + (rng() - 0.5) * 12,
      vy: Math.sin(ang) * spd - (isWingTear ? 6 + rng() * 14 : 4),
      rot: rng() * Math.PI * 2,
      vrot: (rng() - 0.5) * 9,
      size: isWingTear ? (1.6 + rng() * 3.4) : (0.9 + rng() * 2.1),
      life: 0,
      maxLife: isWingTear ? (0.75 + rng() * 0.95) : (0.45 + rng() * 0.55),
      kind: rng() < 0.3 ? 'mark' : (rng() < 0.72 ? 'wing' : 'fx'),
      shade: 0.4 + rng() * 1.9,
      shape: rng() < 0.55 ? 'shard' : 'mote',
      drag: isWingTear ? 1.8 : 2.6,
      gravity: isWingTear ? 6 : 16
    });
  }
}

// ================= 翅膀与躯干底层绘制（严格对齐第一部分改错后的曲线与比例） =================
function drawLowerWing(ctx, pal, tearAmount) {
  const alphaMul = 1 - tearAmount * 0.9;
  if (alphaMul <= 0.01) return;

  ctx.save();
  if (alphaMul < 0.999) ctx.globalAlpha *= alphaMul;

  const grad = ctx.createLinearGradient(42, 0, 210, 214);
  grad.addColorStop(0, col(pal, 'wing', 0.3, 0.98));
  grad.addColorStop(0.55, col(pal, 'wing', 1.25, 0.92));
  grad.addColorStop(0.86, col(pal, 'wing', 2.15, 0.74));
  grad.addColorStop(1, col(pal, 'wing', 2.72, 0.42));

  ctx.beginPath();
  ctx.moveTo(-2, 6);
  ctx.bezierCurveTo(58, 2, 146, 16, 238, 44);
  ctx.bezierCurveTo(264, 52, 284, 65, 276, 78);
  ctx.bezierCurveTo(265, 92, 232, 88, 208, 96);
  ctx.bezierCurveTo(232, 110, 242, 126, 226, 136);
  ctx.bezierCurveTo(206, 147, 176, 128, 156, 138);
  ctx.bezierCurveTo(168, 162, 178, 194, 156, 214);
  ctx.bezierCurveTo(144, 224, 132, 212, 134, 194);
  ctx.bezierCurveTo(136, 174, 128, 154, 114, 142);
  ctx.bezierCurveTo(104, 158, 92, 174, 78, 170);
  ctx.bezierCurveTo(68, 167, 74, 145, 64, 132);
  ctx.bezierCurveTo(44, 138, 26, 122, 14, 98);
  ctx.bezierCurveTo(4, 78, -2, 52, -2, 28);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = col(pal, 'wing', 0.15, 0.7);
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // 脉络
  const vGrad = ctx.createLinearGradient(8, 22, 244, 130);
  vGrad.addColorStop(0, col(pal, 'mark', 1.3, 0.34));
  vGrad.addColorStop(0.65, col(pal, 'mark', 2, 0.22));
  vGrad.addColorStop(1, col(pal, 'mark', 2.75, 0.06));
  ctx.strokeStyle = vGrad;
  ctx.lineWidth = 1.15;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(10, 22); ctx.bezierCurveTo(74, 34, 154, 54, 244, 72);
  ctx.moveTo(12, 34); ctx.bezierCurveTo(72, 56, 142, 84, 202, 118);
  ctx.moveTo(10, 48); ctx.bezierCurveTo(60, 82, 112, 126, 148, 198);
  ctx.moveTo(8, 62);  ctx.bezierCurveTo(36, 92, 64, 124, 82, 162);
  ctx.stroke();

  // 月牙纹
  ctx.fillStyle = col(pal, 'mark', 1.4, 0.16);
  ctx.beginPath();
  ctx.moveTo(88, 74);
  ctx.bezierCurveTo(108, 68, 128, 78, 134, 96);
  ctx.bezierCurveTo(120, 86, 102, 84, 88, 90);
  ctx.bezierCurveTo(94, 83, 93, 78, 88, 74);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = col(pal, 'mark', 1, 0.12);
  ctx.beginPath();
  ctx.moveTo(148, 96);
  ctx.bezierCurveTo(164, 92, 178, 100, 182, 112);
  ctx.bezierCurveTo(170, 105, 158, 104, 148, 107);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawWingTip(ctx, pal, tearAmount) {
  const alphaMul = 1 - tearAmount;
  if (alphaMul <= 0.01) return;

  ctx.save();
  if (alphaMul < 0.999) ctx.globalAlpha *= alphaMul;

  const grad = ctx.createLinearGradient(-14, 0, 248, 32);
  grad.addColorStop(0, col(pal, 'wing', 1.45, 0.98));
  grad.addColorStop(0.42, col(pal, 'wing', 1.78, 0.92));
  grad.addColorStop(0.82, col(pal, 'wing', 2.48, 0.74));
  grad.addColorStop(1, col(pal, 'wing', 3, 0.46));

  // 主体无内侧描边，平滑嵌入内翼腕部
  ctx.beginPath();
  ctx.moveTo(-14, -39);
  ctx.bezierCurveTo(-4, -39, 0, -39, 4, -39);
  ctx.bezierCurveTo(58, -44, 136, -24, 216, 8);
  ctx.bezierCurveTo(238, 16, 254, 26, 250, 32);
  ctx.bezierCurveTo(242, 40, 210, 34, 180, 36);
  ctx.bezierCurveTo(210, 46, 232, 56, 226, 64);
  ctx.bezierCurveTo(218, 72, 182, 64, 150, 64);
  ctx.bezierCurveTo(178, 76, 194, 88, 184, 96);
  ctx.bezierCurveTo(174, 104, 140, 92, 110, 90);
  ctx.bezierCurveTo(132, 102, 140, 116, 128, 122);
  ctx.bezierCurveTo(114, 128, 86, 112, 60, 106);
  ctx.bezierCurveTo(32, 100, 6, 96, -12, 94);
  ctx.bezierCurveTo(-24, 62, -24, -8, -14, -39);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // 仅外轮廓描边
  ctx.beginPath();
  ctx.moveTo(0, -39);
  ctx.bezierCurveTo(58, -44, 136, -24, 216, 8);
  ctx.bezierCurveTo(238, 16, 254, 26, 250, 32);
  ctx.bezierCurveTo(242, 40, 210, 34, 180, 36);
  ctx.bezierCurveTo(210, 46, 232, 56, 226, 64);
  ctx.bezierCurveTo(218, 72, 182, 64, 150, 64);
  ctx.bezierCurveTo(178, 76, 194, 88, 184, 96);
  ctx.bezierCurveTo(174, 104, 140, 92, 110, 90);
  ctx.bezierCurveTo(132, 102, 140, 116, 128, 122);
  ctx.bezierCurveTo(114, 128, 86, 112, 60, 106);
  ctx.bezierCurveTo(32, 100, 6, 96, -12, 94);
  ctx.strokeStyle = col(pal, 'wing', 0.28, 0.65);
  ctx.lineWidth = 1.1;
  ctx.lineCap = 'round';
  ctx.stroke();

  // 前缘暗棱
  ctx.beginPath();
  ctx.moveTo(-2, -38);
  ctx.bezierCurveTo(58, -42, 136, -22, 218, 10);
  ctx.bezierCurveTo(236, 17, 248, 24, 247, 29);
  ctx.strokeStyle = col(pal, 'wing', 0, 0.72);
  ctx.lineWidth = 2;
  ctx.stroke();

  // 羽轴脉络
  const vGrad = ctx.createLinearGradient(0, -20, 230, 80);
  vGrad.addColorStop(0, col(pal, 'mark', 1.3, 0.34));
  vGrad.addColorStop(0.65, col(pal, 'mark', 2, 0.22));
  vGrad.addColorStop(1, col(pal, 'mark', 2.75, 0.06));
  ctx.strokeStyle = vGrad;
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(0, -20);  ctx.bezierCurveTo(68, -18, 146, 0, 230, 26);
  ctx.moveTo(1, 10);   ctx.bezierCurveTo(66, 14, 138, 32, 210, 56);
  ctx.moveTo(-4, 46);  ctx.bezierCurveTo(58, 48, 120, 64, 174, 86);
  ctx.moveTo(-10, 80); ctx.bezierCurveTo(42, 76, 88, 88, 124, 110);
  ctx.stroke();

  // 外翼纹带
  ctx.fillStyle = col(pal, 'mark', 1.85, 0.16);
  ctx.beginPath();
  ctx.moveTo(64, -16);
  ctx.bezierCurveTo(96, -6, 126, 12, 146, 32);
  ctx.bezierCurveTo(122, 18, 92, 4, 60, -4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = col(pal, 'mark', 1.6, 0.13);
  ctx.beginPath();
  ctx.moveTo(40, 20);
  ctx.bezierCurveTo(74, 34, 104, 52, 124, 72);
  ctx.bezierCurveTo(98, 58, 68, 42, 36, 32);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawWingInner(ctx, pal, tearAmount) {
  const alphaMul = 1 - tearAmount * 0.95;
  if (alphaMul <= 0.01) return;

  ctx.save();
  if (alphaMul < 0.999) ctx.globalAlpha *= alphaMul;

  const grad = ctx.createLinearGradient(-4, -20, 255, 10);
  grad.addColorStop(0, col(pal, 'wing', 0.35, 1));
  grad.addColorStop(0.52, col(pal, 'wing', 1, 0.99));
  grad.addColorStop(1, col(pal, 'wing', 1.45, 0.98));

  ctx.beginPath();
  ctx.moveTo(-4, -10);
  ctx.bezierCurveTo(42, -56, 126, -92, 248, -85);
  ctx.bezierCurveTo(256, -54, 252, -4, 236, 48);
  ctx.bezierCurveTo(214, 56, 190, 65, 164, 64);
  ctx.bezierCurveTo(146, 62, 126, 74, 106, 66);
  ctx.bezierCurveTo(86, 58, 72, 66, 52, 58);
  ctx.bezierCurveTo(28, 48, 8, 36, -4, 20);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // 仅前缘与后缘描边，腕部接缝不描边
  ctx.strokeStyle = col(pal, 'wing', 0.15, 0.75);
  ctx.lineWidth = 1.25;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-4, -10);
  ctx.bezierCurveTo(42, -56, 126, -92, 248, -85);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(236, 48);
  ctx.bezierCurveTo(214, 56, 190, 65, 164, 64);
  ctx.bezierCurveTo(146, 62, 126, 74, 106, 66);
  ctx.bezierCurveTo(86, 58, 72, 66, 52, 58);
  ctx.bezierCurveTo(28, 48, 8, 36, -4, 20);
  ctx.stroke();

  // 暗影叠层
  ctx.fillStyle = col(pal, 'wing', 0.1, 0.45);
  ctx.beginPath();
  ctx.moveTo(24, -26);
  ctx.bezierCurveTo(92, -64, 176, -78, 248, -68);
  ctx.bezierCurveTo(202, -56, 136, -44, 74, -12);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = col(pal, 'wing', 0.18, 0.32);
  ctx.beginPath();
  ctx.moveTo(48, 16);
  ctx.bezierCurveTo(118, 4, 184, 2, 240, 12);
  ctx.bezierCurveTo(192, 28, 130, 38, 66, 34);
  ctx.closePath();
  ctx.fill();

  // 脉络
  const vGrad = ctx.createLinearGradient(6, -20, 250, 20);
  vGrad.addColorStop(0, col(pal, 'mark', 1.3, 0.34));
  vGrad.addColorStop(0.65, col(pal, 'mark', 2, 0.22));
  vGrad.addColorStop(1, col(pal, 'mark', 2.75, 0.06));
  ctx.strokeStyle = vGrad;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(6, -4);   ctx.bezierCurveTo(76, -42, 162, -68, 248, -66);
  ctx.moveTo(8, 4);    ctx.bezierCurveTo(84, -20, 168, -34, 249, -36);
  ctx.moveTo(10, 12);  ctx.bezierCurveTo(88, 6, 164, 6, 244, 0);
  ctx.moveTo(10, 20);  ctx.bezierCurveTo(76, 26, 146, 36, 238, 34);
  ctx.moveTo(118, -48); ctx.bezierCurveTo(154, -38, 194, -32, 240, -34);
  ctx.moveTo(136, -4); ctx.bezierCurveTo(174, 8, 208, 18, 236, 30);
  ctx.stroke();

  // 月牙纹
  ctx.fillStyle = col(pal, 'mark', 2, 0.2);
  ctx.beginPath();
  ctx.moveTo(128, -22);
  ctx.bezierCurveTo(150, -36, 182, -32, 196, -10);
  ctx.bezierCurveTo(176, -22, 152, -20, 132, -8);
  ctx.bezierCurveTo(138, -14, 135, -19, 128, -22);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = col(pal, 'mark', 3, 0.16);
  ctx.beginPath();
  ctx.moveTo(156, -14);
  ctx.bezierCurveTo(166, -18, 176, -15, 182, -7);
  ctx.bezierCurveTo(173, -11, 164, -11, 156, -7);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = col(pal, 'mark', 1.3, 0.14);
  ctx.beginPath();
  ctx.moveTo(76, -2);
  ctx.bezierCurveTo(92, -12, 114, -10, 124, 4);
  ctx.bezierCurveTo(110, -4, 94, -4, 78, 4);
  ctx.closePath();
  ctx.fill();

  // 翼肩覆羽
  const covGrad = ctx.createLinearGradient(-6, -62, 126, 26);
  covGrad.addColorStop(0, col(pal, 'wing', 0.15, 1));
  covGrad.addColorStop(0.65, col(pal, 'wing', 0.88, 1));
  covGrad.addColorStop(1, col(pal, 'wing', 1.6, 1));
  ctx.beginPath();
  ctx.moveTo(-6, -14);
  ctx.bezierCurveTo(26, -44, 74, -62, 126, -62);
  ctx.bezierCurveTo(108, -46, 96, -38, 78, -36);
  ctx.bezierCurveTo(92, -28, 84, -16, 64, -16);
  ctx.bezierCurveTo(74, -6, 62, 6, 42, 6);
  ctx.bezierCurveTo(46, 18, 32, 26, 14, 22);
  ctx.bezierCurveTo(2, 20, -6, 12, -6, -14);
  ctx.closePath();
  ctx.fillStyle = covGrad;
  ctx.fill();
  ctx.strokeStyle = col(pal, 'wing', 0, 1);
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = col(pal, 'mark', 0.5, 0.26);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(12, -28); ctx.bezierCurveTo(44, -44, 78, -50, 108, -50);
  ctx.moveTo(14, -12); ctx.bezierCurveTo(42, -20, 66, -22, 86, -22);
  ctx.moveTo(10, 4);   ctx.bezierCurveTo(32, 4, 50, 4, 64, 2);
  ctx.stroke();

  ctx.restore();
}

function drawOneWing(ctx, pal, side, pose, tearAmount) {
  ctx.save();
  ctx.translate(side * pose.anchorX, pose.anchorY);
  if (side < 0) ctx.scale(-1, 1);

  // 下翼
  ctx.save();
  ctx.rotate(pose.lowerRot * DEG);
  ctx.scale(pose.lowerScaleX, pose.lowerScaleY);
  drawLowerWing(ctx, pal, tearAmount);
  ctx.restore();

  // 主翼（外翼尖先画在腕部下方，内翼覆盖其根部形成无缝衔接）
  ctx.save();
  ctx.rotate(pose.mainRot * DEG);
  ctx.scale(pose.mainScaleX, pose.mainScaleY);

  ctx.save();
  ctx.translate(248, -46);
  ctx.rotate(pose.tipRot * DEG);
  ctx.scale(pose.tipScaleX, pose.tipScaleY);
  drawWingTip(ctx, pal, tearAmount);
  ctx.restore();

  drawWingInner(ctx, pal, tearAmount);
  ctx.restore();

  ctx.restore();
}

function drawClawSide(ctx, pal, side, pose) {
  ctx.save();
  ctx.translate(side * pose.clawX, pose.clawY);
  if (side < 0) ctx.scale(-1, 1);
  ctx.rotate(pose.clawRot * DEG);
  ctx.scale(pose.clawScale, pose.clawScale);

  // 细长前肢
  ctx.beginPath();
  ctx.moveTo(-2, -4);
  ctx.bezierCurveTo(5, 6, 10, 16, 8, 26);
  ctx.bezierCurveTo(6, 30, 2, 32, -1, 28);
  ctx.bezierCurveTo(2, 22, 0, 13, -5, 2);
  ctx.closePath();
  ctx.fillStyle = col(pal, 'body', 1.1, 1);
  ctx.fill();
  ctx.strokeStyle = col(pal, 'body', 0.25, 1);
  ctx.lineWidth = 0.9;
  ctx.stroke();

  // 三根苍白弯钩爪
  const clawGrad = ctx.createLinearGradient(0, 25, 12, 52);
  clawGrad.addColorStop(0, col(pal, 'claw', 0, 1));
  clawGrad.addColorStop(0.45, col(pal, 'claw', 1, 1));
  clawGrad.addColorStop(0.85, col(pal, 'claw', 2, 1));
  clawGrad.addColorStop(1, col(pal, 'claw', 3, 1));
  ctx.fillStyle = clawGrad;
  ctx.strokeStyle = col(pal, 'body', 1, 1);
  ctx.lineWidth = 0.85;
  ctx.lineJoin = 'round';

  const claws = [
    [[8, 25], [14, 32, 17, 40, 14, 47], [12, 41, 9, 34, 5, 28]],
    [[5, 27], [8, 36, 9, 45, 4, 52], [4, 44, 2, 36, 0, 29]],
    [[1, 27], [1, 34, 0, 41, -5, 46], [-3, 39, -3, 33, -2, 27]]
  ];
  for (let i = 0; i < claws.length; i++) {
    const c = claws[i];
    ctx.beginPath();
    ctx.moveTo(c[0][0], c[0][1]);
    ctx.bezierCurveTo(c[1][0], c[1][1], c[1][2], c[1][3], c[1][4], c[1][5]);
    ctx.bezierCurveTo(c[2][0], c[2][1], c[2][2], c[2][3], c[2][4], c[2][5]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function drawTorso(ctx, pal, scaleX, scaleY) {
  ctx.save();
  ctx.scale(scaleX, scaleY);

  const bGrad = ctx.createLinearGradient(0, -22, 0, 52);
  bGrad.addColorStop(0, col(pal, 'body', 1.2, 1));
  bGrad.addColorStop(0.52, col(pal, 'body', 1.95, 1));
  bGrad.addColorStop(1, col(pal, 'body', 0.75, 1));

  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.bezierCurveTo(16, -20, 25, -6, 23, 14);
  ctx.bezierCurveTo(21, 31, 12, 46, 0, 52);
  ctx.bezierCurveTo(-12, 46, -21, 31, -23, 14);
  ctx.bezierCurveTo(-25, -6, -16, -20, 0, -22);
  ctx.closePath();
  ctx.fillStyle = bGrad;
  ctx.fill();
  ctx.strokeStyle = col(pal, 'body', 0.3, 1);
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // 分节纹
  ctx.strokeStyle = col(pal, 'mark', 0.45, 0.2);
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-13, 10); ctx.bezierCurveTo(-5, 15, 5, 15, 13, 10);
  ctx.moveTo(-11, 22); ctx.bezierCurveTo(-4, 26, 4, 26, 11, 22);
  ctx.moveTo(-8, 34);  ctx.bezierCurveTo(-3, 37, 3, 37, 8, 34);
  ctx.stroke();

  ctx.strokeStyle = col(pal, 'body', 0.15, 0.48);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(0, 4); ctx.lineTo(0, 46);
  ctx.stroke();

  // 蓬松暗影领羽
  ctx.beginPath();
  ctx.moveTo(-28, -12);
  ctx.bezierCurveTo(-31, -2, -26, 8, -18, 14);
  ctx.bezierCurveTo(-22, 19, -16, 24, -9, 20);
  ctx.bezierCurveTo(-6, 27, 0, 29, 0, 29);
  ctx.bezierCurveTo(0, 29, 6, 27, 9, 20);
  ctx.bezierCurveTo(16, 24, 22, 19, 18, 14);
  ctx.bezierCurveTo(26, 8, 31, -2, 28, -12);
  ctx.bezierCurveTo(18, -22, -18, -22, -28, -12);
  ctx.closePath();
  ctx.fillStyle = col(pal, 'body', 1, 1);
  ctx.fill();
  ctx.strokeStyle = col(pal, 'body', 0.2, 1);
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = col(pal, 'mark', 0.35, 0.22);
  ctx.lineWidth = 0.95;
  ctx.beginPath();
  ctx.moveTo(-24, -6); ctx.bezierCurveTo(-21, 2, -15, 7, -10, 10);
  ctx.moveTo(24, -6);  ctx.bezierCurveTo(21, 2, 15, 7, 10, 10);
  ctx.moveTo(-12, 6);  ctx.bezierCurveTo(-8, 13, -4, 17, 0, 19);
  ctx.moveTo(12, 6);   ctx.bezierCurveTo(8, 13, 4, 17, 0, 19);
  ctx.stroke();

  ctx.restore();
}

function drawHeadBase(ctx, pal, headY, headRot) {
  ctx.save();
  ctx.translate(0, headY);
  ctx.rotate(headRot * DEG);

  // 左右冠缕
  ctx.fillStyle = col(pal, 'body', 1.3, 1);
  ctx.strokeStyle = col(pal, 'body', 0.3, 1);
  ctx.lineWidth = 0.9;
  for (let s = -1; s <= 1; s += 2) {
    ctx.beginPath();
    ctx.moveTo(s * 14, -16);
    ctx.bezierCurveTo(s * 26, -23, s * 38, -22, s * 46, -16);
    ctx.bezierCurveTo(s * 37, -15, s * 29, -12, s * 22, -7);
    ctx.bezierCurveTo(s * 30, -8, s * 36, -6, s * 41, -2);
    ctx.bezierCurveTo(s * 32, -1, s * 24, 0, s * 18, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // 面具头颅
  const hGrad = ctx.createLinearGradient(0, -22, 0, 25);
  hGrad.addColorStop(0, col(pal, 'body', 1.75, 1));
  hGrad.addColorStop(0.48, col(pal, 'body', 1, 1));
  hGrad.addColorStop(1, col(pal, 'body', 0.35, 1));

  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.bezierCurveTo(13, -22, 23, -14, 23, -1);
  ctx.bezierCurveTo(23, 10, 15, 19, 6, 23);
  ctx.bezierCurveTo(2, 25, -2, 25, -6, 23);
  ctx.bezierCurveTo(-15, 19, -23, 10, -23, -1);
  ctx.bezierCurveTo(-23, -14, -13, -22, 0, -22);
  ctx.closePath();
  ctx.fillStyle = hGrad;
  ctx.fill();
  ctx.strokeStyle = col(pal, 'body', 0, 1);
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // 眉脊与下颌线
  ctx.strokeStyle = col(pal, 'mark', 0.55, 0.26);
  ctx.lineWidth = 1.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-19, -5);
  ctx.bezierCurveTo(-12, -12, -4, -11, 0, -5);
  ctx.bezierCurveTo(4, -11, 12, -12, 19, -5);
  ctx.stroke();

  ctx.strokeStyle = col(pal, 'mark', 0, 0.18);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-14, 12);
  ctx.bezierCurveTo(-8, 17, -3, 20, 0, 21);
  ctx.bezierCurveTo(3, 20, 8, 17, 14, 12);
  ctx.stroke();

  // 深陷眼窝
  ctx.fillStyle = col(pal, 'body', 0, 1);
  for (let s = -1; s <= 1; s += 2) {
    ctx.beginPath();
    ctx.moveTo(s * 16, 0);
    ctx.bezierCurveTo(s * 12, -5, s * 6, -4, s * 3, 1);
    ctx.bezierCurveTo(s * 6, 5, s * 12, 5, s * 16, 0);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawEyes(ctx, pal, headY, headRot, eyeOpen, eyeGlow) {
  if (eyeGlow <= 0.01) return;
  ctx.save();
  ctx.translate(0, headY);
  ctx.rotate(headRot * DEG);

  // 用径向渐变 + lighter 叠加做冷白发光，避免昂贵的 shadowBlur/filter
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let s = -1; s <= 1; s += 2) {
    const ex = s * 9.6;
    const ey = 0.4;
    const r = 13 * (0.7 + 0.3 * eyeOpen);
    const g = ctx.createRadialGradient(ex, ey, 0.5, ex, ey, r);
    g.addColorStop(0, col(pal, 'eye', 2.4, 0.52 * eyeGlow));
    g.addColorStop(0.45, col(pal, 'eye', 1, 0.22 * eyeGlow));
    g.addColorStop(1, col(pal, 'eye', 0, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ex, ey, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 锐利双眸核心
  for (let s = -1; s <= 1; s += 2) {
    ctx.save();
    ctx.translate(s * 9.6, 0.4);
    ctx.scale(s, Math.max(0.05, eyeOpen));

    ctx.fillStyle = col(pal, 'eye', 2, eyeGlow);
    ctx.beginPath();
    ctx.moveTo(5.4, -1.1);
    ctx.bezierCurveTo(2.2, -3.4, -2.4, -2.6, -5.2, 0.5);
    ctx.bezierCurveTo(-2.2, 2.8, 2.4, 2.4, 5.4, -1.1);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = col(pal, 'eye', 3, eyeGlow);
    ctx.beginPath();
    ctx.moveTo(3.8, -0.7);
    ctx.bezierCurveTo(1.5, -2.2, -1.6, -1.7, -3.7, 0.3);
    ctx.bezierCurveTo(-1.5, 1.8, 1.6, 1.5, 3.8, -0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

function drawOrb(ctx, pal, x, y, pulse, brightness, showClasp) {
  if (brightness <= 0.01) return;
  ctx.save();
  ctx.translate(x, y);

  // 外层柔和晕光
  const outerR = (37 + pulse * 7.5) * (0.7 + 0.3 * brightness);
  const gOut = ctx.createRadialGradient(0, 0, 0, 0, 0, outerR);
  gOut.addColorStop(0, col(pal, 'orb', 2, 0.72 * brightness));
  gOut.addColorStop(0.28, col(pal, 'orb', 1.1, 0.44 * brightness));
  gOut.addColorStop(0.62, col(pal, 'orb', 0.4, 0.16 * brightness));
  gOut.addColorStop(1, col(pal, 'orb', 0.4, 0));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = gOut;
  ctx.beginPath();
  ctx.arc(0, 0, outerR, 0, Math.PI * 2);
  ctx.fill();

  // 中层光环
  const midR = (14.8 + pulse * 2.8) * (0.75 + 0.25 * brightness);
  const gMid = ctx.createRadialGradient(0, 0, 0, 0, 0, midR);
  gMid.addColorStop(0, col(pal, 'orb', 3, 0.96 * brightness));
  gMid.addColorStop(0.45, col(pal, 'orb', 2.25, 0.85 * brightness));
  gMid.addColorStop(0.8, col(pal, 'orb', 1, 0.38 * brightness));
  gMid.addColorStop(1, col(pal, 'orb', 1, 0));
  ctx.fillStyle = gMid;
  ctx.beginPath();
  ctx.arc(0, 0, midR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 纤小托爪
  if (showClasp) {
    ctx.strokeStyle = mixCol(pal, 'body', 2.5, 'orb', 0, 0.34, brightness);
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2.2, -6.5);
    ctx.quadraticCurveTo(0, -4.2, 2.2, -6.5);
    ctx.moveTo(0, -8);
    ctx.lineTo(0, -5.4);
    ctx.stroke();
  }

  // 高亮核心
  const coreR = (5.9 + pulse * 0.65) * (0.7 + 0.3 * brightness);
  const gCore = ctx.createRadialGradient(-coreR * 0.16, -coreR * 0.22, 0.3, 0, 0, coreR);
  gCore.addColorStop(0, col(pal, 'orb', 3, brightness));
  gCore.addColorStop(0.45, col(pal, 'orb', 2.75, brightness));
  gCore.addColorStop(0.82, col(pal, 'orb', 1.95, brightness));
  gCore.addColorStop(1, col(pal, 'orb', 0.8, brightness));
  ctx.fillStyle = gCore;
  ctx.beginPath();
  ctx.arc(0, 0, coreR, 0, Math.PI * 2);
  ctx.fill();

  // 核心柔高光
  ctx.fillStyle = col(pal, 'orb', 3, 0.82 * brightness);
  ctx.beginPath();
  ctx.ellipse(-1.6, -1.8, 2.1, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawTailAndLure(ctx, pal, state, tailAlpha, orbPulse, orbBrightness) {
  const pts = state.tailPts;
  if (!pts || pts.length < 4) return;

  const n = pts.length;
  const leftSide = new Array(n);
  const rightSide = new Array(n);

  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(n - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const w = pts[i].hw;
    leftSide[i] = { x: pts[i].x + nx * w, y: pts[i].y + ny * w };
    rightSide[i] = { x: pts[i].x - nx * w, y: pts[i].y - ny * w };
  }

  const tip = pts[n - 1];

  if (tailAlpha > 0.01) {
    ctx.save();
    if (tailAlpha < 0.999) ctx.globalAlpha *= tailAlpha;

    const tGrad = ctx.createLinearGradient(0, 47, 0, 255);
    tGrad.addColorStop(0, col(pal, 'body', 1.1, 1));
    tGrad.addColorStop(0.7, col(pal, 'body', 2.1, 1));
    tGrad.addColorStop(0.93, col(pal, 'body', 3, 1));
    tGrad.addColorStop(1, mixCol(pal, 'body', 2.6, 'orb', 0, 0.28, 1));

    ctx.beginPath();
    ctx.moveTo(leftSide[0].x, leftSide[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(leftSide[i].x, leftSide[i].y);
    ctx.quadraticCurveTo(tip.x + 1.2, tip.y + 0.5, rightSide[n - 1].x, rightSide[n - 1].y);
    for (let i = n - 2; i >= 0; i--) ctx.lineTo(rightSide[i].x, rightSide[i].y);
    ctx.closePath();
    ctx.fillStyle = tGrad;
    ctx.fill();
    ctx.strokeStyle = col(pal, 'body', 0.4, 1);
    ctx.lineWidth = 0.9;
    ctx.stroke();

    // 侧缘反光脊线
    ctx.strokeStyle = col(pal, 'mark', 1.6, 0.26);
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(leftSide[1].x * 0.65 + pts[1].x * 0.35, leftSide[1].y * 0.65 + pts[1].y * 0.35);
    for (let i = 2; i < n - 3; i++) {
      ctx.lineTo(leftSide[i].x * 0.62 + pts[i].x * 0.38, leftSide[i].y * 0.62 + pts[i].y * 0.38);
    }
    ctx.stroke();

    // 末梢暖金反光
    const rimStart = n - 6;
    ctx.strokeStyle = col(pal, 'orb', 2, (0.32 + orbPulse * 0.25) * orbBrightness);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(rightSide[rimStart].x, rightSide[rimStart].y);
    for (let i = rimStart + 1; i < n; i++) ctx.lineTo(rightSide[i].x, rightSide[i].y);
    ctx.stroke();

    // 节纹
    ctx.strokeStyle = col(pal, 'body', 0.3, 0.52);
    ctx.lineWidth = 1.1;
    const segIdx = [3, 6, 9, 12, 15, 18];
    ctx.beginPath();
    for (let k = 0; k < segIdx.length; k++) {
      const idx = segIdx[k];
      if (idx < n) {
        ctx.moveTo(leftSide[idx].x * 0.85 + pts[idx].x * 0.15, leftSide[idx].y * 0.85 + pts[idx].y * 0.15);
        ctx.lineTo(rightSide[idx].x * 0.85 + pts[idx].x * 0.15, rightSide[idx].y * 0.85 + pts[idx].y * 0.15);
      }
    }
    ctx.stroke();

    // 垂挂细丝
    if (!state.orbDetached) {
      const fLen = 33;
      const ox = Math.sin(state.pendAngle) * fLen;
      const oy = Math.cos(state.pendAngle) * fLen;
      const cx = ox * 0.45 - state.pendVel * 2.2;
      const cy = oy * 0.52;

      ctx.strokeStyle = mixCol(pal, 'body', 2.5, 'orb', 0, 0.22, 0.82);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.quadraticCurveTo(tip.x + cx, tip.y + cy, tip.x + ox, tip.y + oy - 5);
      ctx.stroke();

      ctx.strokeStyle = col(pal, 'orb', 1.75, 0.65 * orbBrightness);
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.moveTo(tip.x + ox * 0.52, tip.y + oy * 0.52);
      ctx.lineTo(tip.x + ox, tip.y + oy - 5);
      ctx.stroke();
    }

    ctx.restore();
  }

  // 垂挂光点（未脱离时跟在尾尖）
  if (!state.orbDetached) {
    const fLen = 33;
    const ox = tip.x + Math.sin(state.pendAngle) * fLen;
    const oy = tip.y + Math.cos(state.pendAngle) * fLen;
    drawOrb(ctx, pal, ox, oy, orbPulse, orbBrightness, tailAlpha > 0.3);
  }
}

// ================= 模块主定义 =================
const tiko = {
  id: 'tiko',
  height: 30,
  anchor: 'center',
  bounds: { left: -47, right: 47, top: -13, bottom: 30 },
  events: ['appear', 'idle', 'ready', 'attack', 'hit', 'heavyHit', 'hide', 'blowOpen', 'die'],

  params: {
    flapSpeed: 2.56,
    hoverAmp: 1.3,
    dartInterval: 4.5,
    dartDist: 12,
    hideSpeed: 4.2,
    readyFlapSpeed: 4.8,
    appearDuration: 1.55,
    attackDuration: 1.08,
    attackHitAt: 0.46,
    hitDuration: 0.78,
    heavyHitDuration: 1.65,
    blowOpenDuration: 1.05,
    dieDuration: 2.2
  },

  create(p, opt = {}) {
    const seed = typeof opt.seed === 'number' ? opt.seed : 42;
    const rng = makeRng(seed);
    const palRgb = buildColorCache(opt.palette);

    const state = {
      seed,
      seedOffset: rng() * 100,
      rng,
      palette: opt.palette || null,
      palRgb,

      // 时间与相位（仅由 dt 累加）
      t: 0,
      flapPhase: rng() * Math.PI * 2,

      // 动作槽状态
      action: 'idle',
      actionTime: 0,
      inReady: false,
      dead: false,
      deadDone: false,

      // 躲光持续状态（不占动作槽）
      hideTarget: 0,
      hideAmount: 0,
      hideJar: 0,       // 裹着挨打时短暂弹开量

      // 待机突然侧闪状态
      dartTimer: 2.4 + rng() * 2.4,
      dartActive: false,
      dartTime: 0,
      dartDur: 0.36,
      dartDir: rng() < 0.5 ? -1 : 1,
      dartBaseX: 0,
      dartFromX: 0,
      dartTargetX: 0,
      dartX: 0,
      dartVelX: 0,

      // 眨眼状态
      nextBlink: 2.8 + rng() * 3.0,
      blinkStart: -1,
      doubleBlink: false,

      // 重击断翅持续下垂状态
      brokenSide: 1,
      brokenTimer: 0,
      brokenMax: 1.15,

      // 尾巴采样点与单摆
      tailPts: [],
      pendAngle: 0.04,
      pendVel: 0,
      prevTipX: 0,
      hasPrevTip: false,

      // 死亡/出场脱离光点状态（单位：厘米）
      orbDetached: false,
      orbWorldX: 0,
      orbWorldY: 24,
      orbWorldVx: 0,
      orbWorldVy: 0,
      orbGroundAlpha: 1,

      // 局部世界碎屑粒子（单位：厘米）
      particles: [],

      // 攻击全屏特效状态（供 drawScreen 使用）
      screenFx: {
        active: false,
        time: 0,
        duration: 0.44,
        slashes: [],
        shadowDir: 1
      },

      // 标记本帧是否触发过攻击命中
      attackHitFired: false,
      dieTearFired: false,
      dieBodyDissolved: false
    };

    // 初始化尾巴几何，防止首帧 draw 早于 update
    updateTailPhysics(state, 0.016, 0, 0);
    return state;
  },

  trigger(state, name, data = {}) {
    if (!state || !name) return;

    // 死亡最高优先级：已死则忽略非 die 事件
    if (state.dead && name !== 'die') return;

    if (name === 'hide') {
      const amt = data && typeof data.amount === 'number' ? data.amount : 0;
      state.hideTarget = clamp(amt, 0, 1);
      return;
    }

    if (tiko.events.indexOf(name) === -1) return;

    // 取消正在进行的待机侧闪（平滑停在当前偏移）
    if (name !== 'idle') {
      state.dartActive = false;
    }

    if (name === 'die') {
      state.dead = true;
      state.deadDone = false;
      state.inReady = false;
      state.action = 'die';
      state.actionTime = 0;
      state.dieTearFired = false;
      state.dieBodyDissolved = false;
      state.orbDetached = false;
      state.orbGroundAlpha = 1;
      spawnDebris(state, 16, 48, 20, 1.0, true);
      return;
    }

    if (name === 'ready') {
      state.inReady = true;
      state.action = 'ready';
      state.actionTime = 0;
      return;
    }

    if (name === 'idle') {
      state.inReady = false;
      state.action = 'idle';
      state.actionTime = 0;
      return;
    }

    if (name === 'appear') {
      state.inReady = false;
      state.action = 'appear';
      state.actionTime = 0;
      state.dartX = 0;
      state.dartTargetX = 0;
      return;
    }

    if (name === 'attack') {
      state.inReady = false;
      state.action = 'attack';
      state.actionTime = 0;
      state.attackHitFired = false;
      const hitAt = clamp(tiko.params.attackHitAt, 0.15, Math.max(0.2, tiko.params.attackDuration - 0.2));
      return { hitAt };
    }

    if (name === 'hit') {
      state.action = 'hit';
      state.actionTime = 0;
      const wrapped = state.hideAmount >= 0.45;
      if (wrapped) {
        // 裹着时挨打：翅膀被短暂震开一点又合上，碎屑少
        state.hideJar = 0.36;
        spawnDebris(state, 3, 14, 16, 0.55, false);
      } else {
        spawnDebris(state, 9, 34, 18, 0.95, false);
      }
      return;
    }

    if (name === 'heavyHit') {
      state.action = 'heavyHit';
      state.actionTime = 0;
      state.brokenSide = state.rng() < 0.5 ? 1 : -1;
      state.brokenTimer = state.brokenMax;
      const wrapped = state.hideAmount >= 0.45;
      if (wrapped) {
        state.hideJar = 0.58;
        spawnDebris(state, 7, 22, 18, 0.85, false);
      } else {
        spawnDebris(state, 16, 42, 22, 1.25, true);
      }
      return;
    }

    if (name === 'blowOpen') {
      state.action = 'blowOpen';
      state.actionTime = 0;
      state.hideTarget = 0;
      state.hideJar = 0.9;
      spawnDebris(state, 10, 32, 20, 1.15, false);
      return;
    }
  },

  update(state, dt, p) {
    if (!state) return;
    const safeDt = clamp(typeof dt === 'number' && isFinite(dt) ? dt : 0.016, 0, 0.05);
    state.t += safeDt;
    state.actionTime += safeDt;

    // 颜色表热切换兼容（如预览页换色）
    if (state.palette && state.palette !== state._lastPal) {
      state.palRgb = buildColorCache(state.palette);
      state._lastPal = state.palette;
    }

    // 1. 躲光平滑过渡（绝不跳变）
    const hideLerp = 1 - Math.exp(-tiko.params.hideSpeed * safeDt);
    state.hideAmount += (state.hideTarget - state.hideAmount) * hideLerp;
    if (Math.abs(state.hideAmount - state.hideTarget) < 0.001) {
      state.hideAmount = state.hideTarget;
    }
    if (state.hideJar > 0) {
      state.hideJar = Math.max(0, state.hideJar - safeDt * 2.6);
    }

    // 2. 重击断翅计时衰减
    if (state.brokenTimer > 0) {
      state.brokenTimer = Math.max(0, state.brokenTimer - safeDt);
    }

    // 3. 振翅相位推进（ready / attack / hit 时更快）
    let fSpeed = tiko.params.flapSpeed;
    if (state.action === 'ready') fSpeed = tiko.params.readyFlapSpeed;
    else if (state.action === 'attack') fSpeed = tiko.params.flapSpeed * 2.2;
    else if (state.action === 'hit' || state.action === 'heavyHit' || state.action === 'blowOpen') {
      fSpeed = tiko.params.flapSpeed * 2.5;
    }
    state.flapPhase += safeDt * fSpeed;

    // 4. 待机突然左右侧闪（连续缓动 + 冲过头 + 回弹，绝非瞬移）
    if (state.action === 'idle') {
      if (!state.dartActive) {
        state.dartTimer -= safeDt;
        if (state.dartTimer <= 0) {
          state.dartActive = true;
          state.dartTime = 0;
          state.dartDur = 0.34 + state.rng() * 0.1;
          state.dartFromX = state.dartX;
          // 在 [-dartDist, +dartDist] 之间往另一侧闪动
          const dist = tiko.params.dartDist;
          if (Math.abs(state.dartX) > dist * 0.4) {
            state.dartDir = state.dartX > 0 ? -1 : 1;
          } else {
            state.dartDir = state.rng() < 0.5 ? -1 : 1;
          }
          state.dartTargetX = clamp(state.dartX + state.dartDir * dist, -dist, dist);
        }
      } else {
        state.dartTime += safeDt;
        const u = clamp(state.dartTime / state.dartDur, 0, 1);
        const eased = easeOutBack(u, 2.15);
        const prevX = state.dartX;
        state.dartX = lerp(state.dartFromX, state.dartTargetX, eased);
        state.dartVelX = (state.dartX - prevX) / Math.max(0.001, safeDt);
        if (u >= 1) {
          state.dartActive = false;
          state.dartX = state.dartTargetX;
          state.dartVelX = 0;
          const iv = Math.max(1.2, tiko.params.dartInterval);
          state.dartTimer = iv * (0.72 + state.rng() * 0.56);
        }
      }
    } else {
      // 非待机时平滑拉回水平中心
      const prevX = state.dartX;
      state.dartX += (0 - state.dartX) * (1 - Math.exp(-5 * safeDt));
      state.dartVelX = (state.dartX - prevX) / Math.max(0.001, safeDt);
    }

    // 5. 各动作生命周期与关键事件点
    if (state.action === 'appear') {
      if (state.actionTime >= tiko.params.appearDuration) {
        state.action = state.inReady ? 'ready' : 'idle';
        state.actionTime = 0;
      }
    } else if (state.action === 'attack') {
      const hitAt = clamp(tiko.params.attackHitAt, 0.15, Math.max(0.2, tiko.params.attackDuration - 0.2));
      if (!state.attackHitFired && state.actionTime >= hitAt) {
        state.attackHitFired = true;
        // 触发全屏斜划痕与翅影扫屏
        const fx = state.screenFx;
        fx.active = true;
        fx.time = 0;
        fx.duration = 0.46;
        fx.shadowDir = state.rng() < 0.5 ? 1 : -1;
        fx.slashes = [
          { x0: 0.22, y0: 0.18, x1: 0.78, y1: 0.72, delay: 0.0, width: 1.0 },
          { x0: 0.76, y0: 0.20, x1: 0.26, y1: 0.76, delay: 0.045, width: 0.92 },
          { x0: 0.34, y0: 0.14, x1: 0.84, y1: 0.62, delay: 0.075, width: 0.62 }
        ];
      }
      if (state.actionTime >= tiko.params.attackDuration) {
        state.action = 'idle';
        state.actionTime = 0;
      }
    } else if (state.action === 'hit') {
      if (state.actionTime >= tiko.params.hitDuration) {
        state.action = state.inReady ? 'ready' : 'idle';
        state.actionTime = 0;
      }
    } else if (state.action === 'heavyHit') {
      if (state.actionTime >= tiko.params.heavyHitDuration) {
        state.action = state.inReady ? 'ready' : 'idle';
        state.actionTime = 0;
      }
    } else if (state.action === 'blowOpen') {
      if (state.actionTime >= tiko.params.blowOpenDuration) {
        state.action = state.inReady ? 'ready' : 'idle';
        state.actionTime = 0;
      }
    } else if (state.action === 'die') {
      const dur = Math.max(0.6, tiko.params.dieDuration);
      const u = clamp(state.actionTime / dur, 0, 1);

      if (!state.dieTearFired && u >= 0.12) {
        state.dieTearFired = true;
        spawnDebris(state, 26, 68, 26, 0.85, true);
      }
      if (!state.dieBodyDissolved && u >= 0.35) {
        state.dieBodyDissolved = true;
        spawnDebris(state, 18, 16, 18, 0.7, false);
        // 尾巴光点脱离并下坠落地
        const tip = state.tailPts[state.tailPts.length - 1] || { x: 0, y: 250 };
        state.orbDetached = true;
        state.orbWorldX = (tip.x + Math.sin(state.pendAngle) * 33) * SVG_TO_CM;
        state.orbWorldY = (tip.y + Math.cos(state.pendAngle) * 33) * SVG_TO_CM;
        state.orbWorldVx = (state.rng() - 0.5) * 8;
        state.orbWorldVy = 4;
      }

      if (state.orbDetached) {
        const groundY = 27.5;
        state.orbWorldVy += 52 * safeDt;
        state.orbWorldX += state.orbWorldVx * safeDt;
        state.orbWorldY += state.orbWorldVy * safeDt;
        if (state.orbWorldY >= groundY) {
          state.orbWorldY = groundY;
          if (Math.abs(state.orbWorldVy) > 5) {
            state.orbWorldVy = -state.orbWorldVy * 0.28;
            state.orbWorldVx *= 0.55;
          } else {
            state.orbWorldVy = 0;
            state.orbWorldVx *= 0.85;
          }
        }
        // 后半段落地后暗下去、灭
        if (u > 0.65) {
          const fadeU = clamp((u - 0.65) / 0.35, 0, 1);
          state.orbGroundAlpha = (1 - easeInCubic(fadeU)) * (0.8 + 0.2 * Math.sin(state.t * 24));
        }
      }

      if (state.actionTime >= dur && state.particles.length === 0) {
        state.deadDone = true;
      } else if (state.actionTime >= dur + 0.5) {
        state.deadDone = true;
      }
    }

    // 6. 全屏划痕计时
    if (state.screenFx.active) {
      state.screenFx.time += safeDt;
      if (state.screenFx.time >= state.screenFx.duration) {
        state.screenFx.active = false;
      }
    }

    // 7. 粒子更新
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const pt = state.particles[i];
      pt.life += safeDt;
      if (pt.life >= pt.maxLife) {
        state.particles.splice(i, 1);
        continue;
      }
      const damp = Math.exp(-pt.drag * safeDt);
      pt.vx *= damp;
      pt.vy = pt.vy * damp + pt.gravity * safeDt;
      pt.x += pt.vx * safeDt;
      pt.y += pt.vy * safeDt;
      pt.rot += pt.vrot * safeDt;
    }

    // 8. 尾巴与垂挂光点物理更新
    const stroke = Math.sin(state.flapPhase) + 0.17 * Math.sin(2 * state.flapPhase - 0.45);
    const hoverShiftSvg = (state.dartX + Math.sin(state.t * 0.62) * 0.5) / SVG_TO_CM;
    updateTailPhysics(state, safeDt, hoverShiftSvg, Math.max(0, stroke));
  },

  draw(p, state) {
    if (!state || !p || !p.drawingContext) return;
    const ctx = p.drawingContext;
    const pal = state.palRgb;
    const t = state.t;

    ctx.save();

    // ================= 1. 计算基础待机波形 =================
    const phase = state.flapPhase;
    const stroke = Math.sin(phase) + 0.17 * Math.sin(2 * phase - 0.45);
    const strokeVel = Math.cos(phase) + 0.34 * Math.cos(2 * phase - 0.45);
    const lagPhase = phase - 0.52;
    const lowerStroke = Math.sin(lagPhase) + 0.14 * Math.sin(2 * lagPhase - 0.45);
    const breath = Math.sin(t * 1.85);

    // 实际合拢度（扣除挨打/吹开时的临时震开）
    let effHide = clamp(state.hideAmount - state.hideJar, 0, 1);

    // 悬停位置（厘米）
    const hoverAmp = tiko.params.hoverAmp;
    let posX = state.dartX + Math.sin(t * 0.62 + state.seedOffset) * 0.52 * (1 - effHide * 0.45);
    let posY = (-Math.sin(phase - 0.58) * hoverAmp + Math.sin(t * 0.78) * 0.46) * (1 - effHide * 0.48)
      + (Math.sin(t * 1.35) * 0.65 * effHide);
    let bodyRoll = Math.cos(t * 0.62) * 1.15 - clamp(state.dartVelX * 0.42, -16, 16);
    let bodyScale = 1;
    let bodyAlpha = 1;
    let wingTear = 0;
    let tailAlpha = 1;
    let eyeGlow = 0.9 + 0.1 * Math.sin(t * 1.7);
    let orbPulse = 0.5 + 0.35 * Math.sin(t * 2.15) + 0.15 * Math.sin(t * 3.85 + 1.4);
    let orbBrightness = 1;

    // 左右翅膀与利爪姿态覆写增量
    let extraSpread = 0;
    let extraTipFlex = 0;
    let clawLift = 0;
    let clawSpread = 0;
    let clawCross = 0;

    // ================= 2. 按当前动作叠加姿态 =================
    if (state.action === 'appear') {
      const u = clamp(state.actionTime / Math.max(0.2, tiko.params.appearDuration), 0, 1);
      if (u < 0.45) {
        // 雾中飘着一颗光点
        const driftU = u / 0.45;
        const ox = Math.sin(driftU * Math.PI * 2.4 + state.seedOffset) * 7 * (1 - driftU * 0.75);
        const oy = lerp(24, 18, smoothstep(driftU)) + Math.cos(driftU * Math.PI * 3) * 1.8 * (1 - driftU);
        ctx.scale(SVG_TO_CM, SVG_TO_CM);
        drawOrb(ctx, pal, ox / SVG_TO_CM, oy / SVG_TO_CM, orbPulse, smoothstep(driftU * 2.5), false);
        ctx.restore();
        return;
      } else if (u < 0.62) {
        // 光点停住、往上一提
        const liftU = (u - 0.45) / 0.17;
        const oy = lerp(18, 8, easeOutCubic(liftU));
        const flare = 1 + Math.sin(liftU * Math.PI) * 0.85;
        ctx.scale(SVG_TO_CM, SVG_TO_CM);
        drawOrb(ctx, pal, 0, oy / SVG_TO_CM, orbPulse * flare, 1, false);
        ctx.restore();
        return;
      } else {
        // 翅膀展开、眼睛亮起
        const unfurlU = (u - 0.62) / 0.38;
        const openEase = easeOutBack(unfurlU, 1.35);
        effHide = clamp(lerp(1, effHide, clamp(openEase, 0, 1.08)), 0, 1);
        posY += lerp(6, 0, easeOutCubic(unfurlU));
        bodyAlpha = smoothstep(unfurlU * 2.2);
        tailAlpha = smoothstep(unfurlU * 1.8);
        eyeGlow = smoothstep((unfurlU - 0.25) / 0.55) * (1 + Math.sin(clamp(unfurlU, 0, 1) * Math.PI) * 0.45);
      }
    } else if (state.action === 'ready') {
      extraSpread = 12;
      clawLift = 1;
      clawSpread = 0.7;
      orbPulse = 0.5 + 0.5 * Math.sin(t * 14);
      orbBrightness = 0.9 + 0.35 * Math.sin(t * 14);
      posY -= 1.8;
    } else if (state.action === 'attack') {
      const dur = Math.max(0.4, tiko.params.attackDuration);
      const hitAt = clamp(tiko.params.attackHitAt, 0.15, dur - 0.18);
      const at = state.actionTime;
      const windupEnd = hitAt * 0.58;

      if (at < windupEnd) {
        // 后上方退半个身位、收紧蓄力、举爪、光点急闪
        const u = smoothstep(at / windupEnd);
        posY -= u * 9.5;
        posX -= u * 2.2;
        bodyScale = lerp(1, 0.86, u);
        bodyRoll -= u * 8;
        extraSpread = -22 * u;
        clawLift = u * 1.3;
        clawSpread = u * 1.1;
        orbPulse = 0.6 + 0.4 * Math.sin(t * 28);
        orbBrightness = 1.25;
      } else if (at < hitAt) {
        // 直冲镜头、双爪交叉划过
        const u = easeInCubic((at - windupEnd) / Math.max(0.01, hitAt - windupEnd));
        posY = lerp(-9.5, 4.5, u);
        posX = lerp(-2.2, 0, u);
        bodyScale = lerp(0.86, 2.28, u);
        bodyRoll = lerp(-8, 5, u);
        extraSpread = lerp(-22, 18, u);
        clawLift = lerp(1.3, 1.5, u);
        clawCross = u;
        orbBrightness = 1.35;
      } else {
        // 反冲弹回原位，翅膀乱扑稳住
        const u = clamp((at - hitAt) / Math.max(0.01, dur - hitAt), 0, 1);
        const rec = easeOutBack(u, 1.45);
        posY = lerp(4.5, 0, rec) - Math.sin(u * Math.PI) * 4;
        bodyScale = lerp(2.28, 1.0, easeOutCubic(u));
        bodyRoll = Math.sin(u * Math.PI * 3) * 10 * (1 - u);
        extraSpread = Math.sin(u * Math.PI * 4.5) * 16 * (1 - u);
        clawCross = Math.max(0, 1 - u * 3);
        clawLift = Math.max(0, 1 - u * 1.8);
      }
    } else if (state.action === 'hit') {
      const u = clamp(state.actionTime / Math.max(0.2, tiko.params.hitDuration), 0, 1);
      const wrapped = state.hideAmount >= 0.45;
      if (wrapped) {
        // 裹着时挨打：后震但稳住，不翻圈
        const kick = Math.sin(u * Math.PI) * (1 - u * 0.4);
        posY -= kick * 5.5;
        bodyRoll += Math.sin(u * Math.PI * 2.5) * 12 * (1 - u);
        bodyScale = 1 - kick * 0.08;
      } else {
        // 张开挨打：往后一仰、翻半圈再稳回
        const arc = Math.sin(u * Math.PI);
        posY -= arc * 10.5;
        bodyScale = 1 - arc * 0.14;
        bodyRoll += Math.sin(u * Math.PI) * 180;
        extraSpread = Math.sin(u * Math.PI * 5) * 18 * (1 - u);
        extraTipFlex = Math.cos(u * Math.PI * 5) * 20 * (1 - u);
      }
    } else if (state.action === 'heavyHit') {
      const u = clamp(state.actionTime / Math.max(0.4, tiko.params.heavyHitDuration), 0, 1);
      const spinPhase = clamp(u / 0.52, 0, 1);
      const spinArc = Math.sin(spinPhase * Math.PI);
      posY -= spinArc * 13.5;
      bodyScale = 1 - spinArc * 0.16;
      // 整整翻过去一圈（360°）
      bodyRoll += easeOutCubic(spinPhase) * 360 * state.brokenSide;
      extraSpread = Math.sin(u * Math.PI * 6) * 20 * (1 - u);
    } else if (state.action === 'blowOpen') {
      const u = clamp(state.actionTime / Math.max(0.3, tiko.params.blowOpenDuration), 0, 1);
      const gust = Math.sin(u * Math.PI);
      posY -= gust * 11;
      bodyRoll += Math.sin(u * Math.PI * 2.2) * 145 * (1 - u * 0.55);
      extraSpread = gust * 28;
      extraTipFlex = -gust * 22;
      clawSpread = gust * 1.1;
    } else if (state.action === 'die') {
      const u = clamp(state.actionTime / Math.max(0.6, tiko.params.dieDuration), 0, 1);
      wingTear = smoothstep(u / 0.45);
      bodyAlpha = 1 - smoothstep((u - 0.22) / 0.35);
      tailAlpha = 1 - smoothstep((u - 0.25) / 0.3);
      eyeGlow = Math.max(0, 1 - u * 3.2);
      posY += u * 4;
      bodyRoll += Math.sin(u * Math.PI * 3) * 22;
    }

    // ================= 3. 合成左右翅膀姿态（同一套翅膀在张开 ↔ 裹起间连续过渡） =================
    const w = smoothstep(effHide);
    const microAsym = Math.sin(t * 0.9) * 0.6;
    const cloakBreathRot = breath * 1.45;
    const cloakScaleX = 0.43 + breath * 0.012;
    const cloakScaleY = 0.68 - breath * 0.01;
    const tipBreath = Math.sin(t * 1.85 - 0.5) * 1.8;
    const lowerBreath = Math.sin(t * 1.85 - 0.7) * 1.6;

    const openMainRot = stroke * 17.5 - 3.5 - extraSpread * 0.75;
    const openMainScaleX = 1 - 0.088 * (stroke * stroke) - 0.024 * Math.max(0, stroke) + extraSpread * 0.004;
    const openMainScaleY = 1 + 0.036 * stroke;
    const openTipRot = -strokeVel * 7.8 + extraTipFlex;
    const openTipScaleX = 1 + 0.02 * stroke;
    const openLowerRot = lowerStroke * 12.5 + 1.5 - extraSpread * 0.35;
    const openLowerScaleX = 1 - 0.055 * (lowerStroke * lowerStroke);
    const openLowerScaleY = 1 + 0.045 * lowerStroke;

    // 重击断翅效果（单侧翼尖打折下垂晃动再撑开）
    const brokenFactor = state.brokenTimer > 0
      ? smoothstep(Math.min(1, state.brokenTimer / 0.28)) * (1 - w * 0.7)
      : 0;

    function buildWingPose(side) {
      const asym = side > 0 ? microAsym : -microAsym;
      const isBroken = brokenFactor > 0.01 && side === state.brokenSide;
      const droopTip = isBroken ? (56 + Math.sin(t * 9) * 10) * brokenFactor : 0;
      const droopMain = isBroken ? (24 + Math.sin(t * 7.5) * 5) * brokenFactor : 0;

      return {
        anchorX: lerp(14, side > 0 ? 6 : 8, w),
        anchorY: lerp(-6, -15, w),
        mainRot: lerp(openMainRot + asym, (side > 0 ? 92 : 94) + (side > 0 ? cloakBreathRot : -cloakBreathRot * 0.8), w) + droopMain,
        mainScaleX: lerp(openMainScaleX, cloakScaleX, w),
        mainScaleY: lerp(openMainScaleY, cloakScaleY, w),
        tipRot: lerp(openTipRot, (side > 0 ? 12 : 14) + (side > 0 ? tipBreath : -tipBreath * 0.7), w) + droopTip,
        tipScaleX: lerp(openTipScaleX, 0.82, w),
        tipScaleY: lerp(1, 0.80, w),
        lowerRot: lerp(openLowerRot + (side > 0 ? 0 : -microAsym * 0.7), (side > 0 ? 66 : 68) + (side > 0 ? lowerBreath : -lowerBreath * 0.8), w) + droopMain * 0.5,
        lowerScaleX: lerp(openLowerScaleX, 0.48, w),
        lowerScaleY: lerp(openLowerScaleY, 0.64, w)
      };
    }

    const leftWingPose = buildWingPose(-1);
    const rightWingPose = buildWingPose(1);

    // 利爪姿态
    const clawSwayL = Math.sin(phase - 1.1) * 4.2 + Math.sin(t * 1.05) * 1.8;
    const clawSwayR = -Math.sin(phase - 1.25) * 4.2 + Math.cos(t * 0.95) * 1.8;
    function buildClawPose(side) {
      const sway = side < 0 ? clawSwayL : clawSwayR;
      return {
        clawX: lerp(12, 7, w) + clawSpread * 14 - clawCross * 22,
        clawY: lerp(34, 30, w) - clawLift * 24,
        clawRot: lerp(sway, 14, w) - clawLift * 28 - clawCross * 52,
        clawScale: lerp(1, 0.82, w) + clawCross * 0.38
      };
    }
    const leftClawPose = buildClawPose(-1);
    const rightClawPose = buildClawPose(1);

    // 躯干呼吸与头部稳态
    const torsoBreath = lerp(Math.sin(phase - 0.9), breath, w);
    const torsoScaleX = 1 + torsoBreath * 0.022;
    const torsoScaleY = 1 - torsoBreath * 0.014;
    const headY = -24 + torsoBreath * 0.8;
    const headCounterRot = -bodyRoll * 0.45 + Math.sin(t * 0.85) * 0.9;
    const eyeOpen = computeEyeOpenness(state);

    // ================= 4. 绘制主体（厘米坐标 -> SVG 内部比例） =================
    ctx.save();
    ctx.translate(posX, posY);
    ctx.rotate(bodyRoll * DEG);
    ctx.scale(bodyScale * SVG_TO_CM, bodyScale * SVG_TO_CM);

    // (1) 尾巴与垂挂光点（未脱离时）
    drawTailAndLure(ctx, pal, state, tailAlpha, orbPulse, orbBrightness);

    const wingsInFront = w > 0.52;

    // (2) 展开态：双翼在身子后面
    if (!wingsInFront && bodyAlpha > 0.01) {
      drawOneWing(ctx, pal, -1, leftWingPose, wingTear);
      drawOneWing(ctx, pal, 1, rightWingPose, wingTear);
    }

    // (3) 利爪、躯干、头部面具
    if (bodyAlpha > 0.01) {
      ctx.save();
      if (bodyAlpha < 0.999) ctx.globalAlpha *= bodyAlpha;
      drawClawSide(ctx, pal, -1, leftClawPose);
      drawClawSide(ctx, pal, 1, rightClawPose);
      drawTorso(ctx, pal, torsoScaleX, torsoScaleY);
      drawHeadBase(ctx, pal, headY, headCounterRot);
      ctx.restore();
    }

    // (4) 裹起态：同一套翅膀折在身前、盖住身子与利爪
    if (wingsInFront && bodyAlpha > 0.01) {
      drawOneWing(ctx, pal, -1, leftWingPose, wingTear);
      drawOneWing(ctx, pal, 1, rightWingPose, wingTear);
    }

    // (5) 两只冷白小眼睛始终在最上层
    if (bodyAlpha > 0.01) {
      drawEyes(ctx, pal, headY, headCounterRot, eyeOpen, eyeGlow * bodyAlpha);
    }

    ctx.restore();

    // ================= 5. 死亡脱离落地光点（厘米坐标） =================
    if (state.orbDetached && state.orbGroundAlpha > 0.01) {
      ctx.save();
      ctx.translate(state.orbWorldX, state.orbWorldY);
      ctx.scale(SVG_TO_CM, SVG_TO_CM);
      drawOrb(ctx, pal, 0, 0, orbPulse * 0.6, state.orbGroundAlpha, false);
      ctx.restore();
    }

    // ================= 6. 碎屑粒子（厘米坐标） =================
    if (state.particles.length > 0) {
      for (let i = 0; i < state.particles.length; i++) {
        const pt = state.particles[i];
        const a = 1 - easeInCubic(pt.life / pt.maxLife);
        if (a <= 0.01) continue;
        ctx.save();
        ctx.translate(pt.x, pt.y);
        ctx.rotate(pt.rot);
        ctx.fillStyle = col(pal, pt.kind, pt.shade, a * 0.92);
        if (pt.shape === 'shard') {
          const s = pt.size;
          ctx.beginPath();
          ctx.moveTo(-s, -s * 0.3);
          ctx.lineTo(s * 0.9, -s * 0.6);
          ctx.lineTo(s * 0.4, s * 0.75);
          ctx.lineTo(-s * 0.6, s * 0.4);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, pt.size * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    ctx.restore();
  },

  drawScreen(p, state, w, h) {
    if (!state || !state.screenFx.active || !p || !p.drawingContext) return;
    const ctx = p.drawingContext;
    const pal = state.palRgb;
    const fx = state.screenFx;
    const u = clamp(fx.time / fx.duration, 0, 1);

    ctx.save();

    // 1. 翅膀暗影扫过半个屏
    const shadowU = clamp(u / 0.72, 0, 1);
    if (shadowU < 1) {
      const sAlpha = Math.sin(shadowU * Math.PI) * 0.44;
      const sx = fx.shadowDir > 0 ? lerp(-w * 0.35, w * 0.85, easeOutCubic(shadowU)) : lerp(w * 1.35, w * 0.15, easeOutCubic(shadowU));
      const g = ctx.createRadialGradient(sx, h * 0.48, w * 0.05, sx, h * 0.48, w * 0.52);
      g.addColorStop(0, col(pal, 'wing', 0, sAlpha));
      g.addColorStop(0.55, col(pal, 'wing', 1, sAlpha * 0.65));
      g.addColorStop(1, col(pal, 'wing', 2, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // 2. 两三道斜的锐利爪痕（很快淡掉）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < fx.slashes.length; i++) {
      const sl = fx.slashes[i];
      const localT = (fx.time - sl.delay) / (fx.duration - sl.delay);
      if (localT <= 0 || localT >= 1) continue;

      const drawProgress = easeOutCubic(clamp(localT / 0.24, 0, 1));
      const fade = 1 - easeInCubic(clamp((localT - 0.18) / 0.82, 0, 1));
      if (fade <= 0.01) continue;

      const x0 = sl.x0 * w;
      const y0 = sl.y0 * h;
      const x1 = lerp(x0, sl.x1 * w, drawProgress);
      const y1 = lerp(y0, sl.y1 * h, drawProgress);
      const mx = (x0 + x1) * 0.5;
      const my = (y0 + y1) * 0.5;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const thick = (w * 0.011) * sl.width * (0.4 + 0.6 * fade);

      // 外辉光梭形爪痕
      ctx.fillStyle = col(pal, 'fx', 2.2, 0.55 * fade);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(mx + nx * thick * 1.9, my + ny * thick * 1.9, x1, y1);
      ctx.quadraticCurveTo(mx - nx * thick * 1.9, my - ny * thick * 1.9, x0, y0);
      ctx.closePath();
      ctx.fill();

      // 内高亮刃心
      ctx.fillStyle = col(pal, 'fx', 3, 0.92 * fade);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(mx + nx * thick * 0.65, my + ny * thick * 0.65, x1, y1);
      ctx.quadraticCurveTo(mx - nx * thick * 0.65, my - ny * thick * 0.65, x0, y0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  },

  done(state) {
    return !!(state && state.deadDone);
  }
};

// ================= 内部辅助：眨眼与尾巴物理 =================
function computeEyeOpenness(state) {
  const t = state.t;
  if (state.blinkStart < 0 && t >= state.nextBlink) {
    state.blinkStart = t;
    state.doubleBlink = state.rng() < 0.22;
  }
  if (state.blinkStart < 0) return 1;

  const elapsed = t - state.blinkStart;
  const singleDur = 0.42;

  function curve(lt) {
    if (lt < 0.13) {
      const k = lt / 0.13;
      return 1 - 0.95 * k * k;
    } else if (lt < 0.20) {
      return 0.05;
    } else if (lt < singleDur) {
      const k = (lt - 0.20) / (singleDur - 0.20);
      return 0.05 + 0.95 * (1 - Math.pow(1 - k, 2.4));
    }
    return 1;
  }

  if (!state.doubleBlink) {
    if (elapsed >= singleDur) {
      state.blinkStart = -1;
      state.nextBlink = t + 4.4 + state.rng() * 4.2;
      return 1;
    }
    return curve(elapsed);
  }
  const gap = 0.16;
  const total = singleDur * 2 + gap;
  if (elapsed < singleDur) return curve(elapsed);
  if (elapsed < singleDur + gap) return 1;
  if (elapsed < total) return curve(elapsed - singleDur - gap);
  state.blinkStart = -1;
  state.nextBlink = t + 4.8 + state.rng() * 4.4;
  return 1;
}

function updateTailPhysics(state, dt, hoverShiftSvg, wingDownwash) {
  const samples = 20;
  const pts = state.tailPts;
  pts.length = 0;

  const t = state.t;
  const w = state.hideAmount;
  const swayScale = lerp(1.0, 0.58, w);
  const tailLen = 204;

  for (let i = 0; i <= samples; i++) {
    const s = i / samples;
    const swayWeight = Math.pow(s, 1.55);
    const naturalCurve = (Math.sin(s * Math.PI * 1.15) * 14 - Math.pow(s, 2.4) * 10) * lerp(1.0, 0.65, w);
    const wave1 = Math.sin(t * 1.48 - s * 2.7 + state.seedOffset * 0.1) * 20 * swayScale;
    const wave2 = Math.sin(t * 2.45 - s * 4.2 + 0.8) * 5.2 * swayScale;
    const driftCoupling = -hoverShiftSvg * 0.42 * s;
    const tipCurlX = s > 0.82 ? Math.pow((s - 0.82) / 0.18, 2) * 10.5 : 0;
    const tipCurlY = s > 0.84 ? -Math.pow((s - 0.84) / 0.16, 2) * 9.5 : 0;

    const x = naturalCurve + (wave1 + wave2) * swayWeight + driftCoupling + tipCurlX;
    const y = 47 + s * tailLen + Math.sin(t * 1.48 - s * 2.1) * 2.2 * s + wingDownwash * 3.5 * s + tipCurlY;
    const hw = 4.6 * Math.pow(1 - s, 1.35) + 0.95;
    pts.push({ x, y, hw });
  }

  const tip = pts[pts.length - 1];
  if (!state.hasPrevTip) {
    state.prevTipX = tip.x;
    state.hasPrevTip = true;
  }
  const safeDt = clamp(dt, 0.001, 0.05);
  const tipVelX = (tip.x - state.prevTipX) / safeDt;
  state.prevTipX = tip.x;

  const restoring = -14.5 * Math.sin(state.pendAngle);
  const damping = -2.35 * state.pendVel;
  const drive = -tipVelX * 0.032 + Math.sin(t * 1.9 + 0.5) * 0.28;
  state.pendVel += (restoring + damping + drive) * safeDt;
  state.pendAngle = clamp(state.pendAngle + state.pendVel * safeDt, -0.55, 0.55);
}

export default tiko;
