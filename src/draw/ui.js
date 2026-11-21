// 石板风格战斗 HUD 零件 + 大厅/通用基础绘制辅助。
import { drawSlateAsset, drawSlateButton, slateText } from './slate-ui.js';
import { traitOf } from '../explore/roster.js';

export const INK = {
  light: '#ebe5d8', muted: '#a9b8b6', faint: '#6f8285',
  gold: '#f0c27a', warm: '#f2b660', warmHi: '#ffe2a8',
  red: '#e2826f', blood: '#b4483a', cold: '#9db4b6',
  panel: '#121b20', edge: '#3a4f56'
};
const FONT = '"PingFang SC", -apple-system, sans-serif';

export function text(ctx, value, x, y, size = 16, color = INK.light, align = 'left', bold = false) {
  ctx.fillStyle = color;
  ctx.font = (bold ? '600 ' : '400 ') + size + 'px ' + FONT;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), x, y);
}
export function measure(ctx, value, size, bold = false) {
  ctx.font = (bold ? '600 ' : '400 ') + size + 'px ' + FONT;
  return ctx.measureText(String(value)).width;
}
export function shadowText(ctx, value, x, y, size, color, align = 'left', bold = false) {
  ctx.save();
  ctx.shadowColor = 'rgba(2,6,8,.85)'; ctx.shadowBlur = 8;
  text(ctx, value, x, y, size, color, align, bold);
  ctx.restore();
}
export function box(ctx, x, y, w, h, fill, stroke = null, r = 4) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = 1; ctx.strokeStyle = stroke; ctx.stroke(); }
}
export function glow(ctx, x, y, r, color, alpha, sy = 1) {
  if (alpha <= 0 || r <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(x, y); ctx.scale(1, sy);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
}
export function shade(ctx, x, y, r, alpha, sy = 1) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(1, sy);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, `rgba(3,7,9,${alpha})`); g.addColorStop(.6, `rgba(3,7,9,${alpha * .7})`); g.addColorStop(1, 'rgba(3,7,9,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
}
export function rule(ctx, x1, y, x2, color = 'rgba(169,184,182,.35)', width = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.min(x1, x2), Math.round(y) - width / 2, Math.abs(x2 - x1), width);
}
export function lightLine(ctx, x1, x2, y, color, alpha = 1, width = 1) {
  ctx.save();
  const g = ctx.createLinearGradient(x1, 0, x2, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.18, color); g.addColorStop(.82, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x1, y - width / 2, x2 - x1, width);
  ctx.restore();
}
export function diamond(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * .62, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * .62, y); ctx.closePath(); ctx.fill();
}

// 石板按钮（弹窗与场景通用，五态：平时 / 悬停 / 按下 / 选中 / 禁用）
export function drawButton(ctx, rect, label, hover, primary = false, { pressed = false, disabled = false } = {}) {
  drawSlateButton(ctx, '弹窗-按钮', rect, label, { hover, pressed, selected: primary, disabled });
}

// A 符环指针：暖金光核 + 慢转细符环（定死的样子，不改）。
export function drawPointer(ctx, x, y, hover = false) {
  const r = hover ? 9 : 7;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(10,15,18,.7)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = '#f5d294';
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.beginPath();
  const phase = performance.now() * .00065;
  for (let i = 0; i < 3; i++) { const a = phase + i * Math.PI * 2 / 3; ctx.moveTo(x + Math.cos(a) * (r + 2), y + Math.sin(a) * (r + 2)); ctx.arc(x, y, r + 2, a, a + .51); }
  ctx.strokeStyle = '#b7a17c'; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, 2.3, 0, Math.PI * 2);
  ctx.fillStyle = '#ffe5b2';
  ctx.fill();
}

// 石板心（支持满 / 半 / 空，以及掉心时的放大歪斜动画）
export function drawHeart(ctx, x, y, state, size = 34, anim = null) {
  const file = state === 'full' || state === true
    ? '界面-心-满.svg'
    : state === 'half'
      ? '界面-心-半.svg'
      : '界面-心-空.svg';
  ctx.save();
  ctx.translate(x, y);
  if (anim) {
    ctx.scale(anim.scale || 1, anim.scale || 1);
    if (anim.rotate) ctx.rotate(anim.rotate);
  }
  drawSlateAsset(ctx, file, -size / 2, -size / 2, size, size);
  ctx.restore();
}

// 怪头顶石板 HUD：无框，名字 + 血条（0.08s 快速跟随掉血）+ 状态小标 + 倒计时圆盘（剩 1 变红并一大一小跳动）
export function drawMonsterTag(ctx, m, r, status, focused = false, dt = 1 / 60) {
  const cx = r.x + r.w / 2;
  const y = r.y;
  const urgent = m.countdown <= 1;
  const title = (m.kind === 'elite' ? '精英 · ' : '') + m.name;
  slateText(ctx, title, cx, y + 10, 16, focused ? '#fff3dc' : '#eef4f6', 'rgba(4,8,12,.92)', 600);

  const barW = Math.max(132, Math.min(180, r.w));
  const barH = 14;
  const bx = cx - barW / 2;
  const by = y + 22;

  const targetHp = Math.max(0, m.visualHp ?? m.hp);
  if (m.shownHp === undefined || m.shownHp < targetHp) m.shownHp = targetHp;
  else m.shownHp += (targetHp - m.shownHp) * Math.min(1, (dt || 1 / 60) / 0.035);
  const ratio = Math.max(0, Math.min(1, m.shownHp / Math.max(1, m.maxHp)));

  // 1) 槽底暗色
  ctx.save();
  ctx.fillStyle = '#0d1216';
  ctx.beginPath();
  ctx.roundRect(bx + 3, by + 2, barW - 6, barH - 4, 4);
  ctx.fill();
  // 2) 红色血量
  if (ratio > 0) {
    const g = ctx.createLinearGradient(0, by + 2, 0, by + barH - 2);
    g.addColorStop(0, '#e35542');
    g.addColorStop(1, '#98271d');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(bx + 3, by + 2, Math.max(4, (barW - 6) * ratio), barH - 4, 4);
    ctx.fill();
  }
  ctx.restore();
  // 3) 透明血条槽框与高光
  drawSlateAsset(ctx, '界面-血条槽.svg', bx, by, barW, barH);

  // 左侧状态图标（躲光 / 厚皮）
  const trait = traitOf(m.kind);
  const iconFile = trait === 'tiko' ? '界面-状态标-躲光.svg' : '界面-状态标-厚皮.svg';
  drawSlateAsset(ctx, iconFile, bx - 26, by - 5, 22, 22);

  // 右侧倒计时圆盘（剩 1 回合数字变红，一直一大一小跳动：scale 1.0 <-> 1.28）
  const wave = 0.5 + 0.5 * Math.sin(performance.now() * 0.0095);
  const discScale = urgent ? 1 + 0.14 * wave : 1;
  const numScale = urgent ? 1 + 0.28 * wave : 1;
  const cdSize = 28 * discScale;
  const cdCx = bx + barW + 17;
  const cdCy = by + barH / 2;
  drawSlateAsset(ctx, urgent ? '界面-倒计时-紧急.svg' : '界面-倒计时.svg', cdCx - cdSize / 2, cdCy - cdSize / 2, cdSize, cdSize);
  ctx.save();
  ctx.translate(cdCx, cdCy + 1);
  ctx.scale(numScale, numScale);
  slateText(ctx, Math.max(0, m.countdown), 0, 0, urgent ? 15 : 13, urgent ? '#ff6b6b' : '#f7e6c4', 'rgba(6,8,10,.95)', 800);
  ctx.restore();

  if (status.length) {
    slateText(ctx, status.join(' · '), cx, y + 48, 12, '#c8d6dc', 'rgba(4,8,12,.9)', 500);
  }
}

// 鼠标停在怪身上才出现的羊皮纸详情框
export function drawMonsterDetail(ctx, m, r, status) {
  const { x, y, w, h } = r;
  drawSlateAsset(ctx, '界面-怪详情框.svg', x, y, w, h);
  const pad = 20;
  slateText(ctx, m.name, x + pad, y + 24, 16, '#2b1e14', null, 700, 'left');
  slateText(ctx, `${m.hp} / ${m.maxHp}`, x + w - pad, y + 24, 14, '#5a3a26', null, 600, 'right');
  ctx.fillStyle = 'rgba(72,48,30,0.32)';
  ctx.fillRect(x + pad, y + 39, w - pad * 2, 1);
  slateText(ctx, m.rule || '', x + pad, y + 56, 13, '#3a2a1c', null, 500, 'left', w - pad * 2);
  const dmg = m.attackDamage ?? 1;
  const heartStr = dmg === 0.5 ? '半颗心' : `${dmg} 颗心`;
  const sub = (status.length ? status.join(' · ') + '　' : '') + `攻击掉${heartStr} · 倒计时 ${m.countdown}`;
  slateText(ctx, sub, x + pad, y + 78, 12, '#7a3420', null, 600, 'left', w - pad * 2);
}

// 通用石板鼠标提示框（牌堆 / 弃牌堆 / 按钮提示）
export function drawSlateTooltip(ctx, x, y, title, lines, w = 228) {
  const h = 40 + lines.length * 20;
  drawSlateAsset(ctx, '界面-提示框.svg', x, y, w, h);
  slateText(ctx, title, x + 16, y + 20, 14, '#f7e6c4', 'rgba(0,0,0,.75)', 700, 'left', w - 32);
  lines.forEach((line, i) => {
    slateText(ctx, line, x + 16, y + 42 + i * 20, 12, '#cfe0e8', 'rgba(0,0,0,.7)', 500, 'left', w - 32);
  });
}
