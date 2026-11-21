// Produce a keyboard/mouse replay without touching the live game or rolling its random stream.
import * as R from '../src/rules.js';
import { RULES } from '../src/config.js';
function planTurn(b, run) {
  let best = -Infinity,
    choice;
  const cards = [],
    indices = [],
    seen = new Set();
  function visit(mask) {
    if (cards.length < 5) {
      for (let i = 0; i < b.hand.length; i++)
        if (!(mask & (1 << i))) {
          cards.push(b.hand[i]);
          indices.push(i);
          visit(mask | (1 << i));
          cards.pop();
          indices.pop();
        }
      return;
    }
    const key = indices.map((i) => b.hand[i].id + ':' + b.hand[i].col + ':' + b.hand[i].vals).join('|');
    if (seen.has(key)) return;
    seen.add(key);
    const plan = R.preview(b, cards);
    for (let target = 0; target < b.monsters.length; target++) {
      if (!b.monsters[target].hp) continue;
      const hp = b.monsters.map((m) => m.hp);
      let n = target,
        total = 0;
      for (const seg of plan.segments) {
        if (!hp[n]) n = hp.findIndex((v) => v > 0);
        if (n < 0) break;
        const damage = Math.min(hp[n], R.segmentDamage(seg, b.monsters[n].kind, b.lamps));
        hp[n] -= damage;
        total += damage;
      }
      const attackers = b.monsters.filter(
        (m, i) => hp[i] && m.countdown - 1 - (m.kind === 'elite' ? plan.hops : 0) <= 0,
      ).length;
      const cost = Math.max(0, attackers - plan.shield);
      const score =
        total +
        hp.reduce(
          (v, h, i) => v + (!h && b.monsters[i].hp ? (b.monsters[i].kind === 'elite' ? 540 : 190) : 0),
          0,
        ) -
        cost * (run.hearts === 1 ? 2400 : 480) +
        R.lampCount(plan.lamps) * 9 +
        (plan.cursor === 6 ? 35 : 0);
      if (score > best) {
        best = score;
        choice = { target, cards: [...indices] };
      }
    }
  }
  visit(0);
  return choice;
}
// Replays traverse the same mouse handlers as a player. No action dispatch or state injection.
export async function dragZone(page, snap, from, index, to, dest, offsetX=0) {
  const s=await snap(),size=await page.evaluate(()=>[innerWidth,innerHeight]);
  const find=(name,arg)=>s.zones.findLast(z=>z.action===name&&(arg===undefined||arg===z.arg));
  const origin=find(from,index),target=typeof to==='string'?find(to,dest):to;
  if(!origin||!target)throw Error(`missing drag zones ${from}:${index} -> ${to}:${dest} (${s.phase})`);
  const x=(target.x+offsetX)*size[0],y=target.y*size[1];
  await page.mouse.move(origin.x*size[0],origin.y*size[1],{steps:3});
  await page.mouse.down();await page.mouse.move(x,y,{steps:6});await page.mouse.up();
  await page.waitForTimeout(50);
  return {x,y};
}
export function route(seed, count = 4, release = false) {
  const run = R.newRun(seed),
    inputs = [];
  for (let i = 0; i < count; i++) {
    const b = R.startFight(run);
    let res = 'next';
    while (res === 'next') {
      const { target, cards } = planTurn(b, run),
        hand = [...b.hand],
        drags = [];
      R.selectTarget(b, target);
      for (const j of cards) {
        const index = b.hand.indexOf(hand[j]);
        drags.push(index);
        R.queueCard(b, index);
      }
      const plan = R.startCast(b);
      for (let j = 0; j < plan.segments.length; j++) R.applyHit(run, b, plan, j);
      for (const j of R.endCast(run, b, plan)) {
        R.attack(run, b, j);
        if (!run.hearts) break;
      }
      inputs.push({ fight: i + 1, turn: b.turn, target, drags });
      res = R.finishTurn(run, b);
    }
    if (res !== 'win') return { inputs, wins: run.wins };
    if (b.elite) R.finishElite(run, !release);
    else R.takeLoot(run, R.lootChoices(run)[0]);
  }
  return { inputs, wins: run.wins };
}
if (process.argv[1]?.endsWith('/route-inputs.mjs')) {
  const result = route(Number(process.argv[2] || 1200));
  console.log(JSON.stringify(result, null, 2));
  if (result.wins !== 4) process.exitCode = 1;
}
