// 在无头 Chrome 里跑：把 art/svg/*.svg 逐帧冻住、画成 PNG、拼成大图，传回 tools/export-sprites.mjs。
// 参数（2026-11-10 第一次导出后按内存定，见 新卡牌/精灵图规范.md 第 2 节）：
// - 静止图（待机第 0 帧，给 <img>、九宫格、图标用）一律 2 倍；
// - 新画法会动的帧：事件 30 帧/秒，循环 15 帧/秒；大件（怪、木桩、门、战利品宝箱、徽记、牌背、门环）1 倍，其余 1.5 倍；
// - 每个动作单独拼一组大图，游戏里用到哪个动作才加载哪组。
const EVENT_FPS = 30;
const LOOP_FPS = 15;
const MAX_SHEET = 4096;
const STILL_SCALE = 2;
const BIG = new Set(['dummy', 'ui_door', 'loot_chest', 'title_emblem', 'card_back', 'npc_knocker']);
const scaleOf = def => def.id.startsWith('mon_') || BIG.has(def.id) ? 1 : 1.5;
const ONLY = window.ONLY ?? [];

const post = (url, body) => fetch(url, { method: 'POST', body });
const log = message => post('/log', message);
(async () => { try { await main(); } catch (error) { await post('/fail', String(error?.stack ?? error)); } })();

async function sha(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 染色素材每种颜色导一套。key 和游戏里用的颜色一一对应（src/art/sprites.ts 里按颜色找 key）。 */
function tintVariants(palette) {
  const list = Object.entries(palette.mix).filter(([, color]) => typeof color === 'string' && color.startsWith('#')).map(([key, color]) => [key, color]);
  list.push(['text', palette.text], ['textDim', palette.textDim]);
  return list;
}

async function main() {
  const manifest = await (await fetch('/art-manifest.json', { cache: 'no-store' })).json();
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0';
  document.body.append(host);
  const out = { version: 1, eventFps: EVENT_FPS, loopFps: LOOP_FPS, assets: {} };
  for (const def of manifest.assets) {
    if (ONLY.length && !ONLY.includes(def.id)) continue;
    const response = await fetch(`/svg/${def.id}.svg`, { cache: 'no-store' });
    if (!response.ok) { await log(`${def.id}：没有 SVG，跳过`); continue; }
    const text = await response.text();
    const hash = await sha(text);
    const variants = def.tint ? tintVariants(manifest.palette) : [[null, null]];
    for (const [key, color] of variants) {
      const name = key ? `${def.id}@${key}` : def.id;
      const entry = await exportAsset(host, def, text, name, color);
      entry.hash = hash;
      out.assets[name] = entry;
    }
  }
  await post('/done', JSON.stringify(out));
}

const kebab = name => name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);

async function exportAsset(host, def, text, name, color) {
  const [, , W, H] = def.viewBox.trim().split(/[\s,]+/).map(Number);
  const scale = scaleOf(def);
  const CW = Math.round(W * scale), CH = Math.round(H * scale);
  const SW = Math.round(W * STILL_SCALE), SH = Math.round(H * STILL_SCALE);
  host.innerHTML = text;
  const svg = host.querySelector('svg');
  svg.classList.add(`svg-${def.id}`);
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  if (color) svg.style.color = color;
  const live = [svg, ...svg.querySelectorAll('*')];
  const index = new Map(live.map((element, i) => [element, i]));
  const slotIds = [...Object.keys(def.slots ?? {}), ...((def.parts ?? []).includes('icon_slot') ? ['icon_slot'] : [])];

  let state;
  const setState = next => {
    if (state === next) return;
    state = next;
    svg.removeAttribute('data-anim'); void svg.getBoundingClientRect();
    if (next) svg.setAttribute('data-anim', next);
    void svg.getBoundingClientRect();
  };
  const seek = t => { const list = svg.getAnimations({ subtree: true }); for (const a of list) { a.pause(); a.currentTime = t; } return list; };
  const loopPeriod = list => Math.max(0, ...list.filter(a => a.effect.getTiming().iterations === Infinity).map(a => Number(a.effect.getTiming().duration) || 0));

  // 冻住：只把正在播的动画所改的那几个属性，按此刻的计算值写成内联样式，再关掉全部动画
  const freeze = () => {
    const clone = svg.cloneNode(true);
    const copies = [clone, ...clone.querySelectorAll('*')];
    for (const animation of svg.getAnimations({ subtree: true })) {
      const target = animation.effect?.target; if (!target || !index.has(target)) continue;
      const props = new Set(animation.effect.getKeyframes().flatMap(k => Object.keys(k)).filter(k => !['offset', 'computedOffset', 'easing', 'composite'].includes(k)));
      const computed = getComputedStyle(target);
      for (const prop of props) { const css = kebab(prop); copies[index.get(target)].style.setProperty(css, computed.getPropertyValue(css)); }
    }
    const off = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    off.textContent = '*{animation:none!important;transition:none!important}';
    clone.prepend(off);
    clone.setAttribute('width', SW); clone.setAttribute('height', SH);
    return new XMLSerializer().serializeToString(clone);
  };
  const slotMatrices = () => {
    if (!slotIds.length) return undefined;
    const result = {};
    for (const id of slotIds) {
      const g = live.find(e => e.id === id); if (!g) continue;
      const m = g.getCTM();
      result[id] = [m.a, m.b, m.c, m.d, m.e, m.f].map(v => Math.round(v * 1000) / 1000);
    }
    return result;
  };

  // 要导的动作
  const plan = [];
  setState(null);
  const idlePeriod = loopPeriod(seek(0));
  plan.push({ name: 'idle', state: null, start: 0, len: idlePeriod, fps: LOOP_FPS, loop: true });
  for (const [event, ms] of Object.entries(def.events ?? {})) {
    const stay = (def.stay ?? []).includes(event);
    plan.push({ name: event, state: event, start: 0, len: ms, fps: EVENT_FPS, loop: false, hold: stay });
    if (stay) { setState(event); const period = loopPeriod(seek(ms)); if (period) plan.push({ name: `${event}~loop`, state: event, start: ms, len: period, fps: LOOP_FPS, loop: true }); }
  }

  const unique = new Map(); // 冻住的 SVG 文本 → 帧
  const order = [];
  const actions = {};
  let still = null;
  for (const step of plan) {
    setState(step.state);
    const dt = 1000 / step.fps;
    const times = [];
    if (!step.len) times.push([step.start, 0]);
    else for (let t = 0; t < step.len - 0.01; t += dt) times.push([step.start + t, Math.min(dt, step.len - t)]);
    if (step.hold) times.push([step.start + step.len - 0.5, dt]); // 停住的样子
    const frames = [];
    for (const [t, d] of times) {
      seek(t);
      const key = freeze();
      const m = slotMatrices();
      let frame = unique.get(key);
      if (!frame) { frame = { key }; unique.set(key, frame); order.push(frame); }
      const last = frames.at(-1);
      if (last && last.ref === frame && JSON.stringify(last.m) === JSON.stringify(m)) last.d += d;
      else frames.push({ ref: frame, d, m });
    }
    actions[step.name] = { loop: step.loop, hold: !!step.hold, frames };
    if (step.name === 'idle') still = frames[0].ref;
  }

  // 画
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const raster = async (key, w, h) => {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(key);
    await img.decode();
    canvas.width = w; canvas.height = h;
    ctx.clearRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
  };
  const blob = c => new Promise(ok => c.toBlob(ok, 'image/png'));
  // 静止图：待机第 0 帧，不裁边，2 倍
  await raster(still.key, SW, SH);
  await post(`/put?f=${encodeURIComponent(name)}.png`, await blob(canvas));

  const animated = order.length > 1 || Object.keys(def.events ?? {}).length > 0;
  const sheets = [];
  if (animated) {
    for (const frame of order) {
      await raster(frame.key, CW, CH);
      const { data } = ctx.getImageData(0, 0, CW, CH);
      let x0 = CW, y0 = CH, x1 = -1, y1 = -1;
      for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (data[(y * CW + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) { frame.w = 0; frame.h = 0; frame.ox = 0; frame.oy = 0; continue; }
      x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(CW - 1, x1 + 1); y1 = Math.min(CH - 1, y1 + 1);
      frame.ox = x0; frame.oy = y0; frame.w = x1 - x0 + 1; frame.h = y1 - y0 + 1;
      frame.bitmap = await createImageBitmap(canvas, x0, y0, frame.w, frame.h);
    }
    // 每个动作单独拼：按高度排，一行一行放
    for (const [actionName, action] of Object.entries(actions)) {
      const used = [...new Set(action.frames.map(f => f.ref))].filter(f => f.w).sort((a, b) => b.h - a.h);
      action.place = new Map();
      if (!used.length) continue;
      const area = used.reduce((s, f) => s + f.w * f.h, 0);
      const width = Math.min(MAX_SHEET, Math.max(...used.map(f => f.w), Math.ceil(Math.sqrt(area * 1.15))));
      let sheet = null, x = 0, y = 0, rowH = 0;
      const open = () => { sheet = { items: [], w: 0, h: 0 }; sheets.push(sheet); x = 0; y = 0; rowH = 0; };
      open();
      for (const f of used) {
        if (x + f.w > width) { x = 0; y += rowH; rowH = 0; }
        if (y + f.h > MAX_SHEET) open();
        sheet.items.push({ f, x, y }); action.place.set(f, { s: sheets.length - 1, x, y });
        x += f.w; rowH = Math.max(rowH, f.h); sheet.w = Math.max(sheet.w, x); sheet.h = Math.max(sheet.h, y + rowH);
      }
    }
    for (const [n, s] of sheets.entries()) {
      const c = document.createElement('canvas'); c.width = s.w; c.height = s.h;
      const g = c.getContext('2d');
      for (const { f, x, y } of s.items) g.drawImage(f.bitmap, x, y);
      s.f = `${name}-${n}.png`;
      await post(`/put?f=${encodeURIComponent(s.f)}`, await blob(c));
    }
  }
  const round = v => Math.round(v * 100) / 100;
  const result = {
    w: W, h: H, scale, stillScale: STILL_SCALE, still: `${name}.png`,
    sheets: sheets.map(s => ({ f: s.f, w: s.w, h: s.h })),
    actions: Object.fromEntries(Object.entries(actions).map(([k, a]) => [k, {
      loop: a.loop, hold: a.hold, sheets: [...new Set([...(a.place?.values() ?? [])].map(p => p.s))],
      frames: a.frames.map(({ ref, d, m }) => {
        const at = a.place?.get(ref);
        const frame = animated ? (ref.w ? { s: at.s, x: at.x, y: at.y, w: ref.w, h: ref.h, ox: ref.ox, oy: ref.oy, d: round(d) } : { s: -2, d: round(d) }) : { s: -1, d: round(d) };
        if (m) frame.m = m;
        return frame;
      }),
    }])),
  };
  const count = Object.values(result.actions).reduce((s, a) => s + a.frames.length, 0);
  await log(`${name}：${order.length} 张不同的帧，${count} 段，${sheets.map(s => `${s.w}×${s.h}`).join(' + ') || '只有静止图'}`);
  host.innerHTML = '';
  return result;
}
