// Capture the same Canvas and mixed Web Audio output, never microphone or screen capture.
const { chromium } = require(process.env.PW_CORE || 'playwright-core');
const fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  { pathToFileURL } = require('node:url');
(async () => {
  const out = path.resolve(process.env.EVIDENCE || 'artifacts/forest');
  await fs.mkdir(out, { recursive: true });
  const b = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--allow-file-access-from-files'],
  });
  try {
    const p = await b.newPage({ viewport: { width: 1440, height: 810 } }),
      errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.addInitScript(() => {
      const Original = AudioContext;
      window.AudioContext = class extends Original {
        createAnalyser() {
          const a = super.createAnalyser();
          window.audioTap = this.createMediaStreamDestination();
          a.connect(window.audioTap);
          return a;
        }
      };
    });
    await p.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href + '?observe&seed=1200');
    await p.waitForFunction(() => window.nightSnapshot?.().zones.length);
    const snap = () => p.evaluate(() => nightSnapshot());
    const zone = async (action, arg) => {
      await p.waitForFunction(([a,b])=>window.nightSnapshot().zones.some(z=>z.action===a&&(b==null||z.arg===b)),[action,arg]);
      const s = await snap(),
        q = s.zones.find(
          (z) => z.action === action && (arg === undefined || JSON.stringify(z.arg) === JSON.stringify(arg)),
        );
      assert(q, action);
      await p.mouse.move(q.x * 1440, q.y * 810, { steps: 3 });
      await p.mouse.click(q.x * 1440, q.y * 810);
      await p.waitForTimeout(100);
    };
    await zone('album');
    await zone('category', 2);
    await zone('study');
    await p.mouse.move(320, 360, { steps: 5 });
    await p.waitForTimeout(700);
    await p.screenshot({ path: path.join(out, 'seal-hover.png') });
    await zone('trycard');
    await p.waitForTimeout(720);
    await p.screenshot({ path: path.join(out, 'seal-cast.png') });
    await p.waitForTimeout(1000);
    await zone('back');
    await zone('back');
    await p.waitForFunction(()=>window.nightSnapshot().phase==='start');
    await p.evaluate(() => {
      const canvas = document.querySelector('canvas'),
        stream = canvas.captureStream(30);
      stream.addTrack(audioTap.stream.getAudioTracks()[0]);
      const chunks = [];
      const rec = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9,opus',
        videoBitsPerSecond: 2800000,
      });
      rec.ondataavailable = (e) => chunks.push(e.data);
      window.stopClip = () =>
        new Promise((resolve) => {
          rec.onstop = async () => {
            const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
            let s = '';
            for (let i = 0; i < bytes.length; i += 16384)
              s += String.fromCharCode(...bytes.slice(i, i + 16384));
            resolve(btoa(s));
          };
          rec.stop();
        });
      rec.start();
    });
    await p.waitForTimeout(1500);
    const before = await snap();
    await zone('start');
    const handoff = await snap();
    assert.equal(handoff.seed, before.seed);
    assert.equal(handoff.z, before.z);
    assert(handoff.time > before.time);
    const firstButton=before.zones.find(z=>z.action==='start');
    await p.mouse.move(firstButton.x*1440,firstButton.y*810+112,{steps:20});
    await p.waitForTimeout(750);
    await p.keyboard.down('KeyW');
    await p.waitForFunction(() => nightSnapshot().wet);
    await p.waitForTimeout(380);
    await p.keyboard.up('KeyW');
    await p.waitForTimeout(150);
    const wet = await snap();
    await p.waitForTimeout(1400);
    const still = await snap();
    assert.equal(still.distance, wet.distance);
    await p.screenshot({ path: path.join(out, 'water.png') });
    const start = before.zones.find((z) => z.action === 'start'),
      x = start.x * 1440,
      y = start.y * 810;
    await p.mouse.move(x + Math.PI / 0.0021, y + 70, { steps: 32 });
    await p.waitForTimeout(500);
    const behind = await snap();
    assert(Math.abs(behind.yaw) > 2.8);
    await p.screenshot({ path: path.join(out, 'turn.png') });
    await p.mouse.move(x, y, { steps: 32 });
    await p.waitForTimeout(500);
    const again = await snap();
    assert(Math.abs(again.yaw) < 0.04);
    assert.equal(again.z, still.z);
    await p.keyboard.down('KeyW');
    await p.keyboard.down('Shift');
    await p.waitForFunction(() => nightSnapshot().phase === 'encounter');
    await p.keyboard.up('KeyW');
    await p.keyboard.up('Shift');
    await p.waitForTimeout(500);
    const encounter = await snap();
    assert(encounter.quiet);
    assert(encounter.audio.counts.wet && encounter.audio.counts.dry);
    await p.waitForTimeout(1400);
    const bytes = Buffer.from(await p.evaluate(() => stopClip()), 'base64');
    await fs.writeFile(path.join(out, '夜林首段.webm'), bytes);
    assert.deepEqual(errors, []);
    await fs.writeFile(
      path.join(out, 'forest.json'),
      JSON.stringify({ before, handoff, wet, still, behind, again, encounter, errors }, null, 2),
    );
    console.log('原地接管、湿地停步、回头、遇怪静音及封印试样通过，录像', bytes.length);
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
