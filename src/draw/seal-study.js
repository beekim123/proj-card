// A view of package 17, not a reward. This never reads or writes the run, deck or collection.
import { createSealState, sealTiko, drawCardFace } from '../../art/cards/index.js';
import { drawDamageNumber } from './slate-ui.js';
import { text, INK, drawButton } from './ui.js';
const card = { id: 'seal_tiko', name: '封印 · 提可', text: '登场打 4 段，每段 6 × 倍率', col: 8 };
export function createStudy(runtime, seed) {
  const p = runtime.p5,
    state = createSealState(p, seed),
    target = runtime.create('badom', { seed });
  return { p, state, target, hits: [], heard: 0, time: 0, hover: false };
}
export function launchStudy(v) {
  if (!v.from) return;
  if (sealTiko.done(v.state)) sealTiko.trigger(v.state, 'idle');
  if (v.state.mode === 'play') return;
  const { hitTimes } = sealTiko.trigger(v.state, 'play', { from: v.from, target: v.to, hits: 4 });
  v.hits = hitTimes;
  v.heard = 0;
  v.time = 0;
}
export function updateStudy(v, dt, sound) {
  sealTiko.update(v.state, dt, v.p);
  v.target.update(dt);
  v.time += dt;
  if (v.state.mode === 'play' && v.heard < v.hits.length && v.time >= v.hits[v.heard]) {
    v.heard++;
    v.target.trigger('hit', { damage: 6 });
    sound?.('hit');
  }
}
export function drawStudy(c, v, w, h, ptr, z) {
  c.fillStyle = 'rgba(4,12,16,.72)';
  c.fillRect(0, 0, w, h);
  const cw = Math.min(282, h * 0.37),
    ch = cw * 1.4,
    r = { x: w * 0.23 - cw / 2, y: h * 0.46 - ch / 2, w: cw, h: ch };
  const over = ptr.x >= r.x && ptr.x <= r.x + cw && ptr.y >= r.y && ptr.y <= r.y + ch;
  if (over !== v.hover) {
    v.hover = over;
    sealTiko.trigger(v.state, over ? 'hover' : 'unhover');
  }
  text(c, '封印牌试样', w * 0.09, h * 0.11, 34, INK.light);
  text(c, '提可　 /　动态原画演示，不计入收录', w * 0.09, h * 0.17, 17, INK.muted);
  v.from = { x: r.x + cw * 0.06, y: r.y + (ch * 12) / 280, w: cw * 0.88, h: (ch * 150) / 280 };
  v.to = { x: w * 0.7, y: h * 0.43, size: h * 0.19 };
  v.target.draw(v.to.x, h * 0.71, h * 0.0021);
  drawCardFace(c, card, r, { p: v.p, sealState: v.state, hover: over });
  sealTiko.drawScreen(v.p, v.state, w, h);
  if (v.heard && v.time - v.hits[v.heard - 1] < 0.28) {
    drawDamageNumber(c, 6, v.to.x + 80, v.to.y - 8 - v.heard * 7, { kind: 'extra' });
  }
  const playing = v.state.mode === 'play' && !sealTiko.done(v.state);
  for (const [action, label, x] of [
    ['back', '‹　返回卡册', w * 0.08],
    ['trycard', v.state.mode === 'play' ? '再演一次' : '打出试样', w * 0.51],
  ]) {
    const b = { action, x, y: h * 0.82, w: 198, h: 48 };
    if (action === 'trycard' && playing) continue;
    drawButton(
      c,
      b,
      label,
      ptr.x >= x && ptr.x <= x + b.w && ptr.y >= b.y && ptr.y <= b.y + b.h,
      action === 'trycard',
    );
    z.push(b);
  }
}
