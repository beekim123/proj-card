// 导出精灵图（2026-11-10）：public/art/*.svg → public/sprites/（PNG 大图 + sprites.json）。
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

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(PUBLIC, 'sprites');
const PAGE = path.join(ROOT, 'tools/export-sprites/page.js');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!fs.existsSync(CHROME)) { console.error(`找不到 Chrome：${CHROME}（可用环境变量 CHROME 指定）`); process.exit(1); }

const only = process.argv.slice(2);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gemcard-sprites-'));
const STAGE = path.join(TMP, 'out');
fs.mkdirSync(STAGE, { recursive: true });
const previous = fs.existsSync(path.join(OUT, 'sprites.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'sprites.json'), 'utf8')) : null;
if (only.length && !previous) { console.error('还没有 sprites.json，先全部导一遍'); process.exit(1); }

const types = { '.json': 'application/json', '.svg': 'image/svg+xml', '.js': 'text/javascript', '.html': 'text/html' };
const html = `<!doctype html><meta charset="utf-8"><title>export-sprites</title><body style="margin:0;background:transparent"><script>window.ONLY=${JSON.stringify(only)}</script><script src="/page.js"></script>`;
const body = req => new Promise(ok => { const parts = []; req.on('data', d => parts.push(d)); req.on('end', () => ok(Buffer.concat(parts))); });
let done; const allDone = new Promise(r => { done = r; });
let result = null;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET') {
    if (url.pathname === '/') { res.setHeader('content-type', 'text/html'); res.end(html); return; }
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
const chrome = spawn(CHROME, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-device-scale-factor=1', `--user-data-dir=${path.join(TMP, 'profile')}`, `http://127.0.0.1:${port}/`], { stdio: 'ignore' });
const timer = setTimeout(() => { console.error('导出超时（10 分钟）'); done(1); }, 10 * 60 * 1000);
const code = await allDone; clearTimeout(timer);
if (chrome.exitCode === null) { const exited = new Promise(r => chrome.once('exit', r)); chrome.kill('SIGTERM'); await Promise.race([exited, new Promise(r => setTimeout(r, 5000))]); }
server.close();

if (!code) {
  fs.mkdirSync(OUT, { recursive: true });
  const merged = only.length ? { ...result, assets: { ...previous.assets, ...result.assets } } : result;
  // 只导部分时，先删掉这几个素材的旧图，再放新图
  const owned = id => f => f === `${id}.png` || f.startsWith(`${id}-`) || f.startsWith(`${id}@`);
  if (only.length) {
    for (const id of Object.keys(result.assets)) for (const f of fs.readdirSync(OUT)) if (owned(id.split('@')[0])(f)) fs.rmSync(path.join(OUT, f));
  } else {
    for (const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, f));
  }
  for (const f of fs.readdirSync(STAGE)) fs.copyFileSync(path.join(STAGE, f), path.join(OUT, f));
  fs.writeFileSync(path.join(OUT, 'sprites.json'), JSON.stringify(merged));
  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.png'));
  const bytes = files.reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
  const pixels = Object.values(merged.assets).reduce((s, a) => s + a.sheets.reduce((t, sh) => t + sh.w * sh.h, 0), 0);
  console.log(`导出 ${Object.keys(result.assets).length} 个素材 → public/sprites/：${files.length} 张图，${(bytes / 1048576).toFixed(1)} MB；大图解码后共约 ${(pixels * 4 / 1048576).toFixed(0)} MB`);
}
fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
process.exit(code);
