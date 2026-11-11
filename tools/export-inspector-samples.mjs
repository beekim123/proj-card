// Original H5 generatePlaceholder door samples, exported by the unchanged atlas page.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
const root = process.cwd();
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const registry = path.join(root, 'art/sprites/sprites.json');
const original = hash(fs.readFileSync(registry));
const child = spawn(process.execPath, [path.join(root, 'tools/export-sprites.mjs'), ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, SPRITE_INSPECTOR_SAMPLES: '1', SPRITE_PLACEHOLDERS: '0' } });
const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
if (code !== 0) process.exit(code ?? 1);
if (hash(fs.readFileSync(registry)) !== original) throw new Error('正式精灵图registry被修改');
const directory = path.join(root, 'art/inspector');
const data = JSON.parse(fs.readFileSync(path.join(directory, 'sprites.json'), 'utf8'));
const report = { source: 'tools/export-sprites/placeholders.ts', source_sha256: hash(fs.readFileSync(path.join(root, 'tools/export-sprites/placeholders.ts'))), h5_source_sha256: hash(fs.readFileSync(path.join(root, 'h5/src/art/placeholders.ts'))), normal_sets: Object.keys(JSON.parse(fs.readFileSync(registry, 'utf8')).assets).length, normal_registry_sha256: original, normal_registry_unchanged: true, event_fps: data.eventFps, loop_fps: data.loopFps, assets: {} };
for (const [id, entry] of Object.entries(data.assets)) {
  const svg = fs.readFileSync(path.join(directory, 'svg', `${id}.svg`));
  if (entry.hash !== hash(svg).slice(0, 16)) throw new Error(`占位图指纹不符：${id}`);
  const files = [entry.still, ...entry.sheets.map(sheet => sheet.f)];
  for (const file of files) {
    if (!file.startsWith('inspector_')) throw new Error(`独立前缀缺失：${file}`);
    fs.copyFileSync(path.join(directory, file), path.join(root, 'art/sprites', file));
    const source = `res://art/sprites/${file}`;
    const digest = crypto.createHash('md5').update(source).digest('hex');
    const dest = `res://.godot/imported/${file}-${digest}.s3tc.ctex`;
    fs.writeFileSync(path.join(root, 'art/sprites', `${file}.import`), `[remap]\n\nimporter="texture"\ntype="CompressedTexture2D"\npath.s3tc=${JSON.stringify(dest)}\nmetadata={\n"vram_texture": true\n}\n\n[deps]\n\nsource_file=${JSON.stringify(source)}\ndest_files=[${JSON.stringify(dest)}]\n\n[params]\n\ncompress/mode=2\ncompress/high_quality=false\ncompress/lossy_quality=0.7\ncompress/uastc_level=0\ncompress/rdo_quality_loss=0.0\ncompress/hdr_compression=1\ncompress/normal_map=0\ncompress/channel_pack=0\nmipmaps/generate=false\nmipmaps/limit=-1\nroughness/mode=0\nroughness/src_normal=""\nprocess/fix_alpha_border=true\nprocess/premult_alpha=false\nprocess/normal_map_invert_y=false\nprocess/hdr_as_srgb=false\nprocess/hdr_clamp_exposure=false\nprocess/size_limit=0\ndetect_3d/compress_to=0\n`);
  }
  report.assets[id] = { hash: entry.hash, actions: Object.keys(entry.actions), frames: Object.values(entry.actions).reduce((total, action) => total + action.frames.length, 0), pngs: files.length, bytes: files.reduce((total, file) => total + fs.statSync(path.join(root, 'art/sprites', file)).size, 0) };
}
fs.mkdirSync(path.join(root, 'artifacts/art'), { recursive: true });
fs.writeFileSync(path.join(root, 'artifacts/art/inspector-samples.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Inspector原占位图已生成 ${Object.keys(data.assets).length} 套；正式${report.normal_sets}套registry哈希不变。`);
