import { isScenePhase, cardVis } from '../game.js';
import { lobby, album, preferences } from '../draw/hall.js';
import { HUD, RULES } from '../config.js';
import { preview, lampCount, formatChineseNumber, previewPendingGems } from '../rules.js';
import { traitOf } from '../explore/roster.js';
import { combatLayout, dragVisual, dragDestination, drawTargetCorners } from './combat-drag.js';
import { drawCastSequence } from '../draw/actors.js';
import {
  INK, drawPointer, drawHeart, drawMonsterTag, drawMonsterDetail,
  drawSlateTooltip, shadowText, glow, rule,
} from '../draw/ui.js';
import {
  drawCard, cardStateFromPreview, drawPile, drawColorRing, drawGemExpSockets, drawChainSlot,
} from '../draw/cards.js';
import {
  drawSlateAsset, drawSlateButton, drawSlateCastButton, slateText, buttonState,
} from '../draw/slate-ui.js';
import { drawStudy } from '../draw/seal-study.js';

const hoverSprings = new WeakMap();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const rect = (x, y, w, h, action, arg) => ({ x, y, w, h, action, arg });
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const smooth = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

function stageShakeOffset(g) {
  if (!g.stageShake) return { x: 0, y: 0 };
  const u = (g.elapsed - g.stageShake.born) / (g.stageShake.duration || 0.35);
  if (u < 0 || u >= 1) return { x: 0, y: 0 };
  // 原型 @keyframes shake: 0% 0,0 -> 20% -10,4 -> 40% 9,-5 -> 60% -6,3 -> 80% 4,-2 -> 100% 0,0
  const kf = [
    [0, 0, 0],
    [0.2, -10, 4],
    [0.4, 9, -5],
    [0.6, -6, 3],
    [0.8, 4, -2],
    [1.0, 0, 0],
  ];
  for (let i = 0; i < kf.length - 1; i++) {
    const [t0, x0, y0] = kf[i];
    const [t1, x1, y1] = kf[i + 1];
    if (u >= t0 && u <= t1) {
      const k = (u - t0) / (t1 - t0);
      return { x: lerp(x0, x1, k), y: lerp(y0, y1, k) };
    }
  }
  return { x: 0, y: 0 };
}

function heartLoseAnim(g, idx) {
  if (!g.heartLose || g.heartLose.index !== idx) return null;
  const u = (g.elapsed - g.heartLose.born) / (g.heartLose.duration || 0.6);
  if (u < 0 || u >= 1) return null;
  // 0% scale(1) -> 30% scale(1.5) rotate(-15deg) -> 100% scale(1)
  const tri = u < 0.3 ? u / 0.3 : (1 - u) / 0.7;
  return {
    scale: 1 + 0.5 * tri,
    rotate: (-15 * Math.PI / 180) * tri,
  };
}

function slateBtn(ctx, zones, p, label, r, { primary = false, disabled = false, prefix = '弹窗-按钮', fontSize } = {}) {
  const hover = !disabled && inside(p, r);
  drawSlateButton(ctx, prefix, r, label, { hover, pressed: Boolean(p.down), selected: primary, disabled, fontSize });
  if (!disabled) zones.push(r);
  return hover;
}

function drawDimBackdrop(ctx, w, h, alpha = 0.72) {
  ctx.fillStyle = `rgba(5,8,12,${alpha})`;
  ctx.fillRect(0, 0, w, h);
}

// 左上：三颗石板心（支持半颗心与掉心放大歪斜动画）+ 护盾图标 + 战次说明；顶上正中：本回合总伤害牌（施法中往上滚）
function drawHeader(ctx, g, w) {
  const inBattle = Boolean(g.b && ['encounter', 'battle', 'cast', 'attack', 'death'].includes(g.phase));
  for (let i = 0; i < RULES.hearts; i++) {
    const st = g.hearts >= i + 1 ? 'full' : g.hearts >= i + 0.5 ? 'half' : 'empty';
    drawHeart(ctx, 42 + i * 38, 42, st, 34, heartLoseAnim(g, i));
  }
  let textX = 42 + RULES.hearts * 38 + 8;
  if (inBattle) {
    const hasShield = (g.b.shield || 0) > 0;
    drawSlateAsset(ctx, hasShield ? '界面-护盾-亮.svg' : '界面-护盾-暗.svg', textX - 4, 24, 34, 38);
    if (g.b.shield > 1) {
      slateText(ctx, g.b.shield, textX + 26, 54, 13, '#fff3dc', 'rgba(0,0,0,.85)', 700);
    }
    textX += 42;
    const caption = (g.b.elite ? '精英 · ' : '') + '第 ' + g.fight + ' 仗';
    slateText(ctx, caption, textX, 42, 14, '#c4d4da', 'rgba(4,8,12,.9)', 600, 'left');

    // 顶上正中：本回合总伤害牌（施法中每帧追差值的 18% 往上滚，打完换成中文单位）
    const pw = 360;
    const ph = 56;
    const px = w / 2 - pw / 2;
    const py = 14;
    drawSlateAsset(ctx, '界面-总伤害牌.svg', px, py, pw, ph);
    const rolling = g.phase === 'cast';
    const dmg = Math.max(0, Math.round(rolling ? (g.shownTurnDamage || 0) : (g.turnDamage || 0)));
    const dmgStr = rolling ? String(dmg) : formatChineseNumber(dmg);
    slateText(ctx, '本回合总伤害', px + 26, py + ph / 2, 13, '#a8bcc4', 'rgba(0,0,0,.8)', 500, 'left');
    slateText(ctx, dmgStr, px + pw - 26, py + ph / 2 + 1, dmg > 0 ? 24 : 18, dmg > 0 ? '#ffd98a' : '#9fb2ba', 'rgba(0,0,0,.88)', 800, 'right', 208);
  } else if (g.fight) {
    slateText(ctx, '第 ' + g.fight + ' 仗', textX, 42, 14, '#c4d4da', 'rgba(4,8,12,.9)', 600, 'left');
  }
}

function drawTravel(ctx, g, w, h, p, zones) {
  if (!g.locked) {
    slateBtn(ctx, zones, p, '点一下继续', rect(w / 2 - 104, h / 2 - 26, 208, 52, 'resume'), { primary: true });
    return;
  }
  if (g.phase === 'loot') {
    const label = g.canPickup ? 'E　拾取' : '走近地上的牌';
    if (g.canPickup) glow(ctx, w / 2, h / 2 + 56, 110, 'rgba(242,182,96,.6)', 0.35, 0.4);
    shadowText(ctx, label, w / 2, h / 2 + 56, g.canPickup ? 20 : 16, g.canPickup ? INK.warmHi : INK.muted, 'center', g.canPickup);
    if (g.canPickup) zones.push(rect(0, 0, w, h, 'pickup'));
  }
}

function drawTags(ctx, g, w, h, p, zones, dt) {
  const b = g.b;
  const battle = g.phase === 'battle' && !g.pileModal;
  const tags = (g.screenEnemies || []).filter(m => b.monsters[m.index]?.hp > 0 || (g.phase === 'cast' && (b.monsters[m.index]?.shownHp || 0) > 0.5)).map(m => {
    const mw = clamp(m.w * 0.62, 142, 186);
    const tag = rect(
      clamp(m.x - mw / 2, 42, w - mw - 42),
      clamp((g.phase === 'cast' ? m.labelY : m.top) - 66, 92, h - HUD.trayOffset - 92),
      mw, 58, 'target', m.index
    );
    const mon = b.monsters[m.index];
    const trait = traitOf(mon.kind);
    const status = [];
    if (trait === 'tiko') {
      const n = lampCount(g.phase === 'cast' ? g.castPlan.startLamps : b.lamps);
      status.push(n ? '躲光 −' + n * 10 + '%' : '躲光');
    } else {
      status.push('厚皮');
    }
    if (mon.attacks >= RULES.attacksBeforeRage) status.push('狂怒');
    if (g.phase === 'cast' && trait === 'elite') {
      mon._displayCd = Math.max(0, mon.countdown - (g.uiBells || 0));
    } else {
      mon._displayCd = mon.countdown;
    }
    return {
      m, tag,
      body: rect(m.x - m.w / 2, m.top, m.w, m.h, 'target', m.index),
      status,
      mon,
    };
  }).sort((a, b) => a.tag.x - b.tag.x);

  for (let i = 1; i < tags.length; i++) {
    tags[i].tag.x = Math.max(tags[i].tag.x, tags[i - 1].tag.x + tags[i - 1].tag.w + 46);
  }
  const shift = tags.length ? Math.max(0, tags.at(-1).tag.x + tags.at(-1).tag.w + 42 - w) : 0;
  for (const t of tags) {
    t.tag.x -= shift;
    if (battle) zones.push(t.body);
  }

  const active = battle && !g.cardDrag && [...zones, ...tags.map(t => t.tag)].findLast(z => z.action === 'target' && inside(p, z));
  for (const t of tags) {
    if (battle) zones.push(t.tag);
    if (t.m.index === b.target) {
      drawTargetCorners(ctx, t.m);
      if (g.phase === 'cast') drawCastSequence(ctx, t.m, g.castPlan.states, g.castIndex, g.elapsed);
    }
    const savedCd = t.mon.countdown;
    t.mon.countdown = t.mon._displayCd ?? savedCd;
    drawMonsterTag(ctx, t.mon, t.tag, t.status, t.m.index === b.target || active?.arg === t.m.index, dt);
    t.mon.countdown = savedCd;
  }

  const hovered = active && tags.find(t => t.m.index === active.arg);
  g.hoveredMonster = hovered ? hovered.m.index : null;
  if (hovered) {
    const { tag, mon, status } = hovered;
    const tw = 290;
    const th = 98;
    const above = tag.y - th - 10 >= 84;
    const x = above ? tag.x + (tag.w - tw) / 2 : (tag.x + tag.w / 2 > w / 2 ? tag.x - tw - 28 : tag.x + tag.w + 28);
    const y = above ? tag.y - th - 10 : clamp(tag.y - 10, 84, h - HUD.trayOffset - th - 10);
    drawMonsterDetail(ctx, mon, { x: clamp(x, 12, w - tw - 12), y, w: tw, h: th }, status);
  }
}

function transformedCard(cx, cy, angle, scale) {
  const halfW = HUD.handWidth * scale / 2;
  const halfH = HUD.handHeight * scale / 2;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const a = Math.abs(c) * halfW + Math.abs(s) * halfH;
  const b = Math.abs(s) * halfW + Math.abs(c) * halfH;
  return {
    x: cx - a, y: cy - b, w: a * 2, h: b * 2,
    hit(x, y) {
      const dx = x - cx;
      const dy = y - cy;
      return Math.abs(dx * c + dy * s) <= halfW && Math.abs(dy * c - dx * s) <= halfH;
    },
  };
}

// 0.35s 缓动逼近目标位置；悬停 0.15s 缓动（上浮 26px，放大 1.06x；能接上浮 10px，补色上浮 14px，断色不动）
function stepPose(pose, target, dt, duration = 0.35) {
  const k = 1 - Math.exp(-Math.max(0.001, dt || 1 / 60) / (duration * 0.28));
  pose.x = lerp(pose.x, target.x, k);
  pose.y = lerp(pose.y, target.y, k);
  pose.w = lerp(pose.w, target.w, k);
  pose.h = lerp(pose.h, target.h, k);
  pose.angle = lerp(pose.angle, target.angle || 0, k);
  pose.alpha = lerp(pose.alpha ?? 1, target.alpha ?? 1, k);
}

function drawHand(ctx, g, w, h, p, zones, dt, drop, battle) {
  const b = g.b;
  // 只把已经到发牌时刻的牌纳入扇形排版，实现补牌一张张飞入（每张约 0.11s）且扇形跟着平滑重排
  const visibleEntries = [];
  b.hand.forEach((card, i) => {
    const cv = cardVis(card);
    if (cv.dealAt !== undefined && g.elapsed < cv.dealAt) return;
    visibleEntries.push({ card, i, cv });
  });

  const n = visibleEntries.length;
  const maxSpan = n > 8 ? Math.min(w - 340, HUD.handSpan + 120) : HUD.handSpan;
  const gap = Math.min(HUD.handGap, (maxSpan - HUD.handWidth) / Math.max(1, n - 1));

  const hands = visibleEntries.map(({ card, i, cv }, visIdx) => {
    const u = n <= 1 ? 0 : 2 * visIdx / (n - 1) - 1;
    const targetCx = w / 2 + (visIdx - (n - 1) / 2) * gap;
    const targetCy = h - HUD.handHeight / 2 - 16 + u * u * HUD.handArc + drop;
    const targetAngle = u * HUD.handAngle;

    let nextSt = null;
    let state = null;
    if (battle) {
      nextSt = card.instant ? null : preview(b, [...b.line, card]).states.at(-1);
      state = cardStateFromPreview(nextSt, card, { hover: false });
    }
    const baseLift = battle ? (state?.lift || 0) : 0;

    // 如果刚从序列撤销回手牌，继承序列位置滑回手里；否则从右下牌堆飞入
    if (!cv.pose) {
      if (cv.seqPose) {
        cv.pose = { ...cv.seqPose, angle: 0, alpha: 1 };
        delete cv.seqPose;
      } else {
        cv.pose = { x: w - 61, y: h - 63, w: 54, h: 81, angle: -0.25, alpha: 0.25 };
      }
    }
    delete cv.seqPose;

    stepPose(cv.pose, {
      x: targetCx,
      y: targetCy - baseLift,
      w: HUD.handWidth,
      h: HUD.handHeight,
      angle: targetAngle,
      alpha: 1,
    }, dt, 0.35);

    const hs = hoverSprings.get(card) ?? { t: 0 };
    hoverSprings.set(card, hs);
    const hoverExtraLift = Math.max(0, 26 - baseLift) * hs.t;
    const scale = 1 + (1.06 - 1) * hs.t;
    const prior = transformedCard(cv.pose.x, cv.pose.y - hoverExtraLift, cv.pose.angle * (1 - hs.t), scale);
    return { card, i, cv, hs, state, nextSt, baseLift, prior };
  });

  let selected = null;
  if (battle && !g.cardDrag && !g.pileModal) {
    selected = hands.find(slot => slot.hs.t > 0.45 && slot.prior.hit(p.x, p.y));
    selected ??= hands.findLast(slot => slot.prior.hit(p.x, p.y));
  }
  if (selected && g._lastHoverCard !== selected.card) {
    g._lastHoverCard = selected.card;
    g.hooks?.sound?.('hover');
  } else if (!selected) {
    g._lastHoverCard = null;
  }

  const ordered = selected ? [...hands.filter(slot => slot !== selected), selected] : hands;

  for (const slot of ordered) {
    const { card, i, cv, hs, baseLift } = slot;
    const isSel = slot === selected;
    // 0.15 秒悬停缓动
    const hk = 1 - Math.exp(-Math.max(0.001, dt || 1 / 60) / 0.045);
    hs.t = lerp(hs.t, isSel ? 1 : 0, hk);

    const hoverExtraLift = Math.max(0, 26 - baseLift) * hs.t;
    const cx = cv.pose.x;
    const cy = cv.pose.y - hoverExtraLift;
    const a = cv.pose.angle * (1 - hs.t);
    const scale = (cv.pose.w / HUD.handWidth) * (1 + (1.06 - 1) * hs.t);
    const state = battle ? cardStateFromPreview(slot.nextSt, card, { hover: isSel }) : null;

    ctx.save();
    ctx.globalAlpha *= cv.pose.alpha ?? 1;
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.scale(scale, scale);
    if (g.cardDrag?.moving && g.cardDrag.card === card) ctx.globalAlpha *= 0.16;
    drawCard(ctx, card, { x: -HUD.handWidth / 2, y: -HUD.handHeight / 2, w: HUD.handWidth, h: HUD.handHeight }, state, isSel);
    ctx.restore();
    if (battle && !g.pileModal) zones.push({ ...transformedCard(cx, cy, a, scale), action: 'play', arg: i });
  }
  return selected?.card ?? null;
}

function drawCircleUndoButton(ctx, zones, p, cx, cy, size, iconFile, action, tooltipTitle, tooltipSub) {
  const r = {
    x: cx - size / 2, y: cy - size / 2, w: size, h: size, action,
    hit: (x, y) => Math.hypot(x - cx, y - cy) <= size / 2,
  };
  const hover = r.hit(p.x, p.y);
  const st = buttonState({ hover, pressed: Boolean(p.down) });
  drawSlateAsset(ctx, `界面-圆按钮-${st}.svg`, r.x, r.y, size, size);
  const iconSize = Math.round(size * 0.56);
  const dy = st === '按下' ? 2 : 0;
  drawSlateAsset(ctx, iconFile, cx - iconSize / 2, cy - iconSize / 2 + dy, iconSize, iconSize);
  zones.push(r);
  return hover ? { title: tooltipTitle, lines: [tooltipSub], x: cx - 100, y: cy - size / 2 - 72 } : null;
}

function drawPileModal(ctx, g, w, h, p, zones) {
  const isDraw = g.pileModal === 'draw';
  const raw = isDraw ? g.b.draw : g.b.discard;
  const cards = isDraw
    ? [...raw].sort((a, b) => a.col - b.col || a.name.localeCompare(b.name, 'zh'))
    : [...raw];

  drawDimBackdrop(ctx, w, h, 0.74);
  const pw = Math.min(920, w - 80);
  const ph = Math.min(580, h - 90);
  const px = (w - pw) / 2;
  const py = (h - ph) / 2;

  zones.push(rect(0, 0, w, h, 'closePile'));
  drawSlateAsset(ctx, '弹窗-牌堆大面板.svg', px, py, pw, ph);
  zones.push(rect(px, py, pw, ph, 'noop'));

  slateText(ctx, (isDraw ? '牌堆' : '弃牌堆') + ` · 共 ${cards.length} 张`, px + 44, py + 44, 22, '#f7e6c4', 'rgba(0,0,0,.8)', 700, 'left');
  if (isDraw) {
    slateText(ctx, '（已打乱排序展示，不代表抽牌顺序）', px + 240, py + 45, 13, '#9fb2ba', 'rgba(0,0,0,.7)', 500, 'left');
  }

  const closeR = rect(px + pw - 60, py + 22, 42, 42, 'closePile');
  const closeHover = inside(p, closeR);
  const closeSt = buttonState({ hover: closeHover, pressed: Boolean(p.down) });
  drawSlateAsset(ctx, `弹窗-关闭按钮-${closeSt}.svg`, closeR.x, closeR.y, closeR.w, closeR.h);
  zones.push(closeR);

  if (!cards.length) {
    slateText(ctx, '目前没有牌', w / 2, py + ph / 2, 18, '#9fb2ba', 'rgba(0,0,0,.7)', 500);
    return;
  }

  const cols = 7;
  const cw = 98;
  const ch = 147;
  const gapX = 18;
  const gapY = 18;
  const gridW = cols * cw + (cols - 1) * gapX;
  const startX = px + (pw - gridW) / 2;
  const startY = py + 84;
  const maxShow = Math.min(cards.length, cols * 3);
  for (let i = 0; i < maxShow; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    drawCard(ctx, cards[i], { x: startX + col * (cw + gapX), y: startY + row * (ch + gapY), w: cw, h: ch }, null, false);
  }
  if (cards.length > maxShow) {
    slateText(ctx, `还有 ${cards.length - maxShow} 张…`, w / 2, py + ph - 26, 13, '#cfe0e8', 'rgba(0,0,0,.7)', 500);
  }
}

function drawFlyingCards(ctx, g) {
  if (!g.flyingCards?.length) return;
  for (const f of g.flyingCards) {
    const u = clamp((g.elapsed - f.born) / (f.duration || 0.35), 0, 1);
    let cx, cy, cw, ch, alpha = 1;
    if (f.twoStage) {
      // 满 12 张溢出：0..0.42 飞到画面中间，0.42..0.68 停顿展示，0.68..1.0 飞入弃牌堆
      if (u < 0.42) {
        const k = smooth(u / 0.42);
        cx = lerp(f.fromX, f.midX, k);
        cy = lerp(f.fromY, f.midY, k);
        cw = lerp(f.fromW, f.midW, k);
        ch = lerp(f.fromH, f.midH, k);
      } else if (u < 0.68) {
        cx = f.midX; cy = f.midY; cw = f.midW; ch = f.midH;
      } else {
        const k = smooth((u - 0.68) / 0.32);
        cx = lerp(f.midX, f.toX, k);
        cy = lerp(f.midY, f.toY, k);
        cw = lerp(f.midW, f.toW, k);
        ch = lerp(f.midH, f.toH, k);
        alpha = 1 - 0.4 * k;
      }
    } else {
      const k = smooth(u);
      cx = lerp(f.fromX, f.toX, k);
      cy = lerp(f.fromY, f.toY, k);
      cw = lerp(f.fromW, f.toW, k);
      ch = lerp(f.fromH, f.toH, k);
      alpha = 1 - 0.35 * k;
    }
    ctx.save();
    ctx.globalAlpha *= alpha;
    drawCard(ctx, f.card, { x: cx - cw / 2, y: cy - ch / 2, w: cw, h: ch }, null, false);
    ctx.restore();
  }
}

function drawBattle(ctx, g, w, h, p, zones, dt) {
  const b = g.b;
  const floating = dragVisual(g, p);
  drawTags(ctx, g, w, h, p, zones, dt);

  const alive = g.phase !== 'death';
  const battle = g.phase === 'battle';
  const reveal = g.phase === 'encounter'
    ? smooth(g.phaseTime / HUD.handTravel)
    : alive ? 1 : 1 - smooth(g.phaseTime / HUD.handTravel);
  const tray = h - HUD.trayOffset;

  ctx.save();
  ctx.globalAlpha *= reveal;

  // 底部暗渐变托住手牌与色环
  const shadeTop = tray - 56;
  const dark = ctx.createLinearGradient(0, shadeTop, 0, h);
  dark.addColorStop(0, 'rgba(3,7,9,0)');
  dark.addColorStop(0.42, 'rgba(4,9,13,.66)');
  dark.addColorStop(1, 'rgba(4,9,13,.92)');
  ctx.fillStyle = dark;
  ctx.fillRect(0, shadeTop, w, h - shadeTop);

  const plan = g.phase === 'cast' && g.castPlan ? g.castPlan : preview(b);
  const active = g.phase === 'cast' ? g.castState : null;
  const curMult = active?.multiplier ?? plan.multiplier;

  // 倍率每变一次弹一下（放大到 1.6 倍再回来，0.3 秒）
  if (battle && g._lastPlanMult !== undefined && g._lastPlanMult !== curMult) {
    g.multPop = { born: g.elapsed, duration: 0.30 };
    g.hooks?.sound?.('mult');
  }
  if (battle) g._lastPlanMult = curMult;
  let multScale = 1;
  if (g.multPop) {
    const mu = (g.elapsed - g.multPop.born) / (g.multPop.duration || 0.30);
    if (mu >= 0 && mu < 1) multScale = 1 + 0.6 * Math.pow(1 - mu, 2);
  }

  // 左下：色环盘 + 右侧三色宝石环形经验（含待结算经验预览与升级闪光）+ 弃牌堆
  drawColorRing(ctx, 112, h - 222, active?.lamps ?? plan.lamps, active?.cursor ?? plan.cursor, curMult, multScale);
  const pendingXP = battle ? previewPendingGems(b, plan.states) : null;
  drawGemExpSockets(ctx, 232, h - 278, g.run.gems, pendingXP, g.gemFlash, g.elapsed);

  let tooltip = null;
  const settledDiscardExtra = g.phase === 'cast' ? Math.max(0, (g.settledCastIndex ?? -1) + 1) : 0;
  const discardCount = b.discard.length + settledDiscardExtra;
  const discardBox = drawPile(ctx, 26, h - 18, discardCount, '弃牌堆', 'left', false);
  const hoverDiscard = battle && !g.pileModal && !g.cardDrag && inside(p, discardBox);
  if (hoverDiscard) {
    drawPile(ctx, 26, h - 18, discardCount, '弃牌堆', 'left', true);
    tooltip = {
      title: `弃牌堆（${discardCount} 张）`,
      lines: ['打出去的牌放这里。牌堆抽空了，', '就洗回牌堆接着抽。满 12 张多抽的牌', '也进这里。点一下看有哪些牌。'],
      x: 26, y: discardBox.y - 118,
    };
  }
  if (battle && !g.pileModal) zones.push({ ...discardBox, action: 'openPile', arg: 'discard' });

  // 右下：牌堆 + 施法按钮 + 施法提示字
  const drawBox = drawPile(ctx, w - 26, h - 18, b.draw.length, '牌堆', 'right', false);
  const hoverDraw = battle && !g.pileModal && !g.cardDrag && inside(p, drawBox);
  if (hoverDraw) {
    drawPile(ctx, w - 26, h - 18, b.draw.length, '牌堆', 'right', true);
    tooltip = {
      title: `牌堆（还剩 ${b.draw.length} 张）`,
      lines: ['每回合补到 8 张；抽空了把弃牌堆', '洗回来。点一下看里面有哪些牌', '（不按顺序）。'],
      x: w - 254, y: drawBox.y - 118,
    };
  }
  if (battle && !g.pileModal) zones.push({ ...drawBox, action: 'openPile', arg: 'draw' });

  const castCx = w - 122;
  const castCy = h - 216;
  const castSize = 126;
  if (battle && !g.pileModal) {
    const r = {
      x: castCx - castSize / 2, y: castCy - castSize / 2, w: castSize, h: castSize,
      action: 'cast', hit: (x, y) => Math.hypot(x - castCx, y - castCy) <= castSize * 0.48,
    };
    const hover = r.hit(p.x, p.y);
    drawSlateCastButton(ctx, castCx, castCy, castSize, '施法', {
      hover, pressed: Boolean(p.down), selected: b.line.length > 0,
    });
    zones.push(r);
    slateText(ctx, '一张不排也能按，就是这回合不出牌', castCx - 12, castCy + 76, 12, '#8fa4ae', 'rgba(0,0,0,.85)', 500, 'center', 216);
  } else {
    const label = g.phase === 'encounter' ? '遇敌'
      : g.phase === 'cast' ? (g.castRainbowActive ? '彩虹 ×3' : '施法中')
        : g.phase === 'attack' ? '怪物攻击' : '击破';
    drawSlateCastButton(ctx, castCx, castCy, castSize, label, {
      disabled: g.phase !== 'cast', selected: g.phase === 'cast',
    });
    if (g.phase === 'cast') {
      slateText(ctx, '点画面一下加速，再点一下跳过', castCx - 12, castCy + 76, 12, '#ffd98a', 'rgba(0,0,0,.9)', 600, 'center', 216);
      zones.unshift(rect(0, 68, w, h - 68, 'castClick'));
    }
  }

  // 先画手牌（获取当前悬停手牌，用于序列上方“放进去以后：保底 xxx”预览）
  const hoveredCard = drawHand(ctx, g, w, h, p, zones, dt, (1 - reveal) * HUD.handHeight * 1.6, battle);

  // 中下：序列槽（平时隐藏；正在拖牌、或序列里有牌、或正在施法且尚有未飞完的牌时显示）
  const draggingQueue = Boolean(g.cardDrag?.moving && !g.cardDrag.card.instant);
  const firstActiveIdx = g.phase === 'cast' ? Math.max(0, (g.settledCastIndex ?? -1) + 1) : 0;
  const remainingStates = plan.states.slice(firstActiveIdx);
  const showTray = b.line.length > 0 || draggingQueue || (g.phase === 'cast' && remainingStates.length > 0);
  const to = dragDestination(g, p, w, h);

  if (showTray) {
    const count = remainingStates.length;
    const l = combatLayout(w, h, Math.max(1, count));
    drawSlateAsset(ctx, '界面-序列槽.svg', l.tray.x, l.tray.y, l.tray.w, l.tray.h);

    // 拖牌到序列上方时，序列区高亮
    if (draggingQueue && to?.where === 'line') {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 217, 138, 0.11)';
      ctx.strokeStyle = '#ffd98a';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#ffd98a';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.roundRect(l.tray.x + 4, l.tray.y + 4, l.tray.w - 8, l.tray.h - 8, 12);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (count === 0 && draggingQueue) {
      slateText(ctx, '把手牌拖到这里排进施法序列', w / 2, l.tray.y + l.tray.h / 2, 15, '#c8d6dc', 'rgba(0,0,0,.85)', 600);
    }

    // 序列上方预览行：保底 xxx　暴击最高 yyy　（这次会出彩虹）　放进去以后：保底 zzz
    let pvText = b.line.length > 0 || g.phase === 'cast'
      ? `保底 ${formatChineseNumber(plan.total)}　暴击最高 ${formatChineseNumber(plan.max)}${plan.rainbow ? '　（这次会出彩虹）' : ''}`
      : '序列是空的';
    let projStr = '';
    if (battle && hoveredCard && !hoveredCard.instant && !g.cardDrag) {
      const proj = preview(b, [...b.line, hoveredCard]);
      projStr = `　放进去以后：保底 ${formatChineseNumber(proj.total)}`;
    }
    if (!projStr) {
      slateText(ctx, pvText, w / 2, l.tray.y - 20, 15, '#e8eef2', 'rgba(4,8,12,.94)', 700);
    } else {
      slateText(ctx, pvText + projStr, w / 2, l.tray.y - 20, 15, '#ffd98a', 'rgba(4,8,12,.94)', 700);
    }

    // 序列里的每张牌（结算完的牌飞走后，后面的牌平滑往前挪）
    for (let k = 0; k < count; k++) {
      const origIdx = firstActiveIdx + k;
      const step = plan.states[origIdx];
      const rawCard = b.line[origIdx] || step?.card;
      if (!step || !rawCard) continue;
      const cv = cardVis(rawCard);
      const targetCx = l.x + k * l.pitch + HUD.slotWidth / 2;
      const targetCy = l.y + HUD.slotHeight / 2;
      if (!cv.seqPose) {
        if (cv.pose) {
          cv.seqPose = { x: cv.pose.x, y: cv.pose.y, w: cv.pose.w, h: cv.pose.h };
          delete cv.pose;
        } else {
          cv.seqPose = { x: targetCx, y: targetCy, w: HUD.slotWidth, h: HUD.slotHeight };
        }
      }
      stepPose(cv.seqPose, { x: targetCx, y: targetCy, w: HUD.slotWidth, h: HUD.slotHeight, angle: 0, alpha: 1 }, dt, 0.35);
      const slot = {
        x: cv.seqPose.x - cv.seqPose.w / 2,
        y: cv.seqPose.y - cv.seqPose.h / 2,
        w: cv.seqPose.w,
        h: cv.seqPose.h,
      };
      drawChainSlot(ctx, slot, step, g.phase === 'cast' && origIdx === g.castIndex, false);
    }

    // 撤销上一步 / 撤销全部（仅在排牌阶段且序列有牌时显示）
    if (battle && b.line.length > 0 && !g.pileModal) {
      const bx = l.tray.x + l.tray.w + 30;
      const t1 = drawCircleUndoButton(ctx, zones, p, bx, l.tray.y + 34, 46, '界面-图标-撤销一步.svg', 'undoLast', '撤销上一步', '把序列最后一张牌退回手里');
      const t2 = drawCircleUndoButton(ctx, zones, p, bx, l.tray.y + 90, 46, '界面-图标-撤销全部.svg', 'undoAll', '撤销全部', '把序列里所有牌退回手里');
      if (t1) tooltip = t1;
      else if (t2) tooltip = t2;
    }
  } else if (battle && hoveredCard && !hoveredCard.instant && !g.cardDrag) {
    // 序列空着且鼠标停在手牌上：显示“放进去以后：保底 xxx”
    const proj = preview(b, [hoveredCard]);
    if (proj.total > 0) {
      slateText(ctx, `放进去以后：保底 ${formatChineseNumber(proj.total)}　（暴击最高 ${formatChineseNumber(proj.max)}）`, w / 2, tray + 48, 15, '#ffd98a', 'rgba(4,8,12,.94)', 700);
    }
  }

  // 飞行中的牌（结算完飞入弃牌堆 / 立即释放飞入弃牌堆 / 洗牌飞回牌堆 / 满 12 张飞中间再进弃牌堆）
  drawFlyingCards(ctx, g);

  // 立即释放牌拖动提示
  if (battle && to?.where === 'instant') {
    slateText(ctx, `松开马上生效 · ${g.cardDrag.card.name}`, w / 2, tray + 52, 16, '#ffd98a', 'rgba(4,8,12,.94)', 700);
  }

  // 正在拖动的牌跟随鼠标并放大一点 (1.06x)
  if (battle && floating) {
    const cw = HUD.handWidth * 1.06;
    const ch = HUD.handHeight * 1.06;
    glow(ctx, floating.x, floating.y, cw * 1.05, g.cardDrag.card.instant ? 'rgba(240,192,96,.85)' : 'rgba(242,182,96,.8)', 0.45);
    drawCard(ctx, g.cardDrag.card, { x: floating.x - cw / 2, y: floating.y - ch / 2, w: cw, h: ch }, null, true);
  }

  // 补色白光（0.42 秒垂直白光束 + 画面白闪）
  if (g.whiteBeam) {
    const bu = (g.elapsed - g.whiteBeam.born) / (g.whiteBeam.duration || 0.42);
    if (bu >= 0 && bu < 1) {
      const ba = Math.sin(bu * Math.PI);
      const monScreen = (g.screenEnemies || []).find(m => m.index === g.whiteBeam.target) || (g.screenEnemies || [])[0];
      const bx = monScreen ? monScreen.x : w / 2;
      const by = monScreen ? monScreen.y : h * 0.48;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = ba * 0.88;
      const beamGrad = ctx.createLinearGradient(bx - 36, 0, bx + 36, 0);
      beamGrad.addColorStop(0, 'rgba(255,255,255,0)');
      beamGrad.addColorStop(0.5, 'rgba(255,255,255,0.95)');
      beamGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = beamGrad;
      ctx.fillRect(bx - 36, 0, 72, by);
      ctx.globalAlpha = ba * 0.24;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  // 出彩虹：全屏闪一道横向六色渐变彩虹（0.7 秒，最亮约 0.55 透明）
  if (g.rainbowFlash) {
    const ru = typeof g.rainbowFlash === 'number'
      ? 1 - g.rainbowFlash
      : (g.elapsed - g.rainbowFlash.born) / (g.rainbowFlash.duration || 0.70);
    if (ru >= 0 && ru < 1) {
      const ra = Math.sin(ru * Math.PI) * 0.55;
      ctx.save();
      ctx.globalAlpha = ra;
      const rg = ctx.createLinearGradient(0, 0, w, 0);
      rg.addColorStop(0, '#e5484d');
      rg.addColorStop(0.2, '#f2cc3c');
      rg.addColorStop(0.4, '#46a758');
      rg.addColorStop(0.6, '#2a8f8b');
      rg.addColorStop(0.8, '#3e8ed0');
      rg.addColorStop(1, '#8e4ec6');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  // 画面中间偏下统一出字位置（原型 #msg，1 秒左右淡掉）
  if (g.centerMsg) {
    const age = g.elapsed - g.centerMsg.born;
    const dur = g.centerMsg.duration || 1.1;
    if (age >= 0 && age < dur) {
      const alpha = age > dur - 0.3 ? Math.max(0, (dur - age) / 0.3) : Math.min(1, (age + 0.08) * 8);
      ctx.save();
      ctx.globalAlpha *= alpha;
      const my = tray - 48;
      shadeShape(ctx, w / 2, my, Math.max(220, g.centerMsg.text.length * 16 + 56), 28);
      slateText(ctx, g.centerMsg.text, w / 2, my, 22, '#ffd98a', 'rgba(4,8,12,.96)', 800);
      ctx.restore();
    }
  }

  if (tooltip && !g.pileModal) {
    drawSlateTooltip(ctx, clamp(tooltip.x, 12, w - 240), clamp(tooltip.y, 80, h - 140), tooltip.title, tooltip.lines);
  }

  ctx.restore();

  if (g.pileModal && battle) {
    drawPileModal(ctx, g, w, h, p, zones);
  }
}

function shadeShape(ctx, cx, cy, rx, ry) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, 'rgba(4,8,12,0.78)');
  g.addColorStop(0.65, 'rgba(4,8,12,0.45)');
  g.addColorStop(1, 'rgba(4,8,12,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
  ctx.restore();
}

function drawReward(ctx, g, w, h, p, zones) {
  const t = smooth(g.phaseTime / HUD.lootRise);
  drawDimBackdrop(ctx, w, h, 0.72);
  const pw = 760;
  const ph = 520;
  const px = (w - pw) / 2;
  const py = (h - ph) / 2 + 12;
  drawSlateAsset(ctx, '弹窗-石板面板.svg', px, py, pw, ph);
  drawSlateAsset(ctx, '弹窗-胜利挂旗.svg', w / 2 - 190, py - 42, 380, 96);
  slateText(ctx, '战利品', w / 2, py + 4, 28, '#fff2d2', 'rgba(20,10,4,.85)', 700);
  slateText(ctx, '选一张异能牌加入牌组', w / 2, py + 74, 15, '#c8d6dc', 'rgba(0,0,0,.75)', 500);

  const cw = 156;
  const ch = 234;
  const gap = 34;
  const start = w / 2 - (3 * cw + 2 * gap) / 2;
  const cy = py + 112;
  for (let i = 0; i < 3; i++) {
    const sx = start + (cw + gap) * i;
    drawSlateAsset(ctx, '弹窗-奖励空槽.svg', sx - 8, cy - 8, cw + 16, ch + 16);
    if (!g.choices[i]) continue;
    const zone = rect(sx, cy + (1 - t) * 140, cw, ch, 'choose', i);
    const hover = inside(p, zone);
    if (hover) zone.y -= 8;
    drawCard(ctx, g.choices[i], zone, hover ? { mode: 'hover', hover: true } : null, hover);
    zones.push(zone);
  }
  ctx.save();
  ctx.globalAlpha *= clamp((t - 0.65) / 0.35, 0, 1);
  slateBtn(ctx, zones, p, '不要', rect(w / 2 - 84, py + ph - 78, 168, 48, 'choose', -1));
  ctx.restore();
}

function drawDialog(ctx, g, w, h, p, zones) {
  if (g.phase === 'choose') {
    drawReward(ctx, g, w, h, p, zones);
    return;
  }
  drawDimBackdrop(ctx, w, h, 0.72);

  if (g.phase === 'result') {
    const failed = g.reason !== '主动撤离';
    const pw = 560;
    const ph = 420;
    const px = (w - pw) / 2;
    const py = (h - ph) / 2 + 10;
    if (failed) {
      drawSlateAsset(ctx, '弹窗-战败暗雾.svg', w / 2 - 360, h / 2 - 240, 720, 480);
      slateText(ctx, '失守', w / 2, py + 44, 34, '#f0a698', 'rgba(10,4,4,.9)', 700);
      slateText(ctx, g.reason || '战斗失败', w / 2, py + 84, 16, '#c8b8b4', 'rgba(0,0,0,.8)', 500);
    } else {
      drawSlateAsset(ctx, '弹窗-石板面板.svg', px, py, pw, ph);
      drawSlateAsset(ctx, '弹窗-胜利挂旗.svg', w / 2 - 190, py - 42, 380, 96);
      slateText(ctx, '本局结算', w / 2, py + 4, 26, '#fff2d2', 'rgba(20,10,4,.85)', 700);
      slateText(ctx, g.reason, w / 2, py + 72, 15, '#f0c27a', 'rgba(0,0,0,.75)', 600);
    }
    const rows = [
      ['经历战斗', g.fight + ' 仗'],
      ['封印', g.seals.length ? '大巴多姆 ×' + g.seals.length : '无'],
      ['最高回合伤害', formatChineseNumber(g.bestTurn)],
      ['最高单发伤害', formatChineseNumber(g.bestHit)],
    ];
    rows.forEach(([label, value], i) => {
      const cy = py + 126 + i * 48;
      rule(ctx, px + 56, cy - 22, px + pw - 56, 'rgba(180,200,210,.22)');
      slateText(ctx, label, px + 60, cy, 16, '#b6c8d0', 'rgba(0,0,0,.75)', 500, 'left');
      slateText(ctx, value, px + pw - 60, cy, 20, '#f7e6c4', 'rgba(0,0,0,.8)', 700, 'right');
    });
    slateBtn(ctx, zones, p, '再来一局', rect(w / 2 - 110, py + ph - 78, 220, 52, 'restart'), { primary: true });
    return;
  }

  if (g.phase === 'elite') {
    const pw = 660;
    const ph = 370;
    const px = (w - pw) / 2;
    const py = (h - ph) / 2 + 12;
    drawSlateAsset(ctx, '弹窗-石板面板.svg', px, py, pw, ph);
    drawSlateAsset(ctx, '弹窗-胜利挂旗.svg', w / 2 - 190, py - 42, 380, 96);
    slateText(ctx, '精英击破', w / 2, py + 4, 26, '#fff2d2', 'rgba(20,10,4,.85)', 700);
    drawCard(ctx, { id: 'seal', ...RULES.extras.seal }, { x: px + 46, y: py + 74, w: 164, h: 246 }, null, false);
    slateText(ctx, '大巴多姆', px + 246, py + 108, 28, '#f7e6c4', 'rgba(0,0,0,.8)', 700, 'left');
    slateText(ctx, '封印或放走，都回 1 颗心。', px + 246, py + 156, 16, '#c8d6dc', 'rgba(0,0,0,.75)', 500, 'left');
    slateText(ctx, '封印才会得到这张封印牌。', px + 246, py + 188, 15, '#f0c27a', 'rgba(0,0,0,.75)', 600, 'left');
    slateBtn(ctx, zones, p, '封印', rect(px + 246, py + 256, 170, 50, 'seal'), { primary: true });
    slateBtn(ctx, zones, p, '放走', rect(px + 434, py + 256, 170, 50, 'release'));
    return;
  }

  const pw = 520;
  const ph = 260;
  const px = (w - pw) / 2;
  const py = (h - ph) / 2;
  drawSlateAsset(ctx, '弹窗-确认面板.svg', px, py, pw, ph);
  slateText(ctx, '接下来去哪里？', w / 2, py + 62, 26, '#f7e6c4', 'rgba(0,0,0,.8)', 700);
  slateText(ctx, '撤离会结束本局并结算成绩。', w / 2, py + 108, 15, '#b6c8d0', 'rgba(0,0,0,.75)', 500);
  slateBtn(ctx, zones, p, '接着走', rect(px + 54, py + 166, 194, 52, 'continue'), { primary: true });
  slateBtn(ctx, zones, p, '撤离', rect(px + pw - 248, py + 166, 194, 52, 'exit'));
}

export function renderHUD(ctx, g, w, h, pointer, dt) {
  const zones = [];
  const p = pointer ?? { x: -999, y: -999, down: false };
  const shk = stageShakeOffset(g);
  ctx.save();
  if (shk.x || shk.y) ctx.translate(shk.x, shk.y);

  if (g.phase === 'start') {
    lobby(ctx, g, w, h, p, zones);
  } else if (g.phase === 'study') {
    drawStudy(ctx, g.study, w, h, p, zones);
  } else if (g.phase === 'album') {
    album(ctx, g, w, h, p, zones);
  } else if (g.phase === 'settings') {
    preferences(ctx, g, w, h, p, zones);
  } else if (g.phase === 'sealing') {
    slateText(ctx, '金线合拢 · 封印', w / 2, h * 0.72, 26, '#f7d48c', 'rgba(0,0,0,.85)', 700);
  } else if (['walk', 'loot'].includes(g.phase)) {
    drawHeader(ctx, g, w);
    drawTravel(ctx, g, w, h, p, zones);
  } else if (['encounter', 'battle', 'cast', 'attack', 'death'].includes(g.phase)) {
    drawBattle(ctx, g, w, h, p, zones, dt);
    drawHeader(ctx, g, w);
  } else {
    drawDialog(ctx, g, w, h, p, zones);
  }

  // 右上角：回合牌 + 逃跑小按钮 + 返回大厅小按钮
  const lock = g.locked && ['walk', 'loot'].includes(g.phase);
  if (isScenePhase(g.phase) && !g.pileModal) {
    let right = w - 22;
    const hallR = rect(right - 108, 22, 108, 36, 'hall');
    slateBtn(ctx, zones, p, '返回大厅 H', hallR, { prefix: '界面-小按钮', fontSize: 13 });
    right -= 118;
    if (['encounter', 'battle', 'cast', 'attack'].includes(g.phase) && g.hearts > 0 && g.b?.monsters.some(m => m.hp > 0)) {
      const fleeR = rect(right - 82, 22, 82, 36, 'flee');
      slateBtn(ctx, zones, p, '逃跑', fleeR, { prefix: '界面-小按钮', fontSize: 13 });
      right -= 92;
    }
    if (g.b && ['encounter', 'battle', 'cast', 'attack', 'death'].includes(g.phase)) {
      const trW = 136;
      const trH = 38;
      drawSlateAsset(ctx, '界面-回合牌.svg', right - trW, 21, trW, trH);
      slateText(ctx, `第 ${g.b.turn} / ${RULES.turnLimit} 回合`, right - trW / 2, 40, 14, '#eef4f6', 'rgba(0,0,0,.8)', 600);
    }
  }

  if (lock) drawPointer(ctx, w / 2, h / 2, g.canPickup && g.phase === 'loot');
  else if (p.x >= 0 && p.y >= 0) drawPointer(ctx, p.x, p.y, zones.some(z => z.action !== 'noop' && z.action !== 'castClick' && (z.hit ? z.hit(p.x, p.y) : inside(p, z))));
  ctx.restore();
  return zones;
}
