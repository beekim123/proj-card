// 卡册状态（2026-11-20 第三版：照 30 包 Neo 的「深林碑廊」接进来）。
// 一排牌左右滚（拖、滚轮、箭头键、底部卷轴条、点两侧的牌），正中那张放大；点正中的牌拿出来细看。
// 不碰局、战斗、世界和声音系统；要放的声音写进 a.sfx，由外面取走去放。
import { RULES } from '../config.js';
import { profile } from '../storage/profile.js';

export const W = 1440, H = 810;
export const GEMS = Array.from({ length: 7 }, (_, i) => 'gem' + i);
const GEM_VALS = [[5, 0, 0], [4, 7, 0], [0, 5, 0], [0, 4, 7], [0, 0, 5], [7, 0, 4], [4, 5, 6]];
export const cardFor = id => id.startsWith('gem')
  ? { id: 'gem', col: +id[3], name: RULES.colors[+id[3]] + '宝石', vals: GEM_VALS[+id[3]], text: '每颗宝石打一段' }
  : id === 'seal' ? { id: 'seal', ...RULES.extras.seal } : { id, ...RULES.extras[id] };

// 卡集：一套牌配一张背景。现在只有夜林这一套，背景先用通用的；以后每个卡集换自己的背景。
export const SETS = [{
  id: 'night', name: '夜林', background: 'generic',
  cats: [
    { name: '色光', badge: null, ids: GEMS, how: '出发时起手就有' },
    { name: '法术', badge: '徽记-法术.svg', ids: RULES.loot, how: '打赢一仗后，从掉落的三张里挑' },
    { name: '封印', badge: '徽记-封印.svg', ids: ['seal'], how: '打赢精英战后，封印大巴多姆' },
  ],
}];
export const allIds = SETS.flatMap(s => s.cats.flatMap(c => c.ids));
export const has = id => profile.cards.includes(id);
export const clip = (x, l = 0, h = 1) => Math.min(h, Math.max(l, x));
export function fit(w, h) { const s = Math.min(w / W, h / H); return { s, x: (w - W * s) / 2, y: (h - H * s) / 2 }; }
export const setOf = a => SETS[a.set] || SETS[0];
// a.cat = -1 是“全部”，0.. 是各章
export const listOf = a => a.cat < 0 ? setOf(a).cats.flatMap(c => c.ids) : setOf(a).cats[a.cat].ids;
export const catForId = (a, id) => setOf(a).cats.find(c => c.ids.includes(id)) || setOf(a).cats[0];
// 底部卷轴条（看和拖共用）
export const SCRUB = { x: 250, y: 744, w: 940, h: 30, pad: 22 };
const PX_PER_CARD = 125;

export function openAlbum(a = {}) {
  Object.assign(a, {
    view: 'gallery', set: 0, cat: -1, index: 0, pos: 0, vel: 0, arrival: 0, depart: false, exitReady: false,
    id: null, progress: 0, closing_card: false, flipped: false, flip: 0, drag: null, inspectAt: -9, wheelAt: -9,
    sfx: [], t: 0, opaque: true, spread: 0,
  });
  a.index = a.spread = a.pos = middle(a);   // 一进来停在这一排正中，两边都有牌
  return a;
}
const middle = a => Math.floor((listOf(a).length - 1) / 2);
const sfx = (a, name, opts) => a.sfx.push([name, opts]);

function go(a, i, quiet) {
  const j = clip(Math.round(i), 0, listOf(a).length - 1);
  if (j !== a.index && !quiet) sfx(a, 'page', { speed: 1.25 });
  a.index = a.spread = j;
}
function selectCat(a, c) {
  c = clip(c | 0, -1, setOf(a).cats.length - 1);
  if (c === a.cat) return;
  a.cat = c; a.index = a.spread = a.pos = middle(a); a.vel = 0; sfx(a, 'page', { speed: 0.9 });
}
function putBack(a) { if (a.id && !a.closing_card) { a.closing_card = true; sfx(a, 'cardIn'); } }

export function albumAction(a, action, arg) {
  if (!a.view) openAlbum(a);
  if (a.depart) return true;
  if (action === 'escape' || action === 'back') {
    if (a.id) putBack(a); else a.depart = true;
    return true;
  }
  if (a.id) {
    if (action === 'putback') putBack(a);
    else if (action === 'flip') { a.flipped = !a.flipped; sfx(a, 'page', { speed: 0.8 }); }
    else if (action === 'study') return a.id !== 'seal';
    return true;
  }
  if (action === 'category') selectCat(a, arg);
  else if (action === 'step') go(a, a.index + (arg < 0 ? -1 : 1));
  else if (action === 'wheel') { if (a.t - a.wheelAt > 0.12) { a.wheelAt = a.t; go(a, a.index + (arg < 0 ? -1 : 1)); } }
  else if (action === 'folio') go(a, arg | 0);
  else if (action === 'study') return listOf(a)[a.index] !== 'seal';   // 封印牌试演交给外面开
  else if (action === 'inspect') {
    if (arg === listOf(a)[a.index] && has(arg) && Math.abs(a.pos - a.index) < 0.45) {
      a.id = arg; a.closing_card = false; a.progress = 0; a.flipped = false; a.flip = 0; a.inspectAt = a.t; sfx(a, 'cardOut');
    }
  }
  return true;
}

export function updateAlbum(a, dt) {
  if (!a.view) openAlbum(a);
  dt = Math.min(dt, 1 / 30);
  a.t += dt;
  a.arrival = clip(a.arrival + (a.depart ? -1 : 1) * dt * 2.4);
  if (a.depart && !a.arrival) a.exitReady = true;
  if (!a.drag?.moved) a.pos += (a.index - a.pos) * Math.min(1, dt * 9);   // 追到停的那张（跟 Neo 原型一样的手感）
  if (Math.abs(a.pos - a.index) < 0.002) a.pos = a.index;
  if (a.id) {
    a.progress = clip(a.progress + (a.closing_card ? -1 : 1) * dt * 4);
    a.flip += ((a.flipped ? Math.PI : 0) - a.flip) * Math.min(1, dt * 10);
    if (a.closing_card && !a.progress) { a.id = null; a.closing_card = false; a.flipped = false; a.flip = 0; }
  }
}

// 拖：按住走廊左右拖（带惯性，停下吸到最近一张）；按住底部卷轴条直接定位。点击交给外面的按钮区。
export function albumPointer(a, type, x, y, w, h) {
  if (!a.view || a.depart || a.arrival < 0.98) { a.drag = null; return false; }
  const f = fit(w, h), px = (x - f.x) / f.s, py = (y - f.y) / f.s, now = performance.now() / 1000;
  const justOpened = a.id && a.t - a.inspectAt < 0.08;   // 按下那一下刚点开细看：也许是要拖
  if (a.id && !justOpened && !a.drag) return false;
  const n = listOf(a).length, scrubTo = () => { const k = clip((px - SCRUB.x - SCRUB.pad) / (SCRUB.w - SCRUB.pad * 2)); a.pos = k * Math.max(0, n - 1); };
  if (type === 'down') {
    const scrub = px >= SCRUB.x && px <= SCRUB.x + SCRUB.w && py >= SCRUB.y - 10 && py <= SCRUB.y + SCRUB.h + 10;
    a.drag = { x0: px, last: px, t: now, start: a.pos, moved: scrub, scrub, v: 0 };
    if (scrub) { scrubTo(); go(a, a.pos, true); }
    return scrub;
  }
  if (!a.drag) return false;
  const d = a.drag;
  if (type === 'move') {
    if (d.scrub) { scrubTo(); go(a, a.pos); return true; }
    if (Math.abs(px - d.x0) > 8 && !d.moved) {
      d.moved = true;
      if (a.id) { a.id = null; a.closing_card = false; a.progress = 0; }   // 其实是拖，不是点开
    }
    if (!d.moved) return false;
    const dt = Math.max(1 / 240, now - d.t);
    a.pos = clip(d.start - (px - d.x0) / PX_PER_CARD, -0.45, n - 0.55);
    d.v = d.v * 0.6 + (-(px - d.last) / PX_PER_CARD / dt) * 0.4; d.last = px; d.t = now;
    return true;
  }
  a.drag = null;
  if (!d.moved) return false;
  if (!d.scrub) go(a, a.pos + clip(d.v * 0.08, -2, 2));
  else go(a, a.pos);
  return true;
}

export function hit(q, p) { return q.hit ? q.hit(p.x, p.y) : p.x >= q.x && p.y >= q.y && p.x <= q.x + q.w && p.y <= q.y + q.h; }
export { profile };
