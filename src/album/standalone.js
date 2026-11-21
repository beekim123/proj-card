// 独立打开的卡册（卡册.command / album.html）：跟游戏里同一套卡册。
import { album } from './view.js';
import { openAlbum, albumAction, updateAlbum, albumPointer, hit, profile } from './module.js';
import { drawPointer } from '../draw/ui.js';
import { drawStudy, createStudy, updateStudy, launchStudy } from '../draw/seal-study.js';
import { createMonsterRuntime } from '../battle/monsters.js';
import { loadSlateUI, initSealPortraits } from '../draw/slate-ui.js';
import * as audio from '../audio/forest.js';
const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d'), status = document.querySelector('#status'), label = status.querySelector('span'), restart = status.querySelector('button');
const a = openAlbum(), g = { album: a }, p = { x: -100, y: -100 }; a.standalone = true;
let w = 1440, h, z = [], study, monsters, prev = 0, pending = false;
function resize() { const d = devicePixelRatio; canvas.width = Math.round(innerWidth * d); canvas.height = Math.round(innerHeight * d); h = w * canvas.height / canvas.width; ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0); monsters?.beginFrame(false, w, h); }
function locate(e) { p.x = w * e.clientX / innerWidth; p.y = h * e.clientY / innerHeight; }
function dispatch(action, arg) {
  if (study) { if (action === 'back' || action === 'escape') study = null; if (action === 'trycard') launchStudy(study); return; }
  if (!albumAction(a, action, arg) && action === 'study') study = createStudy(monsters, 716);
}
canvas.addEventListener('pointerdown', e => { if (e.button !== 0) return; audio.unlock(); locate(e); if (!study) albumPointer(a, 'down', p.x, p.y, w, h); const q = z.findLast(q => hit(q, p)); if (q) dispatch(q.action, q.arg); });
canvas.addEventListener('pointermove', e => { locate(e); if (!study) albumPointer(a, 'move', p.x, p.y, w, h); });
for (const [evt, type] of [['pointerup', 'up'], ['pointercancel', 'cancel']]) canvas.addEventListener(evt, e => { locate(e); if (!study) albumPointer(a, type, p.x, p.y, w, h); });
addEventListener('blur', () => albumPointer(a, 'cancel', p.x, p.y, w, h));
canvas.addEventListener('wheel', e => { e.preventDefault(); if (!study && Math.abs(e.deltaY) + Math.abs(e.deltaX) > 2) dispatch('wheel', Math.sign(e.deltaY || e.deltaX)); }, { passive: false });
addEventListener('keydown', e => {
  if (e.repeat || !status.hidden) return;
  if (e.key === 'Escape') dispatch('escape');
  else if (!study && e.key === 'ArrowLeft') dispatch('step', -1);
  else if (!study && e.key === 'ArrowRight') dispatch('step', 1);
});
function draw(now) {
  const dt = Math.min(.05, (now - prev) / 1000); prev = now; z = [];
  if (study) { ctx.fillStyle = '#142329'; ctx.fillRect(0, 0, w, h); updateStudy(study, dt); drawStudy(ctx, study, w, h, p, z); }
  else {
    ctx.fillStyle = '#05080a'; ctx.fillRect(0, 0, w, h);
    updateAlbum(a, dt); for (const [n, o] of a.sfx.splice(0)) audio.sound(n, o);
    album(ctx, g, w, h, p, z);
  }
  drawPointer(ctx, p.x, p.y, z.some(q => hit(q, p)));
  if (a.exitReady) { pending = false; status.hidden = false; label.textContent = '卡册已收起'; restart.hidden = false; if (navigator.userAgent.includes('Electron')) window.close(); return; }
  requestAnimationFrame(draw);
}
restart.onclick = () => { if (pending) return; pending = true; openAlbum(a); a.standalone = true; status.hidden = true; prev = performance.now(); requestAnimationFrame(draw); };
addEventListener('resize', resize);
// 测试用的只读快照：不改收藏，也不改卡册状态。
if (new URLSearchParams(location.search).has('observe')) window.albumSnapshot = () => ({ view: a.view, cat: a.cat, index: a.index, pos: a.pos, id: a.id, progress: a.progress, arrival: a.arrival, study: !!study, cards: [...profile.cards], zones: z.map(q => ({ ...q })), w, h });
(async () => {
  try {
    resize();
    monsters = await createMonsterRuntime(canvas, ['badom', 'tiko']);
    await loadSlateUI();
    await initSealPortraits(monsters);
    resize(); status.hidden = true; pending = true; prev = performance.now(); requestAnimationFrame(draw);
  } catch (e) { label.textContent = '无法加载卡册 · ' + e.message; console.error(e); }
})();
