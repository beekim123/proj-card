// Pointer gestures are presentation-only until a mouse-up lands on a valid zone.
import { HUD } from '../config.js';

export const contains = (r, p) =>
  r.hit ? r.hit(p.x, p.y) : p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export function combatLayout(w, h, lineCount = 0) {
  const trayW = 630;
  const trayH = 124;
  const trayX = (w - trayW) / 2;
  const trayY = h - HUD.trayOffset;
  const n = Math.max(1, lineCount);
  const padX = 24;
  const usable = trayW - padX * 2;
  const pitch = n <= 1
    ? HUD.slotWidth + HUD.slotGap
    : Math.min(HUD.slotWidth + 14, (usable - HUD.slotWidth) / (n - 1));
  const rowW = n === 1 ? HUD.slotWidth : (n - 1) * pitch + HUD.slotWidth;
  return {
    tray: { x: trayX, y: trayY, w: trayW, h: trayH },
    pitch,
    x: w / 2 - rowW / 2,
    y: trayY + (trayH - HUD.slotHeight) / 2,
    width: rowW,
    hand: {
      x: (w - HUD.handSpan) / 2 - 30,
      y: h - HUD.handHeight - 45,
      w: HUD.handSpan + 60,
      h: HUD.handHeight + 45,
    },
  };
}

export function beginDrag(g, zone, p) {
  if (zone.action !== 'play') return;
  const card = g.b?.hand[zone.arg];
  if (!card) return;
  g.cardDrag = {
    source: 'hand',
    card,
    index: zone.arg,
    start: { ...p },
    origin: { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 },
    moving: false,
  };
}

export function moveDrag(g, p) {
  const d = g.cardDrag;
  if (d && !d.returning && Math.hypot(p.x - d.start.x, p.y - d.start.y) > 5) d.moving = true;
}

export function dragDestination(g, p, w, h) {
  const d = g.cardDrag;
  if (!d?.moving || d.returning || g.phase !== 'battle') return null;
  const l = combatLayout(w, h, g.b.line.length);
  if (d.card.instant) {
    // 立即释放的牌：拖出手牌区上方松手即生效。
    return p.y < l.hand.y + 12 ? { where: 'instant' } : null;
  }
  // 进队列的牌：拖到序列槽区域（或手牌区上方）即接在末尾。
  const dropZone = {
    x: l.tray.x - 40,
    y: l.tray.y - 40,
    w: l.tray.w + 80,
    h: l.tray.h + 56,
  };
  return contains(dropZone, p) ? { where: 'line', edge: g.b.line.length } : null;
}

export function releaseDrag(g, p, w, h, act) {
  const d = g.cardDrag;
  if (!d || d.returning) return;
  if (g.phase !== 'battle' || g.b.hand[d.index] !== d.card) {
    g.cardDrag = null;
    return;
  }
  moveDrag(g, p);
  const to = dragDestination(g, p, w, h);
  if (!d.moving) {
    g.cardDrag = null;
    return;
  }
  if (!to) {
    d.returning = { at: { ...p }, time: g.elapsed };
    return;
  }
  act(g, 'play', d.index);
  g.cardDrag = null;
}

export function dragVisual(g, p) {
  const d = g.cardDrag;
  if (!d?.moving) return null;
  if (!d.returning) return p;
  const t = Math.max(0, (g.elapsed - d.returning.time) / 0.19);
  if (t >= 1) {
    g.cardDrag = null;
    return null;
  }
  const k = (1 - t) ** 3;
  return {
    x: d.origin.x + (d.returning.at.x - d.origin.x) * k,
    y: d.origin.y + (d.returning.at.y - d.origin.y) * k,
  };
}

// 选中的怪：四个细角 + 脚下一圈暖光。
export function drawTargetCorners(ctx, m) {
  const w = m.w + 12;
  const h = m.h + 10;
  const x = m.x - w / 2;
  const y = m.top - 5;
  const s = Math.min(16, w * 0.12, h * 0.12);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,226,168,.85)';
  ctx.shadowColor = 'rgba(242,182,96,.9)';
  ctx.shadowBlur = 6;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (const [cx, cy, a, b] of [
    [x, y, 1, 1],
    [x + w, y, -1, 1],
    [x, y + h, 1, -1],
    [x + w, y + h, -1, -1],
  ]) {
    ctx.moveTo(cx + a * s, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + b * s);
  }
  ctx.stroke();
  ctx.restore();
}
