// Receive original SVG bytes; sprite generation remains a separate, sequential step.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const design = path.resolve(process.argv[2] ?? '../design');
const artRoot = path.join(design, '新卡牌/美术');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const manifest = read(path.join(artRoot, '素材清单.json'));
const sourceSets = [
  ['01-fable', 'gemcard-gothic-ref-fable'], ['02-carbon', 'gemcard-gothic-ref-carbon'],
  ['03-角色', 'gemcard-remake-03'], ['04-宝石卡牌', 'gemcard-remake-04'],
  ['05-宝物图标', 'gemcard-remake-05'], ['06-界面奖励', 'gemcard-remake-06'],
  ['07-场景特效', 'gemcard-remake-07'],
];
// Ordered repair overlays: never accept the three rejected 08 drafts.
const repairSets = [
  ['08-细节重做', 'gemcard-remake-08', {
    mon_tree: '7c92db6de196e72fec128136b92c6c459093643822af2b98e324382b09384ca4',
    mon_chest: '9c0b837815ca75dbeafcecd050e701a06c02bcd974485acca126a563c454bd57',
    card_art_mirror: '2a0d6ad02c27f9a8fb7a5b429348de2a5e007948507c0d2c1585a872cf5e8156',
    card_art_lens: 'b18a2f222a22517ab10f2c95e9135f6a1101224e02f58054214353a0471d4239',
    card_art_hammer: 'dccddb00ab67f67f3670f60ee316f5e483ffab948350db8249f9d9db30256972',
    card_art_diamond: '15142acc9823fef6e068a888c07aa22a3094b82720d77a94f1c8dbad786aa7b7',
    card_art_whistle: 'dd5289557d200895734a908488712d13eabe2e2f567f2393163f5cf5fa1c9f44',
    mon_soldier: '3de1f2b3832433c0362834d37c44a43298a078ef18d7c563aee47f437801d8e1',
    mon_portrait: '851ebb9862af31d11c2cfef5dc85934fc89052bf5914dae57ab776c2e73a13c1',
    mon_lock: '4f605e96653412adad60e7f9683c6134e3824490046d0d2901344dbad7ef5cc9',
    dummy: '8201129301327f29b0f98b4359495cc4ba5bbf0aebd73160140411ce6796f3c4',
    mon_clock: '4c397e17e350b60778bf1b688755c24d2bf6a83371bd7acc8910af33c21dcf73',
    mon_box: '3a3936e3f44a900460bc08d662fa5f5ed6a3ccfb3e93f6822916cef4d4467b76',
    title_emblem: 'ef5e1379974aadbb1a7fa7b6a52d8d348db0de54aa97b49c95d7b5191404b03f',
  }],
  ['09-第08包返修', 'gemcard-remake-09', {
    relic_biggem: '5440a4724a7a738e7a369803101504f387f6b79ff52387f1c86fc1045dd8d504',
    prop_coins: '1019cfe8141048fd4d426d46c0c4b45b66568d640e2fae5966e8d821dd01d308',
    card_art_empty: '6b712f96ddfcfa13b2840e49903d0adf144144b79157df25b286de50e6e14652',
  }],
];
const definitions = new Map(manifest.assets.map(a => [a.id, a]));
for (const directory of fs.readdirSync(path.join(artRoot, '新画法全量重制')).filter(f => /^第0[3-7]包-/.test(f) && !f.endsWith('.zip'))) {
  for (const def of read(path.join(artRoot, '新画法全量重制', directory, '素材清单.json')).assets) {
    assert(definitions.has(def.id), '包内ID不在v5总表：' + def.id);
    definitions.set(def.id, { ...definitions.get(def.id), ...def });
  }
}
const received = new Map();
for (const [label, directory, allowed] of [...sourceSets, ...repairSets]) {
  const base = path.join(design, 'style-lab/practice', directory, 'art');
  const accepted = new Set();
  const skipped = [];
  for (const card of read(path.join(base, 'manifest.json')).assets) {
    const id = card.key;
    if (allowed && !Object.hasOwn(allowed, id)) { skipped.push(id); continue; }
    assert(definitions.has(id) && !accepted.has(id) && (allowed ? received.has(id) : !received.has(id)), '不明或重复交稿：' + id);
    const source = path.join(base, 'svg', id + '.svg');
    const bytes = fs.readFileSync(source);
    if (allowed) assert.equal(sha(bytes), allowed[id], '返修稿SHA-256不符：' + id);
    const svg = bytes.toString('utf8');
    const def = definitions.get(id);
    assert.equal(svg.match(/\bviewBox=["']([^"']+)["']/)?.[1], def.viewBox, '画框不符：' + id);
    for (const part of [...(def.parts ?? []), ...Object.keys(def.slots ?? {})]) {
      assert(new RegExp('\\bid=["\']' + part + '["\']').test(svg), '缺少接口：' + id + '/' + part);
    }
    received.set(id, { bytes, source, package: label });
    accepted.add(id);
  }
  if (allowed) {
    assert.deepEqual([...accepted].sort(), Object.keys(allowed).sort(), '返修白名单缺稿：' + label);
    console.log(`${label}：接收${accepted.size}件；跳过白名单外ID：${skipped.join('、') || '（无）'}`);
  }
}
assert.equal(definitions.size, 118);
assert.equal(received.size, 118);
const provenance = { style: 'fable-carbon-remake', date: '2026-11-12', scope: 118,
  source_manifest_sha256: sha(fs.readFileSync(path.join(artRoot, '素材清单.json'))),
  stage: 'received-candidate', event_fps: 30, loop_fps: 15, assets: {} };
for (const [id, item] of received) {
  provenance.assets[id] = { package: item.package, source: path.relative(design, item.source), svg_sha256: sha(item.bytes) };
}
// All inputs are checked before touching runtime art; no placeholder fallback.
fs.mkdirSync('art/svg', { recursive: true });
for (const [id, item] of received) fs.writeFileSync('art/svg/' + id + '.svg', item.bytes);
for (const file of fs.readdirSync('art/svg')) {
  if (file.endsWith('.svg') && !received.has(file.slice(0, -4))) fs.rmSync(path.join('art/svg', file));
}
manifest.assets = manifest.assets.map(def => ({ ...definitions.get(def.id), artStyle: provenance.style }));
manifest.name = '新卡牌 · 新画法完整素材清单';
manifest.about = '118个唯一ID：Fable/Carbon 22件及03–07包96件；全部采用新版交付SVG，其中 14 件用第08包、3 件用第09包返修稿。运行目录不使用旧稿或占位别名。交付齐全不代表用户视觉验收通过。';
manifest.artStyle = provenance.style;
fs.writeFileSync('art/art-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync('art/new-art-provenance.json', JSON.stringify(provenance, null, 2) + '\n');
console.log('已接收118份新版SVG原件；下一步逐帧导出30/15fps，再生成原生资源和检查。');
