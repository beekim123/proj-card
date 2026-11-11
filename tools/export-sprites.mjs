// 导出精灵图（2026-11-10）：art/svg/*.svg → art/sprites/（PNG 大图 + sprites.json）。
//
//   npm run export:sprites            全部重导
//   npm run export:sprites mon_bear   只导这几个（其余沿用 sprites.json 里已有的）
//
// 规范见设计目录 新卡牌/精灵图规范.md。做法：
// 起一个本地小服务，开本机无头 Chrome 跑 tools/export-sprites/page.js：
// 把每个 SVG 塞进页面，设 data-anim，把动画停在每一帧的时间点，记下会动的部件此刻的样子，
// 冻成一张静止的 SVG 画到 canvas 上，裁掉透明边，拼成大图，传回来写文件。
// 美术换了必须重导：src/art/sprites.test.ts 会核对每个 SVG 的指纹。
// 只关自己开的那个 Chrome（别的会话可能也在用浏览器）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, 'art');
const PLACEHOLDERS = process.env.SPRITE_PLACEHOLDERS === '1';
const INSPECTOR_SAMPLES = process.env.SPRITE_INSPECTOR_SAMPLES === '1';
const GENERATED = PLACEHOLDERS || INSPECTOR_SAMPLES;
const OUT = path.join(PUBLIC, INSPECTOR_SAMPLES ? 'inspector' : PLACEHOLDERS ? 'placeholders' : 'sprites');
const PAGE = path.join(ROOT, 'tools/export-sprites/page.js');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!fs.existsSync(CHROME)) { console.error(`找不到 Chrome：${CHROME}（可用环境变量 CHROME 指定）`); process.exit(1); }

const only = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'art-manifest.json'), 'utf8'));
const missing = manifest.assets.filter(def => !fs.existsSync(path.join(PUBLIC, 'svg', `${def.id}.svg`)));
const generatedDefinitions = INSPECTOR_SAMPLES ? manifest.assets.filter(def => ['mon_chest', 'mon_bear'].includes(def.id)) : missing;
let placeholderSvgs = {};
if (GENERATED) {
  let code = stripTypeScriptTypes(fs.readFileSync(path.join(ROOT, 'tools/export-sprites/placeholders.ts'), 'utf8'), { mode: 'strip' });
  code = code.replace("import { dimensions } from './types';", "function dimensions(definition) { const values = definition.viewBox.trim().split(/[\\s,]+/).map(Number); return [values[2], values[3]]; }");
  const { generatePlaceholder } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  placeholderSvgs = Object.fromEntries(generatedDefinitions.map(def => [def.id, generatePlaceholder(def, manifest)]));
  const svgOut = path.join(PUBLIC, INSPECTOR_SAMPLES ? 'inspector/svg' : 'placeholders/svg');
  fs.mkdirSync(svgOut, { recursive: true });
  if (INSPECTOR_SAMPLES) fs.writeFileSync(path.join(svgOut, '.gdignore'), '');
  else fs.writeFileSync(path.join(PUBLIC, 'placeholders/.gdignore'), '');
  for (const [id, svg] of Object.entries(placeholderSvgs)) fs.writeFileSync(path.join(svgOut, `${id}.svg`), svg);
}
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gemcard-sprites-'));
const STAGE = path.join(TMP, 'out');
fs.mkdirSync(STAGE, { recursive: true });
const previous = fs.existsSync(path.join(OUT, 'sprites.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'sprites.json'), 'utf8')) : null;
if (only.length && !previous && !GENERATED) { console.error('还没有 sprites.json，先全部导一遍'); process.exit(1); }

const types = { '.json': 'application/json', '.svg': 'image/svg+xml', '.js': 'text/javascript', '.html': 'text/html' };
const html = `<!doctype html><meta charset="utf-8"><title>export-sprites</title><body style="margin:0;background:transparent"><script>window.ONLY=${JSON.stringify(only)}</script><script src="/page.js"></script>`;
const body = req => new Promise(ok => { const parts = []; req.on('data', d => parts.push(d)); req.on('end', () => ok(Buffer.concat(parts))); });
let done; const allDone = new Promise(r => { done = r; });
let result = null;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET') {
    if (url.pathname === '/') { res.setHeader('content-type', 'text/html'); res.end(html); return; }
    if (GENERATED && url.pathname === '/art-manifest.json') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ...manifest, assets: generatedDefinitions })); return; }
    if (GENERATED && url.pathname.startsWith('/svg/')) { const id = path.basename(url.pathname, '.svg'); if (placeholderSvgs[id]) { res.setHeader('content-type', 'image/svg+xml'); res.end(placeholderSvgs[id]); return; } }
    if (url.pathname === '/page.js') { res.setHeader('content-type', 'text/javascript'); res.end(fs.readFileSync(PAGE)); return; }
    const file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) { res.statusCode = 404; res.end(); return; }
    res.setHeader('content-type', types[path.extname(file)] ?? 'application/octet-stream'); res.end(fs.readFileSync(file)); return;
  }
  const data = await body(req); res.end('ok');
  if (url.pathname === '/put') {
    const f = url.searchParams.get('f') ?? '';
    if (!/^[A-Za-z0-9_@.-]+\.png$/.test(f)) return;
    fs.writeFileSync(path.join(STAGE, f), data);
  } else if (url.pathname === '/log') console.log('  ' + data.toString());
  else if (url.pathname === '/fail') { console.error('导出失败：\n' + data.toString()); done(1); }
  else if (url.pathname === '/done') { result = JSON.parse(data.toString()); done(0); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const chrome = spawn(CHROME, ['--headless=new', '--renderer-process-limit=1', '--num-raster-threads=1', '--disable-background-networking', '--disable-background-timer-throttling', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-device-scale-factor=1', `--user-data-dir=${path.join(TMP, 'profile')}`, `http://127.0.0.1:${port}/`], { stdio: 'ignore' });
chrome.once('error', error => { console.error(error); done(1); });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => done(1));
const timer = setTimeout(() => { console.error('导出超时（10 分钟）'); done(1); }, 10 * 60 * 1000);
const code = await allDone; clearTimeout(timer);
if (chrome.exitCode === null) { const exited = new Promise(r => chrome.once('exit', r)); chrome.kill('SIGTERM'); await Promise.race([exited, new Promise(r => setTimeout(r, 5000))]); }
server.close();

if (!code) {
  if (INSPECTOR_SAMPLES) for (const entry of Object.values(result.assets)) {
    entry.still = 'inspector_' + entry.still;
    for (const sheet of entry.sheets) sheet.f = 'inspector_' + sheet.f;
    entry.inspectorPlaceholder = true;
  }
  fs.mkdirSync(OUT, { recursive: true });
  const merged = only.length && previous ? { ...result, assets: { ...previous.assets, ...result.assets } } : result;
  // 只导部分时，先删掉这几个素材的旧图，再放新图
  const owned = id => f => f === `${id}.png` || f.startsWith(`${id}-`) || f.startsWith(`${id}@`);
  if (only.length) {
    for (const id of Object.keys(result.assets)) for (const f of fs.readdirSync(OUT)) if (owned((INSPECTOR_SAMPLES ? 'inspector_' : '') + id.split('@')[0])(f)) fs.rmSync(path.join(OUT, f));
  } else {
    for (const f of fs.readdirSync(OUT)) if (f !== '.gdignore' && fs.statSync(path.join(OUT, f)).isFile() && (!INSPECTOR_SAMPLES || f.endsWith('.png') || f === 'sprites.json')) fs.rmSync(path.join(OUT, f));
  }
  for (const f of fs.readdirSync(STAGE)) fs.copyFileSync(path.join(STAGE, f), path.join(OUT, (INSPECTOR_SAMPLES ? 'inspector_' : '') + f));
  fs.writeFileSync(path.join(OUT, 'sprites.json'), JSON.stringify(merged));
  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.png'));
  const bytes = files.reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
  const pixels = Object.values(merged.assets).reduce((s, a) => s + a.sheets.reduce((t, sh) => t + sh.w * sh.h, 0), 0);
  console.log(`导出 ${Object.keys(result.assets).length} 个素材 → ${INSPECTOR_SAMPLES ? 'art/inspector/' : PLACEHOLDERS ? 'art/placeholders/' : 'art/sprites/'}：${files.length} 张图，${(bytes / 1048576).toFixed(1)} MB；大图解码后共约 ${(pixels * 4 / 1048576).toFixed(0)} MB`);
}
fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
let finalCode = code;
if (!code && !GENERATED && missing.some(def => !only.length || only.includes(def.id))) {
  const child = spawn(process.execPath, [import.meta.filename, ...only], { stdio: 'inherit', env: { ...process.env, SPRITE_PLACEHOLDERS: '1' } });
  finalCode = await new Promise(resolve => child.once('exit', resolve));
  if (!finalCode) {
    const fallback = path.join(PUBLIC, 'placeholders');
    const fallbackData = JSON.parse(fs.readFileSync(path.join(fallback, 'sprites.json'), 'utf8'));
    const base = JSON.parse(fs.readFileSync(path.join(OUT, 'sprites.json'), 'utf8'));
    const missingIds = new Set(missing.map(def => def.id));
    const fallbackAssets = Object.fromEntries(Object.entries(fallbackData.assets).filter(([key]) => missingIds.has(key.split('@')[0])));
    for (const f of fs.readdirSync(fallback).filter(f => f.endsWith('.png'))) {
      const id = f.split('@')[0].replace(/-\d+\.png$/, '').replace(/\.png$/, '');
      if (missingIds.has(id)) fs.copyFileSync(path.join(fallback, f), path.join(OUT, f));
    }
    for (const entry of Object.values(fallbackAssets)) entry.placeholder = true;
    fs.writeFileSync(path.join(OUT, 'sprites.json'), JSON.stringify({ ...base, assets: { ...base.assets, ...fallbackAssets } }));
  }
}
process.exit(finalCode);
