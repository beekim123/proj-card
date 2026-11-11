// Render the unchanged read-only H5 synthesizer in Chrome OfflineAudioContext.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';

const root = process.cwd();
const source = fs.readFileSync(path.join(root, 'tools/audio/sound-source.ts'), 'utf8');
const compiled = stripTypeScriptTypes(source, { mode: 'strip' });
const chromePath = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const output = path.join(root, 'audio');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gemcard-audio-'));
fs.mkdirSync(output, { recursive: true });
let browser;
let timeout;
let finished;
const done = new Promise(resolve => { finished = resolve; });
const jobs = [];
for (const volume of [1, 2, 3]) {
  for (const [method, base] of [['playCard', 'card'], ['double', 'double'], ['shadow', 'shadow']]) for (let i = 0; i < 15; i++) jobs.push({ name: `${base}_${i}`, method, args: [i], volume });
  jobs.push({ name: 'hit', method: 'hit', args: [false], volume }, { name: 'hit_big', method: 'hit', args: [true], volume });
  for (const rule of ['bite', 'hug', 'unwind', 'wound_down', 'bell', 'layer']) jobs.push({ name: `rule_${rule}`, method: 'rule', args: [rule], volume });
  for (const [method, name] of [['white','white'], ['rainbow','rainbow'], ['pierce','pierce'], ['heartLose','heart_lose'], ['heal','heal'], ['draw','draw'], ['button','button'], ['hourglass','hourglass'], ['seal','seal'], ['unseal','unseal'], ['whistle','whistle'], ['slowBeat','slow_beat'], ['shopRemove','shop_remove'], ['shopCopy','shop_copy'], ['doorOpen','door_open']]) jobs.push({ name, method, args: [], volume });
}
const readBody = request => new Promise(resolve => { const chunks = []; request.on('data', chunk => chunks.push(chunk)); request.on('end', () => resolve(Buffer.concat(chunks))); });
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET') {
    if (url.pathname === '/sound.js') { response.setHeader('content-type', 'text/javascript'); response.end(compiled); return; }
    if (url.pathname === '/page.js') { response.setHeader('content-type', 'text/javascript'); response.end(fs.readFileSync(path.join(root, 'tools/record-audio/page.js'))); return; }
    response.setHeader('content-type', 'text/html');
    response.end(`<!doctype html><meta charset="utf-8"><script>window.JOBS=${JSON.stringify(jobs)}</script><script type="module" src="/page.js"></script>`); return;
  }
  const body = await readBody(request);
  if (url.pathname === '/wav') {
    const filename = url.searchParams.get('file') ?? '';
    if (!/^[a-z0-9_]+_v[123]\.wav$/.test(filename)) { response.writeHead(400); response.end(); return; }
    fs.writeFileSync(path.join(output, filename), body);
  } else if (url.pathname === '/log') console.log(body.toString());
  else if (url.pathname === '/done') { fs.writeFileSync(path.join(output, 'sounds.json'), JSON.stringify({ source: 'h5/src/ui/sound.ts', source_sha256: crypto.createHash('sha256').update(source).digest('hex'), sample_rate: 48000, channels: 2, bits: 16, volume: { 1: .22, 2: .45, 3: .7 }, recordings: JSON.parse(body.toString()), note: 'Each WAV renders the original SoundSystem in a fresh offline context; deterministic noise/reverb seed resets per recording.' }, null, 2) + '\n'); finished(0); }
  else if (url.pathname === '/fail') { console.error(body.toString()); finished(1); }
  response.end('ok');
});
let code = 1;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = spawn(chromePath, ['--headless=new', '--renderer-process-limit=1', '--num-raster-threads=1', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', `--user-data-dir=${path.join(tmp, 'profile')}`, `http://127.0.0.1:${server.address().port}/`], { stdio: 'ignore' });
  browser.once('error', error => { console.error(error); finished(1); });
  timeout = setTimeout(() => { console.error('离线录音超时'); finished(1); }, 10 * 60 * 1000);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => finished(1));
  code = await done;
} finally {
  clearTimeout(timeout);
  if (browser && browser.exitCode === null) {
    const exited = new Promise(resolve => browser.once('exit', resolve));
    browser.kill('SIGTERM');
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5000))]);
  }
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
process.exitCode = code;
