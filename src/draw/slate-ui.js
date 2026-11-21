// 石板风格 UI、卡面与伤害数字统一加载与绘制模块（全部素材来自 art/ui/石板/生成.py）。
import { SVG_FILES, SVG_SIZES, RECOLOR_TEMPLATES } from '../../art/ui/石板/manifest.js';

const SVG_ROOT = new URL('../../art/ui/石板/svg/', import.meta.url);
const FONT = '"PingFang SC", -apple-system, sans-serif';

export const COLOR_KEYS = ['red', 'yellow', 'green', 'cyan', 'blue', 'purple', 'white'];
export const COLOR_SHORT = { red: '红', yellow: '黄', green: '绿', cyan: '青', blue: '蓝', purple: '紫', white: '白' };
export const LIGHT_FLAG = { yellow: true, white: true };
export const GLOW_HEX = {
  red: '#ff4a3a',
  yellow: '#ffcf3a',
  green: '#3df06a',
  cyan: '#36e8e0',
  blue: '#3f86ff',
  purple: '#c35cff',
  white: '#ffffff',
};
export const WHEEL_COLS = ['red', 'yellow', 'green', 'cyan', 'blue', 'purple'];
export const GEM_ARC_COLOR = { r: '#ff4a3a', g: '#3df06a', b: '#3f86ff' };
// 与 生成.py color_card() 的悬空布局一致（29 包定稿）
const GEM_LAYOUT = {
  red: [['r', 200, 250, 74]],
  yellow: [['r', 140, 238, 58], ['g', 262, 266, 58]],
  green: [['g', 200, 250, 74]],
  cyan: [['g', 140, 238, 58], ['b', 262, 266, 58]],
  blue: [['b', 200, 250, 74]],
  purple: [['b', 140, 238, 58], ['r', 262, 266, 58]],
  white: [['r', 200, 190, 50], ['g', 130, 300, 50], ['b', 270, 300, 50]],
};
const GEM_INDEX = { r: 0, g: 1, b: 2 };
const DMG_STYLE_MAP = {
  red: '红',
  green: '绿',
  blue: '蓝',
  white: '白',
  extra: '铁',
  pure: '铜',
  total: '铜',
  dim: '灰',
};

const bitmaps = new Map();
const cardFaceCache = new Map();
const sealPortraits = { tiko: null, badom: null };
let loading = null;
let ready = false;

function bakeScaleFor(name) {
  // 2x rasterization for HUD parts so Retina looks razor-sharp; 1x for 400x600+ cards/panels already at high res.
  if (name.startsWith('伤害-')) return 1.5;
  if (name.startsWith('色光-') || name.startsWith('异能-') || name.startsWith('封印-') || name === '牌背.svg') return 1;
  if (name.startsWith('状态-')) return name === '状态-提示字底.svg' ? 1.5 : 1;
  if (name.startsWith('弹窗-牌堆大面板') || name.startsWith('弹窗-石板面板')) return 1.5;
  return 2;
}

function loadAndBake(src, key, baseW, baseH, scale) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const done = () => {
        const w = Math.max(1, Math.round(baseW * scale));
        const h = Math.max(1, Math.round(baseH * scale));
        const c = new OffscreenCanvas(w, h);
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        bitmaps.set(key, c);
        resolve();
      };
      if (img.decode) img.decode().then(done, done);
      else done();
    };
    img.onerror = () => reject(new Error('石板素材加载失败 · ' + key));
    img.src = src;
  });
}

export function loadSlateUI() {
  return loading ??= (async () => {
    const jobs = [];
    for (const file of SVG_FILES) {
      const url = new URL(encodeURIComponent(file), SVG_ROOT).href;
      const [bw, bh] = SVG_SIZES[file] || [400, 600];
      jobs.push(loadAndBake(url, file, bw, bh, bakeScaleFor(file)));
    }
    for (const [name, raw] of Object.entries(RECOLOR_TEMPLATES)) {
      const sc = bakeScaleFor(name);
      const [bw, bh] = SVG_SIZES[name] || [440, 640];
      for (const hex of Object.values(GLOW_HEX)) {
        const uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(raw.replaceAll('#ff00ff', hex));
        jobs.push(loadAndBake(uri, `${name}@${hex}`, bw, bh, sc));
      }
    }
    await Promise.all(jobs);
    ready = true;
  })().catch(err => {
    loading = null;
    throw err;
  });
}

export function isSlateReady() {
  return ready;
}

export function getSlateAsset(name) {
  return bitmaps.get(name) || null;
}

export function drawSlateAsset(ctx, name, x, y, w, h) {
  const img = bitmaps.get(name);
  if (!img) return false;
  ctx.drawImage(img, x, y, w, h);
  return true;
}

// 用游戏里真实的提可 / 巴多姆 p5 模块截取待机一帧，贴进封印牌圆窗。
async function capturePortrait(runtime, id, fit) {
  const mod = runtime.module(id);
  if (!mod || typeof window === 'undefined' || !window.p5) return null;
  const pal = runtime.paletteOf ? runtime.paletteOf(id, '普通') : runtime.palette;
  const S = 600;
  return new Promise(resolve => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;';
    document.body.appendChild(host);
    let inst = null;
    inst = new window.p5(q => {
      q.setup = () => {
        q.createCanvas(S, S);
        q.pixelDensity(1);
        q.noLoop();
        const st = mod.create(q, { palette: pal, seed: 7, elite: false });
        for (let i = 0; i < 90; i++) mod.update(st, 1 / 60, q);
        q.clear();
        q.push();
        q.translate(S / 2 + fit.dx * S, S / 2 + fit.dy * S);
        q.scale(fit.s * S / 100);
        mod.draw(q, st);
        q.pop();
        const out = new OffscreenCanvas(S, S);
        out.getContext('2d').drawImage(q.drawingContext.canvas, 0, 0);
        setTimeout(() => {
          try { inst?.remove(); } catch {}
          host.remove();
        }, 0);
        resolve(out);
      };
    }, host);
  });
}

export async function initSealPortraits(runtime) {
  if (!runtime) return;
  const [tiko, badom] = await Promise.all([
    capturePortrait(runtime, 'tiko', { s: 0.96, dx: 0, dy: -0.05 }),
    capturePortrait(runtime, 'badom', { s: 0.72, dx: 0, dy: 1.38 }),
  ]);
  if (tiko) sealPortraits.tiko = tiko;
  if (badom) sealPortraits.badom = badom;
  cardFaceCache.clear();
}

export function slateText(ctx, str, cx, cy, size, fill, stroke = null, weight = 600, align = 'center', maxWidth = 0) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const s = String(str);
  if (stroke) {
    ctx.lineWidth = Math.max(2, size * 0.16);
    ctx.strokeStyle = stroke;
    ctx.lineJoin = 'round';
    if (maxWidth > 0) ctx.strokeText(s, cx, cy, maxWidth);
    else ctx.strokeText(s, cx, cy);
  }
  ctx.fillStyle = fill;
  if (maxWidth > 0) ctx.fillText(s, cx, cy, maxWidth);
  else ctx.fillText(s, cx, cy);
}

function wrapLines(ctx, str, maxWidth, font) {
  ctx.font = font;
  const raw = String(str || '').split('\n');
  const lines = [];
  for (const seg of raw) {
    let cur = '';
    for (const ch of seg) {
      if (cur && ctx.measureText(cur + ch).width > maxWidth) {
        lines.push(cur);
        cur = ch;
      } else cur += ch;
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

function resolveAbilityAssets(card) {
  if (card.instant) {
    if (card.col === 8) return { win: '异能-铜框-none-窗.svg', frame: '异能-铜框-none-牌身.svg', key: 'none' };
    return { win: '异能-灵感涌现-窗.svg', frame: '异能-灵感涌现-牌身.svg', key: COLOR_KEYS[card.col] || 'green' };
  }
  if (card.col === 4) return { win: '异能-增幅法阵-窗.svg', frame: '异能-增幅法阵-牌身.svg', key: 'blue' };
  if (card.col === 0) return { win: '异能-铁框-red-窗.svg', frame: '异能-铁框-red-牌身.svg', key: 'red' };
  if (card.col === 7) return { win: '异能-铁框-white-窗.svg', frame: '异能-铁框-white-牌身.svg', key: 'white' };
  return { win: '异能-铁框-none-窗.svg', frame: '异能-铁框-none-牌身.svg', key: 'none' };
}

function paintCardBase400(ctx, card) {
  if (card.id === 'back') {
    drawSlateAsset(ctx, '牌背.svg', 0, 0, 400, 600);
    return;
  }
  const isSeal = card.id === 'seal' || card.id === 'seal_badom' || card.id === 'seal_tiko';
  if (card.id === 'gem') {
    const key = COLOR_KEYS[card.col] || 'red';
    drawSlateAsset(ctx, `色光-${key}-窗.svg`, 0, 0, 400, 600);
    drawSlateAsset(ctx, `色光-${key}-牌身.svg`, 0, 0, 400, 600);
    const light = LIGHT_FLAG[key];
    slateText(ctx, COLOR_SHORT[key], 58, 54, 30, light ? '#2a2016' : '#fff3dc', light ? 'rgba(255,240,200,.5)' : 'rgba(20,12,6,.75)', 600);
    slateText(ctx, '色光牌', 200, 500, 28, '#efe4cc', 'rgba(0,0,0,.65)', 600);
    return;
  }
  if (isSeal) {
    drawSlateAsset(ctx, '封印-窗.svg', 0, 0, 400, 600);
    const monImg = card.id === 'seal_tiko' ? sealPortraits.tiko : sealPortraits.badom;
    if (monImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(200, 206, 128, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(monImg, 70, 76, 260, 260);
      ctx.restore();
    }
    drawSlateAsset(ctx, '封印-牌身.svg', 0, 0, 400, 600);
    slateText(ctx, '无', 58, 40, 24, '#eef3f5', 'rgba(0,0,0,.7)', 600);
    slateText(ctx, '色', 58, 70, 24, '#eef3f5', 'rgba(0,0,0,.7)', 600);
    slateText(ctx, card.name || '封印', 200, 384, 26, '#efe4cc', 'rgba(0,0,0,.65)', 600, 'center', 228);
    const lines = wrapLines(ctx, card.text, 224, `500 20px ${FONT}`).slice(0, 4);
    const yStart = lines.length <= 2 ? 456 : lines.length === 3 ? 444 : 434;
    const lineStep = lines.length >= 4 ? 26 : 30;
    lines.forEach((l, i) => slateText(ctx, l, 200, yStart + i * lineStep, 20, '#2c2118', null, 500, 'center', 228));
    return;
  }
  // 异能牌
  const { win, frame, key } = resolveAbilityAssets(card);
  drawSlateAsset(ctx, win, 0, 0, 400, 600);
  drawSlateAsset(ctx, frame, 0, 0, 400, 600);
  if (card.col === 8) {
    slateText(ctx, '无', 58, 40, 24, '#eef3f5', 'rgba(0,0,0,.7)', 600);
    slateText(ctx, '色', 58, 70, 24, '#eef3f5', 'rgba(0,0,0,.7)', 600);
  } else if (card.col === 7) {
    slateText(ctx, '变', 58, 40, 24, '#2a2016', 'rgba(255,240,200,.5)', 600);
    slateText(ctx, '色', 58, 70, 24, '#2a2016', 'rgba(255,240,200,.5)', 600);
  } else {
    const light = LIGHT_FLAG[key];
    slateText(ctx, COLOR_SHORT[key] || '', 58, 54, 30, light ? '#2a2016' : '#fff3dc', light ? 'rgba(255,240,200,.5)' : 'rgba(20,12,6,.75)', 600);
  }
  slateText(ctx, card.name || '', 200, 379, 26, '#efe4cc', 'rgba(0,0,0,.65)', 600, 'center', 228);
  const lines = wrapLines(ctx, card.text, 224, `500 20px ${FONT}`).slice(0, 4);
  const yStart = lines.length <= 2 ? 456 : lines.length === 3 ? 444 : 434;
  const lineStep = lines.length >= 4 ? 26 : 30;
  lines.forEach((l, i) => slateText(ctx, l, 200, yStart + i * lineStep, 20, '#2c2118', null, 500, 'center', 228));
}

function cachedCardBase(card) {
  const key = [card.id, card.col, card.vals?.join(','), card.name, card.text, Boolean(card.instant)].join('|');
  let img = cardFaceCache.get(key);
  if (!img) {
    img = new OffscreenCanvas(400, 600);
    paintCardBase400(img.getContext('2d'), card);
    if (cardFaceCache.size >= 96) cardFaceCache.delete(cardFaceCache.keys().next().value);
    cardFaceCache.set(key, img);
  }
  return img;
}

export function drawSlateCard(ctx, card, rect, st = null) {
  if (!ready) return false;
  const { x, y, w, h } = rect;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(w / 400, h / 600);

  // 原型强提示光晕（在 400×600 卡面坐标系下绘制）
  if (st) {
    if (st.rainbowRing || st.mode === 'rainbow') {
      // 差一盏出彩虹 / 出彩虹：五层彩虹光环（红、黄、绿、蓝、紫）
      const ringCols = ['#8e4ec6', '#3e8ed0', '#46a758', '#f0c060', '#e5484d'];
      for (let i = 0; i < ringCols.length; i++) {
        const pad = (5 - i) * 9;
        ctx.save();
        ctx.strokeStyle = ringCols[i];
        ctx.lineWidth = 10;
        ctx.shadowColor = ringCols[i];
        ctx.shadowBlur = i === 0 ? 24 : 8;
        ctx.beginPath();
        ctx.roundRect(14 - pad, 14 - pad, 372 + pad * 2, 572 + pad * 2, 26 + pad * 0.6);
        ctx.stroke();
        ctx.restore();
      }
      drawSlateAsset(ctx, '状态-彩虹光边.svg', -20, -20, 440, 640);
    } else if (st.mode === 'settle') {
      // 正在结算的那张牌：外面一圈 22px 暖金光晕 (#ffd98a)
      ctx.save();
      ctx.shadowColor = '#ffd98a';
      ctx.shadowBlur = 72;
      ctx.fillStyle = 'rgba(255,217,138,0.42)';
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        ctx.roundRect(-8, -8, 416, 616, 30);
        ctx.fill();
      }
      ctx.strokeStyle = '#ffe5a8';
      ctx.lineWidth = 10;
      ctx.stroke();
      ctx.restore();
      drawSlateAsset(ctx, '状态-结算发亮.svg', -20, -20, 440, 640);
    } else if (st.mode === 'comp') {
      // 补色：外面一圈最亮的白光 (box-shadow: 0 0 18px 7px #fff)
      ctx.save();
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 64;
      ctx.fillStyle = 'rgba(255,255,255,0.48)';
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        ctx.roundRect(-6, -6, 412, 612, 28);
        ctx.fill();
      }
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.restore();
      drawSlateAsset(ctx, '状态-补色白光.svg', -20, -20, 440, 640);
    } else if (st.mode === 'same' || st.mode === 'adj' || st.mode === 'wild' || st.mode === 'start') {
      // 能接上的牌（同色、邻色、百搭、起色）：外面一圈这张牌颜色的宽亮光晕
      const glowCol = st.color || GLOW_HEX.yellow;
      ctx.save();
      ctx.shadowColor = glowCol;
      ctx.shadowBlur = 52;
      ctx.fillStyle = glowCol;
      ctx.globalAlpha *= 0.34;
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        ctx.roundRect(-2, -2, 404, 604, 26);
        ctx.fill();
      }
      ctx.globalAlpha = 0.92;
      ctx.strokeStyle = glowCol;
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.restore();
      drawSlateAsset(ctx, `状态-色光边.svg@${glowCol}`, -20, -20, 440, 640);
    }
    if (st.hover || st.mode === 'hover') {
      drawSlateAsset(ctx, '状态-悬停光边.svg', -20, -20, 440, 640);
    }
  }

  ctx.drawImage(cachedCardBase(card), 0, 0, 400, 600);

  // 顶盖状态层（牌面之上）
  if (st) {
    if (st.mode === 'dim') {
      // 断色：整张压暗到四成多亮度 (brightness(.45))
      drawSlateAsset(ctx, '状态-断色压暗.svg', -20, -20, 440, 640);
      ctx.save();
      ctx.fillStyle = 'rgba(4, 7, 10, 0.48)';
      ctx.beginPath();
      ctx.roundRect(14, 14, 372, 572, 22);
      ctx.fill();
      ctx.restore();
    }
    if (st.mode === 'adj') {
      drawSlateAsset(ctx, `状态-邻色箭头.svg@${st.color || GLOW_HEX.green}`, -20, -20, 440, 640);
    }
    if (st.mode === 'settle') drawSlateAsset(ctx, '状态-结算发亮.svg', -20, -20, 440, 640);
    if (st.hint) {
      const boxW = st.hint.length > 6 ? 336 : 264;
      drawSlateAsset(ctx, '状态-提示字底.svg', 200 - boxW / 2, -66, boxW, 52);
      const col = st.hintCol || (st.mode === 'dim' ? '#98a4aa' : st.mode === 'comp' ? '#ffffff' : (st.rainbowRing || st.mode === 'rainbow') ? '#ffe89c' : '#fff0d0');
      slateText(ctx, st.hint, 200, -40, 30, col, 'rgba(6,10,14,.94)', 700, 'center', boxW - 24);
    }
    if (st.seqTop) slateText(ctx, st.seqTop, 200, -38, 44, st.seqTopCol || '#d8e6ec', 'rgba(6,10,14,.94)', 700, 'center', 480);
    if (st.seqBot) slateText(ctx, st.seqBot, 200, 642, 48, '#ffd98a', 'rgba(6,10,14,.94)', 700, 'center', 480);
  }

  ctx.restore();
  return true;
}

// 统一按钮渲染（支持五态：平时 / 悬停 / 按下 / 选中 / 禁用）
export function buttonState({ hover = false, pressed = false, selected = false, disabled = false } = {}) {
  if (disabled) return '禁用';
  if (pressed && hover) return '按下';
  if (hover) return '悬停';
  if (selected) return '选中';
  return '平时';
}

export function drawSlateButton(ctx, prefix, rect, label, opts = {}) {
  const st = opts.state || buttonState(opts);
  const { x, y, w, h } = rect;
  drawSlateAsset(ctx, `${prefix}-${st}.svg`, x, y, w, h);
  if (label) {
    const dy = st === '按下' ? 2 : 0;
    const size = opts.fontSize || (h >= 46 ? 18 : 14);
    const fill = st === '禁用' ? '#7a8288' : opts.textColor || (st === '悬停' || st === '选中' ? '#fff3dc' : '#efe4cc');
    slateText(ctx, label, x + w / 2, y + h / 2 + dy, size, fill, 'rgba(0,0,0,.72)', 600, 'center', w - 26);
  }
}

export function drawSlateCastButton(ctx, cx, cy, size, label, opts = {}) {
  const st = opts.state || buttonState(opts);
  drawSlateAsset(ctx, `界面-施法按钮-${st}.svg`, cx - size / 2, cy - size / 2, size, size);
  const dy = st === '按下' ? 2 : 0;
  const fSize = label.length > 2 ? Math.round(size * 0.145) : Math.round(size * 0.205);
  const fill = st === '禁用' ? '#8c969c' : '#2b1806';
  const stroke = st === '禁用' ? 'rgba(0,0,0,.65)' : 'rgba(255,244,210,.55)';
  slateText(ctx, label, cx, cy + 1 + dy, fSize, fill, stroke, 700, 'center', size * 0.68);
}

// 石板手绘伤害数字渲染（0–9 单字拼合，支持色光红绿蓝 / 白光 / 无色铁 / 纯伤铜 / 暴击爆裂 / 彩虹描边 / 减伤或挡掉小盾 / “彩虹补 xxx”）
export function drawDamageNumber(ctx, value, x, y, o = {}) {
  if (!ready || !Number.isFinite(+value)) return false;
  if (o.prefix) {
    // “彩虹补 xxx”大数字：前面手绘风格大字 + 后面石板手绘数字
    const digits = String(Math.max(0, Math.round(+value)));
    const h = (o.height ?? 44) * 1.25;
    const sc = h / 76;
    const dw = 96 * sc;
    const dh = 116 * sc;
    const adv = 56 * sc;
    const numW = dw + adv * (digits.length - 1);
    const prefixW = h * 2.85;
    const totalW = prefixW + numW;
    const bw = Math.max(totalW * 1.22, dh * 1.6);
    const bh = dh * 1.65;
    drawSlateAsset(ctx, '伤害-暴击爆裂.svg', x - bw / 2, y - bh / 2, bw, bh);
    slateText(ctx, o.prefix, x - totalW / 2 + prefixW * 0.48, y + 2, Math.round(h * 0.78), '#ffd98a', 'rgba(12,16,20,.95)', 800);
    const x0 = x - totalW / 2 + prefixW;
    const y0 = y - dh / 2;
    for (let i = 0; i < digits.length; i++) {
      drawSlateAsset(ctx, `伤害-彩虹描边-${digits[i]}.svg`, x0 + i * adv, y0, dw, dh);
      drawSlateAsset(ctx, `伤害-铜-${digits[i]}.svg`, x0 + i * adv, y0, dw, dh);
    }
    return true;
  }
  const blocked = Boolean(o.blocked);
  const reduced = Boolean(o.reduced) && !blocked;
  const crit = Boolean(o.crit) && !blocked;
  const rainbow = Boolean(o.rainbow) && !blocked;
  const dim = blocked || reduced;
  const baseHeight = o.height ?? (o.kind === 'total' ? 42 : 34);
  const h = baseHeight * (crit ? 1.32 : dim ? 0.82 : 1);
  const sc = h / 76; // 96×116 画布内可视字高约 76
  const dw = 96 * sc;
  const dh = 116 * sc;
  const adv = 56 * sc;

  const digits = blocked ? '0' : String(Math.max(0, Math.round(+value)));
  const totalW = dw + adv * (digits.length - 1);
  const x0 = x - totalW / 2;
  const y0 = y - dh / 2;

  // 1) 暴击：背后手绘尖角爆裂
  if (crit) {
    const bw = Math.max(totalW * 1.38, dh * 1.48);
    const bh = dh * 1.62;
    drawSlateAsset(ctx, '伤害-暴击爆裂.svg', x - bw / 2, y - bh / 2, bw, bh);
  }

  // 2) 彩虹回合：外圈彩色描边（叠在任何填色底下）
  if (rainbow) {
    for (let i = 0; i < digits.length; i++) {
      drawSlateAsset(ctx, `伤害-彩虹描边-${digits[i]}.svg`, x0 + i * adv, y0, dw, dh);
    }
  }

  // 3) 主体手绘数字
  const style = dim ? '灰' : (DMG_STYLE_MAP[o.kind ?? o.art] || '铁');
  for (let i = 0; i < digits.length; i++) {
    drawSlateAsset(ctx, `伤害-${style}-${digits[i]}.svg`, x0 + i * adv, y0, dw, dh);
  }

  // 4) 挡掉 / 减伤：旁边一个小盾
  if (blocked || reduced) {
    const sh = dh * 0.62;
    const sw = sh * (56 / 64);
    drawSlateAsset(ctx, '伤害-小盾.svg', x0 - sw * 0.46, y - sh * 0.48, sw, sh);
  }
  return true;
}
