// 石板风格战斗卡牌、色环、宝石经验、牌堆与序列槽绘制（含原型全部手牌提示、序列标签、倍率弹跳与宝石升级闪光）。
import {
  drawSlateAsset,
  drawSlateCard,
  slateText,
  WHEEL_COLS,
  GLOW_HEX,
  GEM_ARC_COLOR,
  COLOR_KEYS,
} from './slate-ui.js';
import { gemThreshold, formatChineseNumber, lampCount } from '../rules.js';

export function cardStateFromPreview(st, card, { hover = false } = {}) {
  if (card?.instant) {
    return { mode: hover ? 'hover' : null, hint: '马上生效', hintCol: '#ffd98a', hover, lift: 0 };
  }
  if (!st) return hover ? { mode: 'hover', hover: true, lift: 0 } : null;
  const colIdx = st.card?.col ?? card.col;
  const key = COLOR_KEYS[colIdx] || 'yellow';
  const hex = GLOW_HEX[key] || '#ffffff';
  const rel = st.relation;
  // 差一盏出彩虹（当前已亮 5 盏，打这张就满 6 盏出彩虹；或者打完这张达到 5 盏）
  const triggersRainbow = Boolean(st.rainbow);
  const reachesFive = !triggersRainbow && lampCount(st.lamps) === 5 && rel !== '断色' && rel !== '补色' && colIdx !== 8;
  const rainbowRing = triggersRainbow || reachesFive;

  if (rel === '断色') {
    return { mode: 'dim', hint: '断色', hover, lift: 0, rainbowRing: false };
  }
  if (rel === '补色') {
    const suffix = triggersRainbow ? ' · 出彩虹' : '';
    return {
      mode: 'comp',
      color: '#ffffff',
      hint: '×2 补色 · 白光' + suffix,
      hover,
      lift: 14,
      rainbowRing,
    };
  }
  if (rel === '同色') {
    const suffix = triggersRainbow ? ' · 出彩虹' : reachesFive ? ' · 差一盏彩虹' : '';
    return { mode: 'same', color: hex, hint: '×2 同色' + suffix, hover, lift: 10, rainbowRing };
  }
  if (rel === '邻色') {
    const suffix = triggersRainbow ? ' · 出彩虹' : reachesFive ? ' · 差一盏彩虹' : '';
    return { mode: 'adj', color: hex, hint: '↗ ×2 邻色' + suffix, hover, lift: 10, rainbowRing };
  }
  if (rel === '百搭') {
    const suffix = triggersRainbow ? ' · 出彩虹' : reachesFive ? ' · 差一盏彩虹' : '';
    return { mode: 'wild', color: hex, hint: '×2 百搭' + suffix, hover, lift: 10, rainbowRing };
  }
  if (rel === '起色') {
    return { mode: 'start', color: hex, hint: '起色', hover, lift: 10, rainbowRing };
  }
  if (st.hint && st.hint !== card.name) {
    return { mode: hover ? 'hover' : null, hint: st.hint, hover, lift: 0, rainbowRing };
  }
  return hover ? { mode: 'hover', hover: true, lift: 0 } : null;
}

export function drawCard(ctx, card, rect, state = null, hover = false) {
  const st = typeof state === 'string'
    ? (state ? { hint: state, hover, mode: state === '断色' ? 'dim' : hover ? 'hover' : null } : (hover ? { mode: 'hover', hover: true } : null))
    : (state ? { ...state, hover: state.hover || hover } : (hover ? { mode: 'hover', hover: true } : null));
  drawSlateCard(ctx, card, rect, st);
}

// 左下弃牌堆 / 右下牌堆：石板牌堆叠 + 计数牌 + 标签
export function drawPile(ctx, x, y, count, label, align, hover = false) {
  const right = align === 'right';
  const stackX = right ? x - 70 : x;
  const stackY = y - 90;
  const badgeX = right ? x - 114 : x + 62;
  const badgeY = y - 38;
  ctx.save();
  if (hover) {
    ctx.shadowColor = 'rgba(207,224,232,0.55)';
    ctx.shadowBlur = 10;
  }
  drawSlateAsset(ctx, '界面-牌堆叠.svg', stackX, stackY, 70, 90);
  ctx.restore();
  drawSlateAsset(ctx, '界面-计数牌.svg', badgeX, badgeY, 52, 30);
  slateText(ctx, count, badgeX + 26, badgeY + 15, 15, '#eef5f8', 'rgba(0,0,0,.75)', 700);
  slateText(ctx, label, badgeX + 26, badgeY - 14, 12, hover ? '#f7e6c4' : '#a8bcc4', 'rgba(0,0,0,.85)', 500);
  return {
    x: Math.min(stackX, badgeX),
    y: stackY,
    w: Math.max(stackX + 70, badgeX + 52) - Math.min(stackX, badgeX),
    h: 90,
    cx: stackX + 35,
    cy: stackY + 45,
  };
}

// 左下色环盘（180×180）：石盘 + 6 颗可换色灯 + 当前圈 + 倍率（支持 1.6x 弹跳动画）
export function drawColorRing(ctx, cx, cy, lamps, cursor, multiplier, multScale = 1) {
  const size = 180;
  drawSlateAsset(ctx, '界面-色环盘.svg', cx - size / 2, cy - size / 2, size, size);
  for (let i = 0; i < 6; i++) {
    const a = (-90 + 60 * i) * Math.PI / 180;
    const lx = cx + Math.cos(a) * 60;
    const ly = cy + Math.sin(a) * 60;
    const lit = Boolean(lamps & (1 << i));
    if (lit) {
      drawSlateAsset(ctx, `界面-色环灯-亮.svg@${GLOW_HEX[WHEEL_COLS[i]]}`, lx - 14, ly - 14, 28, 28);
    } else {
      drawSlateAsset(ctx, '界面-色环灯-灭.svg', lx - 14, ly - 14, 28, 28);
    }
    if (i === cursor) {
      drawSlateAsset(ctx, '界面-色环当前圈.svg', lx - 19, ly - 19, 38, 38);
    }
  }
  if (cursor === 6) {
    drawSlateAsset(ctx, '界面-色环当前圈.svg', cx - 34, cy - 34, 68, 68);
  }
  ctx.save();
  ctx.translate(cx, cy + 1);
  ctx.scale(multScale, multScale);
  const fSize = multiplier >= 1000 ? 17 : multiplier >= 100 ? 20 : 24;
  slateText(ctx, '×' + multiplier, 0, 0, fSize, multScale > 1.05 ? '#ffe6a8' : multiplier > 1 ? '#f7e6c4' : '#e6eef2', 'rgba(0,0,0,.85)', 800, 'center', 78);
  ctx.restore();
}

// 色环右侧：红/绿/蓝宝石环形经验托 + 待结算预览环 + 升级箭头 ↑ + 0.7s 升级放大闪光
export function drawGemExpSockets(ctx, gx, topY, gems = null, pending = null, gemFlash = null, elapsed = 0) {
  const rows = [
    ['r', '宝石-红.svg', gems?.[0] || { level: 1, exp: 0 }, pending?.[0] || 0, 0],
    ['g', '宝石-绿.svg', gems?.[1] || { level: 1, exp: 0 }, pending?.[1] || 0, 1],
    ['b', '宝石-蓝.svg', gems?.[2] || { level: 1, exp: 0 }, pending?.[2] || 0, 2],
  ];
  rows.forEach(([k, fn, gem, pend, idx], i) => {
    const gy = topY + i * 56;
    let flashScale = 1;
    let flashGlow = 0;
    if (gemFlash && gemFlash.colors?.has(idx)) {
      const u = (elapsed - gemFlash.born) / (gemFlash.duration || 0.7);
      if (u >= 0 && u < 1) {
        // 40% 处放大到 1.4 倍、亮度翻倍
        const tri = u < 0.4 ? u / 0.4 : (1 - u) / 0.6;
        flashScale = 1 + 0.42 * tri;
        flashGlow = tri;
      }
    }

    ctx.save();
    ctx.translate(gx, gy);
    ctx.scale(flashScale, flashScale);
    if (flashGlow > 0) {
      ctx.shadowColor = GEM_ARC_COLOR[k];
      ctx.shadowBlur = 24 * flashGlow;
    }
    drawSlateAsset(ctx, '界面-宝石经验托.svg', -26, -26, 52, 52);
    const need = gemThreshold(gem.level);
    const p = Math.min(1, (gem.exp || 0) / need);
    const q = Math.min(1, ((gem.exp || 0) + pend) / need);
    if (q > p) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * q);
      ctx.strokeStyle = GEM_ARC_COLOR[k];
      ctx.globalAlpha *= 0.36;
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }
    if (p > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
      ctx.strokeStyle = GEM_ARC_COLOR[k];
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }
    drawSlateAsset(ctx, fn, -21, -21, 42, 42);
    if (flashGlow > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = flashGlow * 0.65;
      drawSlateAsset(ctx, fn, -21, -21, 42, 42);
      ctx.restore();
    }
    ctx.restore();

    slateText(ctx, 'Lv ' + gem.level, gx + 34, gy + 1, 14, flashGlow > 0 ? '#ffe5a8' : gem.level > 1 ? '#f7e6c4' : '#e6eef2', 'rgba(0,0,0,.85)', 600, 'left');
    if (q >= 1) {
      slateText(ctx, '↑', gx + 72, gy + 1, 14, '#ffd98a', 'rgba(0,0,0,.9)', 800, 'left');
    }
  });
}

// 序列里的单张牌（75×112）：上面写接法和倍率（如“补色 ×4”），下面写它打多少
export function drawChainSlot(ctx, rect, step, active = false, hover = false) {
  if (!step) return;
  const rel = step.relation;
  const topLabel = rel && rel !== '无色'
    ? `${rel} ×${step.multiplier}${step.rainbow ? ' 彩虹' : ''}`
    : (step.card?.id === 'lens' ? `×${step.multiplier}` : '');
  drawSlateCard(ctx, step.card, rect, {
    mode: active ? 'settle' : (hover ? 'hover' : null),
    hover,
  });
  const cx = rect.x + rect.w / 2;
  if (topLabel) {
    slateText(ctx, topLabel, cx, rect.y - 10, 12, step.rainbow ? '#ffe596' : '#c8d8e0', 'rgba(6,10,14,.94)', 700);
  }
  if (step.total > 0) {
    const by = rect.y + rect.h + 13;
    const baseStr = formatChineseNumber(step.total);
    slateText(ctx, baseStr, cx, by, 13, '#ffd98a', 'rgba(6,10,14,.94)', 700);
  }
}
