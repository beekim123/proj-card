// Delivery identity and complete runtime coverage; independent of the design checkout.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root = process.cwd();
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const manifest = read('art/art-manifest.json');
assert.equal(manifest.assets.length, 118, '新版应完整覆盖118个素材，不能继续使用89项旧清单');
assert.equal(new Set(manifest.assets.map(a => a.id)).size, 118, '素材ID重复');
const provenance = read('art/new-art-provenance.json');
assert.equal(Object.keys(provenance.assets).length, 118);
assert.equal(provenance.style, 'fable-carbon-remake');
const actualSvgs = fs.readdirSync('art/svg').filter(f => f.endsWith('.svg')).sort();
assert.deepEqual(actualSvgs, manifest.assets.map(a => a.id + '.svg').sort(), '运行目录有漏稿或非新版SVG');
for (const def of manifest.assets) {
  const source = provenance.assets[def.id];
  assert(source?.package && source.svg_sha256 && source.source, '缺少来源：' + def.id);
  assert.equal(digest('art/svg/' + def.id + '.svg'), source.svg_sha256, '交付SVG被改动：' + def.id);
  const svg = fs.readFileSync('art/svg/' + def.id + '.svg', 'utf8');
  const viewBox = svg.match(/\bviewBox=["']([^"']+)["']/)?.[1].trim().split(/[\s,]+/).map(Number);
  assert.deepEqual(viewBox, def.viewBox.trim().split(/[\s,]+/).map(Number), '画框不符：' + def.id);
  for (const part of [...(def.parts ?? []), ...Object.keys(def.slots ?? {})]) {
    assert(new RegExp('\\bid=["\']' + part + '["\']').test(svg), '缺少部件/槽：' + def.id + '/' + part);
  }
}
if (!process.argv.includes('--sources-only')) {
  const sprites = read('art/sprites/sprites.json');
  assert.equal(sprites.eventFps, 30);
  assert.equal(sprites.loopFps, 15);
  const expectedFiles = new Set(['sprites.json']);
  const variants = Object.keys(manifest.palette.mix).filter(k => /^#[\da-f]{6}$/i.test(manifest.palette.mix[k] ?? '')).concat(['text', 'textDim']);
  const expectedNames = [];
  for (const def of manifest.assets) {
    const names = def.tint ? variants.map(k => def.id + '@' + k) : [def.id];
    expectedNames.push(...names);
    for (const name of names) {
      const entry = sprites.assets[name];
      assert(entry && !entry.placeholder && !entry.inspectorPlaceholder, '缺少真实新版帧：' + name);
      assert.equal(entry.hash, provenance.assets[def.id].svg_sha256.slice(0, 16), '帧与新版SVG不匹配：' + name);
      for (const file of [entry.still, ...entry.sheets.map(s => s.f)]) {
        assert(fs.statSync('art/sprites/' + file).size > 0, '缺少PNG：' + file);
        expectedFiles.add(file); expectedFiles.add(file + '.import');
      }
      for (const event of ['idle', ...Object.keys(def.events ?? {})]) {
        const action = entry.actions[event];
        assert(action?.frames.length > 0, '缺少动作：' + name + '/' + event);
        // Held events include one explicit endpoint sample for their persistent pose.
        const expectedMs = def.events?.[event] + (action.hold ? 1000 / sprites.eventFps : 0);
        const roundingBound = action.frames.length * 0.005 + 0.001; // exporter stores each duration to 0.01ms
        if (event !== 'idle') assert(Math.abs(action.frames.reduce((n, f) => n + f.d, 0) - expectedMs) <= roundingBound, '动作时长不符：' + name + '/' + event);
        for (const frame of action.frames) for (const slot of Object.keys(def.slots ?? {})) assert(frame.m?.[slot], '丢失动态文字槽：' + name + '/' + slot);
      }
    }
  }
  assert.deepEqual(Object.keys(sprites.assets).sort(), expectedNames.sort(), 'registry有旧套或缺染色');
  for (const file of fs.readdirSync('art/sprites')) assert(expectedFiles.has(file) || file === '.gdignore', '残留旧PNG/import：' + file);
  assert(!fs.existsSync('art/inspector') && !fs.existsSync('art/placeholders'), '运行目录仍保留旧占位美术');
}
console.log('新版美术核对通过：118项交付身份、接口' + (process.argv.includes('--sources-only') ? '' : '、全染色/动作/槽/帧及旧图清理'));
