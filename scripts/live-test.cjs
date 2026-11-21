// Independent browser profile. All game input goes through pointer, keyboard and visible zones.
const assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path'),
  { pathToFileURL } = require('node:url');
const { chromium, _electron } = require(process.env.PW_CORE || 'playwright-core');
const seed = Number(process.env.SEED || 1200),
  limit = Number(process.env.FIGHTS || 4),
  mode = process.env.MODE || 'seal';
const out = path.resolve(process.env.EVIDENCE || 'artifacts/live');
const errors = [],
  history = [],
  phases = new Set();
let ctx,
  p,
  lastPoint = { x: 720, y: 405 },
  angleX = 0,
  angleY = 0;
let vw = 1440,
  vh = 810;
async function boot(dir) {
  if (process.env.ELECTRON_QA) {
    ctx = await _electron.launch({
      args: [path.resolve(__dirname, '..'), '--observe', '--fullhp', '--seed=' + seed],
      executablePath: require('electron'),
      env: { ...process.env, NIGHTWOOD_TEST_PROFILE: dir },
    });
    p = await ctx.firstWindow();
    await p.waitForFunction(() => window.nightSnapshot?.().zones.length);
    [vw, vh] = await p.evaluate(() => [innerWidth, innerHeight]);
    p.on('pageerror', (e) => errors.push(e.message));
    return;
  }
  ctx = await chromium.launchPersistentContext(dir, {
    executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    viewport: { width: 1440, height: 810 },
    args: ['--allow-file-access-from-files'],
  });
  p = ctx.pages()[0];
  await p.bringToFront();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await p.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href + '?observe&fullhp&seed=' + seed);
  await p.waitForFunction(() => window.nightSnapshot?.().zones.length);
}
const snap = () => p.evaluate(() => window.nightSnapshot());
const pause = (ms) => p.waitForTimeout(ms);
async function click(action, arg) {
  await p.waitForFunction(([a,b])=>window.nightSnapshot().zones.some(z=>z.action===a&&(b==null||JSON.stringify(z.arg)===JSON.stringify(b))),[action,arg],{timeout:6500});
  const s = await snap();
  const r = s.zones.findLast(
    (z) => z.action === action && (arg === undefined || JSON.stringify(z.arg) === JSON.stringify(arg)),
  );
  assert(r, `missing ${action} ${arg} in ${s.phase}`);
  await pointer(r.x * vw, r.y * vh);
  await p.mouse.down();
  await p.mouse.up();
  await pause(82);
}
async function pointer(x, y) {
  await p.mouse.move(x, y, { steps: 2 });
  lastPoint = { x, y };
}
async function aim(s, yaw, pitch) {
  const dx = Math.round(Math.atan2(Math.sin(yaw - s.yaw), Math.cos(yaw - s.yaw)) / 0.0021),
    dy = Math.round((s.pitch - pitch) / 0.0021);
  if (dx || dy) {
    lastPoint.x += dx;
    lastPoint.y += dy;
    await p.mouse.move(lastPoint.x, lastPoint.y);
  }
}
async function shot(name) {
  await p.screenshot({ path: path.join(out, name + '.png') });
}
const profile = () => p.evaluate(() => JSON.parse(localStorage.getItem('nightwood.profile.v1')));
async function main() {
  const { route,dragZone } = await import('./route-inputs.mjs'),
    replay = mode === 'fail' ? [] : route(seed, limit).inputs;
  await fs.mkdir(out, { recursive: true });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nightwood-qa-'));
  await boot(dir);
  try {
    await click('settings');
    await click('volume', ['music', -0.1]);
    await click('volume', ['sfx', -0.1]);
    await click('volume', ['mute', 0]);
    await click('volume', ['mute', 0]);
    await shot('settings');
    const saved = await profile();
    await click('back');
    await click('album');
    await shot('empty-album');
    await click('back');
    await click('start');
    let lastPhase = '',
      lastKey = '',
      past = 0,
      stuck = 0,
      frames = 0,
      touched = new Set(),
      accepted = new Set(),
      abandoned = new Set(),
      lastLootD=0, stalled=0, hadPickup = false;
    const began = Date.now();
    while (Date.now() - began < 300000) {
      const s = await snap(),
        ph = s.phase;
      frames++;
      if (ph !== lastPhase) {
        history.push({
          phase: ph,
          f: s.fight,
          t: s.turn,
          hearts: s.hearts,
          mon: s.mons,
          deck: s.deck,
          time: s.time,
          audio: s.audio,
          choices: s.choices,
        });
        console.log(s.fight, ph, s.turn, s.mons?.map((m) => m[0] + ':' + m[1]).join('/'));
        if (['encounter', 'attack', 'death', 'loot', 'choose', 'elite', 'sealing', 'result'].includes(ph))
          await shot(s.fight + '-' + ph);
        phases.add(ph);
        lastPhase = ph;
      }
      if (ph === 'walk') {
        if (!s.locked) {
          await pointer(720, 405);
          await p.mouse.click(720, 405);
          await pause(170);
          continue;
        }
        await p.keyboard.down('Shift');
        await p.keyboard.down('KeyW');
        if (lastKey !== 'walk') {
          past = s.distance;
          stuck = 0;
          lastKey = 'walk';
          await aim(s, s.yaw, -0.015);
        } else if (Math.abs(s.distance - past) < 0.02) {
          if (++stuck > 5) {
            await aim(s, s.yaw + 0.78, -0.03);
            stuck = 0;
          }
        } else stuck = 0;
        past = s.distance;
      }
      if (ph === 'encounter') {
        await p.keyboard.up('Shift');
        await p.keyboard.up('KeyW');
        lastKey = 'encounter';
        s.mons.forEach((m) => touched.add(m[0]));
      }
      if (ph === 'battle') {
        if (mode === 'fail') {
          await click('cast');
          continue;
        }
        const turn = replay.find((t) => t.fight === s.fight && t.turn === s.turn);
        assert(turn, '实机回合与输入不符');
        await click('target', turn.target);
        for (const [slot,index] of turn.drags.entries()) lastPoint=await dragZone(p,snap,'play',index,'dropSlot',slot);
        const b = await snap();
        assert.equal(b.line, 5);
        await shot(s.fight + '-line');
        await click('cast');
      }
      if (ph === 'loot') {
        if (!s.locked) {
          await pointer(720, 405);
          await p.mouse.click(720, 405);
          await pause(130);
          continue;
        }
        const d = Math.hypot(s.loot.x - s.x, s.loot.z - s.z);
        await aim(
          s,
          Math.atan2(s.loot.x - s.x, s.loot.z - s.z),
          Math.max(-Math.PI / 12, Math.atan2(-0.45, d)),
        );
        const angle=Math.atan2(s.loot.x-s.x,s.loot.z-s.z)-s.yaw;
        if(frames%60===0)console.log('拾取观察',JSON.stringify({d,yaw:s.yaw,pitch:s.pitch,x:s.x,z:s.z,angle,can:s.can,locked:s.locked}));
        if (d > 1.82 && Math.cos(angle)>.90) await p.keyboard.down('KeyW');
        else await p.keyboard.up('KeyW');
        if(d<1.2){await p.keyboard.down('KeyS');await pause(150);await p.keyboard.up('KeyS')}
        if(Math.abs(d-lastLootD)<.012&&!s.can){stalled++;if(stalled===12){await p.keyboard.up('KeyW');await p.keyboard.down('KeyD');await pause(350);await p.keyboard.up('KeyD');stalled=0}}else stalled=0;lastLootD=d;
        if (s.can) {
          await p.keyboard.up('KeyW');
          await p.keyboard.press('KeyE');
          hadPickup = true;
        }
      }
      if (ph === 'choose') {
        await pause(600);
        if (mode === 'skip') {
          s.choices.forEach((x) => abandoned.add(x));
          await click('choose', -1);
        } else {
          accepted.add(s.choices[0]);
          await click('choose', 0);
        }
      }
      if (ph === 'elite') {
        await click(mode === 'release' ? 'release' : 'seal');
        if (mode !== 'release') accepted.add('seal');
      }
      if (ph === 'route') {
        await click(s.fight >= limit ? 'exit' : 'continue');
      }
      if (ph === 'result') {
        if (mode === 'fail') assert(['心已耗尽', '十回合耗尽'].includes(s.reason));
        else {
          assert.equal(s.reason, '主动撤离');
          assert.equal(s.fight, limit);
          assert(hadPickup);
        }
        await click('restart');
        const fresh = await snap();
        assert.equal(fresh.phase, 'start');
        assert.equal(fresh.fight, 0);
        assert.equal(fresh.hearts, 3);
        break;
      }
      await pause(70);
    }
    if(!phases.has('result'))console.log('末帧',await snap());
    assert(phases.has('result'), '对局超时');
    const before = await profile();
    await ctx.close();
    ctx = null;
    await boot(dir);
    const after = await profile();
    assert.deepEqual(after, before);
    assert.equal(after.music, saved.music);
    assert.equal(after.sfx, saved.sfx);
    for (const id of accepted) assert(after.cards.includes(id), id);
    for (const id of abandoned) assert(!after.cards.includes(id), id);
    if (mode === 'release') assert(!after.cards.includes('seal'));
    await click('album');
    await shot('album-restart');
    if (accepted.size) {
      const id = [...accepted][0];
      await pause(500);await click('category', id==='seal'?2:id.startsWith('gem')?0:1);await pause(600);
      const at=id.startsWith('gem')?+id[3]:id==='seal'?0:['lens','rain','light','mirror','ice','shield'].indexOf(id);if(at>0){await click('folio',at);await pause(700);}
      await click('inspect', id);
      await pause(450);
      await shot('detail');
      await click('putback');
      await pause(450);
      await click('back');
    }
    let quitVerified = false;
    if (process.env.ELECTRON_QA) {
      if ((await snap()).phase !== 'start') await click('back');
      await p.waitForFunction(()=>window.nightSnapshot().phase==='start');
      const q = (await snap()).zones.find((z) => z.action === 'quit');
      await pointer(q.x * vw, q.y * vh);
      await Promise.all([
        ctx.waitForEvent('close'),
        p.mouse.click(q.x * vw, q.y * vh).catch((e) => {
          if (!/closed/i.test(e.message)) throw e;
        }),
      ]);
      ctx = null;
      quitVerified = true;
    }
    assert.deepEqual(errors, []);
    await fs.writeFile(
      path.join(out, 'verified.json'),
      JSON.stringify(
        {
          seed,
          mode,
          limit,
          touched: [...touched],
          accepted: [...accepted],
          phases: [...phases],
          inputs: replay,
          quitVerified,
          saved: after,
          errors,
          history,
        },
        null,
        2,
      ),
    );
  } finally {
    await ctx?.close();
  }
}
main().catch(async (e) => {
  console.error(e);
  await fs.writeFile(path.join(out, 'failure.json'), JSON.stringify({ errors, history }, null, 2));
  await ctx?.close();
  process.exitCode = 1;
});
