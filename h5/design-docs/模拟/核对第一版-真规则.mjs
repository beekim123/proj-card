// Hint bot on the REAL engine: reconcile skip+heal vs taking loot.
import * as R from './rules.mjs';
const PRI = { white: 3, shun: 2, same: 1, plain: 0 };
const LOOTPRI = ['hammer', 'lens', 'bag', 'mirror', 'stone'];
function pick(run) {
  let best = -1, key = null;
  run.game.hand.forEach((c, i) => {
    const e = R.previewCard(run.game, c);
    const k = [PRI[e.k], e.m2, e.damage];
    if (!key || k[0] > key[0] || (k[0] === key[0] && (k[1] > key[1] || (k[1] === key[1] && k[2] > key[2])))) { key = k; best = i; }
  });
  return best;
}
function playRun(seed, loot) {
  const run = R.createRun(seed); let hits = 0;
  while (run.phase === 'battle' || run.phase === 'loot') {
    if (run.phase === 'loot') {
      if (loot === 'skip' || (loot === 'smart' && run.hearts < 3)) R.skipLoot(run);
      else if (loot === 'random') R.chooseLoot(run, Math.floor(Math.random() * run.loot.length));
      else { let i = 0, b = 99; run.loot.forEach((t, j) => { const p = LOOTPRI.indexOf(t); if (p < b) { b = p; i = j; } }); R.chooseLoot(run, i); }
      continue;
    }
    while (run.game.hand.length) R.playRunCard(run, pick(run));
    const h = run.hearts; R.endRunTurn(run); if (run.hearts < h) hits++;
  }
  return { win: run.phase === 'victory', turns: run.stats.turns, hits, fight: run.result.fight, best: run.stats.bestTurn };
}
const N = +process.argv[2] || 300;
for (const loot of ['skip', 'take', 'random', 'smart']) {
  const rs = []; for (let s = 1; s <= N; s++) rs.push(playRun(s * 7919, loot));
  const w = rs.filter(r => r.win).length / N;
  const med = a => a.sort((x, y) => x - y)[a.length >> 1];
  console.log(loot.padEnd(7), 'win', (w * 100).toFixed(0) + '%', 'turns', med(rs.map(r => r.turns)), 'hits', (rs.reduce((a, r) => a + r.hits, 0) / N).toFixed(2), 'bestTurn med', med(rs.map(r => r.best)).toExponential(2));
}
