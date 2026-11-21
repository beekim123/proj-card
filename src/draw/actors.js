import { WORLD } from '../config.js';
import { drawLootGlow } from './world.js';
import { drawDamageNumber, drawSlateAsset } from './slate-ui.js';

const P = WORLD.palettes;
const TAU = Math.PI * 2;

export function drawMagicCircle(c, x, y, r, time, lit, alpha) {
  c.save();
  c.globalAlpha *= alpha;
  const lamps = Array.isArray(lit) ? lit : null;
  for (const ratio of [1, 0.72]) {
    c.strokeStyle = ratio === 1 ? '#d4b47a' : '#8d7548';
    c.lineWidth = ratio === 1 ? 1.7 : 0.9;
    c.beginPath();
    c.ellipse(x, y, r * ratio, r * 0.27 * ratio, 0, 0, TAU);
    c.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const a = time * 0.27 + (i * TAU) / 6;
    const cx = x + Math.cos(a) * r;
    const cy = y + Math.sin(a) * r * 0.27;
    const on = lamps ? lamps[i] : i === lit;
    c.fillStyle = on ? P.lamp[i] : '#3a4248';
    c.strokeStyle = on ? '#fff3dc' : '#7b8a92';
    c.lineWidth = 1;
    c.beginPath();
    c.ellipse(cx, cy, r * (on ? 0.071 : 0.049), r * (on ? 0.052 : 0.038), 0, 0, TAU);
    c.fill();
    c.stroke();
  }
  c.restore();
}

export function drawCastSequence(c, p, steps, active, time) {
  if (!steps?.length) return;
  const r = Math.min(105, p.w * 0.66);
  const cy = p.top - 12 - r * 0.12;
  const ink = [...P.lamp, '#eef4f6', '#c8b8e2', '#9fb6be'];
  c.save();
  c.translate(p.x, cy);
  c.scale(1, 0.27);
  c.lineCap = 'round';
  steps.forEach(({ card }, i) => {
    const a = time * 0.27 - Math.PI / 2 + (i * TAU) / steps.length;
    const lit = i === active;
    const rad = r * 0.53;
    c.globalAlpha = lit ? 1 : i < active ? 0.25 : 0.6;
    c.strokeStyle = ink[card.col] || '#e8c488';
    c.lineWidth = lit ? 5 : 2.5;
    c.beginPath();
    c.arc(0, 0, rad, a + 0.07, a + TAU / steps.length - 0.07);
    c.stroke();
    if (lit) {
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      c.stroke();
    }
  });
  c.restore();
}

export function paintNumber(c, n, x, y) {
  const u = n.t;
  c.save();
  c.globalAlpha *= Math.min(1, (1 - u) * 3.8);
  const pop = 1 + 0.22 * Math.max(0, 1 - u * 5.5);
  drawDamageNumber(c, n.value, x, y - u * 48, {
    ...n,
    height: (n.kind === 'total' ? 42 : 34) * pop,
  });
  c.restore();
}

export function drawLoot(c, x, y, w, h, time) {
  drawLootGlow(c, x, y, w * 1.26, h * 1.26, time);
  c.save();
  c.translate(x, y);
  c.rotate(-0.085 + 0.035 * Math.sin(time * 1.2));
  const cw = w * 0.72;
  const ch = cw * 1.5;
  drawSlateAsset(c, '牌背.svg', -cw / 2, -ch / 2, cw, ch);
  c.restore();
}

// 施法特效：色光扫过法阵并落到目标身上（颜色贴合石板宝石色系）
export function castFlash(c, p, n, t) {
  if (!n || t > 0.2) return;
  const u = t / 0.2;
  const rad = Math.min(105, p.w * 0.66);
  const y = p.top - 12 - rad * 0.12;
  const hue = ({
    red: '#ff6b5a',
    green: '#54f082',
    blue: '#62a4ff',
    white: '#f2f8ff',
    pure: '#e0a862',
    extra: '#b8ccd6',
  })[n.kind] ?? '#e8c488';
  c.save();
  c.globalAlpha = (1 - u) * 0.88;
  c.strokeStyle = hue;
  c.lineWidth = (n.kind === 'white' ? 3.2 : 2.1) * (1 - u) + 0.6;
  c.beginPath();
  c.ellipse(p.x, y, rad * (1 + u * 0.17), rad * 0.27 * (1 + u * 0.17), 0, TAU * u, TAU * (u + 0.82));
  c.stroke();
  for (const side of [-1, 1]) {
    c.beginPath();
    c.moveTo(p.x + side * rad * 0.65, y + rad * 0.12);
    c.bezierCurveTo(
      p.x + side * rad * 0.71,
      y + p.h * 0.2,
      p.x - side * rad * 0.35,
      y + p.h * 0.32,
      p.x + side * rad * 0.06,
      y + p.h * 0.53
    );
    c.stroke();
  }
  c.restore();
}

// 怪脚下：牌光照在地上的一片暖光，加一小块接地影。飞的怪影子淡、散得开。
export function groundLight(c, foot, p, flying, alpha, death) {
  if (foot.d <= 0.1) return;
  const k = alpha * (1 - death);
  const w = Math.max(p.w * (flying ? 0.5 : 0.7), 30);
  const x = foot.x;
  const y = foot.y;
  if (k <= 0) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  let g = c.createRadialGradient(x, y, 0, x, y, w * 1.3);
  g.addColorStop(0, `rgba(242,170,90,${0.34 * k})`);
  g.addColorStop(0.5, `rgba(200,130,70,${0.13 * k})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.translate(x, y);
  c.scale(1, 0.22);
  c.translate(-x, -y);
  c.fillRect(x - w * 1.3, y - w * 1.3, w * 2.6, w * 2.6);
  c.restore();
  c.save();
  const sw = w * (flying ? 0.45 : 0.55);
  g = c.createRadialGradient(x, y, 0, x, y, sw);
  g.addColorStop(0, `rgba(2,5,7,${(flying ? 0.35 : 0.7) * k})`);
  g.addColorStop(1, 'rgba(2,5,7,0)');
  c.fillStyle = g;
  c.translate(x, y);
  c.scale(1, 0.2);
  c.translate(-x, -y);
  c.fillRect(x - sw, y - sw, sw * 2, sw * 2);
  c.restore();
}
