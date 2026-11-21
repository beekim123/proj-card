// 卡册画面（2026-11-20 第三版，照 30 包 Neo「深林碑廊」接进来）：
// 单独一页，通用背景；一排牌左右滚（Cover-Flow 式伪 3D），正中那张放大、脚下法阵、地面倒影；
// 底部卷轴条快速定位；点正中的牌拿出来细看。牌面一律用石板牌（draw/slate-ui.js），跟战斗同一套。
import { W, H, SCRUB, fit, clip, has, cardFor, setOf, listOf, catForId, openAlbum } from './module.js';
import { loadSlateUI, isSlateReady, drawSlateCard, drawSlateAsset, drawSlateButton, buttonState, slateText, COLOR_KEYS, COLOR_SHORT, GLOW_HEX } from '../draw/slate-ui.js';

const CX = 720, CY = 408, CW = 250;   // 正中那张牌
const NONE_GLOW = '#b57cff';
let loadAsked = false;

const smooth = k => k * k * (3 - 2 * k);
const inRect = (p, r) => p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h;
const keyOf = card => card.col < 7 ? COLOR_KEYS[card.col] : null;
const glowOf = card => GLOW_HEX[keyOf(card)] || NONE_GLOW;
const titleOf = (id, card) => id.startsWith('gem') ? `${COLOR_SHORT[keyOf(card)]} · 色光牌` : card.name;

function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${a})`; }

// 没收录的牌：牌背压暗，中间一圈暗法阵和章的徽记，写“未收录”
function lockedFace(c, cat, t) {
  c.save(); c.globalAlpha *= 0.85; drawSlateAsset(c, '牌背.svg', 0, 0, 400, 600); c.restore();
  c.fillStyle = 'rgba(10,15,20,.72)'; rr(c, 14, 14, 372, 572, 22); c.fill();
  c.strokeStyle = 'rgba(126,156,168,.34)'; c.lineWidth = 3; rr(c, 22, 22, 356, 556, 18); c.stroke();
  const pulse = 0.55 + 0.2 * Math.sin(t * 1.8);
  c.save(); c.translate(200, 232); c.strokeStyle = `rgba(155,195,210,${0.26 * pulse})`; c.lineWidth = 2.5;
  c.beginPath(); c.arc(0, 0, 96, 0, Math.PI * 2); c.stroke();
  c.setLineDash([8, 8]); c.beginPath(); c.arc(0, 0, 74, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
  if (cat.badge) { c.globalAlpha *= 0.55; drawSlateAsset(c, cat.badge, -40, -40, 80, 80); }
  c.restore();
  slateText(c, '未收录', 200, 392, 30, '#95acb6', 'rgba(4,8,12,.85)', 600);
}

// 2D 伪 3D 的一张牌：绕竖轴转（横向压扁 + 错切）、石板厚边、扫光、远处压暗
function card3D(c, cx, cy, w, o, face) {
  const cos = Math.cos(o.rotY || 0), sin = Math.sin(o.rotY || 0), ac = Math.max(0.03, Math.abs(cos)), s = w / 400, skew = o.skew || 0;
  c.save(); c.globalAlpha *= o.alpha ?? 1; c.translate(cx, cy);
  if (o.shadow !== false) {
    c.save(); c.translate(sin * 14 * s, (o.shadowY ?? 24) * s); c.transform(ac, skew, 0, 1, 0, 0); c.scale(s, s);
    c.fillStyle = 'rgba(2,6,10,.5)'; rr(c, -196, -296, 392, 592, 24); c.fill(); c.restore();
  }
  const edge = (o.thickness ?? 12) * Math.abs(sin);
  if (edge > 0.6) {
    c.save(); c.transform(ac, skew, 0, 1, (sin >= 0 ? -1 : 1) * edge * s, 0); c.scale(s, s);
    c.fillStyle = '#3c4a52'; rr(c, -200, -300, 400, 600, 22); c.fill(); c.restore();
  }
  c.transform(ac, skew, 0, 1, 0, 0); c.scale(s, s); c.translate(-200, -300);
  if (o.hover && cos > 0) drawSlateAsset(c, '状态-悬停光边.svg', -20, -20, 440, 640);
  else if (o.glow && cos > 0) drawSlateAsset(c, GLOW_HEX[o.glowKey] ? `状态-色光边.svg@${GLOW_HEX[o.glowKey]}` : '状态-悬停光边.svg', -20, -20, 440, 640);
  if (cos < 0) { c.save(); c.translate(400, 0); c.scale(-1, 1); drawSlateAsset(c, '牌背.svg', 0, 0, 400, 600); c.restore(); }
  else face(c);
  if (o.sheen != null) {
    c.save(); rr(c, 8, 8, 384, 584, 20); c.clip();
    const x = 200 + o.sheen * 360, g = c.createLinearGradient(x - 130, 0, x + 130, 600);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(220,245,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 400, 600); c.restore();
  }
  if (o.fog > 0.01) { c.fillStyle = `rgba(9,17,22,${Math.min(0.82, o.fog)})`; rr(c, 6, 6, 388, 588, 22); c.fill(); }
  c.restore();
}

function faceFor(a, id) {
  const card = cardFor(id);
  return has(id) ? cc => drawSlateCard(cc, card, { x: 0, y: 0, w: 400, h: 600 }) : cc => lockedFace(cc, catForId(a, id), a.t);
}

// 通用背景（屏幕坐标铺满）：深青暗底、中间一团冷雾光、横着飘的薄雾、往上飘的光尘。没有树、柱子这类竖的东西。
const MOTES = Array.from({ length: 46 }, (_, i) => ({ x: (i * 197.3) % 1, y: (i * 113.7) % 1, r: 1 + (i % 3) * 0.8, v: 0.012 + (i % 5) * 0.006, ph: i * 0.7 }));
function background(c, w, h, t, k) {
  c.save(); c.globalAlpha = k;
  const g = c.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, Math.max(w, h) * 0.75);
  g.addColorStop(0, '#22363f'); g.addColorStop(0.45, '#111d23'); g.addColorStop(1, '#05080a');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 3; i++) {
    const y = h * (0.3 + i * 0.17), x = w * (0.5 + 0.18 * Math.sin(t * 0.05 + i * 2.1));
    c.save(); c.translate(x, y); c.scale(1, 0.16);
    const m = c.createRadialGradient(0, 0, 0, 0, 0, w * 0.55);
    m.addColorStop(0, `rgba(120,160,172,${0.07 - i * 0.015})`); m.addColorStop(1, 'rgba(120,160,172,0)');
    c.fillStyle = m; c.beginPath(); c.arc(0, 0, w * 0.55, 0, Math.PI * 2); c.fill(); c.restore();
  }
  for (const m of MOTES) {
    const y = ((m.y - t * m.v) % 1 + 1) % 1, x = m.x + Math.sin(t * 0.4 + m.ph) * 0.01;
    c.fillStyle = `rgba(190,225,232,${0.12 + 0.1 * Math.sin(t * 1.3 + m.ph)})`;
    c.beginPath(); c.arc(x * w, y * h, m.r, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}

// 地面（逻辑坐标）：一点透视的石板缝，近疏远密；正中脚下一圈随这张牌颜色的法阵
function floor(c, a, hex, px, py) {
  const vpX = W / 2 + px * 26, top = 486;
  const fg = c.createLinearGradient(0, top, 0, H);
  fg.addColorStop(0, 'rgba(10,19,24,0)'); fg.addColorStop(0.3, 'rgba(14,26,33,.75)'); fg.addColorStop(1, 'rgba(6,10,13,.9)');
  c.fillStyle = fg; c.fillRect(-400, top, W + 800, H - top + 200);
  c.save(); c.strokeStyle = 'rgba(116,170,186,.1)'; c.lineWidth = 1.2;
  for (let i = -8; i <= 8; i++) { c.beginPath(); c.moveTo(vpX + i * 24, top + 10); c.lineTo(W / 2 + i * 165, H); c.stroke(); }
  for (let k = 1; k < 7; k++) {
    const f = Math.pow(k / 6, 1.85), y = top + 10 + f * (H - top - 10);
    c.strokeStyle = `rgba(116,170,186,${0.04 + f * 0.1})`; c.beginPath(); c.moveTo(-400, y); c.lineTo(W + 400, y); c.stroke();
  }
  c.restore();
  c.save(); c.translate(W / 2 + px * 8, 594 + py * 4);
  const rg = c.createRadialGradient(0, 0, 12, 0, 0, 210);
  rg.addColorStop(0, rgba(hex, 0.33)); rg.addColorStop(0.5, rgba(hex, 0.1)); rg.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = rg; c.beginPath(); c.ellipse(0, 0, 210, 56, 0, 0, Math.PI * 2); c.fill();
  c.scale(1, 0.26); c.rotate(a.t * 0.22); c.strokeStyle = rgba(hex, 0.53); c.lineWidth = 2.5;
  c.beginPath(); c.arc(0, 0, 148, 0, Math.PI * 2); c.stroke();
  c.setLineDash([12, 10]); c.beginPath(); c.arc(0, 0, 112, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
  c.restore();
}

function roundButton(c, local, ptr, x, y, size, glyph, action, arg, label) {
  const r = { x: x - size / 2, y: y - size / 2, w: size, h: size }, hov = inRect(ptr, { ...r, w: label ? size + 110 : size });
  drawSlateAsset(c, `界面-圆按钮-${hov ? '悬停' : '平时'}.svg`, r.x, r.y, size, size);
  slateText(c, glyph, x, y + 1, size * 0.46, hov ? '#fff3dc' : '#efe4cc', 'rgba(0,0,0,.7)', 700);
  if (label) slateText(c, label, x + size / 2 + 12, y, 17, hov ? '#fff3dc' : '#cfd8d4', 'rgba(0,0,0,.7)', 500, 'left');
  local.push({ ...r, w: label ? size + 110 : size, action, arg });
}

function gallery(c, a, ptr, local) {
  const set = setOf(a), ids = listOf(a), n = ids.length, t = a.t, pos = a.pos;
  const px = (ptr.x / W - 0.5) * 2, py = (ptr.y / H - 0.5) * 2;
  const ci = clip(Math.round(pos), 0, n - 1), cur = ids[ci], curCard = cardFor(cur), curHex = has(cur) ? glowOf(curCard) : '#678c9c';
  floor(c, a, curHex, px, py);

  // 一排牌：中间左右各 6 张。近大远小，两翼往里斜转、逐级缩小、沉进雾里
  const items = [];
  for (let i = Math.max(0, ci - 6); i <= Math.min(n - 1, ci + 6); i++) {
    const d = i - pos, ad = Math.abs(d), sg = d >= 0 ? 1 : -1, depth = Math.min(1, ad / 5.5);
    const w = CW * Math.pow(0.84, ad), rotY = -sg * Math.min(0.88, Math.pow(ad, 0.72) * 0.48);
    const x = W / 2 + sg * (Math.pow(ad, 0.84) * 188 + (ad > 0.01 ? 38 * Math.min(1, ad) : 0)) + px * 14 * (1 - depth * 0.6);
    const y = CY - depth * 36 + Math.sin(t * 1.8 + i * 0.9) * (ad < 0.5 ? 5 : 2.5) + py * 8;
    items.push({ id: ids[i], i, d, ad, depth, w, rotY, skew: sg * Math.min(0.14, ad * 0.048), x, y,
      hw: w * 0.48 * Math.max(0.35, Math.abs(Math.cos(rotY))), hh: w * 0.74 });
  }
  items.sort((p, q) => q.ad - p.ad);   // 远的先画
  let hover = null;
  if (!a.id && !a.drag?.moved) for (let k = items.length - 1; k >= 0; k--) { const it = items[k]; if (Math.abs(ptr.x - it.x) <= it.hw && Math.abs(ptr.y - it.y) <= it.hh) { hover = it; break; } }

  for (const it of items) {
    const centered = it.ad < 0.45, card = cardFor(it.id), got = has(it.id), hov = hover === it, lift = hov ? -14 : 0;
    if (centered) {   // 正中那张在石板地上的倒影
      c.save(); c.translate(it.x, 622); c.scale(1, -0.36); c.globalAlpha *= 0.24;
      card3D(c, 0, -180, it.w, { rotY: it.rotY, shadow: false, thickness: 0 }, faceFor(a, it.id)); c.restore();
    }
    card3D(c, it.x, it.y + lift, it.w * (hov ? 1.04 : 1), {
      rotY: it.rotY + (centered && hov ? clip((ptr.x - it.x) / 220, -0.18, 0.18) : 0), skew: it.skew,
      alpha: Math.max(0.28, 1 - it.depth * 0.68), fog: it.depth * 0.66, hover: hov && got,
      glow: centered && got, glowKey: keyOf(card), sheen: centered ? Math.sin(t * 1.5) * 0.55 : null, shadowY: 26 * (1 - it.depth * 0.4),
    }, faceFor(a, it.id));
    local.push({ x: it.x - it.hw, y: it.y + lift - it.hh, w: it.hw * 2, h: it.hh * 2, action: centered ? 'inspect' : 'folio', arg: centered ? it.id : it.i });
  }

  // 正中那张的名字和一句说明
  const got = has(cur), cat = catForId(a, cur);
  slateText(c, got ? titleOf(cur, curCard) : '？？？', W / 2, 648, 22, got ? '#f6ecd4' : '#8ea5b0', 'rgba(0,0,0,.85)', 700);
  slateText(c, got ? `${cat.name}牌 · 已收录 · 点牌面拿出来细看` : `${cat.name}牌 · 未收录 · ${cat.how}`, W / 2, 676, 13, got ? rgba(curHex, 0.95) : '#6e8792', 'rgba(0,0,0,.78)', 500);
  if (cur === 'seal') {   // 封印牌：不用收录也能试演（不是奖励）
    const r = { x: W / 2 - 56, y: 692, w: 112, h: 38 };
    drawSlateButton(c, '弹窗-按钮', r, '试演', { state: buttonState({ hover: inRect(ptr, r) }), fontSize: 15 });
    local.push({ ...r, action: 'study' });
  }

  // 上面换章：全部 / 色光 / 法术 / 封印
  const tabs = [{ name: '全部', i: -1, ids: set.cats.flatMap(ct => ct.ids) }, ...set.cats.map((ct, i) => ({ name: ct.name, i, ids: ct.ids }))];
  const bw = 116, bh = 38, gx = 10, total = tabs.length * bw + (tabs.length - 1) * gx;
  tabs.forEach((tb, j) => {
    const r = { x: (W - total) / 2 + j * (bw + gx), y: 46, w: bw, h: bh };
    drawSlateButton(c, '界面-小按钮', r, `${tb.name} ${tb.ids.filter(has).length}/${tb.ids.length}`, { state: buttonState({ hover: inRect(ptr, r), selected: tb.i === a.cat }), fontSize: 13 });
    local.push({ ...r, action: 'category', arg: tb.i });
  });

  // 底部卷轴条：亮点是收录了的，暗点没收录；按住拖直接定位
  const S = SCRUB, span = S.w - S.pad * 2, ky = S.y + S.h / 2;
  c.save(); c.fillStyle = 'rgba(13,22,28,.86)'; rr(c, S.x, S.y, S.w, S.h, 15); c.fill();
  c.strokeStyle = 'rgba(132,176,192,.36)'; c.lineWidth = 1.4; c.stroke();
  ids.forEach((id, i) => {
    const tx = S.x + S.pad + (n > 1 ? i / (n - 1) : 0.5) * span, on = Math.abs(i - pos) < 0.5;
    c.beginPath(); c.arc(tx, ky, on ? 5 : has(id) ? 3.2 : 2, 0, Math.PI * 2);
    c.fillStyle = on ? '#fff4d4' : has(id) ? glowOf(cardFor(id)) : 'rgba(116,140,150,.38)'; c.fill();
  });
  const kx = S.x + S.pad + (n > 1 ? clip(pos / (n - 1)) : 0.5) * span;
  c.fillStyle = '#f4d38a'; c.strokeStyle = '#121d24'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(kx, ky - 11); c.lineTo(kx + 9, ky); c.lineTo(kx, ky + 11); c.lineTo(kx - 9, ky); c.closePath(); c.fill(); c.stroke();
  slateText(c, `${ci + 1} / ${n}`, S.x + S.w + 46, ky, 13, '#b8cfd8', null, 600);
  c.restore();
  slateText(c, '拖动 / 滚轮 / 左右键 / 拖底部卷轴条 · 点两侧的牌拉近，点正中的牌细看', 24, H - 18, 12, '#7d98a4', null, 500, 'left');
}

function inspector(c, a, ptr, local) {
  const k = smooth(a.progress), id = a.id, card = cardFor(id), cat = catForId(a, id), hex = glowOf(card);
  c.save();
  c.fillStyle = `rgba(4,9,13,${0.84 * k})`; c.fillRect(-400, -200, W + 800, H + 400);
  local.push({ x: 0, y: 0, w: W, h: H, action: 'putback' });
  const g = c.createRadialGradient(560, 410, 40, 560, 410, 330);
  g.addColorStop(0, rgba(hex, 0.26 * k)); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(200, 60, 720, 700);

  // 右边说明
  const px = 800, py = 190, pw = 320, ph = 430;
  c.globalAlpha = k;
  c.fillStyle = 'rgba(16,25,31,.92)'; rr(c, px, py, pw, ph, 16); c.fill();
  c.strokeStyle = 'rgba(142,180,194,.42)'; c.lineWidth = 1.5; c.stroke();
  if (cat.badge) drawSlateAsset(c, cat.badge, px + 24, py + 24, 38, 38);
  slateText(c, `${cat.name}牌 · 已收录`, px + (cat.badge ? 74 : 24), py + 43, 15, rgba(hex, 1), null, 600, 'left');
  slateText(c, titleOf(id, card), px + 24, py + 100, 28, '#f5ebd4', 'rgba(0,0,0,.7)', 700, 'left', pw - 48);
  c.strokeStyle = 'rgba(142,180,194,.22)'; c.beginPath(); c.moveTo(px + 24, py + 134); c.lineTo(px + pw - 24, py + 134); c.stroke();
  slateText(c, '效果', px + 24, py + 164, 14, '#8ca8b4', null, 600, 'left');
  slateText(c, card.text || '', px + 24, py + 196, 19, '#e2eef2', null, 500, 'left', pw - 48);
  slateText(c, '怎么拿到', px + 24, py + 246, 14, '#8ca8b4', null, 600, 'left');
  slateText(c, cat.how, px + 24, py + 278, 17, '#c9d8de', null, 500, 'left', pw - 48);
  const btns = [['flip', a.flipped ? '翻回正面' : '看牌背']];
  if (id === 'seal') btns.push(['study', '试演']);
  btns.forEach(([action, label], i) => {
    const r = { x: px + 24 + i * 140, y: py + ph - 74, w: 128, h: 46 };
    drawSlateButton(c, '弹窗-按钮', r, label, { state: buttonState({ hover: inRect(ptr, r) }), fontSize: 16 });
    local.push({ ...r, action });
  });
  const cb = { x: px + pw - 30, y: py - 22, w: 48, h: 48 };
  drawSlateAsset(c, `弹窗-关闭按钮-${inRect(ptr, cb) ? '悬停' : '平时'}.svg`, cb.x, cb.y, cb.w, cb.h);
  local.push({ ...cb, action: 'putback' });

  // 拿在眼前的牌：跟着鼠标微转，点牌翻面
  const tilt = clip((ptr.x - 560) / 340, -1, 1) * 0.28, w = 360 * (0.84 + 0.16 * k), y = 405 + Math.sin(a.t * 2.1) * 5 + (1 - k) * 60;
  card3D(c, 560, y, w, { rotY: a.flip + tilt, skew: clip((ptr.y - 405) / 320, -1, 1) * -0.06 * Math.sign(tilt || 1), thickness: 14, glow: true, glowKey: keyOf(card), sheen: Math.sin(tilt * 3.2), shadowY: 32 }, faceFor(a, id));
  local.push({ x: 560 - w / 2, y: y - w * 0.75, w, h: w * 1.5, action: 'flip' });
  c.globalAlpha = k * 0.8;
  slateText(c, '点空白处或按 Esc 放回去', W / 2, 772, 14, '#89a3ad', null, 500);
  c.restore();
}

export function album(c, g, w, h, p, z) {
  const a = g.album; if (!a.view) openAlbum(a);
  if (!loadAsked) { loadAsked = true; loadSlateUI().catch(e => console.error(e)); }
  const f = fit(w, h), s = f.s, k = smooth(a.arrival), local = [], ptr = { x: (p.x - f.x) / s, y: (p.y - f.y) / s };
  c.save();
  background(c, w, h, a.t, k);   // 以后每个卡集换自己的背景：按 setOf(a).background 选
  c.translate(f.x, f.y); c.scale(s, s);
  if (!isSlateReady()) { slateText(c, '正在取出卡册…', CX, CY, 18, '#a8c5d0', null, 500); c.restore(); return; }
  c.globalAlpha = k;
  c.save(); c.translate(0, (1 - k) * 40); gallery(c, a, ptr, local); c.restore();
  c.globalAlpha = k;
  roundButton(c, local, ptr, 64, 64, 52, '‹', 'back', undefined, a.standalone ? '关闭' : '返回大厅');
  if (a.id) { const keep = local.length; inspector(c, a, ptr, local); local.splice(0, keep); }
  c.restore();
  if (k > .98 && !a.depart) for (const q of local) z.push({ ...q, x: q.x * s + f.x, y: q.y * s + f.y, w: q.w * s, h: q.h * s });
}
