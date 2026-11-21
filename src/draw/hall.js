import { text, drawPointer, INK, glow, shadowText, diamond, lightLine } from './ui.js';
import { profile } from '../storage/profile.js';
import { MUSIC_SUITES, MUSIC_SCENES, getMusicState } from '../audio/forest.js';
import { drawSlateAsset, drawSlateButton, slateText } from './slate-ui.js';
export { album } from '../album/view.js';
const gold = '#d8bb88',
  pale = '#e0e0d2',
  muted = '#a9b7b2';
function wash(c, w, h, alpha = 0.67) {
  const a = c.createLinearGradient(0, 0, w * .62, 0);
  a.addColorStop(0, `rgba(3,7,9,${alpha})`);
  a.addColorStop(0.55, `rgba(3,7,9,${alpha * .35})`);
  a.addColorStop(1, 'rgba(3,7,9,0)');
  c.fillStyle = a;
  c.fillRect(0, 0, w, h);
}
function click(c, z, p, label, x, y, w, h, action, arg, size, color = pale) {
  const hover = p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
  z.push({ x, y, w, h, action, arg });
  if (hover) glow(c, x + 6 + size * label.length * .5, y + h / 2, size * label.length * .9, 'rgba(242,182,96,.6)', .28, .45);
  shadowText(c, label, x + 6, y + h / 2, size, hover ? INK.warmHi : color, 'left', size > 30);
  if (hover) { diamond(c, x - 12, y + h / 2, 5, INK.warm); lightLine(c, x - 4, x + 18 + size * label.length, y + h - 4, INK.warm); }
}

// 近处纯黑的大树框住画面：固定种子，不随镜头动（它们“就在眼前”）。
const near = [];
function nearTrees(w, h) {
  if (near.w === w && near.h === h) return near;
  near.length = 0; near.w = w; near.h = h;
  let seed = 7;
  const R = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  for (const [x, w0, lean] of [[-w * .03, w * .15, -.05], [w * .17, w * .045, .03], [w * 1.02, w * .12, .06], [w * .88, w * .05, -.03]]) {
    const t = { x, w0, w1: w0 * (.28 + R() * .15), lean, ph: R() * 6, bend: (R() - .5) * w0 * .5, branches: [] };
    // 只往画面里伸一两根短枝，往上翘，不横穿标题
    const side = x < w / 2 ? 1 : -1, nb = x < w / 2 ? 1 : 2;
    for (let i = 0; i < nb; i++) t.branches.push({ k: .55 + R() * .3, a: side * (.35 + R() * .3), kink: -side * (.15 + R() * .3), len: Math.min(w0 * (1.6 + R() * 1.4), w * .09), bw: w0 * (.14 + R() * .08) });
    near.push(t);
  }
  return near;
}
function treeShape(c, t, h) {
  const n = 14, pts = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n, y = h * 1.04 - k * h * 1.1;
    const cx = t.x + t.lean * k * h + Math.sin(k * 3 + t.ph) * t.bend;
    let hw = (t.w0 + (t.w1 - t.w0) * Math.pow(k, .7)) / 2;
    if (k < .07) hw *= 1 + (.07 - k) / .07 * .8;
    pts.push([cx, y, hw]);
  }
  c.beginPath();
  c.moveTo(pts[0][0] - pts[0][2], pts[0][1]);
  for (const q of pts) c.lineTo(q[0] - q[2], q[1]);
  for (let i = pts.length - 1; i >= 0; i--) c.lineTo(pts[i][0] + pts[i][2], pts[i][1]);
  c.closePath();
  for (const b of t.branches) {
    const q = pts[Math.min(n, Math.floor(b.k * n))], ax = q[0], ay = q[1];
    const mx = ax + Math.sin(b.a) * b.len * .5, my = ay - Math.cos(b.a) * b.len * .5;
    const tx = mx + Math.sin(b.a + b.kink) * b.len * .5, ty = my - Math.cos(b.a + b.kink) * b.len * .5;
    const px = Math.cos(b.a), py = Math.sin(b.a);
    c.moveTo(ax - px * b.bw / 2, ay - py * b.bw / 2); c.lineTo(mx - px * b.bw * .28, my - py * b.bw * .28); c.lineTo(tx, ty);
    c.lineTo(mx + px * b.bw * .28, my + py * b.bw * .28); c.lineTo(ax + px * b.bw / 2, ay + py * b.bw / 2); c.closePath();
  }
}
function frame(c, w, h, t) {
  for (const tree of nearTrees(w, h)) {
    // 朝雾的一侧一道很细的冷光边
    c.save(); c.translate(tree.x < w / 2 ? 1.6 : -1.6, -1); c.fillStyle = 'rgba(157,180,182,.32)'; treeShape(c, tree, h); c.fill(); c.restore();
    c.fillStyle = '#04070a'; treeShape(c, tree, h); c.fill();
  }
  // 地面最下面一条压暗：近处的地是黑的
  const g = c.createLinearGradient(0, h * .8, 0, h);
  g.addColorStop(0, 'rgba(4,7,10,0)'); g.addColorStop(1, 'rgba(4,7,10,.85)');
  c.fillStyle = g; c.fillRect(0, h * .8, w, h * .2);
  // 远处路上落着一张发光的牌，往林子里勾人
  const x = w * .6, y = h * .62, pulse = .85 + .15 * Math.sin(t * 1.7);
  glow(c, x, y, 120, 'rgba(242,170,80,.9)', .32 * pulse, .5);
  glow(c, x, y, 26, 'rgba(255,226,168,1)', .7 * pulse);
  c.save(); c.translate(x, y); c.rotate(-.2); c.fillStyle = '#fbe3b0'; c.fillRect(-3, -4.5, 6, 9); c.restore();
}

export function lobby(c, g, w, h, p, z) {
  frame(c, w, h, g.elapsed);
  wash(c, w, h, .72);
  glow(c, w * .16, h * 1.02, w * .32, 'rgba(242,170,80,.8)', .12, .55);
  const x = w * 0.09, top = h * 0.25;
  shadowText(c, '异能卡牌', x, top, 64, INK.light, 'left', true);
  shadowText(c, '夜　林', x + 4, top + 54, 16, INK.faint, 'left');
  c.fillStyle = INK.warm; c.fillRect(x + 4, top + 78, 52, 2);
  const y = h * 0.46, rows = [
    [g.pausedRun ? '继续游戏' : '开始游戏', 'start', 36, '#f6dfb4'],
    ['战斗练习', 'practice', 24, muted], ['卡册', 'album', 24, muted],
    ['设置', 'settings', 24, muted], ['退出游戏', 'quit', 24, muted]];
  rows.forEach(([label, a, size, color], i) => click(c, z, p, label, x, y + (i ? 64 + (i - 1) * 54 : 0), 260, i ? 46 : 56, a, null, size, color));
}
export function preferences(c, g, w, h, p, z) {
  frame(c, w, h, g.elapsed);
  wash(c, w, h, 0.88);
  const x = w * 0.08;
  const y = h * 0.14;
  shadowText(c, '设置', x, y, 42, pale, 'left', true);
  c.fillStyle = INK.warm;
  c.fillRect(x + 2, y + 32, 52, 2);

  const inside = (r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  const sbtn = (r, label, action, arg, { selected = false, prefix = '界面-小按钮', fontSize = 14 } = {}) => {
    const hover = inside(r);
    drawSlateButton(c, prefix, r, label, { hover, pressed: Boolean(p.down), selected, fontSize });
    z.push({ ...r, action, arg });
  };

  // 左栏：音量与静音
  const leftPanel = { x: x - 12, y: y + 58, w: 410, h: 360 };
  drawSlateAsset(c, '弹窗-石板面板.svg', leftPanel.x, leftPanel.y, leftPanel.w, leftPanel.h);
  slateText(c, '音量', leftPanel.x + 34, leftPanel.y + 42, 20, '#f7e6c4', 'rgba(0,0,0,.8)', 700, 'left');

  ['music', 'sfx'].forEach((key, i) => {
    const yy = leftPanel.y + 110 + i * 82;
    slateText(c, i ? '林间与动作音' : '背景音乐音量', leftPanel.x + 34, yy, 17, '#dfe9ee', 'rgba(0,0,0,.8)', 600, 'left');
    sbtn({ x: leftPanel.x + 188, y: yy - 20, w: 46, h: 40 }, '−', 'volume', [key, -0.1], { fontSize: 20 });
    slateText(c, Math.round(profile[key] * 100) + '%', leftPanel.x + 276, yy, 18, gold, 'rgba(0,0,0,.85)', 700, 'center');
    sbtn({ x: leftPanel.x + 318, y: yy - 20, w: 46, h: 40 }, '＋', 'volume', [key, 0.1], { fontSize: 20 });
  });
  sbtn(
    { x: leftPanel.x + 34, y: leftPanel.y + 266, w: 200, h: 48 },
    profile.mute ? '静音 · 已开' : '静音 · 已关',
    'volume',
    ['mute', 0],
    { selected: profile.mute, prefix: '弹窗-按钮', fontSize: 16 }
  );

  // 右栏：背景音乐（四套曲风切换 + 段落试听）
  const ms = getMusicState();
  const rightPanel = { x: leftPanel.x + leftPanel.w + 34, y: leftPanel.y, w: 720, h: 452 };
  drawSlateAsset(c, '弹窗-石板面板.svg', rightPanel.x, rightPanel.y, rightPanel.w, rightPanel.h);
  slateText(c, '背景音乐（点选即刻切换并保存）', rightPanel.x + 34, rightPanel.y + 42, 20, '#f7e6c4', 'rgba(0,0,0,.8)', 700, 'left');

  MUSIC_SUITES.forEach((suite, i) => {
    const sy = rightPanel.y + 82 + i * 68;
    const active = (profile.musicSuite || ms.suite) === suite.id;
    sbtn(
      { x: rightPanel.x + 34, y: sy, w: 180, h: 48 },
      (active ? '✦ ' : '') + suite.name,
      'musicSuite',
      suite.id,
      { selected: active, prefix: '弹窗-按钮', fontSize: 16 }
    );
    slateText(c, suite.style, rightPanel.x + 230, sy + 24, 14, active ? '#ffe8b8' : '#b2c4cc', 'rgba(0,0,0,.8)', 500, 'left', 454);
  });

  // 试听段落切换（大厅 / 林子里走 / 战斗 / 精英战）
  const py = rightPanel.y + 368;
  slateText(c, '试听当前套的段落：', rightPanel.x + 34, py + 18, 15, '#c8d6dc', 'rgba(0,0,0,.8)', 600, 'left');
  MUSIC_SCENES.forEach((sc, i) => {
    const active = (ms.preview || ms.scene) === sc.id;
    sbtn(
      { x: rightPanel.x + 190 + i * 124, y: py, w: 112, h: 38 },
      sc.name,
      'musicPreview',
      sc.id,
      { selected: active, prefix: '界面-小按钮', fontSize: 13 }
    );
  });

  sbtn({ x: leftPanel.x, y: h * 0.85, w: 206, h: 52 }, '‹　返回大厅', 'back', null, { prefix: '弹窗-按钮', fontSize: 17 });
}
