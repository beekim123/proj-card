// A pool belongs to its streamed forest chunk. Its bank and plants do not depend on visit order.
import { drawGrass } from '../draw/world.js';

const tau = Math.PI * 2,
  clamp = (x) => Math.max(0, Math.min(1, x));
export function poolFor(cx, cz, seed) {
  let k = (seed ^ Math.imul(cx, 0x165667b1) ^ Math.imul(cz, 0x27d4eb2d)) >>> 0;
  const r = () => (k = (Math.imul(k, 1664525) + 1013904223) >>> 0) / 4294967296;
  const first = !cx && !cz;
  // A second hollow lies on the far side of the opening path before the terrain becomes fully procedural.
  const farZ = 38 + (((Math.imul(seed ^ 0x754ca, 1664525) + 1013904223) >>> 0) / 4294967296) * 20;
  const hollow = cx === 0 && cz === Math.floor(farZ / 20);
  if (!first && !hollow && r() > 0.18) return null;
  const x = first ? 0.65 : hollow ? 0.9 : cx * 20 + 4 + r() * 12,
    z = first ? 6.6 : hollow ? farZ : cz * 20 + 4 + r() * 12,
    rx = first ? 2.55 : 1.4 + r() * 2,
    rz = first ? 3.2 : 1.8 + r() * 2.4,
    phase = r() * 6;
  const bank = [],
    plants = [],
    shadows = [],
    silt = [];
  for (let i = 0; i < 44; i++) {
    const a = (tau * i) / 44,
      m = shape(a, phase);
    bank.push([x + rx * Math.cos(a) * m, 0, z + rz * Math.sin(a) * m]);
    if ((i % 3 === 0 && r() > 0.27) || i === 8) {
      plants.push({ x: bank[i][0], z: bank[i][2], s: 0.5 + r() * 0.7, high: i % 2 === 0, phase: r() * tau });
    }
  }
  for (let i = 0; i < 8; i++)
    shadows.push({
      x: x + (r() - 0.5) * rx * 1.8,
      z: z + rz * (0.1 + r() * 0.85),
      w: 0.025 + r() * 0.14,
      l: 0.55 + r() * rz,
    });
  for (let i = 0; i < 85; i++) {
    const a = r() * tau,
      dist = Math.sqrt(r());
    silt.push({
      x: x + Math.cos(a) * rx * dist,
      z: z + Math.sin(a) * rz * dist,
      w: 0.015 + r() * 0.18,
      phase: r() * tau,
    });
  }
  return { x, z, rx, rz, phase, bank, plants, shadows, silt };
}
function shape(a, p) {
  return 0.94 + 0.068 * Math.sin(3 * a + p) + 0.037 * Math.cos(7 * a - p);
}
export function underfoot(w) {
  for (const c of w.chunks.values()) {
    const p = c.pool;
    if (!p || Math.abs(p.x - w.x) > p.rx * 1.06 || Math.abs(p.z - w.z) > p.rz * 1.06) continue;
    const dx = (w.x - p.x) / p.rx,
      dz = (w.z - p.z) / p.rz;
    if (Math.hypot(dx, dz) < shape(Math.atan2(dz, dx), p.phase)) return p;
  }
  return null;
}
export function waterDistance(w) {
  let best = 32,
    pan = 0;
  for (const c of w.chunks.values()) {
    const p = c.pool;
    if (!p) continue;
    const dx = p.x - w.x,
      dz = p.z - w.z,
      d = Math.hypot(dx, dz);
    if (d < best) {
      best = d;
      pan = (dx * Math.cos(w.yaw) - dz * Math.sin(w.yaw)) / Math.max(1, d);
    }
  }
  return [best, pan];
}
// Local water texture lives only as long as its chunk. The waves and vegetation remain live.
const waterTiles = new WeakMap();
function texture(c, p) {
  let tile = waterTiles.get(p);
  if (tile) return tile;
  const side = 2.2 * Math.max(p.rx, p.rz),
    ox = p.x - side / 2,
    oz = p.z - side / 2;
  const canvas = new OffscreenCanvas(448, 448),
    g = canvas.getContext('2d');
  g.scale(448 / side, 448 / side);
  g.translate(-ox, -oz);
  const path = (points) => {
    g.beginPath();
    points.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
    g.closePath();
  };
  path(p.bank.map(([x, y, z]) => [x, z]));
  g.clip();
  const color = g.createLinearGradient(0, p.z - p.rz, 0, p.z + p.rz);
  color.addColorStop(0, '#142227');
  color.addColorStop(0.38, '#213137');
  color.addColorStop(0.76, '#293e45');
  color.addColorStop(1, '#314b53');
  g.fillStyle = color;
  g.fillRect(ox, oz, side, side);
  for (const a of p.silt) {
    g.fillStyle = a.phase > 3 ? '#384b50' : '#1c2f35';
    g.fillRect(a.x, a.z, a.w, 0.012 + a.w * 0.12);
  }
  for (const a of p.shadows) {
    g.fillStyle = '#15252b';
    path([
      [a.x, a.z],
      [a.x + a.w, a.z],
      [a.x + a.w * 0.22, a.z - a.l],
      [a.x - 0.05, a.z - a.l * 0.8],
    ]);
    g.fill();
    const tip = a.z - a.l * 0.52;
    path([
      [a.x, tip],
      [a.x + a.w * 0.5, tip],
      [a.x - 0.27, tip - 0.31],
      [a.x - 0.45, tip - 0.34],
    ]);
    g.fill();
  }
  for (let i = 0; i < 17; i++) {
    g.fillStyle = i % 4 ? '#46585e' : '#5a7177';
    const x = p.x + p.rx * Math.cos(i * 2.41 + p.phase),
      z = p.z + p.rz * Math.sin(i * 5.7 + p.phase);
    path([
      [x, z],
      [x + 0.18, z + 0.013],
      [x + 0.41, z + 0.006],
    ]);
    g.fill();
  }
  tile = { canvas, side, ox, oz, tiles: new Map() };
  waterTiles.set(p, tile);
  return tile;
}
function ripple(c, cam, x, z, u, r, data) {
  if (u < 0 || u > 1) return;
  const p = cam.project(x, 0.009, z);
  if (p.d < 0.45) return;
  const size = (cam.f / p.d) * r * (0.1 + u);
  if (data && data.ripples.length < 8) {
    const uvx = p.x / data.w, uvy = p.y / data.h;
    if (uvx > -0.25 && uvx < 1.25 && uvy > -0.1 && uvy < 1.25) {
      data.ripples.push([uvx, uvy, u, ((cam.f / p.d) * r) / data.w]);
    }
  }
  c.beginPath();
  c.ellipse(p.x, p.y, size, size * Math.min(0.85, cam.eye / p.d), 0, 0, tau);
  c.strokeStyle = `rgba(174,205,210,${(1 - u) * (data ? 0.16 : 0.52)})`;
  c.lineWidth = 0.65 + 1.6 * (1 - u);
  c.stroke();
}
function projectBank(cam, bank) {
  const near = 0.12;
  const pts = bank.map(([x, y, z]) => cam.space(x, y, z));
  let poly = pts;
  if (pts.some((p) => p[2] < near)) {
    poly = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const da = a[2] - near, db = b[2] - near;
      if (da >= 0) poly.push(a);
      if ((da >= 0) !== (db >= 0)) {
        const k = da / (da - db);
        poly.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]);
      }
    }
  }
  return poly.length >= 3 ? poly.map((p) => cam.screen(p)) : null;
}
// A wet patch is baked into the existing 2-metre ground tile once. No second floor pass.
export function wetTile(c, p, x, z, size, variant, ground) {
  const t = texture(c, p),
    key = x + ',' + z + ',' + variant;
  if (t.tiles.has(key)) return t.tiles.get(key);
  const n = 448,
    a = new OffscreenCanvas(n, n),
    g = a.getContext('2d');
  g.drawImage(ground, 0, 0, n, n);
  g.drawImage(
    t.canvas,
    ((t.ox - x) * n) / size,
    ((t.oz - z) * n) / size,
    (t.side * n) / size,
    (t.side * n) / size,
  );
  const result = { pattern: c.createPattern(a, 'repeat'), w: n, h: n };
  t.tiles.set(key, result);
  return result;
}
export function paintPool(c, cam, p, t, w, queue, quiet, data = null) {
  const d = Math.hypot(p.x - cam.x, p.z - cam.z),
    [l, , depth] = cam.space(p.x, 0, p.z);
  if (d > 36 || depth < -4.8 || Math.abs(l) > Math.max(depth, 0) * 0.87 + 5) return;
  if (data && d < 18) {
    const poly = projectBank(cam, p.bank);
    if (poly) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, farD = 0;
      for (let i = 0; i < poly.length; i++) {
        const pt = poly[i];
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
        if (pt.d > farD) farD = pt.d;
      }
      if (maxX > 0 && minX < data.w && maxY > 0 && minY < data.h && (maxY - minY) > 14) {
        data.puddle(poly, minX, minY, maxX, maxY, farD);
      }
    }
  }
  c.save();
  c.globalAlpha = clamp((36 - d) / 13);
  const tip = p.plants[0];
  if (tip) {
    const age = (t + p.phase) % 4.2;
    ripple(c, cam, tip.x * 0.85 + p.x * 0.15, tip.z * 0.85 + p.z * 0.15, age / 1.45, 0.44, data);
  }
  for (const f of w.splashes || [])
    if (Math.abs(f.x - p.x) < p.rx * 1.1 && Math.abs(f.z - p.z) < p.rz * 1.1) {
      const age = (t - f.time) / 1.3;
      ripple(c, cam, f.x, f.z, age, 0.76, data);
      if (age <= 1 && age >= 0) {
        for (let j = 0; j < 3; j++) {
          const q = cam.project(
            f.x + Math.sin(j * 2.4) * (0.11 + age * 0.58),
            0.012,
            f.z + Math.cos(j * 2.4) * (0.11 + age * 0.58),
          );
          if (q.d > 0.6) {
            c.fillStyle = `rgba(141,168,172,${(1 - age) * 0.48})`;
            c.fillRect(q.x, q.y, (cam.f / q.d) * 0.09, 1.6);
          }
        }
      }
    }
  c.restore();
  for (const [i, a] of p.plants.entries()) {
    const pos = cam.project(a.x, 0, a.z);
    if (pos.d < 0.7 || pos.x < -150 || pos.x > cam.mx * 2 + 150) continue;
    const variant = a.high ? 2 : (i & 1 ? 1 : 3);
    const sw = (cam.f / pos.d) * (a.high ? 0.46 : 0.62) * a.s;
    const sh = sw * (variant === 2 ? 48 / 42 : variant === 1 ? 40 / 75 : 31 / 54);
    const plantObj = { variant, phase: a.phase, face: i % 3 === 0 ? -1 : 1 };
    const plantAlpha = clamp((36 - d) / 13);
    queue.push({
      d: pos.d,
      paint() {
        c.save();
        c.globalAlpha = plantAlpha;
        drawGrass(c, pos.x, pos.y, sw, sh, plantObj, quiet ? 0 : t, pos.d);
        c.restore();
      },
    });
    if (i === 0) {
      const age = (t + p.phase) % 4.2;
      if (age > 3.92) {
        const u = (age - 3.92) / 0.28,
          q = cam.project(a.x * 0.85 + p.x * 0.15, (1 - u * u) * 0.22, a.z * 0.85 + p.z * 0.15);
        if (q.d > 0.6)
          queue.push({
            d: q.d,
            paint() {
              c.fillStyle = '#adc0bf';
              c.fillRect(q.x, q.y, 1.4, 2.6);
            },
          });
      }
    }
  }
}
